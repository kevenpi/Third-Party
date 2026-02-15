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

/** Return YYYY-MM-DD in local timezone (not UTC). */
function localDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

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
  voiceConversationId?: string;
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

/**
 * Write a list of bubbles directly for a given date (used by seeding).
 * Merges with existing data by sessionId.
 */
export async function saveBubblesDirect(bubbles: TimelineBubble[]): Promise<void> {
  await ensureTimelineDir();
  // Group by date
  const byDate = new Map<string, TimelineBubble[]>();
  for (const b of bubbles) {
    const list = byDate.get(b.date) ?? [];
    list.push(b);
    byDate.set(b.date, list);
  }
  for (const [date, newBubbles] of byDate) {
    const filePath = bubblePath(date);
    let existing: TimelineBubble[] = [];
    try {
      const raw = await fs.readFile(filePath, "utf8");
      existing = JSON.parse(raw);
    } catch { /* new file */ }
    const existingIds = new Set(existing.map((b) => b.id));
    const merged = [...existing, ...newBubbles.filter((b) => !existingIds.has(b.id))].slice(0, 50);
    await fs.writeFile(filePath, JSON.stringify(merged, null, 2), "utf8");
  }
}

/**
 * Seed sample conversations for demo people so profiles have data.
 * Only runs once — skips if timeline already has data.
 */
