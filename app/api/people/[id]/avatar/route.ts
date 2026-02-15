import { NextRequest, NextResponse } from "next/server";
import { getPersonAvatar } from "@/lib/faceRecognition";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/people/[id]/avatar
 * Returns the person's current avatar image if available.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const avatar = await getPersonAvatar(id);
    if (!avatar) {
      return NextResponse.json({ error: "Avatar not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(avatar.buffer), {
      status: 200,
      headers: {
        "Content-Type": avatar.contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load avatar" },
      { status: 500 }
    );
  }
}
