import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || "",
});

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export type ConversationRealityDecision = {
  isConversation: boolean;
  confidence: number;
  rationale: string;
  signals: string[];
  provider: "claude" | "heuristic";
};

function parseJsonFromClaude(text: string): Record<string, unknown> | null {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function heuristicConversationDecision(transcript: string): ConversationRealityDecision {
  const cleaned = transcript.trim();
  const words = cleaned.split(/\s+/).filter(Boolean).length;
  const speakerTurns = cleaned
    .split("\n")
    .filter((line) => /^[^:\n]{1,30}:\s+/.test(line.trim())).length;
  const questionMarks = (cleaned.match(/\?/g) ?? []).length;
  const turnTaking = speakerTurns >= 3;
  const enoughWords = words >= 18;
  const dialogSignal = questionMarks >= 1 || /you|i|we|us/i.test(cleaned);
  const isConversation = enoughWords && (turnTaking || dialogSignal);
  const confidence = isConversation ? 0.68 : 0.35;
  const signals = [
    `word_count=${words}`,
    `speaker_turns=${speakerTurns}`,
    `question_marks=${questionMarks}`,
  ];
  const rationale = isConversation
    ? "Heuristic detected sustained dialog-like language."
    : "Heuristic detected low dialog signal or too-short snippet.";
  return { isConversation, confidence, rationale, signals, provider: "heuristic" };
}

export async function classifyRealConversation(transcript: string): Promise<ConversationRealityDecision> {
  const normalized = transcript.trim().slice(0, 8000);
  if (!normalized) {
    return {
      isConversation: false,
      confidence: 0.01,
      rationale: "Transcript is empty.",
      signals: ["word_count=0"],
      provider: "heuristic",
    };
  }

  const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
  if (!hasApiKey) {
    return heuristicConversationDecision(normalized);
  }

  try {
    const msg = await client.messages.create({
      model: DEFAULT_MODEL,
      max_tokens: 350,
      messages: [
        {
          role: "user",
          content: [
            "You are a strict classifier for wearable-audio snippets.",
            "Decide whether this transcript is a genuine interpersonal conversation, not random speech/noise/monologue/TV/background chatter.",
            "Output exactly one JSON object with this shape:",
            "{",
            '  "isConversation": boolean,',
            '  "confidence": number,',
            '  "rationale": string,',
            '  "signals": string[]',
            "}",
            "confidence must be 0..1.",
            "signals should be short evidence tags like speaker_turns, question_response, noise_like, very_short.",
            "No markdown.",
            "",
            "Transcript:",
            normalized,
          ].join("\n"),
        },
      ],
    });

    const text = msg.content
      .filter((c) => c.type === "text")
      .map((c) => (c as { text: string }).text)
      .join("")
      .trim();
    const parsed = parseJsonFromClaude(text);
    if (!parsed) {
      const fallback = heuristicConversationDecision(normalized);
      return {
        ...fallback,
        rationale: `Claude parse failed; fallback heuristic used. ${fallback.rationale}`,
      };
    }

    const confidenceRaw = parsed.confidence;
    const confidence =
      typeof confidenceRaw === "number"
        ? Math.max(0, Math.min(1, confidenceRaw))
        : 0.5;
    const signalsRaw = parsed.signals;
    const signals = Array.isArray(signalsRaw)
      ? signalsRaw.filter((s): s is string => typeof s === "string").slice(0, 8)
      : [];

    return {
      isConversation: parsed.isConversation === true,
      confidence,
      rationale:
        typeof parsed.rationale === "string" && parsed.rationale.trim().length > 0
          ? parsed.rationale.trim().slice(0, 300)
          : "Claude returned no rationale.",
      signals,
      provider: "claude",
    };
  } catch {
    return heuristicConversationDecision(normalized);
  }
}

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
