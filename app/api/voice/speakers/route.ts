import { NextRequest, NextResponse } from "next/server";
import * as storage from "@/lib/voice/speakerStorage";

export const runtime = "nodejs";

const userId = "default";

/** GET: list speakers for the user. */
export async function GET() {
  try {
    const speakers = storage.loadSpeakers(userId);
    return NextResponse.json({
      speakers: speakers.map((s) => ({
        id: s.id,
        display_name: s.display_name,
        created_at: s.created_at,
        last_seen_at: s.last_seen_at,
      })),
    });
  } catch (err) {
    console.error("Speakers list error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

/** PATCH: set display_name for a speaker (e.g. "Roommate", "Mom"). */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { speakerId, display_name } = body as { speakerId?: string; display_name?: string };
    if (!speakerId || typeof display_name !== "string") {
      return NextResponse.json(
        { error: "speakerId and display_name required" },
        { status: 400 }
      );
    }
    const speakers = storage.loadSpeakers(userId);
    const s = speakers.find((x) => x.id === speakerId);
    if (!s) {
      return NextResponse.json({ error: "Speaker not found" }, { status: 404 });
    }
    s.display_name = display_name.trim() || null;
    storage.saveSpeakers(userId, speakers);
    return NextResponse.json({ ok: true, speaker: { id: s.id, display_name: s.display_name } });
  } catch (err) {
    console.error("Speaker update error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
