import { promises as fs } from "fs";
import path from "path";
import { getDataRoot } from "@/lib/runtimePaths";
import {
  AwarenessDebugEvent,
  AwarenessSignalEvent,
  ConversationAwarenessState,
  RecordingSession
} from "@shared/types";
import {
  AwarenessDebugEventSchema,
  AwarenessSignalEventSchema,
  ConversationAwarenessStateSchema,
  RecordingSessionSchema
} from "@/lib/schemas";

const DATA_ROOT = getDataRoot();
const AWARENESS_ROOT = path.join(DATA_ROOT, "awareness");
const EVENTS_DIR = path.join(AWARENESS_ROOT, "events");
const DEBUG_EVENTS_PATH = path.join(AWARENESS_ROOT, "debugEvents.json");
const CLIPS_DIR = path.join(AWARENESS_ROOT, "clips");
const STATE_PATH = path.join(AWARENESS_ROOT, "state.json");
const SESSIONS_PATH = path.join(AWARENESS_ROOT, "sessions.json");

export function createEmptyAwarenessState(): ConversationAwarenessState {
  return {
    listeningEnabled: true,
    isRecording: false,
    lastUpdatedAt: new Date().toISOString(),
    activeSessionId: undefined,
    activeSpeakers: [],
    rollingAudioLevels: [],
    recentSignals: [],
    latestAction: "idle"
  };
}

async function ensureAwarenessDirs() {
  await Promise.all([
    fs.mkdir(AWARENESS_ROOT, { recursive: true }),
    fs.mkdir(EVENTS_DIR, { recursive: true }),
    fs.mkdir(CLIPS_DIR, { recursive: true })
  ]);
}

async function readJsonOrNull<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJson<T>(filePath: string, value: T): Promise<void> {
  await ensureAwarenessDirs();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function eventFilePath(dateKey: string): string {
  return path.join(EVENTS_DIR, `${dateKey}.json`);
}

function clipFileExtension(mimeType: string): string {
  if (mimeType.includes("webm")) {
    return "webm";
  }
  if (mimeType.includes("mpeg") || mimeType.includes("mp3")) {
    return "mp3";
  }
  if (mimeType.includes("wav")) {
    return "wav";
  }
  if (mimeType.includes("ogg")) {
    return "ogg";
  }
  return "bin";
}

function parseBase64Payload(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("data:")) {
    const [, b64] = trimmed.split(",");
    return b64 ?? "";
  }
  return trimmed;
}

export async function getAwarenessState(): Promise<ConversationAwarenessState> {
  await ensureAwarenessDirs();
  const raw = await readJsonOrNull<ConversationAwarenessState>(STATE_PATH);
  if (!raw) {
    return createEmptyAwarenessState();
  }

  const parsed = ConversationAwarenessStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : createEmptyAwarenessState();
}

export async function saveAwarenessState(state: ConversationAwarenessState): Promise<void> {
  const parsed = ConversationAwarenessStateSchema.parse(state);
  await writeJson(STATE_PATH, parsed);
}

export async function getRecordingSessions(): Promise<RecordingSession[]> {
  await ensureAwarenessDirs();
  const raw = await readJsonOrNull<RecordingSession[]>(SESSIONS_PATH);
  if (!raw || !Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => RecordingSessionSchema.safeParse(entry))
    .filter((result): result is { success: true; data: RecordingSession } => result.success)
    .map((result) => result.data)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function saveRecordingSessions(sessions: RecordingSession[]): Promise<void> {
  const parsed = sessions.map((session) => RecordingSessionSchema.parse(session));
  await writeJson(SESSIONS_PATH, parsed);
}

export async function upsertRecordingSession(session: RecordingSession): Promise<void> {
  const sessions = await getRecordingSessions();
  const next = sessions.filter((item) => item.id !== session.id);
  next.unshift(RecordingSessionSchema.parse(session));
  await saveRecordingSessions(next.slice(0, 200));
}

export async function getRecordingSession(sessionId: string): Promise<RecordingSession | null> {
  const sessions = await getRecordingSessions();
  return sessions.find((session) => session.id === sessionId) ?? null;
}

export async function appendAwarenessEvent(event: AwarenessSignalEvent): Promise<void> {
  await ensureAwarenessDirs();

  const parsed = AwarenessSignalEventSchema.parse(event);
  const dateKey = parsed.timestamp.slice(0, 10);
  const filePath = eventFilePath(dateKey);

  const existing = (await readJsonOrNull<AwarenessSignalEvent[]>(filePath)) ?? [];
  const next = [...existing, parsed].slice(-5000);
  await writeJson(filePath, next);
}

export async function appendAwarenessDebugEvent(event: AwarenessDebugEvent): Promise<void> {
  await ensureAwarenessDirs();
  const parsed = AwarenessDebugEventSchema.parse(event);
  const existing = (await readJsonOrNull<AwarenessDebugEvent[]>(DEBUG_EVENTS_PATH)) ?? [];
  const next = [...existing, parsed].slice(-1500);
  await writeJson(DEBUG_EVENTS_PATH, next);
}

export async function listRecentAwarenessEvents(limit = 80): Promise<AwarenessSignalEvent[]> {
  await ensureAwarenessDirs();
  const filenames = (await fs.readdir(EVENTS_DIR))
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => b.localeCompare(a));

  const collected: AwarenessSignalEvent[] = [];

  for (const filename of filenames) {
    if (collected.length >= limit) {
      break;
    }

    const raw = await readJsonOrNull<AwarenessSignalEvent[]>(path.join(EVENTS_DIR, filename));
    if (!raw || !Array.isArray(raw)) {
      continue;
    }

    const valid = raw
      .map((item) => AwarenessSignalEventSchema.safeParse(item))
      .filter((result): result is { success: true; data: AwarenessSignalEvent } => result.success)
      .map((result) => result.data)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    for (const event of valid) {
      if (collected.length >= limit) {
        break;
      }
      collected.push(event);
    }
  }

  return collected.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export async function listRecentAwarenessDebugEvents(limit = 120): Promise<AwarenessDebugEvent[]> {
  await ensureAwarenessDirs();
  const raw = (await readJsonOrNull<AwarenessDebugEvent[]>(DEBUG_EVENTS_PATH)) ?? [];
  const valid = raw
    .map((item) => AwarenessDebugEventSchema.safeParse(item))
    .filter((result): result is { success: true; data: AwarenessDebugEvent } => result.success)
    .map((result) => result.data)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return valid.slice(0, limit);
}

export async function saveRecordedClip(
  sessionId: string,
  audioBase64: string,
  mimeType: string
): Promise<string> {
  await ensureAwarenessDirs();

  const cleanedBase64 = parseBase64Payload(audioBase64);
  const buffer = Buffer.from(cleanedBase64, "base64");
  const extension = clipFileExtension(mimeType);
  const filename = `${sessionId}_${Date.now()}.${extension}`;
  const outputPath = path.join(CLIPS_DIR, filename);

  await fs.writeFile(outputPath, buffer);

  return path.join("data", "awareness", "clips", filename);
}

/** Resolve persisted clip path to an absolute runtime path. */
export function resolveRecordedClipPath(clipPath: string): string {
  if (path.isAbsolute(clipPath)) return clipPath;
  return path.join(CLIPS_DIR, path.basename(clipPath));
}
