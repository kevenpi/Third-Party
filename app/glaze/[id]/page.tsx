"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, MoreVertical } from "lucide-react";

interface Insight {
  text: string;
  color: string;
}

interface Conversation {
  date: string;
  color: string;
  size: "small" | "medium" | "large";
}

const GLAZE_DATA: Record<string, {
  name: string;
  description: string;
  stats: string;
  colorBand: string[];
  insights: Insight[];
  conversations: Conversation[];
}> = {
  alex: {
    name: "Alex",
    description: "Alex is your partner. 847 conversations over 4 months. Your dynamic ranges from deeply connected to intensely passionate. You talk most mornings and evenings. Lately you've been navigating a recurring topic around weekend planning that surfaces about once a week.",
    stats: "4 months · 847 conversations · talked today",
    colorBand: [
      "#7AB89E", "#6AAAB4", "#C4B496", "#D4B07A", "#7AB89E",
      "#6AAAB4", "#D4806A", "#C4684A", "#B84A3A", "#7AB89E",
      "#6AAAB4", "#C4B496", "#D4B07A", "#D4806A", "#B84A3A",
      "#7AB89E", "#6AAAB4", "#7AB89E", "#C4B496", "#D4B07A",
    ],
    insights: [
      {
        text: "You tend to lead conversations — you speak about 60% of the time. This has been shifting. Alex is speaking more this month.",
        color: "#7AB89E",
      },
      {
        text: "A topic around finances has come up 3 times recently. Each time, stress rises at the same point.",
        color: "#D4806A",
      },
      {
        text: "Your repair rate is strong. When things get tense, one of you reaches out within hours.",
        color: "#7AB89E",
      },
      {
        text: "Morning conversations are consistently your warmest.",
        color: "#6AAAB4",
      },
    ],
    conversations: [
      { date: "2026-02-14", color: "#7AB89E", size: "small" },
      { date: "2026-02-14", color: "#B84A3A", size: "large" },
      { date: "2026-02-14", color: "#7AB89E", size: "large" },
      { date: "2026-02-13", color: "#6AAAB4", size: "medium" },
      { date: "2026-02-13", color: "#C4B496", size: "small" },
      { date: "2026-02-12", color: "#D4B07A", size: "medium" },
      { date: "2026-02-12", color: "#D4806A", size: "medium" },
      { date: "2026-02-11", color: "#7AB89E", size: "large" },
      { date: "2026-02-10", color: "#6AAAB4", size: "medium" },
      { date: "2026-02-09", color: "#B84A3A", size: "large" },
      { date: "2026-02-08", color: "#7AB89E", size: "small" },
      { date: "2026-02-07", color: "#C4B496", size: "medium" },
      { date: "2026-02-06", color: "#D4B07A", size: "small" },
      { date: "2026-02-05", color: "#7AB89E", size: "large" },
      { date: "2026-02-04", color: "#6AAAB4", size: "medium" },
    ],
  },
};

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getBubbleSize(size: "small" | "medium" | "large"): string {
  switch (size) {
    case "small": return "w-6 h-6";
    case "medium": return "w-8 h-8";
    case "large": return "w-10 h-10";
  }
}

export default function GlazePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [glaze] = useState(GLAZE_DATA[params.id as string] || null);
  const [filter, setFilter] = useState<"recent" | "significant" | "stressful">("recent");

  if (!glaze) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#12110F]">
        <p className="text-[rgba(255,255,255,0.7)]">Person not found</p>
      </div>
    );
  }

  const getInitials = (name: string): string => {
    return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
  };

  // Get oldest and newest dates for color band labels
  const oldestDate = glaze.conversations[glaze.conversations.length - 1]?.date || "";
  const newestDate = glaze.conversations[0]?.date || "";

  return (
    <div className="min-h-screen bg-[#12110F] pb-20">
      {/* Navigation Bar */}
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => router.back()} className="p-2 -ml-2 text-[rgba(255,255,255,0.9)]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-normal" style={{ fontFamily: 'Fraunces, serif' }}>{glaze.name}</h2>
          <button className="p-2 -mr-2 text-[rgba(255,255,255,0.5)]">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-8">
        {/* Person Header */}
        <div className="text-center space-y-4">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#7AB89E] to-[#6AAAB4] flex items-center justify-center text-[#12110F] text-2xl font-semibold mx-auto">
            {getInitials(glaze.name)}
          </div>
          <h1 className="text-3xl font-normal text-[rgba(255,255,255,0.95)]" style={{ fontFamily: 'Fraunces, serif' }}>
            {glaze.name}
          </h1>
          <p className="text-[rgba(255,255,255,0.8)] leading-relaxed px-4" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
            {glaze.description}
          </p>
          <p className="text-sm text-[rgba(255,255,255,0.4)]">{glaze.stats}</p>
        </div>

        {/* Emotional Color Band */}
        <div className="space-y-2">
          <div className="h-8 rounded-lg overflow-hidden flex">
            {glaze.colorBand.map((color, idx) => (
              <div key={idx} style={{ backgroundColor: color, flex: 1 }} />
            ))}
          </div>
          <div className="flex justify-between text-xs text-[rgba(255,255,255,0.3)]">
            <span>{oldestDate ? formatDate(oldestDate) : "Oct 2025"}</span>
            <span>Today</span>
          </div>
        </div>

        {/* AI Pattern Insights */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">Patterns</p>
          <div className="space-y-3">
            {glaze.insights.map((insight, idx) => (
              <div
                key={idx}
                className="warm-card border-l-4"
                style={{ borderLeftColor: insight.color }}
              >
                <p className="text-[rgba(255,255,255,0.8)] leading-relaxed italic" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                  {insight.text}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Conversation History */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">All Conversations</p>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="bg-[#1E1B18] border border-[rgba(255,255,255,0.06)] rounded-lg px-3 py-1 text-xs text-[rgba(255,255,255,0.7)] focus:outline-none focus:ring-2 focus:ring-[rgba(212,176,122,0.3)]"
            >
              <option value="recent">Most recent</option>
              <option value="significant">Most significant</option>
              <option value="stressful">Most stressful</option>
            </select>
          </div>
          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-[rgba(255,255,255,0.06)]"></div>
            <div className="space-y-4">
              {glaze.conversations.map((conv, idx) => {
                const sizeClass = getBubbleSize(conv.size);
                return (
                  <button
                    key={idx}
                    onClick={() => router.push(`/conversation/${conv.date}`)}
                    className="relative flex items-center gap-4 group w-full text-left"
                  >
                    <div
                      className={`${sizeClass} rounded-full -ml-8 transition-all group-hover:scale-125 z-10`}
                      style={{
                        backgroundColor: conv.color,
                        color: conv.color,
                        boxShadow: `0 0 8px ${conv.color}, inset 0 0 4px rgba(255, 255, 255, 0.1)`
                      }}
                    />
                    <div className="flex-1">
                      <p className="text-sm text-[rgba(255,255,255,0.5)]">{formatDate(conv.date)}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
