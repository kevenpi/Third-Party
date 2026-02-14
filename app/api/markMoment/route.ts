import { NextResponse } from "next/server";
import { z } from "zod";
import { getAnalyzedDay, saveAnalyzedDay } from "@/lib/storage";

const MarkSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  momentId: z.string().min(1),
  ignored: z.boolean()
});

export async function POST(request: Request) {
  try {
    const parsed = MarkSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { date, momentId, ignored } = parsed.data;
    const day = await getAnalyzedDay(date);
    if (!day) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }

    day.moments = day.moments.map((moment) =>
      moment.id === momentId ? { ...moment, ignored } : moment
    );

    await saveAnalyzedDay(day);
    return NextResponse.json({ ok: true, day });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
