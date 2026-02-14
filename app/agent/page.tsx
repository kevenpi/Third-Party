"use client";

import { useState } from "react";
import { Send } from "lucide-react";

interface AgentMessage {
  id: string;
  text: string;
  timestamp: string;
}

const SAMPLE_INSIGHTS: AgentMessage[] = [
  {
    id: "1",
    text: "You've both been circling the same topic this week — from different angles. You're feeling unheard about the weekend. Alex is feeling overwhelmed by decisions. You're both reaching for the same thing: to feel like a team. You're closer than you think.",
    timestamp: "2 hours ago",
  },
  {
    id: "2",
    text: "I noticed something. When Alex brings up work stress, your responses have been shorter than usual. They might read that as disinterest. You might just be tired. Naming that could shift a lot.",
    timestamp: "Yesterday",
  },
  {
    id: "3",
    text: "Something worth seeing: when planning comes up, you decide quickly and Alex needs more time. Neither is wrong. But the difference in pace is creating friction.",
    timestamp: "3 days ago",
  },
  {
    id: "4",
    text: "After the tense call yesterday, you texted Alex within 20 minutes. That reaching — even when it's hard — is the strongest pattern in your relationship. I see it consistently.",
    timestamp: "5 days ago",
  },
];

export default function AgentPage() {
  const [isConnected, setIsConnected] = useState(true); // Set to true to show connected state
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [inputValue, setInputValue] = useState("");

  const handleSend = () => {
    if (!inputValue.trim()) return;

    const newMessage: AgentMessage = {
      id: Date.now().toString(),
      text: `Thank you for asking. Based on what I'm seeing, ${inputValue.toLowerCase()} is something worth exploring together. I'd suggest starting with how you both feel about it, rather than jumping to solutions.`,
      timestamp: "Just now",
    };

    setMessages([newMessage, ...messages]);
    setInputValue("");
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#12110F] pb-20 flex items-center">
        <div className="max-w-md mx-auto px-4 py-12 space-y-8 text-center">
          {/* Visual Element */}
          <div className="flex items-center justify-center gap-8 mb-8">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7AB89E] to-[#6AAAB4]"></div>
            <div className="w-12 h-0.5 bg-gradient-to-r from-[#7AB89E] to-[#6AAAB4]"></div>
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#7AB89E] to-[#6AAAB4]"></div>
          </div>

          {/* Title */}
          <h1 className="text-3xl font-normal text-[rgba(255,255,255,0.95)]" style={{ fontFamily: 'Fraunces, serif' }}>
            The Third Party
          </h1>

          {/* Explanatory Text */}
          <div className="space-y-4 text-[rgba(255,255,255,0.8)] leading-relaxed" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            <p>
              When you and someone you trust both connect, the Agent can see both sides — both hearts, both perspectives.
            </p>
            <p>
              It never reveals what one person shares privately. It holds both truths and helps you understand each other.
            </p>
            <p className="italic">
              Think of it as a mediator who knows both hearts and only speaks to create peace.
            </p>
          </div>

          {/* Primary Action */}
          <button
            onClick={() => setIsConnected(true)}
            className="w-full py-4 px-6 bg-gradient-to-r from-[#D4B07A] to-[#E8C97A] text-[#12110F] rounded-2xl font-medium shadow-lg hover:scale-[1.02] transition-all"
          >
            Invite someone to connect
          </button>

          {/* Privacy Note */}
          <p className="text-xs text-[rgba(255,255,255,0.4)]">
            Everything is encrypted. Nothing is shared without mutual consent.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#12110F] pb-32 flex flex-col">
      {/* Connection Header */}
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7AB89E] to-[#6AAAB4] flex items-center justify-center text-[#12110F] font-semibold">
              Y
            </div>
            <div className="w-8 h-0.5 bg-gradient-to-r from-[#7AB89E] to-[#6AAAB4]"></div>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#7AB89E] to-[#6AAAB4] flex items-center justify-center text-[#12110F] font-semibold">
              A
            </div>
          </div>
          <p className="text-center text-sm text-[rgba(255,255,255,0.9)] mt-2" style={{ fontFamily: 'Fraunces, serif' }}>
            You & Alex
          </p>
          <p className="text-center text-xs text-[rgba(255,255,255,0.4)]">Connected since November 2025</p>
        </div>
      </div>

      {/* Agent Insights */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto px-4 py-8 space-y-6">
          {[...messages, ...SAMPLE_INSIGHTS].map((message) => (
            <div
              key={message.id}
              className="warm-card space-y-2 fade-up"
            >
              <p className="text-[rgba(255,255,255,0.9)] leading-relaxed italic" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                {message.text}
              </p>
              <p className="text-xs text-[rgba(255,255,255,0.4)]">{message.timestamp}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Ask the Agent Input */}
      <div className="fixed bottom-16 left-0 right-0 z-50 bg-[#12110F]/95 backdrop-blur-md border-t border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask the Agent anything"
              className="flex-1 px-4 py-3 bg-[#1E1B18] border border-[rgba(255,255,255,0.06)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(212,176,122,0.3)] text-[rgba(255,255,255,0.9)] placeholder-[rgba(255,255,255,0.4)]"
              style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
            />
            <button
              onClick={handleSend}
              className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#D4B07A] to-[#E8C97A] text-[#12110F] flex items-center justify-center hover:scale-105 transition-all"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
