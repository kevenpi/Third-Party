import { randomUUID } from "crypto";
import {
  AwarenessSignalEvent,
  ConversationAwarenessState,
  MetaGlassesSignalPayload,
  RecordingSession,
  SpeakerHint,
  SpeakerWindow
} from "@shared/types";
import {
  appendAwarenessEvent,
  getAwarenessState,
  getRecordingSession,
  getRecordingSessions,
  listRecentAwarenessEvents,
  saveAwarenessState,
  saveRecordedClip,
  upsertRecordingSession
} from "@/lib/awarenessStorage";
import { saveTimelineBubbleFromSession } from "@/lib/timelineStorage";

const LEGIBLE_AUDIO_THRESHOLD = 0.03;
const LEGIBLE_HINT_THRESHOLD = 0.35;
const SEGMENT_SECONDS = 5;

function nowIso(): string {
  return new Date().toISOString();
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function clampArray<T>(items: T[], max: number): T[] {
  if (items.length <= max) {
    return items;
  }
  return items.slice(items.length - max);
}

function normalizeSpeakerHints(hints?: SpeakerHint[] | null): SpeakerHint[] {
  if (!hints || hints.length === 0) {
    return [];
  }

  return hints
    .map((hint) => ({
      personTag: hint.personTag.trim(),
      speakingScore: clamp01(hint.speakingScore)
    }))
    .filter((hint) => hint.personTag.length > 0)
    .sort((a, b) => b.speakingScore - a.speakingScore)
    .slice(0, 4);
}

function mergeSpeakerWindows(existing: SpeakerWindow[], hints: SpeakerHint[]): SpeakerWindow[] {
  const scoreMap = new Map<string, number>();

  existing.forEach((speaker) => {
    scoreMap.set(speaker.personTag, speaker.score);
  });

  hints.forEach((hint) => {
    const previous = scoreMap.get(hint.personTag);
    if (previous === undefined) {
      scoreMap.set(hint.personTag, hint.speakingScore);
      return;
    }

    // Smooth with recency bias.
    scoreMap.set(hint.personTag, clamp01(previous * 0.65 + hint.speakingScore * 0.35));
  });

  return [...scoreMap.entries()]
    .map(([personTag, score]) => ({ personTag, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function topSpeakersFromRecentSignals(signals: AwarenessSignalEvent[]): SpeakerWindow[] {
  const scoreMap = new Map<string, number>();

  for (const signal of signals) {
    for (const hint of signal.speakerHints) {
      const current = scoreMap.get(hint.personTag) ?? 0;
      scoreMap.set(hint.personTag, clamp01(current + hint.speakingScore * 0.25));
    }
  }

  return [...scoreMap.entries()]
    .map(([personTag, score]) => ({ personTag, score: clamp01(score) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}

function isLegibleSpeech(signal: AwarenessSignalEvent): boolean {
  if (signal.audioLevel < LEGIBLE_AUDIO_THRESHOLD) return false;
  const transcriptWords = signal.transcriptWords ?? 0;
  if (transcriptWords >= 1) return true;
  if (!signal.speakerHints || signal.speakerHints.length === 0) return false;
  const maxHint = Math.max(...signal.speakerHints.map((h) => h.speakingScore));
  return maxHint >= LEGIBLE_HINT_THRESHOLD;
}

function evidenceFromSignal(signal: AwarenessSignalEvent) {
  return {
    samples: 1,
    legibleFrames: isLegibleSpeech(signal) ? 1 : 0,
    transcriptWords: signal.transcriptWords ?? 0,
    transcriptConfidenceSum: signal.transcriptConfidence ?? 0
  };
}

function mergeEvidence(
  existing: RecordingSession["evidence"] | undefined,
  signal: AwarenessSignalEvent
): RecordingSession["evidence"] {
  const base = existing ?? {
    samples: 0,
    legibleFrames: 0,
    transcriptWords: 0,
    transcriptConfidenceSum: 0
  };
  const delta = evidenceFromSignal(signal);
  return {
    samples: base.samples + delta.samples,
    legibleFrames: base.legibleFrames + delta.legibleFrames,
    transcriptWords: base.transcriptWords + delta.transcriptWords,
    transcriptConfidenceSum: base.transcriptConfidenceSum + delta.transcriptConfidenceSum
  };
}

function rollingWindowSignals(signals: AwarenessSignalEvent[], seconds: number): AwarenessSignalEvent[] {
  if (signals.length === 0) return [];
  const latestTs = Date.parse(signals[signals.length - 1].timestamp);
  if (!Number.isFinite(latestTs)) return [];
  const minTs = latestTs - seconds * 1000;
  return signals.filter((s) => {
    const ts = Date.parse(s.timestamp);
    return Number.isFinite(ts) && ts >= minTs;
  });
}

function isConversationWindow(signals: AwarenessSignalEvent[]): boolean {
  if (signals.length < 2) return false;
  const startMs = Date.parse(signals[0].timestamp);
  const endMs = Date.parse(signals[signals.length - 1].timestamp);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  const durationSec = Math.max(0, (endMs - startMs) / 1000);
  if (durationSec < SEGMENT_SECONDS * 0.8) return false;

  const words = signals.reduce((sum, s) => sum + (s.transcriptWords ?? 0), 0);
  const confValues = signals
    .map((s) => s.transcriptConfidence)
    .filter((v): v is number => typeof v === "number");
  const avgConfidence =
    confValues.length > 0 ? confValues.reduce((sum, v) => sum + v, 0) / confValues.length : 0;
  const legibleFrames = signals.filter(isLegibleSpeech).length;
  const distinctSpeakers = new Set(
    signals.flatMap((s) => s.speakerHints.map((h) => h.personTag))
  ).size;
  const avgAudio =
    signals.reduce((sum, s) => sum + s.audioLevel, 0) / Math.max(1, signals.length);

  const transcriptStrong = words >= 10 || (words >= 6 && avgConfidence >= 0.2);
  const multiSpeakerStrong = legibleFrames >= 4 && distinctSpeakers >= 2;
  const audioSpeechBlend = avgAudio >= LEGIBLE_AUDIO_THRESHOLD && words >= 5;

  return transcriptStrong || multiSpeakerStrong || audioSpeechBlend;
}

function shouldStartRecording(state: ConversationAwarenessState, incoming: AwarenessSignalEvent): boolean {
  const recentSignals = clampArray([...state.recentSignals, incoming], 36);
  return isConversationWindow(rollingWindowSignals(recentSignals, SEGMENT_SECONDS));
}

function shouldStopRecording(state: ConversationAwarenessState, incoming: AwarenessSignalEvent): boolean {
  const recentSignals = clampArray([...state.recentSignals, incoming], 36);
  const window = rollingWindowSignals(recentSignals, SEGMENT_SECONDS);
  if (window.length < 2) return false;
  return !isConversationWindow(window);
}

function buildSessionId(): string {
  return `rec_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function normalizeSignal(event: Partial<AwarenessSignalEvent> & { source: AwarenessSignalEvent["source"] }): AwarenessSignalEvent {
  const hints = normalizeSpeakerHints(event.speakerHints);

  const audioFromHints =
    hints.length > 0 ? hints.reduce((sum, hint) => sum + hint.speakingScore, 0) / hints.length : 0;
  const presenceScore = event.presenceScore !== undefined ? clamp01(event.presenceScore) : undefined;
  const fallbackAudioLevel =
    event.source === "phone_camera"
      ? clamp01((presenceScore ?? 0) * 0.45)
      : audioFromHints;

  return {
    source: event.source,
    timestamp: event.timestamp ?? nowIso(),
    audioLevel: clamp01(event.audioLevel ?? fallbackAudioLevel),
    presenceScore,
    transcriptText: event.transcriptText?.slice(0, 500),
    transcriptWords: event.transcriptWords !== undefined ? Math.max(0, Math.min(200, Math.round(event.transcriptWords))) : undefined,
    transcriptConfidence: event.transcriptConfidence !== undefined ? clamp01(event.transcriptConfidence) : undefined,
    speakerHints: hints,
    deviceId: event.deviceId
  };
}

async function stopActiveSession(state: ConversationAwarenessState): Promise<void> {
  if (!state.activeSessionId) {
    return;
  }

  const existing = await getRecordingSession(state.activeSessionId);
  if (!existing || existing.endedAt) {
    return;
  }

  await upsertRecordingSession({
    ...existing,
    endedAt: nowIso()
  });
}

export async function setListeningEnabled(listeningEnabled: boolean): Promise<ConversationAwarenessState> {
  const state = await getAwarenessState();

  state.listeningEnabled = listeningEnabled;
  state.lastUpdatedAt = nowIso();

  if (!listeningEnabled) {
    if (state.isRecording) {
      await stopActiveSession(state);
    }

    state.isRecording = false;
    state.activeSessionId = undefined;
    state.latestAction = "idle";
    state.activeSpeakers = [];
  } else {
    state.latestAction = "awaiting_conversation";
  }

  await saveAwarenessState(state);
  return state;
}

export async function ingestAwarenessSignal(
  event: Partial<AwarenessSignalEvent> & { source: AwarenessSignalEvent["source"] }
): Promise<{ state: ConversationAwarenessState; session: RecordingSession | null }> {
  const signal = normalizeSignal(event);
  await appendAwarenessEvent(signal);

  const state = await getAwarenessState();

  state.lastUpdatedAt = nowIso();
  state.rollingAudioLevels = clampArray([...state.rollingAudioLevels, signal.audioLevel], 20);
  state.recentSignals = clampArray([...state.recentSignals, signal], 20);
  state.activeSpeakers = topSpeakersFromRecentSignals(state.recentSignals);

  if (!state.listeningEnabled) {
    state.latestAction = "idle";
    await saveAwarenessState(state);
    return { state, session: null };
  }

  let activeSession: RecordingSession | null = null;

  if (!state.isRecording) {
    if (shouldStartRecording(state, signal)) {
      const newSession: RecordingSession = {
        id: buildSessionId(),
        startedAt: nowIso(),
        createdBy: "detector",
        speakerWindows: state.activeSpeakers,
        clipPaths: [],
        evidence: evidenceFromSignal(signal)
      };

      await upsertRecordingSession(newSession);
      state.isRecording = true;
      state.activeSessionId = newSession.id;
      state.latestAction = "start_recording";
      activeSession = newSession;
    } else {
      state.latestAction = "awaiting_conversation";
    }

    await saveAwarenessState(state);
    return { state, session: activeSession };
  }

  if (state.activeSessionId) {
    const existing = await getRecordingSession(state.activeSessionId);
    if (existing) {
      const updatedSession: RecordingSession = {
        ...existing,
        speakerWindows: mergeSpeakerWindows(existing.speakerWindows, signal.speakerHints),
        evidence: mergeEvidence(existing.evidence, signal)
      };
      await upsertRecordingSession(updatedSession);
      activeSession = updatedSession;

    }
  }

  if (shouldStopRecording(state, signal)) {
    const endedSessionId = state.activeSessionId;
    await stopActiveSession(state);
    state.isRecording = false;
    state.activeSessionId = undefined;
    state.latestAction = "stop_recording";
    await saveAwarenessState(state);
    if (endedSessionId) {
      const endedSession = await getRecordingSession(endedSessionId);
      if (endedSession?.endedAt) void saveTimelineBubbleFromSession(endedSession).catch(() => {});
    }
    return { state, session: activeSession };
  }

  state.latestAction = "continue_recording";
  await saveAwarenessState(state);
  return { state, session: activeSession };
}

export async function ingestMetaGlassesSignal(
  payload: MetaGlassesSignalPayload
): Promise<{ state: ConversationAwarenessState; session: RecordingSession | null }> {
  return ingestAwarenessSignal({
    source: "meta_glasses",
    timestamp: payload.timestamp,
    audioLevel: payload.audioLevel,
    speakerHints: payload.speakerHints,
    deviceId: payload.deviceId
  });
}

export async function attachRecordedClip(
  sessionId: string,
  audioBase64: string,
  mimeType: string
): Promise<RecordingSession | null> {
  const session = await getRecordingSession(sessionId);
  if (!session) {
    return null;
  }

  const clipPath = await saveRecordedClip(sessionId, audioBase64, mimeType);
  const updated: RecordingSession = {
    ...session,
    clipPaths: [...session.clipPaths, clipPath].slice(-24)
  };

  await upsertRecordingSession(updated);
  return updated;
}

export async function getAwarenessSnapshot() {
  const [state, sessions, recentEvents] = await Promise.all([
    getAwarenessState(),
    getRecordingSessions(),
    listRecentAwarenessEvents(40)
  ]);

  return {
    state,
    sessions: sessions.slice(0, 12),
    recentEvents: recentEvents.slice(0, 20)
  };
}
