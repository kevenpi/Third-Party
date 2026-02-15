export function getOpenAIApiKey(): string | undefined {
  // Prefer standard OpenAI env var, but allow common project aliases.
  return (
    process.env.OPENAI_API_KEY ||
    process.env.CHATGPT_API_KEY ||
    process.env.OPENAI_TRANSCRIBE_API_KEY
  );
}

export function hasOpenAIApiKey(): boolean {
  return Boolean(getOpenAIApiKey());
}
