import { NextResponse } from "next/server";
import { z } from "zod";
import { generateSharedSessionWithAgent } from "@/lib/claudeAgent";
import { PartnerSafeReviewSchema, SharedSessionSchema } from "@/lib/schemas";
import { saveSharedSession } from "@/lib/storage";

const RequestSchema = z.object({
  myReview: PartnerSafeReviewSchema,
  partnerReview: PartnerSafeReviewSchema
});

export async function POST(request: Request) {
  try {
    const parsed = RequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const session = await generateSharedSessionWithAgent(
      parsed.data.myReview,
      parsed.data.partnerReview
    );

    const validated = SharedSessionSchema.safeParse(session);
    if (!validated.success) {
      return NextResponse.json(
        { error: "Shared session failed validation", details: validated.error.flatten() },
        { status: 500 }
      );
    }

    const dateKey = `${parsed.data.myReview.date}_${parsed.data.partnerReview.date}`;
    await saveSharedSession(dateKey, validated.data);

    return NextResponse.json({ session: validated.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
