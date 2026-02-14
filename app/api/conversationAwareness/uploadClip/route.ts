import { NextResponse } from "next/server";
import { UploadRecordedClipSchema } from "@/lib/schemas";
import { attachRecordedClip } from "@/lib/conversationAwareness";

export async function POST(request: Request) {
  try {
    const body = UploadRecordedClipSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid request", details: body.error.flatten() },
        { status: 400 }
      );
    }

    const session = await attachRecordedClip(
      body.data.sessionId,
      body.data.audioBase64,
      body.data.mimeType
    );

    if (!session) {
      return NextResponse.json({ error: "Recording session not found" }, { status: 404 });
    }

    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
