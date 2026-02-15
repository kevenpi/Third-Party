import { promises as fs } from "fs";
import path from "path";
import { AnalyzedDay, DailyReview, SharedSession } from "@shared/types";
import { getDataRoot } from "@/lib/runtimePaths";

const DATA_ROOT = getDataRoot();
const ANALYZED_DIR = path.join(DATA_ROOT, "analyzed-days");
const REVIEWS_DIR = path.join(DATA_ROOT, "reviews");
const SESSIONS_DIR = path.join(DATA_ROOT, "sessions");

async function ensureDirs() {
  await Promise.all([
    fs.mkdir(ANALYZED_DIR, { recursive: true }),
    fs.mkdir(REVIEWS_DIR, { recursive: true }),
    fs.mkdir(SESSIONS_DIR, { recursive: true })
  ]);
}

async function writeJson<T>(filePath: string, value: T): Promise<void> {
  await ensureDirs();
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function dayPath(date: string) {
  return path.join(ANALYZED_DIR, `${date}.json`);
}

function reviewPath(date: string) {
  return path.join(REVIEWS_DIR, `${date}.json`);
}

function sessionPath(date: string) {
  return path.join(SESSIONS_DIR, `${date}.json`);
}

export async function saveAnalyzedDay(day: AnalyzedDay): Promise<void> {
  await writeJson(dayPath(day.date), day);
}

export async function getAnalyzedDay(date: string): Promise<AnalyzedDay | null> {
  return readJson<AnalyzedDay>(dayPath(date));
}

export async function listAnalyzedDays(): Promise<string[]> {
  await ensureDirs();
  const files = await fs.readdir(ANALYZED_DIR);
  return files
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort((a, b) => b.localeCompare(a));
}

export async function getLatestAnalyzedDay(): Promise<AnalyzedDay | null> {
  const dates = await listAnalyzedDays();
  if (dates.length === 0) {
    return null;
  }
  return getAnalyzedDay(dates[0]);
}

export async function saveDailyReview(review: DailyReview): Promise<void> {
  await writeJson(reviewPath(review.date), review);
}

export async function getDailyReview(date: string): Promise<DailyReview | null> {
  return readJson<DailyReview>(reviewPath(date));
}

export async function listReviewDates(): Promise<string[]> {
  await ensureDirs();
  const files = await fs.readdir(REVIEWS_DIR);
  return files
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""))
    .sort((a, b) => b.localeCompare(a));
}

export async function getLatestDailyReview(): Promise<DailyReview | null> {
  const dates = await listReviewDates();
  if (dates.length === 0) {
    return null;
  }
  return getDailyReview(dates[0]);
}

export async function saveSharedSession(dateKey: string, session: SharedSession): Promise<void> {
  await writeJson(sessionPath(dateKey), session);
}
