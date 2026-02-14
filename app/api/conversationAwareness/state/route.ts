import { NextResponse } from "next/server";
import { getAwarenessSnapshot } from "@/lib/conversationAwareness";

export async function GET() {
  try {
    const snapshot = await getAwarenessSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
