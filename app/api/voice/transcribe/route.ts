import { NextRequest, NextResponse } from "next/server";
import { transcribeWithDiarization } from "@/lib/voice/googleDiarization";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_CLOUD_PROJECT) {
      return NextResponse.json(
        { error: "Google Cloud credentials not configured. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_CLOUD_PROJECT." },
        { status: 503 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("audio") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Missing 'audio' file" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const minSpeakers = parseInt(String(formData.get("minSpeakerCount") || "1"), 10);
    const maxSpeakers = parseInt(String(formData.get("maxSpeakerCount") || "6"), 10);

    const result = await transcribeWithDiarization(buffer, {
      languageCode: String(formData.get("languageCode") || "en-US"),
      minSpeakerCount: Math.max(1, minSpeakers),
      maxSpeakerCount: Math.min(10, Math.max(1, maxSpeakers)),
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Transcribe error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Transcription failed" },
      { status: 500 }
    );
  }
}
