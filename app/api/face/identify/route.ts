import { NextRequest, NextResponse } from "next/server";
import { identifyFace, saveUnknownFace, touchPerson } from "@/lib/faceRecognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/face/identify
 * Body:
 *   - { frameBase64: string, saveUnknown?: boolean, sessionId?: string }
 *   - { confirmPersonId: string, confirmPersonName: string } for user-confirmed uncertain matches
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { frameBase64, saveUnknown, sessionId, confirmPersonId, confirmPersonName } = body as {
      frameBase64?: string;
      saveUnknown?: boolean;
      sessionId?: string;
      confirmPersonId?: string;
      confirmPersonName?: string;
    };

    if (confirmPersonId && confirmPersonName) {
      void touchPerson(confirmPersonId);
      return NextResponse.json({
        person: {
          id: confirmPersonId,
          name: confirmPersonName,
          confidence: "high" as const,
        },
        confirmedByUser: true,
      });
    }

    if (!frameBase64) {
      return NextResponse.json(
        { error: "Missing frameBase64" },
        { status: 400 }
      );
    }

    const result = await identifyFace(frameBase64);

    if (!result.person) {
      let unknownFramePath: string | undefined;
      if (saveUnknown && sessionId) {
        unknownFramePath = await saveUnknownFace(sessionId, frameBase64);
      }
      return NextResponse.json({
        person: null,
        uncertainCandidate: result.uncertainCandidate
          ? {
              id: result.uncertainCandidate.personId,
              name: result.uncertainCandidate.personName,
              confidence: result.uncertainCandidate.confidence,
            }
          : null,
        unknownFramePath,
        noEnrolledFaces: result.noEnrolledFaces,
      });
    }

    void touchPerson(result.person.personId);

    return NextResponse.json({
      person: {
        id: result.person.personId,
        name: result.person.personName,
        confidence: result.person.confidence,
      },
      uncertainCandidate: null,
      noEnrolledFaces: false,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Identification failed" },
      { status: 500 }
    );
  }
}
