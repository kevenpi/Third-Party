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
    id: "alex",
    name: "Alex",
    description: "Your partner. You talk every morning and evening. Deeply tender and intensely passionate.",
    lastConversation: "2 hours ago",
    emotionalColors: ["#7AB89E", "#6AAAB4", "#B84A3A", "#7AB89E"],
    avatarGradient: "from-[#7AB89E] to-[#6AAAB4]",
  },
  {
    id: "jordan",
    name: "Jordan",
    description: "Your closest friend. Long easy conversations, lots of laughter.",
    lastConversation: "5 hours ago",
    emotionalColors: ["#6AAAB4", "#7AB89E", "#6AAAB4"],
    avatarGradient: "from-[#6AAAB4] to-[#7AB89E]",
  },
  {
    id: "mom",
    name: "Mom",
    description: "Your mother. Weekly calls. Mostly warm — she worries about you.",
    lastConversation: "3 hours ago",
    emotionalColors: ["#D4B07A", "#C4B496", "#D4B07A"],
    avatarGradient: "from-[#D4B07A] to-[#C4B496]",
  },
  {
    id: "sam",
    name: "Sam",
    description: "A colleague. Brief, task-oriented. Neutral energy.",
    lastConversation: "1 hour ago",
    emotionalColors: ["#C4B496", "#C4B496", "#C4B496"],
    avatarGradient: "from-[#C4B496] to-[#C4B496]",
  },
  {
    id: "riley",
    name: "Riley",
    description: "Your sibling. Sporadic conversations, warm when you connect.",
    lastConversation: "Last Tuesday",
    emotionalColors: ["#D4B07A", "#C4B496"],
    avatarGradient: "from-[#D4B07A] to-[#D4806A]",
  },
  {
    id: "dr-chen",
    name: "Dr. Chen",
    description: "Your therapist. Weekly sessions, calm and reflective.",
    lastConversation: "Last Wednesday",
    emotionalColors: ["#7AB89E", "#6AAAB4", "#7AB89E"],
    avatarGradient: "from-[#7AB89E] to-[#6AAAB4]",
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
