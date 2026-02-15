import { NextResponse } from "next/server";
import { listEnrolledPeople } from "@/lib/faceRecognition";
import { listTimelineDates, getBubblesForDate } from "@/lib/timelineStorage";
import type { TimelineBubble } from "@/lib/timelineStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PersonSummary {
  id: string;
  name: string;
  conversationCount: number;
  totalDurationMin: number;
  lastTalked: string | null;
  dominantColors: string[];
  photoCount: number;
}

/**
 * GET /api/people
 * Returns all known people aggregated from enrolled faces + timeline bubbles.
 */
export async function GET() {
  try {
    // Gather all people from enrolled faces
    const enrolled = await listEnrolledPeople();
    const peopleMap = new Map<string, PersonSummary>();

    for (const person of enrolled) {
      peopleMap.set(person.name.toLowerCase(), {
        id: person.id,
        name: person.name,
        conversationCount: 0,
        totalDurationMin: 0,
        lastTalked: person.lastSeenAt ?? null,
        dominantColors: [],
        photoCount: person.photoCount,
      });
    }

    // Gather all timeline bubbles and aggregate per person
    const dates = await listTimelineDates();
    const allBubbles: TimelineBubble[] = [];
    for (const date of dates.slice(0, 30)) {
      const bubbles = await getBubblesForDate(date);
      allBubbles.push(...bubbles);
    }

    for (const bubble of allBubbles) {
      const personNames = bubble.person.split(",").map((n) => n.trim()).filter(Boolean);
      for (const name of personNames) {
        if (name === "Me" || name === "Conversation") continue;
        const key = name.toLowerCase();
        const existing = peopleMap.get(key);
        if (existing) {
          existing.conversationCount++;
          existing.totalDurationMin += bubble.durationMin;
          if (!existing.lastTalked || bubble.date > existing.lastTalked) {
            existing.lastTalked = bubble.date;
          }
          if (!existing.dominantColors.includes(bubble.color)) {
            existing.dominantColors.push(bubble.color);
          }
        } else {
          // Person found in timeline but not enrolled
          const id = key.replace(/\s+/g, "_");
          peopleMap.set(key, {
            id,
            name,
            conversationCount: 1,
            totalDurationMin: bubble.durationMin,
            lastTalked: bubble.date,
            dominantColors: [bubble.color],
            photoCount: 0,
          });
        }
      }
    }

    // Sort by most recent conversation
    const people = [...peopleMap.values()].sort((a, b) => {
      if (!a.lastTalked && !b.lastTalked) return 0;
      if (!a.lastTalked) return 1;
      if (!b.lastTalked) return -1;
      return b.lastTalked.localeCompare(a.lastTalked);
    });

    return NextResponse.json({ people });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
