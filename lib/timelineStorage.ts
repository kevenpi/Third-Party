/**
 * Timeline bubbles: one per conversation session end.
 * Formula: score from cortisol, heart rate, length, meaningfulness → size & color.
 */

import { promises as fs } from "fs";
import path from "path";
import type { RecordingSession } from "@shared/types";
import { getDataRoot } from "@/lib/runtimePaths";

const DATA_ROOT = getDataRoot();
const TIMELINE_DIR = path.join(DATA_ROOT, "timeline");

export interface TimelineBubble {
  id: string;
  sessionId: string;
  time: string;
  person: string;
  durationSec: number;
  durationMin: number;
  size: "small" | "medium" | "large";
  color: string;
  colorName: string;
  date: string;
  score: number;
  cortisol?: number;
  heartRate?: number;
  meaningfulness?: number;
}

async function ensureTimelineDir() {
  await fs.mkdir(TIMELINE_DIR, { recursive: true });
}

function bubblePath(date: string): string {
  return path.join(TIMELINE_DIR, `${date}.json`);
}

/** Placeholder until we have real biometrics: 0–1 */
const DEFAULT_CORTISOL = 0.5;
const DEFAULT_HEART_RATE = 0.5;
const DEFAULT_MEANINGFULNESS = 0.5;

/**
 * Score from formula: length (weight 0.3) + cortisol (0.2) + heart rate (0.2) + meaningfulness (0.3).
 * Higher score → larger bubble. Stress (high cortisol/HR) → red; repair/meaningful → green; else neutral.
 */
function scoreAndStyle(
  durationMin: number,
  cortisol: number = DEFAULT_CORTISOL,
  heartRate: number = DEFAULT_HEART_RATE,
  meaningfulness: number = DEFAULT_MEANINGFULNESS
): { score: number; size: "small" | "medium" | "large"; color: string; colorName: string } {
  const lengthNorm = Math.min(1, durationMin / 30);
  const score =
    lengthNorm * 0.3 +
    cortisol * 0.2 +
    heartRate * 0.2 +
    meaningfulness * 0.3;

  let size: "small" | "medium" | "large" = "small";
  if (score >= 0.6) size = "large";
  else if (score >= 0.35) size = "medium";

  const isHighStress = cortisol >= 0.7 || heartRate >= 0.7;
  const isRepair = meaningfulness >= 0.7 && !isHighStress;
  const color = isHighStress ? "#B84A3A" : isRepair ? "#7AB89E" : score >= 0.5 ? "#6AAAB4" : "#C4B496";
  const colorName = isHighStress ? "stress-red" : isRepair ? "repair-sage" : "steady";

  return { score, size, color, colorName };
}

function isValidConversationSession(session: RecordingSession, durationSec: number): boolean {
  if (durationSec < 60) return false;
  const ev = session.evidence;
  if (!ev) {
    // Backward compatibility: require a reasonable minimum length if evidence missing.
    return durationSec >= 90;
  }
  const avgTranscriptConfidence =
    ev.samples > 0 ? ev.transcriptConfidenceSum / ev.samples : 0;
  const transcriptRichEnough = ev.transcriptWords >= 15 && avgTranscriptConfidence >= 0.35;
  const speechRichEnough = ev.legibleFrames >= 12 && durationSec >= 90;
  return transcriptRichEnough || speechRichEnough;
}

export async function saveTimelineBubbleFromSession(session: RecordingSession): Promise<TimelineBubble | null> {
  if (!session.endedAt) return null;
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt).getTime();
  const durationSec = Math.max(1, Math.round((end - start) / 1000));
  if (!isValidConversationSession(session, durationSec)) return null;
  const durationMin = durationSec / 60;
  const date = session.startedAt.slice(0, 10);
  const time = new Date(session.startedAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });

  // Compute real biometric values from session samples if available
  let realCortisol = DEFAULT_CORTISOL;
  let realHeartRate = DEFAULT_HEART_RATE;
  let realMeaningfulness = DEFAULT_MEANINGFULNESS;
  if (session.biometricSamples && session.biometricSamples.length > 0) {
    const avgStress =
      session.biometricSamples.reduce((s, b) => s + b.stress, 0) /
      session.biometricSamples.length;
    const avgHr =
      session.biometricSamples.reduce((s, b) => s + b.hr, 0) /
      session.biometricSamples.length;
    realCortisol = Math.min(1, avgStress / 100);
    realHeartRate = Math.min(1, avgHr / 120);
    // Meaningfulness = inverse of stress (calm = meaningful)
    realMeaningfulness = Math.min(1, Math.max(0, 1 - realCortisol + 0.2));
  }

  const { score, size, color, colorName } = scoreAndStyle(
    durationMin,
    realCortisol,
    realHeartRate,
    realMeaningfulness
  );

  // Prefer face-identified person, then speaker windows, then generic
  const person =
    session.faceIdentification?.personName
      ?? (session.speakerWindows?.length > 0
        ? session.speakerWindows
            .filter((w) => w.personTag !== "Me")
            .map((w) => w.personTag)
            .join(", ") || session.speakerWindows.map((w) => w.personTag).join(", ")
        : "Conversation");

  const bubble: TimelineBubble = {
    id: `bubble_${session.id}`,
    sessionId: session.id,
    time,
    person,
    durationSec,
    durationMin: Math.round(durationMin * 10) / 10,
    size,
    color,
    colorName,
    date,
    score,
    cortisol: realCortisol,
    heartRate: realHeartRate,
    meaningfulness: realMeaningfulness
  };

  await ensureTimelineDir();
  const filePath = bubblePath(date);
  let existing: TimelineBubble[] = [];
  try {
    const raw = await fs.readFile(filePath, "utf8");
    existing = JSON.parse(raw);
  } catch {
    /* new file */
  }
  const next = [bubble, ...existing.filter((b) => b.sessionId !== session.id)].slice(0, 50);
  await fs.writeFile(filePath, JSON.stringify(next, null, 2), "utf8");
  return bubble;
}

export async function getBubblesForDate(date: string): Promise<TimelineBubble[]> {
  await ensureTimelineDir();
  const filePath = bubblePath(date);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function listTimelineDates(): Promise<string[]> {
  await ensureTimelineDir();
  const files = await fs.readdir(TIMELINE_DIR);
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""))
    .sort((a, b) => b.localeCompare(a));
}

export async function getBubbleById(id: string): Promise<TimelineBubble | null> {
  const dates = await listTimelineDates();
  for (const date of dates) {
    const bubbles = await getBubblesForDate(date);
    const found = bubbles.find((b) => b.id === id);
    if (found) return found;
  }
  return null;
}
