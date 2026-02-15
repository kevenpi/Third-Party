import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureDemoReview } from "@/lib/demoData";
import { buildDailyReview, buildDraftReflections } from "@/lib/review";
import {
  getAnalyzedDay,
  getDailyReview,
  getLatestDailyReview,
  listReviewDates,
  saveDailyReview
} from "@/lib/storage";
import { DailyReflectionSchema, DailyReviewSchema } from "@/lib/schemas";

const SaveReviewSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reflections: z.array(DailyReflectionSchema)
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const latest = searchParams.get("latest");
  const list = searchParams.get("list");

  if (list === "1") {
    const dates = await listReviewDates();
    return NextResponse.json({ dates });
  }

  if (latest === "1") {
    const review = await getLatestDailyReview();
    if (review) {
      return NextResponse.json({ review });
    }
    const generated = await ensureDemoReview();
    return NextResponse.json({ review: generated });
  }

  if (!date) {
    return NextResponse.json({ error: "date query param is required" }, { status: 400 });
  }

  const saved = await getDailyReview(date);
  if (saved) {
    return NextResponse.json({ review: saved });
  }

  const day = await getAnalyzedDay(date);
  if (!day) {
    return NextResponse.json({ error: "Analyzed day not found" }, { status: 404 });
  }

  const draft = buildDailyReview(day, buildDraftReflections(day));
  const validated = DailyReviewSchema.parse(draft);
  await saveDailyReview(validated);

  return NextResponse.json({ review: validated });
}

export async function POST(request: Request) {
  try {
    const parsed = SaveReviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const day = await getAnalyzedDay(parsed.data.date);
    if (!day) {
      return NextResponse.json({ error: "Analyzed day not found" }, { status: 404 });
    }

    const review = buildDailyReview(day, parsed.data.reflections);
    const validated = DailyReviewSchema.safeParse(review);

    if (!validated.success) {
      return NextResponse.json(
        { error: "Review output failed validation", details: validated.error.flatten() },
        { status: 500 }
      );
    }

    await saveDailyReview(validated.data);
    return NextResponse.json({ review: validated.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
