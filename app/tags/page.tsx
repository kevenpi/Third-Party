"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Plus, X } from "lucide-react";

interface Conversation {
  id: string;
  time: string;
  person: string;
  durationSec: number;
  color: string;
  date: string;
}

const DEFAULT_TAGS = [
  "important",
  "insightful",
  "heated",
  "emotional",
  "recurring",
  "growth",
];

const TAG_LABELS: Record<string, string> = {
  important: "Important",
  insightful: "Insightful",
  heated: "Heated",
  emotional: "Emotional",
  recurring: "Recurring Issue",
  growth: "Growth Moment",
};

function formatTagLabel(tagId: string): string {
  return TAG_LABELS[tagId] || tagId;
}

function formatDateShort(dateStr: string): string {
  const todayStr = localDateStr(new Date());
  if (dateStr === todayStr) return "Today";
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (dateStr === localDateStr(yest)) return "Yesterday";
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function localDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export default function TagsPage() {
  const router = useRouter();
  const [allConversations, setAllConversations] = useState<Conversation[]>([]);
  const [convTags, setConvTags] = useState<Record<string, string[]>>({});
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  // Load custom tags from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("custom-tags");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setCustomTags(parsed);
      }
    } catch {}
  }, []);

  const allTags = [...DEFAULT_TAGS, ...customTags];

  // Fetch all conversations across all dates
  const loadAllConversations = useCallback(async () => {
    try {
      const listRes = await fetch("/api/timeline?list=1");
      const listData = await listRes.json();
      const dates: string[] = listData.dates ?? [];

      const allConvs: Conversation[] = [];
      const fetches = dates.map(async (date) => {
        try {
          const r = await fetch(`/api/timeline?date=${date}`);
          const data = await r.json();
          const bubbles = (data.bubbles ?? []).map(
            (b: {
              id: string;
              time: string;
              person: string;
              durationSec?: number;
              durationMin?: number;
              color: string;
              date: string;
            }) => ({
              id: b.id,
              time: b.time,
              person: b.person,
              durationSec: b.durationSec ?? Math.round((b.durationMin ?? 0) * 60),
              color: b.color,
              date: b.date || date,
            })
          );
          allConvs.push(...bubbles);
        } catch {}
      });

      await Promise.all(fetches);
      setAllConversations(allConvs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllConversations();
  }, [loadAllConversations]);

  // Load tags from localStorage for every conversation
  useEffect(() => {
    const tagMap: Record<string, string[]> = {};
    for (const conv of allConversations) {
      try {
        const raw = localStorage.getItem(`tags-${conv.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) tagMap[conv.id] = parsed;
        }
      } catch {}
    }
    setConvTags(tagMap);
  }, [allConversations]);

  // Count conversations per tag
  const tagCounts: Record<string, number> = {};
  for (const tag of allTags) {
    tagCounts[tag] = Object.values(convTags).filter((tags) => tags.includes(tag)).length;
  }

  // Get tagged conversations, optionally filtered
  const taggedConversations = allConversations
    .filter((conv) => {
      const tags = convTags[conv.id];
      if (!tags || tags.length === 0) return false;
      if (activeFilter) return tags.includes(activeFilter);
      return true;
    })
    .sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return 0;
    });

  const handleCreateTag = () => {
    const name = newTagName.trim();
    if (!name) return;
    // Don't allow duplicates
    const id = name.toLowerCase();
    if (allTags.includes(id) || allTags.some((t) => formatTagLabel(t).toLowerCase() === id)) return;

    const updated = [...customTags, name];
    setCustomTags(updated);
    localStorage.setItem("custom-tags", JSON.stringify(updated));
    TAG_LABELS[name] = name;
    setNewTagName("");
    setShowCreateInput(false);
  };

  const handleConversationClick = (conv: Conversation) => {
    try {
      sessionStorage.setItem(`conv-person-${conv.id}`, conv.person);
    } catch {}
    router.push(`/conversation/${conv.id}`);
  };

  const handleTagFilter = (tagId: string) => {
    setActiveFilter((prev) => (prev === tagId ? null : tagId));
  };

  return (
    <div className="min-h-screen bg-[#12110F] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => router.back()} className="p-2 -ml-2 text-[rgba(255,255,255,0.9)]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-normal" style={{ fontFamily: "Fraunces, serif" }}>
            Tags
          </h1>
          <div className="w-9" />
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-8" style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}>
        {/* Section A: Your Tags */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[rgba(255,255,255,0.3)] font-medium">Your Tags</p>

          {loading ? (
            <p className="text-sm text-[rgba(255,255,255,0.5)]">Loading...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {allTags.map((tagId) => {
                const isActive = activeFilter === tagId;
                return (
                  <button
                    key={tagId}
                    onClick={() => handleTagFilter(tagId)}
                    className={`rounded-2xl p-4 text-left transition-all ${
                      isActive
                        ? "bg-[rgba(255,255,255,0.1)] border border-[#C4B496]"
                        : "bg-[rgba(255,255,255,0.06)] border border-transparent hover:border-[rgba(255,255,255,0.12)]"
                    }`}
                  >
                    <p className={`text-sm font-medium ${isActive ? "text-[#C4B496]" : "text-[rgba(255,255,255,0.85)]"}`}>
                      {formatTagLabel(tagId)}
                    </p>
                    <p className="text-xs text-[rgba(255,255,255,0.4)] mt-1">
                      {tagCounts[tagId] || 0} conversation{(tagCounts[tagId] || 0) !== 1 ? "s" : ""}
                    </p>
                  </button>
                );
              })}

              {/* Create Tag Card */}
              {!showCreateInput ? (
                <button
                  onClick={() => setShowCreateInput(true)}
                  className="rounded-2xl p-4 text-left border border-dashed border-[rgba(255,255,255,0.15)] hover:border-[#D4B07A] hover:bg-[rgba(212,176,122,0.05)] transition-all group"
                >
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-[rgba(255,255,255,0.4)] group-hover:text-[#D4B07A] transition-colors" />
                    <p className="text-sm text-[rgba(255,255,255,0.4)] group-hover:text-[#D4B07A] transition-colors">
                      Create Tag
                    </p>
                  </div>
                </button>
              ) : (
                <div className="rounded-2xl p-4 bg-[rgba(255,255,255,0.06)] border border-[rgba(255,255,255,0.12)] space-y-3">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateTag();
                      if (e.key === "Escape") {
                        setShowCreateInput(false);
                        setNewTagName("");
                      }
                    }}
                    placeholder="Tag name..."
                    autoFocus
                    className="w-full px-3 py-2 bg-[#12110F] border border-[rgba(255,255,255,0.06)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(212,176,122,0.3)] text-sm text-[rgba(255,255,255,0.9)] placeholder-[rgba(255,255,255,0.3)]"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateTag}
                      disabled={!newTagName.trim()}
                      className="flex-1 flex items-center justify-center gap-1 py-2 bg-gradient-to-r from-[#D4B07A] to-[#E8C97A] text-[#12110F] rounded-lg text-xs font-medium disabled:opacity-40"
                    >
                      <Check className="w-3 h-3" />
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setShowCreateInput(false);
                        setNewTagName("");
                      }}
                      className="px-3 py-2 border border-[rgba(255,255,255,0.06)] rounded-lg text-[rgba(255,255,255,0.5)] text-xs"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Active Filter Indicator */}
        {activeFilter && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[rgba(255,255,255,0.5)]">Showing:</span>
            <span className="text-xs px-2 py-1 rounded-full bg-[rgba(255,255,255,0.1)] border border-[#C4B496] text-[#C4B496]">
              {formatTagLabel(activeFilter)}
            </span>
            <button
              onClick={() => setActiveFilter(null)}
              className="text-xs text-[rgba(255,255,255,0.4)] hover:text-[rgba(255,255,255,0.7)]"
            >
              Clear
            </button>
          </div>
        )}

        {/* Section B: Tagged Conversations */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[rgba(255,255,255,0.3)] font-medium">
            Tagged Conversations
          </p>

          {loading ? (
            <p className="text-sm text-[rgba(255,255,255,0.5)]">Loading...</p>
          ) : taggedConversations.length === 0 ? (
            <div className="rounded-2xl bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.06)] p-6 text-center">
              <p className="text-sm text-[rgba(255,255,255,0.4)]">
                {activeFilter
                  ? `No conversations tagged as "${formatTagLabel(activeFilter)}" yet`
                  : "No tagged conversations yet. Open a conversation and add tags to see them here."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {taggedConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => handleConversationClick(conv)}
                  className="w-full rounded-2xl bg-[rgba(255,255,255,0.06)] border border-transparent hover:border-[rgba(255,255,255,0.12)] p-4 text-left transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Color dot as avatar */}
                      <div
                        className="w-10 h-10 rounded-full flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: conv.color }}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[rgba(255,255,255,0.9)] truncate">
                          {conv.person}
                        </p>
                        <p className="text-xs text-[rgba(255,255,255,0.4)] mt-0.5">
                          {formatDateShort(conv.date)} at {conv.time} -- {formatDuration(conv.durationSec)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 flex-shrink-0 max-w-[120px] justify-end">
                      {(convTags[conv.id] || []).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-2 py-0.5 rounded-full border border-[rgba(255,255,255,0.12)] text-[rgba(255,255,255,0.5)] whitespace-nowrap"
                        >
                          {formatTagLabel(t)}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
