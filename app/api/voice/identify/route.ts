import { NextRequest, NextResponse } from "next/server";
import { identifySpeaker } from "@/lib/voice/azureSpeaker";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.AZURE_SPEECH_KEY) {
      return NextResponse.json(
        { error: "Azure Speech not configured. Set AZURE_SPEECH_KEY and AZURE_SPEECH_REGION." },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("audio") as File | null;
    const profileIdsRaw = formData.get("profileIds") as string | null;

    if (!file) {
      return NextResponse.json({ error: "Missing 'audio' file" }, { status: 400 });
    }
    const profileIds = profileIdsRaw
      ? profileIdsRaw.split(",").map((id) => id.trim()).filter(Boolean)
      : [];
    if (profileIds.length === 0) {
      return NextResponse.json({ error: "Missing or empty 'profileIds' (comma-separated)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await identifySpeaker(profileIds, buffer);

    return NextResponse.json(result ?? { identifiedProfileId: null, confidence: "0" });
  } catch (err) {
    console.error("Identify error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Identification failed" },
      { status: 500 }
    );
  }
}
