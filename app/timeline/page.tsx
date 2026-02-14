"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";

interface Conversation {
  id: string;
  time: string;
  person: string;
  duration: number;
  size: "small" | "medium" | "large";
  color: string;
  colorName: string;
  date: string;
}

const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: "1",
    time: "7:08 AM",
    person: "Alex",
    duration: 3,
    size: "small",
    color: "#7AB89E",
    colorName: "calm-sage",
    date: "2026-02-14",
  },
  {
    id: "2",
    time: "9:12 AM",
    person: "Sam",
    duration: 8,
    size: "medium",
    color: "#C4B496",
    colorName: "neutral-sand",
    date: "2026-02-14",
  },
  {
    id: "3",
    time: "10:30 AM",
    person: "Jordan",
    duration: 22,
    size: "large",
    color: "#6AAAB4",
    colorName: "calm-teal",
    date: "2026-02-14",
  },
  {
    id: "4",
    time: "12:45 PM",
    person: "Alex",
    duration: 18,
    size: "large",
    color: "#B84A3A",
    colorName: "stress-red",
    date: "2026-02-14",
  },
  {
    id: "5",
    time: "2:15 PM",
    person: "Sam",
    duration: 2,
    size: "small",
    color: "#C4B496",
    colorName: "neutral-sand",
    date: "2026-02-14",
  },
  {
    id: "6",
    time: "4:30 PM",
    person: "Mom",
    duration: 14,
    size: "medium",
    color: "#D4B07A",
    colorName: "warm-amber",
    date: "2026-02-14",
  },
  {
    id: "7",
    time: "8:00 PM",
    person: "Alex",
    duration: 35,
    size: "large",
    color: "#7AB89E",
    colorName: "peaceful-sage",
    date: "2026-02-14",
  },
];

function getBubbleSize(size: "small" | "medium" | "large"): string {
  switch (size) {
    case "small": return "w-12 h-12";
    case "medium": return "w-20 h-20";
    case "large": return "w-[120px] h-[120px]";
  }
}

function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "short" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function getDatePills(): string[] {
  const pills: string[] = [];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    pills.push(date.toISOString().slice(0, 10));
  }
  return pills;
}

export default function TimelinePage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [conversations, setConversations] = useState<Conversation[]>(SAMPLE_CONVERSATIONS);
  const [dates] = useState<string[]>(getDatePills());

  const todayDisplay = formatDateDisplay(selectedDate);
  const isToday = selectedDate === new Date().toISOString().slice(0, 10);

  const handleBubbleClick = (conversation: Conversation) => {
    router.push(`/conversation/${conversation.id}`);
  };

  return (
    <div className="min-h-screen bg-[#12110F] pb-20 relative">
      {/* Top Bar */}
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-normal" style={{ fontFamily: 'Fraunces, serif' }}>Today</h1>
            <p className="text-sm text-[rgba(255,255,255,0.5)] mt-0.5">{todayDisplay}</p>
          </div>
          <button className="p-2 text-[rgba(255,255,255,0.7)] hover:text-[rgba(255,255,255,0.9)]">
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Date Selector */}
        <div className="px-4 pb-3 overflow-x-auto">
          <div className="flex gap-2">
            {dates.map((date) => {
              const isSelected = date === selectedDate;
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    isSelected
                      ? "bg-gradient-to-r from-[#D4B07A] to-[#E8C97A] text-[#12110F]"
                      : "bg-[#1E1B18] text-[rgba(255,255,255,0.5)] hover:text-[rgba(255,255,255,0.7)] border border-[rgba(255,255,255,0.06)]"
                  }`}
                >
                  {formatDateShort(date)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="max-w-md mx-auto px-4 py-8 relative">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
            <div 
              className="w-24 h-24 rounded-full pulse-glow"
              style={{ 
                backgroundColor: "#D4B07A",
                color: "#D4B07A",
                boxShadow: "0 0 30px #D4B07A, 0 0 60px #D4B07A, inset 0 0 20px rgba(255, 255, 255, 0.1)"
              }}
            />
            <p className="text-[rgba(255,255,255,0.7)] text-center">Your day is just beginning</p>
          </div>
        ) : (
          <div className="relative">
            {/* Thread Line */}
            <div className="thread-line" />

            {/* Start of Day Label */}
            <div className="relative mb-8 text-center">
              <p className="text-xs text-[rgba(255,255,255,0.3)] italic">Start of your day</p>
            </div>

            {/* Conversation Bubbles */}
            <div className="space-y-16">
              {conversations.map((conv, index) => {
                const sizeClass = getBubbleSize(conv.size);
                const isLeft = index % 2 === 0;
                const isLast = index === conversations.length - 1;

                return (
                  <div key={conv.id} className="relative flex items-center min-h-[80px]">
                    {/* Left Label */}
                    {isLeft && (
                      <div className="absolute right-[calc(50%+60px)] text-right pr-4 w-[calc(50%-60px)]">
                        <p className="text-sm font-medium text-[rgba(255,255,255,0.95)] truncate">{conv.person}</p>
                        <p className="text-xs text-[rgba(255,255,255,0.5)]">{conv.time}</p>
                        <p className="text-xs text-[rgba(255,255,255,0.4)]">{conv.duration} min</p>
                      </div>
                    )}

                    {/* Bubble */}
                    <div className="absolute left-1/2 -translate-x-1/2 z-10">
                      <button
                        onClick={() => handleBubbleClick(conv)}
                        className={`bubble ${sizeClass} cursor-pointer ${isLast && isToday ? "pulse-glow" : ""}`}
                        style={{
                          backgroundColor: conv.color,
                          color: conv.color,
                        }}
                      />
                    </div>

                    {/* Right Label */}
                    {!isLeft && (
                      <div className="absolute left-[calc(50%+60px)] text-left pl-4 w-[calc(50%-60px)]">
                        <p className="text-sm font-medium text-[rgba(255,255,255,0.95)] truncate">{conv.person}</p>
                        <p className="text-xs text-[rgba(255,255,255,0.5)]">{conv.time}</p>
                        <p className="text-xs text-[rgba(255,255,255,0.4)]">{conv.duration} min</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Time Anchors */}
            {conversations.length > 0 && (
              <div className="mt-16 space-y-12">
                <div className="relative text-center">
                  <p className="text-xs text-[rgba(255,255,255,0.2)]">Morning</p>
                </div>
                <div className="relative text-center">
                  <p className="text-xs text-[rgba(255,255,255,0.2)]">Afternoon</p>
                </div>
                <div className="relative text-center">
                  <p className="text-xs text-[rgba(255,255,255,0.2)]">Evening</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
