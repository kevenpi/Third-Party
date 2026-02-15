import { NextRequest, NextResponse } from "next/server";
import { getEnrolledPerson } from "@/lib/faceRecognition";
import { listTimelineDates, getBubblesForDate } from "@/lib/timelineStorage";
import type { TimelineBubble } from "@/lib/timelineStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/people/[id]
 * Returns a person profile with conversation history from timeline data.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Try to find enrolled person
    const enrolled = await getEnrolledPerson(id);
    const personName = enrolled?.name ?? id.replace(/_/g, " ");

    // Gather conversations for this person from timeline
    const dates = await listTimelineDates();
    const conversations: (TimelineBubble & { dateFormatted: string })[] = [];
    let totalDurationMin = 0;

    for (const date of dates.slice(0, 60)) {
      const bubbles = await getBubblesForDate(date);
      for (const bubble of bubbles) {
        const names = bubble.person
          .split(",")
          .map((n) => n.trim().toLowerCase());
        if (names.includes(personName.toLowerCase()) || names.includes(id.toLowerCase())) {
          const d = new Date(bubble.date);
          conversations.push({
            ...bubble,
            dateFormatted: d.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
          });
          totalDurationMin += bubble.durationMin;
        }
      }
    }

    // Sort by most recent
    conversations.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return b.time.localeCompare(a.time);
    });

    // Compute color band from conversation colors
    const colorBand = conversations
      .slice(0, 7)
      .map((c) => c.color);

    // Auto-generate description
    const convCount = conversations.length;
    const daysSpan = dates.length > 0
      ? Math.ceil(
          (Date.now() - new Date(dates[dates.length - 1]).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;
    const lastTalked = conversations.length > 0 ? conversations[0].date : null;
    const lastTalkedLabel = lastTalked
      ? (() => {
          const d = new Date(lastTalked);
          const today = new Date();
          const diffDays = Math.floor(
            (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
          );
          if (diffDays === 0) return "today";
          if (diffDays === 1) return "yesterday";
          return `${diffDays} days ago`;
        })()
      : "never";

    const stats = `${Math.min(daysSpan, 14)} days · ${convCount} conversations · talked ${lastTalkedLabel}`;

    const profile = {
      id,
      name: personName,
      description: enrolled
        ? `${personName} is a known contact with ${enrolled.photoCount} enrolled face photo${enrolled.photoCount === 1 ? "" : "s"}.`
        : `${personName} appeared in ${convCount} conversation${convCount === 1 ? "" : "s"} on your timeline.`,
      stats,
      colorBand: colorBand.length > 0 ? colorBand : ["#C4B496"],
      conversations: conversations.slice(0, 20).map((c) => ({
        id: c.id,
        sessionId: c.sessionId,
        date: c.date,
        time: c.time,
        color: c.color,
        size: c.size,
        durationMin: c.durationMin,
        dateFormatted: c.dateFormatted,
      })),
      photoCount: enrolled?.photoCount ?? 0,
      isEnrolled: !!enrolled,
      totalDurationMin: Math.round(totalDurationMin * 10) / 10,
    };

    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
