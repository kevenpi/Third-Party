"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Plus } from "lucide-react";

interface Person {
  id: string;
  name: string;
  description: string;
  lastConversation: string;
  emotionalColors: string[];
  avatarGradient: string;
}

const SAMPLE_PEOPLE: Person[] = [
  {
    id: "arthur",
    name: "Arthur",
    description: "You reconnect most evenings. Honest, direct conversations with growing repair patterns.",
    lastConversation: "today at 9:05 PM",
    emotionalColors: ["#6AAAB4", "#B84A3A", "#7AB89E", "#6AAAB4"],
    avatarGradient: "from-[#6AAAB4] to-[#7AB89E]",
  },
  {
    id: "tane",
    name: "Tane",
    description: "Your closest friend. Consistent check-ins, mostly calm, occasionally tense when stressed.",
    lastConversation: "today at 6:45 PM",
    emotionalColors: ["#C4B496", "#6AAAB4", "#7AB89E"],
    avatarGradient: "from-[#C4B496] to-[#6AAAB4]",
  },
  {
    id: "kevin",
    name: "Kevin",
    description: "A longtime friend. Practical and grounded conversations with occasional friction around plans.",
    lastConversation: "yesterday at 8:00 PM",
    emotionalColors: ["#D4B07A", "#B84A3A", "#7AB89E"],
    avatarGradient: "from-[#D4B07A] to-[#B84A3A]",
  },
];

export default function PeoplePage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  function getInitials(name: string): string {
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  const filteredPeople = SAMPLE_PEOPLE.filter(person =>
    person.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#12110F] pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-normal" style={{ fontFamily: 'Fraunces, serif' }}>People</h1>
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="p-2 text-[rgba(255,255,255,0.7)] hover:text-[rgba(255,255,255,0.9)]"
          >
            {showSearch ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
          </button>
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div className="px-4 pb-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search people..."
                className="w-full px-4 py-3 pl-10 bg-[#1E1B18] border border-[rgba(255,255,255,0.06)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(212,176,122,0.3)] text-[rgba(255,255,255,0.9)] placeholder-[rgba(255,255,255,0.4)]"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgba(255,255,255,0.4)]" />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
                >
                  <X className="w-4 h-4 text-[rgba(255,255,255,0.4)]" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* People List */}
      <div className="max-w-md mx-auto px-4 py-6">
        {filteredPeople.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[rgba(255,255,255,0.5)]">No people found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPeople.map((person) => (
              <button
                key={person.id}
                onClick={() => router.push(`/glaze/${person.id}`)}
                className="w-full warm-card flex items-center gap-4 hover:bg-[#2A2623] transition-all text-left"
              >
                {/* Avatar */}
                <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${person.avatarGradient} flex items-center justify-center text-[#12110F] font-semibold shrink-0`}>
                  {getInitials(person.name)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-medium text-[rgba(255,255,255,0.95)] truncate">{person.name}</h3>
                  <p className="text-sm text-[rgba(255,255,255,0.7)] line-clamp-2 mt-1">{person.description}</p>
                  <p className="text-xs text-[rgba(255,255,255,0.4)] mt-1">Last talked {person.lastConversation}</p>
                </div>

                {/* Emotional Colors */}
                <div className="flex gap-1 shrink-0">
                  {person.emotionalColors.slice(0, 5).map((color, idx) => (
                    <div
                      key={idx}
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Add Person Button */}
        <button className="w-full mt-6 py-4 px-6 bg-[#1E1B18] border border-[rgba(255,255,255,0.06)] rounded-2xl flex items-center justify-center gap-2 text-[rgba(255,255,255,0.7)] hover:bg-[#2A2623] transition-all">
          <Plus className="w-5 h-5" />
          <span className="font-medium">Add someone</span>
        </button>
      </div>
    </div>
  );
}
