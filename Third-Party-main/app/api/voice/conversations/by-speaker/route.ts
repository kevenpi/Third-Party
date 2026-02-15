import { NextRequest, NextResponse } from "next/server";
import * as storage from "@/lib/voice/speakerStorage";

export const runtime = "nodejs";

const userId = "default";

/**
 * GET /api/voice/conversations/by-speaker?speakerId=...
 * Returns conversation IDs that contain at least one segment from this speaker.
 * Use for "all conversations with this person" / storing by individuals.
 */
export async function GET(request: NextRequest) {
  try {
    const speakerId = request.nextUrl.searchParams.get("speakerId");
    if (!speakerId) {
      return NextResponse.json(
        { error: "Missing speakerId query parameter" },
        { status: 400 }
      );
    }
    const conversationIds = storage.getConversationIdsBySpeaker(userId, speakerId);
    const speakers = storage.loadSpeakers(userId);
    const speaker = speakers.find((s) => s.id === speakerId);
    return NextResponse.json({
      speakerId,
      display_name: speaker?.display_name ?? null,
      conversationIds,
      count: conversationIds.length,
    });
  } catch (err) {
    console.error("By-speaker error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
