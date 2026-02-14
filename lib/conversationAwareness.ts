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
const CONVERSATION_PAUSE_SECONDS = 25;
const END_SILENCE_THRESHOLD = 0.1;
const START_MIN_SECONDS = 3;
const READABILITY_CHECK_SECONDS = 7;

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

function secondsSinceLastLegibleSpeech(signals: AwarenessSignalEvent[]): number {
  if (signals.length === 0) return Number.POSITIVE_INFINITY;
  const latestTs = Date.parse(signals[signals.length - 1].timestamp);
  for (let i = signals.length - 1; i >= 0; i -= 1) {
    const s = signals[i];
    if (isLegibleSpeech(s)) {
      const ts = Date.parse(s.timestamp);
      if (!Number.isFinite(ts) || !Number.isFinite(latestTs)) return Number.POSITIVE_INFINITY;
      return Math.max(0, (latestTs - ts) / 1000);
    }
  }
  return Number.POSITIVE_INFINITY;
}

function secondsSinceLastTranscriptWords(signals: AwarenessSignalEvent[]): number {
  if (signals.length === 0) return Number.POSITIVE_INFINITY;
  const latestTs = Date.parse(signals[signals.length - 1].timestamp);
  for (let i = signals.length - 1; i >= 0; i -= 1) {
    const s = signals[i];
    if ((s.transcriptWords ?? 0) > 0) {
      const ts = Date.parse(s.timestamp);
      if (!Number.isFinite(ts) || !Number.isFinite(latestTs)) return Number.POSITIVE_INFINITY;
      return Math.max(0, (latestTs - ts) / 1000);
    }
  }
  return Number.POSITIVE_INFINITY;
}

function secondsSinceAudioAboveThreshold(
  signals: AwarenessSignalEvent[],
  threshold = LEGIBLE_AUDIO_THRESHOLD
): number {
  if (signals.length === 0) return Number.POSITIVE_INFINITY;
  const latestTs = Date.parse(signals[signals.length - 1].timestamp);
  for (let i = signals.length - 1; i >= 0; i -= 1) {
    const s = signals[i];
    if (s.audioLevel >= threshold) {
      const ts = Date.parse(s.timestamp);
      if (!Number.isFinite(ts) || !Number.isFinite(latestTs)) return Number.POSITIVE_INFINITY;
      return Math.max(0, (latestTs - ts) / 1000);
    }
  }
  return Number.POSITIVE_INFINITY;
}

function recentTranscriptWordSum(signals: AwarenessSignalEvent[], lookback = 10): number {
  const windowed = signals.slice(-lookback);
  return windowed.reduce((sum, s) => sum + (s.transcriptWords ?? 0), 0);
}

function sustainedAudioSeconds(signals: AwarenessSignalEvent[], threshold: number): number {
  if (signals.length < 2) return 0;
  let firstIdx = -1;
  for (let i = signals.length - 1; i >= 0; i -= 1) {
    if (signals[i].audioLevel >= threshold) firstIdx = i;
    else break;
  }
  if (firstIdx < 0 || firstIdx >= signals.length - 1) return 0;
  const start = Date.parse(signals[firstIdx].timestamp);
  const end = Date.parse(signals[signals.length - 1].timestamp);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, (end - start) / 1000);
}

function transcriptReadabilityScore(signals: AwarenessSignalEvent[]): number {
  const recent = signals.slice(-14);
  const words = recent.reduce((sum, s) => sum + (s.transcriptWords ?? 0), 0);
  const confidences = recent
    .map((s) => s.transcriptConfidence)
    .filter((v): v is number => typeof v === "number");
  const avgConf =
    confidences.length > 0
      ? confidences.reduce((sum, v) => sum + v, 0) / confidences.length
      : 0;
  const texts = recent
    .map((s) => s.transcriptText ?? "")
    .join(" ")
    .trim();
  const letters = (texts.match(/[a-zA-Z]/g) ?? []).length;
  const printable = (texts.match(/[a-zA-Z0-9\s.,!?'"-]/g) ?? []).length;
  const alphaRatio = printable > 0 ? letters / printable : 0;
  const hasSentenceLikeShape = /[a-zA-Z]{3,}\s+[a-zA-Z]{2,}/.test(texts);

  const wordScore = Math.min(1, words / 20);
  const confScore = Math.min(1, avgConf / 0.7);
  const grammarShape = hasSentenceLikeShape ? 1 : 0;
  const textHealth = Math.min(1, alphaRatio / 0.75);
  return wordScore * 0.4 + confScore * 0.3 + grammarShape * 0.2 + textHealth * 0.1;
}

function shouldStartRecording(state: ConversationAwarenessState, incoming: AwarenessSignalEvent): boolean {
  const recentSignals = clampArray([...state.recentSignals, incoming], 24);
  const sustainedSeconds = sustainedAudioSeconds(recentSignals, LEGIBLE_AUDIO_THRESHOLD);
  return sustainedSeconds >= START_MIN_SECONDS;
}

function shouldStopRecording(state: ConversationAwarenessState, incoming: AwarenessSignalEvent): boolean {
  const recentSignals = clampArray([...state.recentSignals, incoming], 40);
  const pauseSeconds = secondsSinceAudioAboveThreshold(recentSignals, END_SILENCE_THRESHOLD);
  const transcriptPause = secondsSinceLastTranscriptWords(recentSignals);
  return pauseSeconds >= CONVERSATION_PAUSE_SECONDS && transcriptPause >= CONVERSATION_PAUSE_SECONDS;
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

      // After 7s, if transcript is still unreadable/ungrammatical, reset detection and try again.
      const startedMs = Date.parse(updatedSession.startedAt);
      const nowMs = Date.parse(signal.timestamp);
      const elapsedSec =
        Number.isFinite(startedMs) && Number.isFinite(nowMs)
          ? Math.max(0, (nowMs - startedMs) / 1000)
          : 0;
      if (elapsedSec >= READABILITY_CHECK_SECONDS) {
        const readability = transcriptReadabilityScore(
          clampArray([...state.recentSignals, signal], 30)
        );
        if (readability < 0.35) {
          await stopActiveSession(state);
          state.isRecording = false;
          state.activeSessionId = undefined;
          state.latestAction = "awaiting_conversation";
          await saveAwarenessState(state);
          return { state, session: null };
        }
      }
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
