"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, MoreVertical, Play, Pause } from "lucide-react";

interface KeyMoment {
  id: string;
  timestamp: number; // seconds
  timeDisplay: string;
  description: string;
  color: string;
}

const CONVERSATION_DATA: Record<string, {
  person: string;
  date: string;
  time: string;
  duration: number;
  color: string;
  aiNarrative: string;
  keyMoments: KeyMoment[];
}> = {
  "1": {
    person: "Arthur",
    date: "2026-02-14",
    time: "7:08 AM",
    duration: 180,
    color: "#7AB89E",
    aiNarrative: "A gentle morning check-in. You both woke up early and found each other in the kitchen. The conversation was light, mostly about sleep and plans for the day. There was laughter when you both reached for the same coffee cup. Short but warm.",
    keyMoments: [
      { id: "1", timestamp: 30, timeDisplay: "0:30", description: "Shared laughter", color: "#7AB89E" },
    ],
  },
  "2": {
    person: "Kevin",
    date: "2026-02-14",
    time: "9:12 AM",
    duration: 480,
    color: "#C4B496",
    aiNarrative: "A brief work call. Task-oriented and efficient. You discussed project deadlines and next steps. Neutral energy throughout — professional and clear.",
    keyMoments: [
      { id: "1", timestamp: 120, timeDisplay: "2:00", description: "Project deadline discussed", color: "#C4B496" },
    ],
  },
  "3": {
    person: "Tane",
    date: "2026-02-14",
    time: "10:30 AM",
    duration: 1320,
    color: "#6AAAB4",
    aiNarrative: "A long, easy conversation with your closest friend. You caught up on life, shared stories, laughed a lot. The energy was consistently warm and relaxed. This is the kind of conversation that fills you up.",
    keyMoments: [
      { id: "1", timestamp: 180, timeDisplay: "3:00", description: "Shared laughter", color: "#6AAAB4" },
      { id: "2", timestamp: 600, timeDisplay: "10:00", description: "Deep personal story", color: "#7AB89E" },
    ],
  },
  "4": {
    person: "Arthur",
    date: "2026-02-14",
    time: "12:45 PM",
    duration: 1080, // 18 minutes
    color: "#B84A3A",
    aiNarrative: "This started warmly — you were both laughing about something from yesterday. Around the 4-minute mark, the topic shifted to weekend plans and the energy changed. You spoke with a lot of conviction and held most of the conversation from that point. Arthur got quieter, responses shorter. By the end, something was left unfinished. There was a brief repair attempt around 15 minutes, but it felt incomplete.",
    keyMoments: [
      { id: "1", timestamp: 30, timeDisplay: "0:30", description: "Warm start", color: "#D4B07A" },
      { id: "2", timestamp: 225, timeDisplay: "3:45", description: "Topic shifted to weekend plans", color: "#D4806A" },
      { id: "3", timestamp: 440, timeDisplay: "7:20", description: "You raised voice slightly", color: "#C4684A" },
      { id: "4", timestamp: 550, timeDisplay: "9:10", description: "Alex went quiet", color: "#B84A3A" },
      { id: "5", timestamp: 940, timeDisplay: "15:40", description: "Brief repair attempt", color: "#7AB89E" },
    ],
  },
  "5": {
    person: "Kevin",
    date: "2026-02-14",
    time: "2:15 PM",
    duration: 120,
    color: "#C4B496",
    aiNarrative: "A very brief check-in. Quick question and answer. Neutral and efficient.",
    keyMoments: [],
  },
  "6": {
    person: "Kevin",
    date: "2026-02-14",
    time: "4:30 PM",
    duration: 840,
    color: "#D4B07A",
    aiNarrative: "A practical call with Kevin. You both reviewed updates and checked assumptions. There was a moment where concern showed up about timeline risk. You reassured each other and ended with clear next steps.",
    keyMoments: [
      { id: "1", timestamp: 300, timeDisplay: "5:00", description: "She expressed worry", color: "#D4B07A" },
      { id: "2", timestamp: 480, timeDisplay: "8:00", description: "You reassured her", color: "#7AB89E" },
    ],
  },
  "7": {
    person: "Arthur",
    date: "2026-02-14",
    time: "8:00 PM",
    duration: 2100,
    color: "#7AB89E",
    aiNarrative: "A long, peaceful evening conversation. You both decompressed from the day. The earlier tension was gone. You talked about dreams, plans, small moments. The conversation flowed easily. This is what repair looks like — not a big gesture, just time together, talking.",
    keyMoments: [
      { id: "1", timestamp: 600, timeDisplay: "10:00", description: "Shared a dream", color: "#7AB89E" },
      { id: "2", timestamp: 1200, timeDisplay: "20:00", description: "Moment of connection", color: "#6AAAB4" },
    ],
  },
};

