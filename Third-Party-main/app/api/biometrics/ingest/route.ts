import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/biometrics/ingest
 * Apple Watch / HealthKit companion pushes real HR/HRV data here.
 * Body: { sessionId: string, hr: number, hrv: number, timestamp?: string }
 *
 * Note: On the client side, the ConversationListener polls this data
 * and injects it into the biometric recorder via injectWatchData().
 * We store the latest values in a simple in-memory map keyed by sessionId.
 */

// In-memory store for latest Apple Watch readings per session
const watchStore = new Map<string, { hr: number; hrv: number; timestamp: string }>();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, hr, hrv, timestamp } = body as {
      sessionId?: string;
      hr?: number;
      hrv?: number;
      timestamp?: string;
    };

    if (!sessionId || typeof hr !== "number" || typeof hrv !== "number") {
      return NextResponse.json(
        { error: "Missing sessionId, hr, or hrv" },
        { status: 400 }
      );
    }

    watchStore.set(sessionId, {
      hr,
      hrv,
      timestamp: timestamp ?? new Date().toISOString(),
    });

    // Trim old entries (keep max 20)
    if (watchStore.size > 20) {
      const oldest = watchStore.keys().next().value;
      if (oldest) watchStore.delete(oldest);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/biometrics/ingest?sessionId=xxx
 * Client polls to get the latest Apple Watch data for injection.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ data: null });
  }
  const data = watchStore.get(sessionId) ?? null;
  return NextResponse.json({ data });
}
