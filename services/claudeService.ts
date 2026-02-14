import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "",
});

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export const analyzeInteractionVibes = async (transcript: string) => {
  const msg = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Analyze this relational interaction transcript for power dynamics, emotional tone, and potential stress points. Respond with a single JSON object (no markdown) with: summary (string), vibeScore (number 0-100), powerAsymmetry (string), redFlags (array of strings), reconciliationSteps (array of strings). Transcript: ${transcript}`,
      },
    ],
  });
  const text = msg.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("");
  try {
    const parsed = JSON.parse(text.replace(/^[^{]*/, "").replace(/[^}]*$/, ""));
    return { summary: "", vibeScore: 0, ...parsed };
  } catch {
    return { summary: text.slice(0, 200), vibeScore: 50, powerAsymmetry: "", redFlags: [], reconciliationSteps: [] };
  }
};

export const mediateConflict = async (transcript: { speaker: string; text: string; tone: string }[]) => {
  const transcriptText = transcript.map((t) => `${t.speaker}: ${t.text} (${t.tone})`).join("\n");
  const msg = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Act as a neutral, third-party AI mediator for this couple's conflict. Review the transcript, identify the core emotional needs beneath the surface argument, and propose 3 specific steps for reconciliation. Focus on de-escalation and empathy. Transcript:\n${transcriptText}`,
      },
    ],
  });
  const text = msg.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("");
  return text.trim();
};

export const generateDailyReflection = async (daySummary: string) => {
  const msg = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `Based on today's relational data, generate a reflective evening check-in question for the user. Data: ${daySummary}`,
      },
    ],
  });
  const text = msg.content.filter((c) => c.type === "text").map((c) => (c as { text: string }).text).join("");
  return text.trim();
};
