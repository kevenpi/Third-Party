import { NextRequest, NextResponse } from "next/server";
import { enrollFace } from "@/lib/faceRecognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/face/enroll
 * Body: { personId: string, name: string, imageBase64: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { personId, name, imageBase64 } = body as {
      personId?: string;
      name?: string;
      imageBase64?: string;
    };

    if (!personId || !name || !imageBase64) {
      return NextResponse.json(
        { error: "Missing personId, name, or imageBase64" },
        { status: 400 }
      );
    }

    // Basic validation: personId should be alphanumeric/dash/underscore
    if (!/^[a-zA-Z0-9_-]+$/.test(personId)) {
      return NextResponse.json(
        { error: "personId must be alphanumeric (dashes/underscores allowed)" },
        { status: 400 }
      );
    }

    const person = await enrollFace(personId, name.trim(), imageBase64);
    return NextResponse.json({ person });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to enroll face" },
      { status: 500 }
    );
  }
}
