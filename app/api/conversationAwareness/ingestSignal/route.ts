import { NextResponse } from "next/server";
import { IngestSignalRequestSchema } from "@/lib/schemas";
import { ingestAwarenessSignal } from "@/lib/conversationAwareness";

export async function POST(request: Request) {
  try {
    const body = IngestSignalRequestSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid request", details: body.error.flatten() },
        { status: 400 }
      );
    }

    const { state, session } = await ingestAwarenessSignal({
      source: body.data.source,
      timestamp: body.data.timestamp,
      audioLevel: body.data.audioLevel,
      presenceScore: body.data.presenceScore,
      transcriptText: body.data.transcriptText,
      transcriptWords: body.data.transcriptWords,
      transcriptConfidence: body.data.transcriptConfidence,
      speakerHints: body.data.speakerHints,
      deviceId: body.data.deviceId
    });

    return NextResponse.json({ state, session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
