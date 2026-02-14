import { NextResponse } from "next/server";
import { ensureDemoDay } from "@/lib/demoData";
import { getAnalyzedDay, getLatestAnalyzedDay, listAnalyzedDays } from "@/lib/storage";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date");
    const list = searchParams.get("list");

    if (list === "1") {
      const dates = await listAnalyzedDays();
      return NextResponse.json({ dates });
    }

    const day = date ? await getAnalyzedDay(date) : await getLatestAnalyzedDay();

    if (!day && !date) {
      // Try to use existing demo data first (2026-02-14) before generating new
      const existingDemo = await getAnalyzedDay("2026-02-14");
      if (existingDemo) {
        return NextResponse.json({ day: existingDemo });
      }
      
      // Only generate if we have API key, otherwise return error
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
          { error: "No analyzed day found and API key not configured" },
          { status: 404 }
        );
      }
      
      const generated = await ensureDemoDay();
      return NextResponse.json({ day: generated });
    }

    if (!day) {
      return NextResponse.json({ error: "No analyzed day found" }, { status: 404 });
    }

    return NextResponse.json({ day });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
