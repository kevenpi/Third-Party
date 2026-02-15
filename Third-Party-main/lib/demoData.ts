import { analyzeDayWithAgent } from "@/lib/claudeAgent";
import { parseSpikesInput } from "@/lib/parsers";
import { buildDailyReview, buildDraftReflections } from "@/lib/review";
import { PartnerSafeReviewSchema } from "@/lib/schemas";
import { loadSamplePartnerReview, loadSampleSpikesText, loadSampleTranscript } from "@/lib/sample";
import { getAnalyzedDay, getDailyReview, saveAnalyzedDay, saveDailyReview } from "@/lib/storage";
import { DailyReview, PartnerSafeReview } from "@shared/types";

const DEMO_PARTNER_NAME = "Maya (girlfriend)";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export async function ensureDemoDay(date: string = todayDate()) {
  const existing = await getAnalyzedDay(date);
  if (existing) {
    return existing;
  }

  const [transcript, spikesText] = await Promise.all([loadSampleTranscript(), loadSampleSpikesText()]);
  const day = await analyzeDayWithAgent({
    date,
    whoWith: DEMO_PARTNER_NAME,
    transcript: transcript.trim(),
    spikes: parseSpikesInput(spikesText)
  });

  await saveAnalyzedDay(day);
  return day;
}

export async function ensureDemoReview(date: string = todayDate()): Promise<DailyReview> {
  const existing = await getDailyReview(date);
  if (existing) {
    return existing;
  }

  const day = await ensureDemoDay(date);
  const review = buildDailyReview(day, buildDraftReflections(day));
  await saveDailyReview(review);
  return review;
}

export async function loadDemoPartnerReview(date: string = todayDate()): Promise<PartnerSafeReview> {
  const raw = await loadSamplePartnerReview();
  const parsed = PartnerSafeReviewSchema.parse(JSON.parse(raw));

  return {
    ...parsed,
    date,
    whoWith: "You",
    createdAt: new Date().toISOString()
  };
}
