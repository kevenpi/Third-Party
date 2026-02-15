import { NextRequest, NextResponse } from "next/server";
import { listTimelineDates, getBubblesForDate } from "@/lib/timelineStorage";
import { listEnrolledPeople } from "@/lib/faceRecognition";
import type { TimelineBubble } from "@/lib/timelineStorage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/agent/chat
 * Body: { message: string, history?: { role: string, text: string }[] }
 *
 * Uses OpenAI GPT-4o (or Claude if available) to act as a relationship
 * insights agent. Pulls real conversation data to ground the response.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history } = body as {
      message?: string;
      history?: { role: string; text: string }[];
    };

    if (!message?.trim()) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    // Gather context: recent conversations
    const dates = await listTimelineDates();
    const recentDates = dates.slice(0, 7);
    const allBubbles: TimelineBubble[] = [];
    for (const date of recentDates) {
      const bubbles = await getBubblesForDate(date);
      allBubbles.push(...bubbles);
    }

    const people = await listEnrolledPeople();

    // Build context summary
    const contextLines: string[] = [];
    if (people.length > 0) {
      contextLines.push(`People in the user's life: ${people.map((p) => p.name).join(", ")}`);
    }

    // Group conversations by person
    const personConvos = new Map<string, { count: number; totalMin: number; dates: string[] }>();
    for (const bubble of allBubbles) {
      const names = bubble.person.split(",").map((n) => n.trim()).filter((n) => n && n !== "Me" && n !== "Conversation");
      for (const name of names) {
        const existing = personConvos.get(name) ?? { count: 0, totalMin: 0, dates: [] };
        existing.count++;
        existing.totalMin += bubble.durationMin;
        if (!existing.dates.includes(bubble.date)) existing.dates.push(bubble.date);
        personConvos.set(name, existing);
      }
    }

    if (personConvos.size > 0) {
      contextLines.push("\nRecent conversation patterns:");
      for (const [name, data] of personConvos) {
        contextLines.push(
          `- ${name}: ${data.count} conversation${data.count > 1 ? "s" : ""}, ~${Math.round(data.totalMin)} min total, on ${data.dates.length} day${data.dates.length > 1 ? "s" : ""}`
        );
      }
    }

    // Recent stress indicators
    const stressBubbles = allBubbles.filter((b) => b.colorName === "stress-red");
    if (stressBubbles.length > 0) {
      contextLines.push(`\n${stressBubbles.length} high-stress conversation${stressBubbles.length > 1 ? "s" : ""} in the past week:`);
      for (const sb of stressBubbles.slice(0, 3)) {
        contextLines.push(`- ${sb.person} on ${sb.date} (${sb.durationMin} min)`);
      }
    }

    const contextBlock = contextLines.length > 0
      ? `\n\n--- USER'S RECENT DATA ---\n${contextLines.join("\n")}\n---`
      : "";

    const systemPrompt = `You are "The Third Party" — a gentle, insightful AI relationship coach. You have access to the user's recent conversation data (who they talked to, how long, stress levels). Use this to give specific, grounded insights.

Your approach:
- Be warm but honest. Never sugarcoat, but always be kind.
- Reference specific people and patterns from their data when relevant.
- Focus on "what I notice" rather than judgments.
- Suggest concrete actions, not vague advice.
- Keep responses concise (2-4 sentences usually). Be thoughtful, not wordy.
- If the user asks about a specific person, focus on that relationship's patterns.
- Never reveal data the user hasn't shared with you.

${contextBlock}`;

    // Build messages
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
    ];

    if (history && history.length > 0) {
      for (const h of history.slice(-10)) {
        messages.push({
          role: h.role === "user" ? "user" : "assistant",
          content: h.text,
        });
      }
    }
    messages.push({ role: "user", content: message });

    // Try OpenAI first, then Claude
    let responseText = "";

    if (process.env.OPENAI_API_KEY) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o",
            messages,
            max_tokens: 500,
            temperature: 0.7,
          }),
        });
        const data = await res.json();
        responseText = data.choices?.[0]?.message?.content?.trim() ?? "";
      } catch {
        /* fall through to Claude */
      }
    }

    if (!responseText && process.env.ANTHROPIC_API_KEY) {
      try {
        const { default: Anthropic } = await import("@anthropic-ai/sdk");
        const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const response = await client.messages.create({
          model: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-20250514",
          max_tokens: 500,
          system: systemPrompt,
          messages: messages
            .filter((m) => m.role !== "system")
            .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        });
        responseText = response.content
          .map((c: any) => (c.type === "text" ? c.text : ""))
          .join("")
          .trim();
      } catch {
        /* fall through */
      }
    }

    if (!responseText) {
      responseText =
        "I'm here to help you understand your relationships better. To give you the best insights, make sure your OpenAI or Anthropic API key is configured. In the meantime, what's on your mind?";
    }

    return NextResponse.json({ response: responseText });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
