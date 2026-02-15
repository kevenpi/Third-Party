import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getRecordingSession, resolveRecordedClipPath } from "@/lib/awarenessStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webm") return "audio/webm";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  return "application/octet-stream";
}

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.nextUrl.searchParams.get("sessionId");
    if (!sessionId) {
      return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
    }
    const session = await getRecordingSession(sessionId);
    if (!session || session.clipPaths.length === 0) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }
    const latest = session.clipPaths[session.clipPaths.length - 1];
    const absolutePath = resolveRecordedClipPath(latest);
    if (!fs.existsSync(absolutePath)) {
      return NextResponse.json({ error: "Clip file missing" }, { status: 404 });
    }
    const fileBuffer = fs.readFileSync(absolutePath);
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeFromExt(absolutePath),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
