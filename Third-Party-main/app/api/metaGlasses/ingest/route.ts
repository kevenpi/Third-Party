import { NextResponse } from "next/server";
import { MetaGlassesSignalPayloadSchema } from "@/lib/schemas";
import { ingestMetaGlassesSignal } from "@/lib/conversationAwareness";

export async function POST(request: Request) {
  try {
    const body = MetaGlassesSignalPayloadSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid request", details: body.error.flatten() },
        { status: 400 }
      );
    }

    const { state, session } = await ingestMetaGlassesSignal(body.data);

    return NextResponse.json({
      state,
      session,
      identityMode: "speaker-hints",
      safetyNotice:
        "Identity cues are based on consented participant tags and speaker hints. Facial recognition is not used."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
