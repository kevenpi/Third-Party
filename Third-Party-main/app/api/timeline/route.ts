import { NextRequest, NextResponse } from "next/server";
import { getBubblesForDate, listTimelineDates } from "@/lib/timelineStorage";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";

/**
 * GET /api/timeline?date=YYYY-MM-DD  → bubbles for that date.
 * GET /api/timeline?list=1           → list of dates that have bubbles.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const list = searchParams.get("list");
    const date = searchParams.get("date");

    if (list === "1") {
      const dates = await listTimelineDates();
      return NextResponse.json({ dates });
    }

    const day = date ?? (() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const bubbles = await getBubblesForDate(day);
    return NextResponse.json({ date: day, bubbles });
  } catch (err) {
    console.error("Timeline API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
