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

const DATES = [
  "2026-02-14",
  "2026-02-13",
  "2026-02-12",
  "2026-02-11",
  "2026-02-10",
  "2026-02-09",
  "2026-02-08",
  "2026-02-07",
  "2026-02-06",
  "2026-02-05",
  "2026-02-04",
  "2026-02-03",
  "2026-02-02",
  "2026-02-01",
];

const PEOPLE = ["Arthur", "Tane", "Kevin"] as const;
const TIMES = ["7:10 AM", "9:25 AM", "12:40 PM", "3:15 PM", "6:45 PM", "9:05 PM"] as const;

function buildDayConversations(date: string, dayIndex: number): Conversation[] {
  const longMoment = dayIndex % 3;
  return TIMES.map((time, idx) => {
    const person = PEOPLE[(dayIndex + idx) % PEOPLE.length];
    const isHighStress = idx === (dayIndex + 2) % TIMES.length;
    const isRepair = idx === (dayIndex + 4) % TIMES.length;

    const duration = isHighStress
      ? 16 + ((dayIndex + idx) % 11)
      : isRepair
        ? 20 + ((dayIndex + idx) % 12)
        : 4 + ((dayIndex * 2 + idx) % 8);

    return {
      id: String((idx % 7) + 1),
      time,
      person,
      duration,
      size: idx === longMoment || isRepair ? "large" : duration > 10 ? "medium" : "small",
      color: isHighStress ? "#B84A3A" : isRepair ? "#7AB89E" : idx % 2 === 0 ? "#6AAAB4" : "#C4B496",
      colorName: isHighStress ? "stress-red" : isRepair ? "repair-sage" : "steady",
      date,
    };
  });
}

const CONVERSATIONS_BY_DATE: Record<string, Conversation[]> = Object.fromEntries(
  DATES.map((date, idx) => [date, buildDayConversations(date, idx)])
);

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

function timeToMinutes(timeLabel: string): number {
  const [clock, period] = timeLabel.split(" ");
  const [rawHour, rawMinute] = clock.split(":").map(Number);
  const hour12 = rawHour % 12;
  const hour24 = period === "PM" ? hour12 + 12 : hour12;
  return hour24 * 60 + rawMinute;
}

export default function TimelinePage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<string>(DATES[0]);
  const [dates] = useState<string[]>(DATES);

  const conversations = CONVERSATIONS_BY_DATE[selectedDate] ?? [];
  const orderedConversations = [...conversations].sort((a, b) => timeToMinutes(b.time) - timeToMinutes(a.time));

  const todayDisplay = formatDateDisplay(selectedDate);
  const isToday = selectedDate === DATES[0];

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

            {/* Timeline Start Label */}
            <div className="relative mb-8 text-center">
              <p className="text-xs text-[rgba(255,255,255,0.3)] italic">Most recent</p>
            </div>

            {/* Conversation Bubbles */}
            <div className="space-y-16">
              {orderedConversations.map((conv, index) => {
                const sizeClass = getBubbleSize(conv.size);
                const isLeft = index % 2 === 0;
                const isMostRecent = index === 0;

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
                        className={`bubble ${sizeClass} cursor-pointer ${isMostRecent && isToday ? "pulse-glow" : ""}`}
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

            {/* Timeline End Label */}
            {conversations.length > 0 && (
              <div className="mt-12 relative text-center">
                <p className="text-xs text-[rgba(255,255,255,0.2)] italic">Start of your day</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
