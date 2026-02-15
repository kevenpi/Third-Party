import { NextResponse } from "next/server";
import { listEnrolledPeople } from "@/lib/faceRecognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/face/people
 * Returns all enrolled people with metadata.
 */
export async function GET() {
  try {
    const people = await listEnrolledPeople();
    return NextResponse.json({ people });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list people" },
      { status: 500 }
    );
  }
}
