"use client";

import { useState, useCallback, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";

interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export default function AgentPage() {
  const [isConnected, setIsConnected] = useState(true);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [sending, setSending] = useState(false);
  const [hasGreeted, setHasGreeted] = useState(false);

  // Auto-greet on first visit
  useEffect(() => {
    if (hasGreeted || messages.length > 0) return;
    setHasGreeted(true);
    setSending(true);

    fetch("/api/agent/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Give me a brief insight about my recent conversations and relationships. Be specific if you have data.",
        history: [],
      }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.response) {
          setMessages([
            {
              id: Date.now().toString(),
              role: "assistant",
              text: data.response,
              timestamp: "Just now",
            },
          ]);
        }
      })
      .catch(() => {})
      .finally(() => setSending(false));
  }, [hasGreeted, messages.length]);

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || sending) return;

    const userMessage: AgentMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: inputValue.trim(),
      timestamp: "Just now",
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputValue("");
    setSending(true);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage.text,
          history: updatedMessages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();

      const assistantMessage: AgentMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: data.response ?? "I'm having trouble connecting right now. Try again in a moment.",
        timestamp: "Just now",
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          text: "Something went wrong. Please try again.",
          timestamp: "Just now",
        },
      ]);
    } finally {
      setSending(false);
    }
  }, [inputValue, sending, messages]);

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#12110F] pb-20 flex items-center">
        <div className="max-w-md mx-auto px-4 py-12 space-y-8 text-center">
          <div className="flex items-center justify-center gap-8 mb-8">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7AB89E] to-[#6AAAB4]"></div>
            <div className="w-12 h-0.5 bg-gradient-to-r from-[#7AB89E] to-[#6AAAB4]"></div>
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7AB89E] to-[#6AAAB4]"></div>
          </div>

          <h1 className="text-3xl font-normal text-[rgba(255,255,255,0.95)]" style={{ fontFamily: 'Fraunces, serif' }}>
            The Third Party
          </h1>

          <div className="space-y-4 text-[rgba(255,255,255,0.8)] leading-relaxed" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            <p>
              The Agent watches your conversations and relationships over time. It sees patterns you might miss — what elevates your stress, what brings you closer, what keeps repeating.
            </p>
            <p>
              Ask it anything about your relationships. It responds with specific observations grounded in your actual conversations.
            </p>
            <p className="italic">
              Think of it as a wise friend who remembers every conversation and only speaks to help.
            </p>
          </div>

          <button
            onClick={() => setIsConnected(true)}
            className="w-full py-4 px-6 bg-gradient-to-r from-[#D4B07A] to-[#E8C97A] text-[#12110F] rounded-2xl font-medium shadow-lg hover:scale-[1.02] transition-all"
          >
            Start talking to the Agent
          </button>

          <p className="text-xs text-[rgba(255,255,255,0.4)]">
            Everything stays on your device. The Agent uses your conversation data to give personalized insights.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#12110F] pb-32 flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4 text-center">
          <h2 className="text-lg font-normal text-[rgba(255,255,255,0.9)]" style={{ fontFamily: 'Fraunces, serif' }}>
            The Third Party
          </h2>
          <p className="text-xs text-[rgba(255,255,255,0.4)]">Your relationship insights agent</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-4 py-8 space-y-4">
          {messages.length === 0 && !sending && (
            <div className="text-center py-12 space-y-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7AB89E] to-[#6AAAB4] mx-auto opacity-60" />
              <p className="text-[rgba(255,255,255,0.5)] italic" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                Ask me about your relationships, patterns, or anything on your mind.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`${message.role === "user" ? "flex justify-end" : ""}`}
            >
              <div
                className={`rounded-2xl px-4 py-3 max-w-[85%] ${
                  message.role === "user"
                    ? "bg-gradient-to-r from-[#D4B07A]/20 to-[#E8C97A]/20 text-[rgba(255,255,255,0.9)]"
                    : "warm-card"
                }`}
              >
                <p
                  className={`leading-relaxed ${message.role === "assistant" ? "text-[rgba(255,255,255,0.9)] italic" : "text-[rgba(255,255,255,0.9)]"}`}
                  style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
                >
                  {message.text}
                </p>
              </div>
            </div>
          ))}

          {sending && (
            <div className="flex items-center gap-2 text-[rgba(255,255,255,0.5)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm italic">Thinking...</span>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="fixed bottom-16 left-0 right-0 z-50 bg-[#12110F]/95 backdrop-blur-md border-t border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Ask about your relationships..."
              disabled={sending}
              className="flex-1 px-4 py-3 bg-[#1E1B18] border border-[rgba(255,255,255,0.06)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(212,176,122,0.3)] text-[rgba(255,255,255,0.9)] placeholder-[rgba(255,255,255,0.4)] disabled:opacity-50"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            />
            <button
              onClick={handleSend}
              disabled={sending || !inputValue.trim()}
              className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#D4B07A] to-[#E8C97A] text-[#12110F] flex items-center justify-center hover:scale-105 transition-all disabled:opacity-50"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
