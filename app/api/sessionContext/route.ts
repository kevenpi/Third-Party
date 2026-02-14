import { NextResponse } from "next/server";
import { ensureDemoReview, loadDemoPartnerReview } from "@/lib/demoData";

export async function GET() {
  try {
    const [myReview, partnerReview] = await Promise.all([
      ensureDemoReview(),
      loadDemoPartnerReview()
    ]);

    return NextResponse.json({
      myReview: myReview.partnerSafe,
      partnerReview
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
