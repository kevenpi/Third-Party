import { randomUUID } from "crypto";
import {
  AwarenessDebugEvent,
  AwarenessSignalEvent,
  ConversationAwarenessState,
  MetaGlassesSignalPayload,
  RecordingSession,
  SpeakerHint,
  SpeakerWindow
} from "@shared/types";
import {
  appendAwarenessDebugEvent,
  appendAwarenessEvent,
  getAwarenessState,
  getRecordingSession,
  getRecordingSessions,
  listRecentAwarenessDebugEvents,
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
    // Face-identified hints (score >= 0.9) get higher retention weight
    const isFaceId = hint.speakingScore >= 0.9;
    if (previous === undefined) {
      scoreMap.set(hint.personTag, hint.speakingScore);
      return;
    }

    // Smooth with recency bias; face-ID hints retain more strongly.
    const retainWeight = isFaceId ? 0.85 : 0.65;
    scoreMap.set(hint.personTag, clamp01(previous * retainWeight + hint.speakingScore * (1 - retainWeight)));
  });

  return [...scoreMap.entries()]
    .map(([personTag, score]) => ({ personTag, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function topSpeakersFromRecentSignals(signals: AwarenessSignalEvent[]): SpeakerWindow[] {
  const scoreMap = new Map<string, number>();

  for (const signal of signals) {
    // If this signal has a face identification, boost that person
    if (signal.faceIdentification && signal.faceIdentification.confidence !== "low") {
      const faceTag = signal.faceIdentification.personName;
      const current = scoreMap.get(faceTag) ?? 0;
      scoreMap.set(faceTag, clamp01(current + 0.5)); // 2x weight for face-identified
    }

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

type WindowEvaluation = {
  isConversation: boolean;
  windowSamples: number;
  windowDurationSec: number;
  words: number;
  avgConfidence: number;
  legibleFrames: number;
  distinctSpeakers: number;
  avgAudio: number;
  transcriptStrong: boolean;
  multiSpeakerStrong: boolean;
  audioSpeechBlend: boolean;
};

function evaluateConversationWindow(signals: AwarenessSignalEvent[]): WindowEvaluation {
  if (signals.length < 2) {
    return {
      isConversation: false,
      windowSamples: signals.length,
      windowDurationSec: 0,
      words: 0,
      avgConfidence: 0,
      legibleFrames: signals.filter(isLegibleSpeech).length,
      distinctSpeakers: new Set(signals.flatMap((s) => s.speakerHints.map((h) => h.personTag))).size,
      avgAudio: signals.length > 0 ? signals.reduce((sum, s) => sum + s.audioLevel, 0) / signals.length : 0,
      transcriptStrong: false,
      multiSpeakerStrong: false,
      audioSpeechBlend: false
    };
  }
  const startMs = Date.parse(signals[0].timestamp);
  const endMs = Date.parse(signals[signals.length - 1].timestamp);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return {
      isConversation: false,
      windowSamples: signals.length,
      windowDurationSec: 0,
      words: 0,
      avgConfidence: 0,
      legibleFrames: 0,
      distinctSpeakers: 0,
      avgAudio: 0,
      transcriptStrong: false,
      multiSpeakerStrong: false,
      audioSpeechBlend: false
    };
  }
  const durationSec = Math.max(0, (endMs - startMs) / 1000);

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
  const enoughWindowSpan = durationSec >= SEGMENT_SECONDS * 0.8;
  const isConversation =
    enoughWindowSpan && (transcriptStrong || multiSpeakerStrong || audioSpeechBlend);

  return {
    isConversation,
    windowSamples: signals.length,
    windowDurationSec: durationSec,
    words,
    avgConfidence,
    legibleFrames,
    distinctSpeakers,
    avgAudio,
    transcriptStrong,
    multiSpeakerStrong,
    audioSpeechBlend
  };
}

function shouldStartRecording(state: ConversationAwarenessState, incoming: AwarenessSignalEvent): WindowEvaluation {
  const recentSignals = clampArray([...state.recentSignals, incoming], 36);
  return evaluateConversationWindow(rollingWindowSignals(recentSignals, SEGMENT_SECONDS));
}

function shouldStopRecording(state: ConversationAwarenessState, incoming: AwarenessSignalEvent): WindowEvaluation {
  const recentSignals = clampArray([...state.recentSignals, incoming], 36);
  const window = rollingWindowSignals(recentSignals, SEGMENT_SECONDS);
  const evaluation = evaluateConversationWindow(window);
  return {
    ...evaluation,
    isConversation: !evaluation.isConversation
  };
}

function buildSessionId(): string {
  return `rec_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function buildDebugEventId(): string {
  return `dbg_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function transcriptPreview(input: string | undefined): string | undefined {
  if (!input) return undefined;
  return input.trim().slice(0, 160);
}

async function recordDebugEvent(
  event: Omit<AwarenessDebugEvent, "id" | "timestamp"> & { timestamp?: string }
): Promise<void> {
  await appendAwarenessDebugEvent({
    id: buildDebugEventId(),
    timestamp: event.timestamp ?? nowIso(),
    ...event
  });
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
    deviceId: event.deviceId,
    faceIdentification: event.faceIdentification,
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
    await recordDebugEvent({
      category: "listener",
      message: "Listening disabled from UI",
      level: "warn",
      action: "idle",
      data: { reason: "user_toggle_off" }
    });
  } else {
    state.latestAction = "awaiting_conversation";
    await recordDebugEvent({
      category: "listener",
      message: "Listening enabled from UI",
      level: "info",
      action: "awaiting_conversation",
      data: { reason: "user_toggle_on" }
    });
  }

  await saveAwarenessState(state);
  return state;
}

export async function ingestAwarenessSignal(
  event: Partial<AwarenessSignalEvent> & { source: AwarenessSignalEvent["source"] }
): Promise<{ state: ConversationAwarenessState; session: RecordingSession | null }> {
  const signal = normalizeSignal(event);
  await appendAwarenessEvent(signal);
  await recordDebugEvent({
    category: "ingest",
    message: "Signal ingested",
    level: "info",
    data: {
      audioLevel: signal.audioLevel,
      transcriptWords: signal.transcriptWords,
      transcriptConfidence: signal.transcriptConfidence,
      transcriptText: transcriptPreview(signal.transcriptText)
    }
  });

  const state = await getAwarenessState();

  state.lastUpdatedAt = nowIso();
  state.rollingAudioLevels = clampArray([...state.rollingAudioLevels, signal.audioLevel], 20);
  state.recentSignals = clampArray([...state.recentSignals, signal], 20);
  state.activeSpeakers = topSpeakersFromRecentSignals(state.recentSignals);

  if (!state.listeningEnabled) {
    state.latestAction = "idle";
    await recordDebugEvent({
      category: "decision",
      message: "Listening disabled, ignoring signal",
      level: "warn",
      action: "idle",
      data: {
        audioLevel: signal.audioLevel,
        transcriptWords: signal.transcriptWords,
        transcriptText: transcriptPreview(signal.transcriptText),
        reason: "listening_disabled"
      }
    });
    await saveAwarenessState(state);
    return { state, session: null };
  }

  let activeSession: RecordingSession | null = null;

  if (!state.isRecording) {
    const startEvaluation = shouldStartRecording(state, signal);
    await recordDebugEvent({
      category: "decision",
      message: startEvaluation.isConversation
        ? "Conversation window detected, preparing to record"
        : "Conversation window below threshold",
      level: startEvaluation.isConversation ? "info" : "warn",
      action: startEvaluation.isConversation ? "start_recording" : "awaiting_conversation",
      data: {
        audioLevel: signal.audioLevel,
        transcriptWords: signal.transcriptWords,
        transcriptConfidence: signal.transcriptConfidence,
        transcriptText: transcriptPreview(signal.transcriptText),
        windowSamples: startEvaluation.windowSamples,
        windowDurationSec: startEvaluation.windowDurationSec,
        legibleFrames: startEvaluation.legibleFrames,
        distinctSpeakers: startEvaluation.distinctSpeakers,
        avgAudio: startEvaluation.avgAudio,
        avgConfidence: startEvaluation.avgConfidence,
        words: startEvaluation.words,
        transcriptStrong: startEvaluation.transcriptStrong,
        multiSpeakerStrong: startEvaluation.multiSpeakerStrong,
        audioSpeechBlend: startEvaluation.audioSpeechBlend,
        verdict: startEvaluation.isConversation
      }
    });
    if (startEvaluation.isConversation) {
      const newSession: RecordingSession = {
        id: buildSessionId(),
        startedAt: nowIso(),
        createdBy: "detector",
        speakerWindows: state.activeSpeakers,
        clipPaths: [],
        evidence: evidenceFromSignal(signal),
        faceIdentification: signal.faceIdentification,
      };

      await upsertRecordingSession(newSession);
      state.isRecording = true;
      state.activeSessionId = newSession.id;
      state.latestAction = "start_recording";
      activeSession = newSession;
      await recordDebugEvent({
        category: "recording",
        message: "Recording started",
        level: "info",
        sessionId: newSession.id,
        action: "start_recording",
        data: {
          audioLevel: signal.audioLevel,
          transcriptWords: signal.transcriptWords,
          transcriptText: transcriptPreview(signal.transcriptText),
          reason: "conversation_window_detected"
        }
      });
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
        evidence: mergeEvidence(existing.evidence, signal),
        // Attach face identification if we get one (first match wins)
        faceIdentification: existing.faceIdentification ?? signal.faceIdentification,
      };
      await upsertRecordingSession(updatedSession);
      activeSession = updatedSession;

    }
  }

  const stopEvaluation = shouldStopRecording(state, signal);
  await recordDebugEvent({
    category: "decision",
    message: stopEvaluation.isConversation
      ? "Conversation no longer coherent, stopping recording"
      : "Conversation still coherent, keep recording",
    level: "info",
    sessionId: state.activeSessionId,
    action: stopEvaluation.isConversation ? "stop_recording" : "continue_recording",
    data: {
      audioLevel: signal.audioLevel,
      transcriptWords: signal.transcriptWords,
      transcriptConfidence: signal.transcriptConfidence,
      transcriptText: transcriptPreview(signal.transcriptText),
      windowSamples: stopEvaluation.windowSamples,
      windowDurationSec: stopEvaluation.windowDurationSec,
      legibleFrames: stopEvaluation.legibleFrames,
      distinctSpeakers: stopEvaluation.distinctSpeakers,
      avgAudio: stopEvaluation.avgAudio,
      avgConfidence: stopEvaluation.avgConfidence,
      words: stopEvaluation.words,
      transcriptStrong: stopEvaluation.transcriptStrong,
      multiSpeakerStrong: stopEvaluation.multiSpeakerStrong,
      audioSpeechBlend: stopEvaluation.audioSpeechBlend,
      verdict: stopEvaluation.isConversation
    }
  });
  if (stopEvaluation.isConversation) {
    const endedSessionId = state.activeSessionId;
    await stopActiveSession(state);
    state.isRecording = false;
    state.activeSessionId = undefined;
    state.latestAction = "stop_recording";
    await saveAwarenessState(state);
    await recordDebugEvent({
      category: "recording",
      message: "Recording stopped",
      level: "info",
      sessionId: endedSessionId,
      action: "stop_recording",
      data: {
        audioLevel: signal.audioLevel,
        transcriptWords: signal.transcriptWords,
        transcriptText: transcriptPreview(signal.transcriptText),
        reason: "conversation_window_lost"
      }
    });
    if (endedSessionId) {
      const endedSession = await getRecordingSession(endedSessionId);
      if (endedSession?.endedAt) void saveTimelineBubbleFromSession(endedSession).catch(() => {});
    }
    return { state, session: activeSession };
  }

  state.latestAction = "continue_recording";
  await saveAwarenessState(state);
  await recordDebugEvent({
    category: "recording",
    message: "Recording continues",
    level: "info",
    sessionId: state.activeSessionId,
    action: "continue_recording",
    data: {
      audioLevel: signal.audioLevel,
      transcriptWords: signal.transcriptWords,
      transcriptText: transcriptPreview(signal.transcriptText),
      reason: "conversation_still_coherent"
    }
  });
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
    await recordDebugEvent({
      category: "pipeline",
      message: "Clip upload skipped, session missing",
      level: "warn",
      sessionId,
      data: { reason: "session_not_found" }
    });
    return null;
  }

  const clipPath = await saveRecordedClip(sessionId, audioBase64, mimeType);
  const updated: RecordingSession = {
    ...session,
    clipPaths: [...session.clipPaths, clipPath].slice(-24)
  };

  await upsertRecordingSession(updated);
  await recordDebugEvent({
    category: "pipeline",
    message: "Recorded clip attached",
    level: "info",
    sessionId,
    action: "continue_recording",
    data: {
      reason: "clip_saved"
    }
  });
  return updated;
}

export async function getAwarenessSnapshot() {
  const [state, sessions, recentEvents, debugEvents] = await Promise.all([
    getAwarenessState(),
    getRecordingSessions(),
    listRecentAwarenessEvents(40),
    listRecentAwarenessDebugEvents(80)
  ]);

  return {
    state,
    sessions: sessions.slice(0, 12),
    recentEvents: recentEvents.slice(0, 20),
    debugEvents: debugEvents.slice(0, 50)
  };
}
