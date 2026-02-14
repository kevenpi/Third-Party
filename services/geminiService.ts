
import { GoogleGenAI, Type } from "@google/genai";

const API_KEY = process.env.API_KEY || "";
const ai = new GoogleGenAI({ apiKey: API_KEY });

export const analyzeInteractionVibes = async (transcript: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Analyze this relational interaction transcript for power dynamics, emotional tone, and potential stress points. Provide a summary and metrics. Transcript: ${transcript}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          vibeScore: { type: Type.NUMBER, description: "Scale 0-100" },
          powerAsymmetry: { type: Type.STRING, description: "Who is dominating?" },
          redFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
          reconciliationSteps: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["summary", "vibeScore"]
      }
    }
  });
  return JSON.parse(response.text);
};

export const mediateConflict = async (transcript: any[]) => {
  const transcriptText = transcript.map(t => `${t.speaker}: ${t.text} (${t.tone})`).join('\n');
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Act as a neutral, third-party AI mediator for this couple's conflict. Review the transcript, identify the core emotional needs beneath the surface argument, and propose 3 specific steps for reconciliation. Focus on de-escalation and empathy. Transcript: \n${transcriptText}`,
    config: {
      thinkingConfig: { thinkingBudget: 2000 }
    }
  });
  return response.text;
};

export const generateDailyReflection = async (daySummary: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Based on today's relational data, generate a reflective evening check-in question for the user. Data: ${daySummary}`,
  });
  return response.text;
};
