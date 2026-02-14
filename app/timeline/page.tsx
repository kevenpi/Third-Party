"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Settings, Power } from "lucide-react";

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

const PEOPLE = ["Arthur", "Tane", "Kevin"] as const;
const TIMES = ["7:10 AM", "9:25 AM", "12:40 PM", "3:15 PM", "6:45 PM", "9:05 PM"] as const;

function getRecentDates(count: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function archiveConversationsForDate(date: string): Conversation[] {
  const hash = [...date].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const longMoment = hash % 3;
  return TIMES.map((time, idx) => {
    const person = PEOPLE[(hash + idx) % PEOPLE.length];
    const isHighStress = idx === (hash + 2) % TIMES.length;
    const isRepair = idx === (hash + 4) % TIMES.length;
    const duration = isHighStress
      ? 16 + ((hash + idx) % 11)
      : isRepair
        ? 20 + ((hash + idx) % 12)
        : 4 + ((hash * 2 + idx) % 8);
    return {
      id: String((idx % 7) + 1),
      time,
      person,
      duration,
      size: idx === longMoment || isRepair ? "large" : duration > 10 ? "medium" : "small",
      color: isHighStress ? "#B84A3A" : isRepair ? "#7AB89E" : idx % 2 === 0 ? "#6AAAB4" : "#C4B496",
      colorName: isHighStress ? "stress-red" : isRepair ? "repair-sage" : "steady",
      date
    };
  });
}

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
  const parts = timeLabel.match(/(\d+):?(\d*)\s*(AM|PM)?/i);
  if (!parts) return 0;
  let hour = parseInt(parts[1], 10) || 0;
  const min = parseInt(parts[2], 10) || 0;
  const period = (parts[3] || "").toUpperCase();
  if (period === "PM" && hour < 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return hour * 60 + min;
}

export default function TimelinePage() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [dates, setDates] = useState<string[]>(() => getRecentDates(14));
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [appOn, setAppOn] = useState(false);
  const [toggleBusy, setToggleBusy] = useState(false);

  const loadBubbles = useCallback(async (date: string) => {
    try {
      const r = await fetch(`/api/timeline?date=${date}`);
      const data = await r.json();
      if (!r.ok) return;
      const bubbles = (data.bubbles ?? []).map((b: { id: string; time: string; person: string; durationMin: number; size: "small" | "medium" | "large"; color: string; colorName: string; date: string }) => ({
        id: b.id,
        time: b.time,
        person: b.person,
        duration: b.durationMin,
        size: b.size,
        color: b.color,
        colorName: b.colorName,
        date: b.date,
      }));
      setConversations(bubbles);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBubbles(selectedDate);
  }, [selectedDate, loadBubbles]);

  useEffect(() => {
    if (selectedDate !== today) return;
    const id = setInterval(() => loadBubbles(today), 8000);
    return () => clearInterval(id);
  }, [selectedDate, today, loadBubbles]);

  useEffect(() => {
    fetch("/api/timeline?list=1")
      .then((r) => r.json())
      .then((data) => {
        const fromApi = (data.dates ?? []) as string[];
        const recent = getRecentDates(14);
        const merged = [...new Set([...recent, ...fromApi])].sort((a, b) => b.localeCompare(a));
        setDates(merged.slice(0, 14));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/conversationAwareness/state")
      .then((r) => r.json())
      .then((data) => setAppOn(data?.state?.listeningEnabled === true))
      .catch(() => {});
  }, []);

  const toggleApp = useCallback(async () => {
    setToggleBusy(true);
    try {
      const next = !appOn;
      const r = await fetch("/api/conversationAwareness/listen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listeningEnabled: next }),
      });
      if (r.ok) setAppOn(next);
    } finally {
      setToggleBusy(false);
    }
  }, [appOn]);

  const displayConversations =
    conversations.length === 0 && selectedDate !== today
      ? archiveConversationsForDate(selectedDate)
      : conversations;
  const orderedConversations = [...displayConversations].sort((a, b) => timeToMinutes(b.time) - timeToMinutes(a.time));
  const todayDisplay = formatDateDisplay(selectedDate);
  const isToday = selectedDate === today;

  const handleBubbleClick = (conversation: Conversation) => {
    router.push(`/conversation/${conversation.id}`);
  };

  return (
    <div className="min-h-screen bg-[#12110F] pb-20 relative">
      {/* Top Bar */}
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-normal" style={{ fontFamily: "Fraunces, serif" }}>Today</h1>
            <p className="text-sm text-[rgba(255,255,255,0.5)] mt-0.5">{todayDisplay}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleApp}
              disabled={toggleBusy}
              className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium transition-all ${
                appOn
                  ? "bg-[#7AB89E]/30 text-[#7AB89E] border border-[#7AB89E]/50"
                  : "bg-[#1E1B18] text-[rgba(255,255,255,0.5)] border border-[rgba(255,255,255,0.1)]"
              }`}
            >
              <Power className="w-4 h-4" />
              {appOn ? "On" : "Off"}
            </button>
            <button
              onClick={() => router.push("/settings")}
              className="p-2 text-[rgba(255,255,255,0.7)] hover:text-[rgba(255,255,255,0.9)]"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
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
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[40vh]">
            <p className="text-[rgba(255,255,255,0.5)]">Loading…</p>
          </div>
        ) : displayConversations.length === 0 ? (
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
            {displayConversations.length > 0 && (
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
