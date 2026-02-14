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

const START_AUDIO_THRESHOLD = 0.1;
const STOP_AUDIO_THRESHOLD = 0.07;

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

function shouldStartRecording(state: ConversationAwarenessState, incoming: AwarenessSignalEvent): boolean {
  const levels = clampArray([...state.rollingAudioLevels, incoming.audioLevel], 6);
  const voiceFrames = levels.filter((level) => level >= START_AUDIO_THRESHOLD).length;

  const recentSignals = clampArray([...state.recentSignals, incoming], 8);
  const distinctSpeakers = new Set(
    recentSignals
      .flatMap((signal) => signal.speakerHints)
      .filter((hint) => hint.speakingScore >= 0.45)
      .map((hint) => hint.personTag)
  );

  const averageLevel = levels.reduce((sum, value) => sum + value, 0) / Math.max(1, levels.length);
  const presenceScores = recentSignals
    .map((signal) => signal.presenceScore ?? 0)
    .filter((score) => score > 0);
  const averagePresence =
    presenceScores.length === 0
      ? 0
      : presenceScores.reduce((sum, score) => sum + score, 0) / presenceScores.length;

  if (voiceFrames >= 2 && (distinctSpeakers.size >= 2 || averageLevel >= 0.25)) {
    return true;
  }

  return voiceFrames >= 2 && averagePresence >= 0.35 && averageLevel >= 0.12;
}

function shouldStopRecording(state: ConversationAwarenessState, incoming: AwarenessSignalEvent): boolean {
  const levels = clampArray([...state.rollingAudioLevels, incoming.audioLevel], 8);
  const voiceFrames = levels.filter((level) => level >= STOP_AUDIO_THRESHOLD).length;
  const recentSignals = clampArray([...state.recentSignals, incoming], 8);
  const presenceScores = recentSignals
    .map((signal) => signal.presenceScore ?? 0)
    .filter((score) => score > 0);
  const averagePresence =
    presenceScores.length === 0
      ? 0
      : presenceScores.reduce((sum, score) => sum + score, 0) / presenceScores.length;

  return levels.length >= 6 && voiceFrames <= 1 && averagePresence < 0.25;
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
        clipPaths: []
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
        speakerWindows: mergeSpeakerWindows(existing.speakerWindows, signal.speakerHints)
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
