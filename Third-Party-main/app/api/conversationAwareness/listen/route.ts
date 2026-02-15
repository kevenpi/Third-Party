import { NextResponse } from "next/server";
import { AwarenessControlSchema } from "@/lib/schemas";
import { setListeningEnabled } from "@/lib/conversationAwareness";

export async function POST(request: Request) {
  try {
    const body = AwarenessControlSchema.safeParse(await request.json());
    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid request", details: body.error.flatten() },
        { status: 400 }
      );
    }

    const state = await setListeningEnabled(body.data.listeningEnabled);
    return NextResponse.json({ state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
