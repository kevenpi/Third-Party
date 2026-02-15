import { NextRequest, NextResponse } from "next/server";
import { identifyFace, saveUnknownFace, touchPerson } from "@/lib/faceRecognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/face/identify
 * Body: { frameBase64: string, saveUnknown?: boolean, sessionId?: string }
 * Returns: { person: { id, name, confidence } | null, unknownFramePath?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { frameBase64, saveUnknown, sessionId } = body as {
      frameBase64?: string;
      saveUnknown?: boolean;
      sessionId?: string;
    };

    if (!frameBase64) {
      return NextResponse.json(
        { error: "Missing frameBase64" },
        { status: 400 }
      );
    }

    const result = await identifyFace(frameBase64);

    if (!result) {
      // Save unknown face for later tagging if requested
      let unknownFramePath: string | undefined;
      if (saveUnknown && sessionId) {
        unknownFramePath = await saveUnknownFace(sessionId, frameBase64);
      }
      return NextResponse.json({ person: null, unknownFramePath });
    }

    // Update lastSeenAt
    void touchPerson(result.personId);

    return NextResponse.json({
      person: {
        id: result.personId,
        name: result.personName,
        confidence: result.confidence,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Identification failed" },
      { status: 500 }
    );
  }
}
