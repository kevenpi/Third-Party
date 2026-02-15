import { NextRequest, NextResponse } from "next/server";
import { enrollFace, tagUnknownFace } from "@/lib/faceRecognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/face/enroll
 * Body:
 *   - { personId: string, name: string, imageBase64: string }
 *   - { personId: string, name: string, unknownFramePath: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { personId, name, imageBase64, unknownFramePath } = body as {
      personId?: string;
      name?: string;
      imageBase64?: string;
      unknownFramePath?: string;
    };

    if (!personId || !name || (!imageBase64 && !unknownFramePath)) {
      return NextResponse.json(
        { error: "Missing personId, name, and enrollment image source" },
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

    const person = unknownFramePath
      ? await tagUnknownFace(unknownFramePath, personId, name.trim())
      : await enrollFace(personId, name.trim(), imageBase64!);
    return NextResponse.json({ person });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to enroll face" },
      { status: 500 }
    );
  }
}