export default function ConversationDrillInPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [conversation, setConversation] = useState<typeof CONVERSATION_DATA[string] | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isTagged, setIsTagged] = useState(true);
  const [reflection, setReflection] = useState("");
  const [showReflectionInput, setShowReflectionInput] = useState(false);

  useEffect(() => {
    const id = params.id as string;
    const local = CONVERSATION_DATA[id];
    if (local) {
      setConversation(local);
      setLoading(false);
      setIsTagged(local.person !== "Untagged");
      const saved = localStorage.getItem(`reflection-${id}`);
      if (saved) setReflection(saved);
      return;
    }

    fetch(`/api/timeline/conversation?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((payload) => {
        if (payload?.conversation) {
          setConversation(payload.conversation);
          setIsTagged(payload.conversation.person !== "Untagged");
          const saved = localStorage.getItem(`reflection-${id}`);
          if (saved) setReflection(saved);
        } else {
          setConversation(null);
        }
        setLoading(false);
      })
      .catch(() => {
        setConversation(null);
        setLoading(false);
      });
  }, [params.id]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleMomentClick = (moment: KeyMoment) => {
    setCurrentTime(moment.timestamp);
    setIsPlaying(true);
  };

  const handleSaveReflection = () => {
    localStorage.setItem(`reflection-${params.id}`, reflection);
    setShowReflectionInput(false);
  };

  // Generate waveform data (simplified - in real app this would come from audio analysis)
  const generateWaveform = (duration: number, moments: KeyMoment[]) => {
    const points = 200;
    const data: { x: number; y: number; color: string }[] = [];
    for (let i = 0; i < points; i++) {
      const x = (i / points) * 100;
      const time = (i / points) * duration;
      
      // Find closest moment to determine color
      let color = "#C4B496"; // neutral
      if (time < 240) color = "#D4B07A"; // warm start
      else if (time < 550) color = "#D4806A"; // tense
      else if (time < 940) color = "#B84A3A"; // stress
      else color = "#7AB89E"; // repair
      
      // Generate organic wave shape
      const baseY = 50;
      const amplitude = 20 + Math.sin(time * 0.1) * 15;
      const y = baseY + amplitude * Math.sin(i * 0.3);
      
      data.push({ x, y, color });
    }
    return data;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#12110F]">
        <p className="text-[rgba(255,255,255,0.7)]">Loading conversation...</p>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#12110F]">
        <p className="text-[rgba(255,255,255,0.7)]">Conversation not found</p>
      </div>
    );
  }

  const waveformData = generateWaveform(conversation.duration, conversation.keyMoments);
  const durationMinutes = Math.floor(conversation.duration / 60);

  return (
    <div className="min-h-screen bg-[#12110F] pb-20">
      {/* Navigation Bar */}
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <button onClick={() => router.back()} className="p-2 -ml-2 text-[rgba(255,255,255,0.9)]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-normal" style={{ fontFamily: 'Fraunces, serif' }}>
            {isTagged ? conversation.person : "Untagged Conversation"}
          </h2>
          <button className="p-2 -mr-2 text-[rgba(255,255,255,0.5)]">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-8">
        {/* Person Tag */}
        {!isTagged && (
          <button className="w-full py-4 px-6 bg-[#1E1B18] border border-[rgba(255,255,255,0.06)] rounded-2xl text-[rgba(255,255,255,0.9)] font-medium hover:bg-[#2A2623] transition-all">
            Who was this with?
          </button>
        )}

        {/* Conversation Info */}
        <div className="space-y-2">
          {isTagged && (
            <h1 className="text-3xl font-normal text-[rgba(255,255,255,0.95)]" style={{ fontFamily: 'Fraunces, serif' }}>
              {conversation.person}
            </h1>
          )}
          <div className="flex items-center gap-4 text-sm text-[rgba(255,255,255,0.5)]">
            <span>{new Date(conversation.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            <span>•</span>
            <span>{conversation.time}</span>
            <span>•</span>
            <span>{durationMinutes} minutes</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: conversation.color }}
            />
            <span className="text-xs text-[rgba(255,255,255,0.4)]">Conversation</span>
          </div>
        </div>

        {/* Audio Player */}
        <div className="warm-card space-y-4">
          {/* Waveform Visualization */}
          <div className="relative h-32 bg-[#12110F] rounded-lg overflow-hidden">
            <svg className="w-full h-full" viewBox="0 0 400 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  {waveformData.map((point, idx) => (
                    <stop
                      key={idx}
                      offset={`${point.x}%`}
                      stopColor={point.color}
                    />
                  ))}
                </linearGradient>
              </defs>
              <path
                d={`M 0,${waveformData[0].y} ${waveformData.map(p => `L ${p.x * 4},${p.y}`).join(" ")} L 400,${waveformData[waveformData.length - 1].y}`}
                fill="url(#waveGradient)"
                opacity="0.6"
              />
              <path
                d={`M 0,${100 - waveformData[0].y} ${waveformData.map(p => `L ${p.x * 4},${100 - p.y}`).join(" ")} L 400,${100 - waveformData[waveformData.length - 1].y}`}
                fill="url(#waveGradient)"
                opacity="0.6"
              />
              
              {/* AI Highlight Markers */}
              {conversation.keyMoments.map((moment) => {
                const x = (moment.timestamp / conversation.duration) * 400;
                return (
                  <g key={moment.id}>
                    <circle
                      cx={x}
                      cy={50}
                      r="5"
                      fill={moment.color}
                      className="cursor-pointer hover:r-7 transition-all"
                      style={{ filter: `drop-shadow(0 0 4px ${moment.color})` }}
                      onClick={() => handleMomentClick(moment)}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Playback Controls */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-[rgba(255,255,255,0.5)]">{formatTime(currentTime)}</span>
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-14 h-14 rounded-full bg-gradient-to-br from-[#D4B07A] to-[#E8C97A] text-[#12110F] flex items-center justify-center shadow-lg hover:scale-105 transition-all"
            >
              {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
            </button>
            <span className="text-sm text-[rgba(255,255,255,0.5)]">{formatTime(conversation.duration)}</span>
          </div>
        </div>

        {/* AI Narrative */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">What I noticed</p>
          <div className="warm-card">
            <p className="text-[rgba(255,255,255,0.8)] leading-relaxed italic" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {conversation.aiNarrative}
            </p>
          </div>
        </div>

        {/* Key Moments Mini-Timeline */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">Key Moments</p>
          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-[rgba(255,255,255,0.06)]"></div>
            <div className="space-y-6">
              {conversation.keyMoments.map((moment) => (
                <button
                  key={moment.id}
                  onClick={() => handleMomentClick(moment)}
                  className="relative flex items-start gap-4 group w-full text-left"
                >
                  <div
                    className="w-6 h-6 rounded-full -ml-8 transition-all group-hover:scale-125 z-10"
                    style={{ 
                      backgroundColor: moment.color,
                      color: moment.color,
                      boxShadow: `0 0 12px ${moment.color}, inset 0 0 8px rgba(255, 255, 255, 0.1)`
                    }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-[rgba(255,255,255,0.5)]">
                        {moment.timeDisplay}
                      </span>
                    </div>
                    <p className="text-sm text-[rgba(255,255,255,0.8)] leading-relaxed">
                      {moment.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Personal Reflection */}
        <div className="space-y-4 pb-8">
          {!showReflectionInput && !reflection ? (
            <button
              onClick={() => setShowReflectionInput(true)}
              className="w-full py-4 px-6 bg-[#1E1B18] border border-[rgba(255,255,255,0.06)] rounded-2xl text-[rgba(255,255,255,0.5)] text-center hover:bg-[#2A2623] transition-all"
            >
              How did this feel?
            </button>
          ) : showReflectionInput ? (
            <div className="warm-card space-y-4">
              <textarea
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="Write your reflection..."
                className="w-full min-h-[120px] p-4 bg-[#12110F] border border-[rgba(255,255,255,0.06)] rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[rgba(212,176,122,0.3)] text-[rgba(255,255,255,0.9)]"
                style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}
              />
              <div className="flex gap-3">
                <button
                  onClick={handleSaveReflection}
                  className="flex-1 py-3 bg-gradient-to-r from-[#D4B07A] to-[#E8C97A] text-[#12110F] rounded-lg font-medium"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setShowReflectionInput(false);
                    if (!reflection) setReflection("");
                  }}
                  className="px-6 py-3 border border-[rgba(255,255,255,0.06)] rounded-lg text-[rgba(255,255,255,0.5)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="warm-card">
              <p className="text-sm text-[rgba(255,255,255,0.5)] mb-2">Your reflection</p>
              <p className="text-[rgba(255,255,255,0.8)] leading-relaxed">{reflection}</p>
              <button
                onClick={() => setShowReflectionInput(true)}
                className="mt-4 text-sm text-[#D4B07A]"
              >
                Edit
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
