import { NextResponse } from "next/server";

export const runtime = "nodejs";

const EMBEDDER_URL = process.env.SPEAKER_EMBEDDER_URL;
const HEALTH_URL = EMBEDDER_URL ? new URL("/health", EMBEDDER_URL.replace(/\/embed\/?$/, "")).toString() : null;

/**
 * GET: report whether speaker embedder is configured and reachable.
 * Returns { configured, ok, model? } so UI can show "Real voice ID" vs "Placeholder".
 */
export async function GET() {
  const configured = Boolean(EMBEDDER_URL);
  if (!HEALTH_URL) {
    return NextResponse.json({ configured: false, ok: false });
  }
  try {
    const res = await fetch(HEALTH_URL, { method: "GET", signal: AbortSignal.timeout(5000) });
    const ok = res.ok;
    const body = ok ? await res.json().catch(() => ({})) : {};
    return NextResponse.json({
      configured: true,
      ok,
      model: (body as { model?: string }).model ?? undefined,
    });
  } catch {
    return NextResponse.json({ configured: true, ok: false });
  }
}