export async function seedSampleConversations(): Promise<boolean> {
  const dates = await listTimelineDates();
  if (dates.length > 0) {
    // Check if there are actual bubbles (not just empty files)
    for (const d of dates.slice(0, 3)) {
      const bubbles = await getBubblesForDate(d);
      if (bubbles.length > 0) return false; // already have data
    }
  }

  const today = new Date();
  const dateStr = (daysAgo: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return localDateStr(d);
  };

  const SAMPLE_CONVOS: Omit<TimelineBubble, "id">[] = [
    // Arthur — today
    { sessionId: "seed_arthur_1", time: "7:08 AM", person: "Arthur", durationSec: 180, durationMin: 3, size: "small", color: "#7AB89E", colorName: "calm-sage", date: dateStr(0), score: 0.4, cortisol: 0.2, heartRate: 0.4, meaningfulness: 0.7 },
    { sessionId: "seed_arthur_2", time: "12:45 PM", person: "Arthur", durationSec: 1080, durationMin: 18, size: "large", color: "#B84A3A", colorName: "stress-red", date: dateStr(0), score: 0.8, cortisol: 0.75, heartRate: 0.7, meaningfulness: 0.6 },
    { sessionId: "seed_arthur_3", time: "8:00 PM", person: "Arthur", durationSec: 2100, durationMin: 35, size: "large", color: "#7AB89E", colorName: "repair-sage", date: dateStr(0), score: 0.9, cortisol: 0.3, heartRate: 0.45, meaningfulness: 0.85 },
    // Arthur — yesterday
    { sessionId: "seed_arthur_4", time: "9:30 AM", person: "Arthur", durationSec: 600, durationMin: 10, size: "medium", color: "#6AAAB4", colorName: "steady", date: dateStr(1), score: 0.5, cortisol: 0.3, heartRate: 0.4, meaningfulness: 0.6 },
    { sessionId: "seed_arthur_5", time: "7:15 PM", person: "Arthur", durationSec: 1500, durationMin: 25, size: "large", color: "#D4B07A", colorName: "warm-amber", date: dateStr(1), score: 0.7, cortisol: 0.5, heartRate: 0.55, meaningfulness: 0.7 },
    // Arthur — 3 days ago
    { sessionId: "seed_arthur_6", time: "6:45 PM", person: "Arthur", durationSec: 420, durationMin: 7, size: "small", color: "#7AB89E", colorName: "calm-sage", date: dateStr(3), score: 0.4, cortisol: 0.2, heartRate: 0.35, meaningfulness: 0.65 },
    // Arthur — 5 days ago
    { sessionId: "seed_arthur_7", time: "10:00 AM", person: "Arthur", durationSec: 900, durationMin: 15, size: "medium", color: "#D4B07A", colorName: "warm-amber", date: dateStr(5), score: 0.6, cortisol: 0.45, heartRate: 0.5, meaningfulness: 0.55 },

    // Tane — today
    { sessionId: "seed_tane_1", time: "10:30 AM", person: "Tane", durationSec: 1320, durationMin: 22, size: "large", color: "#6AAAB4", colorName: "steady", date: dateStr(0), score: 0.7, cortisol: 0.25, heartRate: 0.4, meaningfulness: 0.8 },
    // Tane — 2 days ago
    { sessionId: "seed_tane_2", time: "3:00 PM", person: "Tane", durationSec: 1800, durationMin: 30, size: "large", color: "#7AB89E", colorName: "calm-sage", date: dateStr(2), score: 0.85, cortisol: 0.2, heartRate: 0.35, meaningfulness: 0.9 },
    // Tane — 4 days ago
    { sessionId: "seed_tane_3", time: "1:15 PM", person: "Tane", durationSec: 720, durationMin: 12, size: "medium", color: "#B84A3A", colorName: "stress-red", date: dateStr(4), score: 0.65, cortisol: 0.65, heartRate: 0.6, meaningfulness: 0.4 },
    // Tane — 7 days ago
    { sessionId: "seed_tane_4", time: "5:00 PM", person: "Tane", durationSec: 300, durationMin: 5, size: "small", color: "#C4B496", colorName: "neutral-sand", date: dateStr(7), score: 0.35, cortisol: 0.3, heartRate: 0.35, meaningfulness: 0.5 },

    // Kevin — today
    { sessionId: "seed_kevin_1", time: "9:12 AM", person: "Kevin", durationSec: 480, durationMin: 8, size: "medium", color: "#C4B496", colorName: "neutral-sand", date: dateStr(0), score: 0.45, cortisol: 0.3, heartRate: 0.4, meaningfulness: 0.5 },
    { sessionId: "seed_kevin_2", time: "2:15 PM", person: "Kevin", durationSec: 120, durationMin: 2, size: "small", color: "#C4B496", colorName: "neutral-sand", date: dateStr(0), score: 0.25, cortisol: 0.2, heartRate: 0.35, meaningfulness: 0.3 },
    { sessionId: "seed_kevin_3", time: "4:30 PM", person: "Kevin", durationSec: 840, durationMin: 14, size: "medium", color: "#D4B07A", colorName: "warm-amber", date: dateStr(0), score: 0.6, cortisol: 0.5, heartRate: 0.55, meaningfulness: 0.55 },
    // Kevin — 2 days ago
    { sessionId: "seed_kevin_4", time: "11:00 AM", person: "Kevin", durationSec: 960, durationMin: 16, size: "large", color: "#D4B07A", colorName: "warm-amber", date: dateStr(2), score: 0.7, cortisol: 0.55, heartRate: 0.5, meaningfulness: 0.6 },
    // Kevin — 4 days ago
    { sessionId: "seed_kevin_5", time: "3:30 PM", person: "Kevin", durationSec: 600, durationMin: 10, size: "medium", color: "#B84A3A", colorName: "stress-red", date: dateStr(4), score: 0.6, cortisol: 0.7, heartRate: 0.65, meaningfulness: 0.4 },
    // Kevin — 6 days ago
    { sessionId: "seed_kevin_6", time: "10:00 AM", person: "Kevin", durationSec: 360, durationMin: 6, size: "small", color: "#6AAAB4", colorName: "steady", date: dateStr(6), score: 0.4, cortisol: 0.25, heartRate: 0.4, meaningfulness: 0.55 },
  ];

  const bubbles: TimelineBubble[] = SAMPLE_CONVOS.map((c) => ({
    ...c,
    id: `bubble_${c.sessionId}`,
  }));

  await saveBubblesDirect(bubbles);
  return true;
}
