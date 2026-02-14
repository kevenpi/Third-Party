import { NextRequest, NextResponse } from "next/server";
import { getBubbleById } from "@/lib/timelineStorage";
import { getRecordingSession } from "@/lib/awarenessStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const bubble = await getBubbleById(id);
    if (!bubble) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const session = await getRecordingSession(bubble.sessionId);
    const duration = Math.max(1, Math.round(bubble.durationSec));
    const minutes = Math.floor(duration / 60);
    const words = session?.evidence?.transcriptWords ?? 0;
    const confidence =
      session?.evidence && session.evidence.samples > 0
        ? session.evidence.transcriptConfidenceSum / session.evidence.samples
        : 0;

    const aiNarrative =
      words > 0
        ? `Conversation lasted ${minutes} minute${minutes === 1 ? "" : "s"} with ${bubble.person}. Live transcript captured about ${words} words with confidence ${(confidence * 100).toFixed(0)}%.`
        : `Conversation lasted ${minutes} minute${minutes === 1 ? "" : "s"} with ${bubble.person}.`;

    const data = {
      person: bubble.person,
      date: bubble.date,
      time: bubble.time,
      duration,
      color: bubble.color,
      aiNarrative,
      keyMoments: [
        {
          id: "1",
          timestamp: Math.max(1, Math.round(duration * 0.2)),
          timeDisplay: "start",
          description: "Conversation begins",
          color: bubble.color
        },
        {
          id: "2",
          timestamp: Math.max(2, Math.round(duration * 0.8)),
          timeDisplay: "end",
          description: "Conversation ends",
          color: bubble.color
        }
      ]
    };

    return NextResponse.json({ conversation: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
