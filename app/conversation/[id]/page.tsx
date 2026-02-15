"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, MoreVertical, Play, Pause } from "lucide-react";
import BiometricChart from "@/components/BiometricChart";
import MessageCorrelationCard from "@/components/MessageCorrelationCard";
import { getStressColor, formatBiometricChange, interpolateHR, formatElapsed } from "@/lib/biometrics";
import type { BiometricData } from "@/lib/biometrics";

interface KeyMoment {
  id: string;
  timestamp: number;
  timeDisplay: string;
  description: string;
  color: string;
}

interface TranscriptSegment {
  speaker: string;
  text: string;
  startMs: number;
  endMs: number;
}

interface ConversationData {
  person: string;
  date: string;
  time: string;
  duration: number;
  color: string;
  aiNarrative: string;
  keyMoments: KeyMoment[];
  transcriptSegments?: TranscriptSegment[];
  biometricData?: BiometricData;
  faceIdentification?: { personId: string; personName: string; confidence: string };
  unknownFaceFramePath?: string;
}

export default function ConversationDrillInPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [conversation, setConversation] = useState<ConversationData | null>(null);
  const [bioData, setBioData] = useState<BiometricData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isTagged, setIsTagged] = useState(true);
  const [reflection, setReflection] = useState("");
  const [showReflectionInput, setShowReflectionInput] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagName, setTagName] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const TAG_OPTIONS = [
    { id: "important", label: "Important", emoji: "\u2B50" },
    { id: "insightful", label: "Insightful", emoji: "\uD83D\uDCA1" },
    { id: "heated", label: "Heated", emoji: "\uD83D\uDD25" },
    { id: "emotional", label: "Emotional", emoji: "\uD83D\uDE22" },
    { id: "recurring", label: "Recurring Issue", emoji: "\uD83D\uDD01" },
    { id: "growth", label: "Growth Moment", emoji: "\uD83C\uDF31" },
  ];

  const handleTagPerson = useCallback(() => {
    if (!tagName.trim() || !conversation) return;
    const name = tagName.trim();
    const personId = name.toLowerCase().replace(/\s+/g, "-");
    setConversation({ ...conversation, person: name });
    setIsTagged(true);
    setShowTagInput(false);
    setTagName("");
    try { sessionStorage.setItem(`conv-person-${params.id}`, name); } catch {}
    // If there was an unknown face frame, enroll it
    if (conversation.unknownFaceFramePath) {
      void fetch("/api/face/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, name, unknownFramePath: conversation.unknownFaceFramePath }),
      }).catch(() => {});
    }
  }, [tagName, conversation, params.id]);

  useEffect(() => {
    const id = params.id as string;

    let personOverride: string | null = null;
    try { personOverride = sessionStorage.getItem(`conv-person-${id}`); } catch {}

    fetch(`/api/timeline/conversation?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((payload) => {
        if (payload?.conversation) {
          const conv: ConversationData = payload.conversation;
          if (personOverride) conv.person = personOverride;
          setConversation(conv);
          setIsTagged(conv.person !== "Conversation" && conv.person !== "Untagged");

          // Use biometric data from the API response
          if (conv.biometricData) {
            setBioData(conv.biometricData);
          }

          const saved = localStorage.getItem(`reflection-${id}`);
          if (saved) setReflection(saved);

          const savedTags = localStorage.getItem(`tags-${id}`);
          if (savedTags) {
            try { setSelectedTags(JSON.parse(savedTags)); } catch {}
          }
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

  const handleToggleTag = (tagId: string) => {
    setSelectedTags((prev) => {
      const next = prev.includes(tagId)
        ? prev.filter((t) => t !== tagId)
        : [...prev, tagId];
      localStorage.setItem(`tags-${params.id}`, JSON.stringify(next));
      return next;
    });
  };

  const handleSaveReflection = () => {
    localStorage.setItem(`reflection-${params.id}`, reflection);
    setShowReflectionInput(false);
  };

  // Generate waveform from biometric data if available, else synthetic
  const generateWaveform = (duration: number, moments: KeyMoment[]) => {
    const points = 200;
    const data: { x: number; y: number; color: string }[] = [];
    for (let i = 0; i < points; i++) {
      const x = (i / points) * 100;
      const time = (i / points) * duration;

      // Color from biometric stress if available
      let color = "#C4B496";
      if (bioData?.hrTimeline?.length) {
        const bio = interpolateHR(bioData.hrTimeline, time);
        color = getStressColor(bio.stress);
      } else {
        // Try to color based on nearby key moments
        let nearestDist = Infinity;
        for (const m of moments) {
          const dist = Math.abs(time - m.timestamp);
          if (dist < nearestDist) {
            nearestDist = dist;
            color = m.color;
          }
        }
      }

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
        {/* Person Tag — with face enrollment for untagged conversations */}
        {!isTagged && (
          <div className="space-y-3">
            {!showTagInput ? (
              <button
                onClick={() => setShowTagInput(true)}
                className="w-full py-4 px-6 bg-[#1E1B18] border border-[rgba(255,255,255,0.06)] rounded-2xl text-[rgba(255,255,255,0.9)] font-medium hover:bg-[#2A2623] transition-all"
              >
                Who was this with?
              </button>
            ) : (
              <div className="warm-card space-y-3">
                <input
                  type="text"
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  placeholder="Person's name..."
                  className="w-full px-4 py-3 bg-[#12110F] border border-[rgba(255,255,255,0.06)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(212,176,122,0.3)] text-[rgba(255,255,255,0.9)] placeholder-[rgba(255,255,255,0.4)]"
                />
                <div className="flex gap-3">
                  <button
                    onClick={handleTagPerson}
                    disabled={!tagName.trim()}
                    className="flex-1 py-3 bg-gradient-to-r from-[#D4B07A] to-[#E8C97A] text-[#12110F] rounded-lg font-medium disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setShowTagInput(false)}
                    className="px-6 py-3 border border-[rgba(255,255,255,0.06)] rounded-lg text-[rgba(255,255,255,0.5)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
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
            <span className="text-xs text-[rgba(255,255,255,0.4)]">
              {conversation.faceIdentification
                ? `Identified: ${conversation.faceIdentification.personName} (${conversation.faceIdentification.confidence})`
                : "Conversation"
              }
            </span>
          </div>
        </div>

        {/* Tag Pills */}
        <div className="flex flex-wrap gap-2" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
          {TAG_OPTIONS.map((tag) => {
            const active = selectedTags.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => handleToggleTag(tag.id)}
                className={`px-3 py-1 rounded-full text-sm transition-all active:scale-95 ${
                  active
                    ? "bg-[rgba(255,255,255,0.1)] border border-[#C4B496] text-[#C4B496]"
                    : "bg-transparent border border-[rgba(255,255,255,0.12)] text-[rgba(255,255,255,0.4)]"
                }`}
              >
                {tag.emoji} {tag.label}
              </button>
            );
          })}
        </div>

        {/* Audio Waveform */}
        <div className="warm-card space-y-4">
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
              {conversation.keyMoments.map((moment) => {
                const x = (moment.timestamp / conversation.duration) * 400;
                return (
                  <g key={moment.id}>
                    <circle
                      cx={x}
                      cy={50}
                      r="5"
                      fill={moment.color}
                      className="cursor-pointer"
                      style={{ filter: `drop-shadow(0 0 4px ${moment.color})` }}
                      onClick={() => handleMomentClick(moment)}
                    />
                  </g>
                );
              })}
            </svg>
          </div>

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

        {/* Biometric Response Section */}
        {bioData && (
          <div className="space-y-4 fade-up">
            <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">Biometric Response</p>

            <div className="flex items-center gap-3 flex-wrap" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {[
                { label: "Peak HR", value: `${bioData.peak.hr}`, color: getStressColor(bioData.peak.stress) },
                { label: "HRV drop", value: formatBiometricChange(bioData.baseline.hrv, bioData.peak.hrv), color: "#7AB89E" },
                { label: "Peak stress", value: `${bioData.peak.stress}`, color: "#D4B07A" },
                ...(bioData.recovery.minutes > 0 ? [{ label: "Recovery", value: `${bioData.recovery.minutes} min`, color: "rgba(255,255,255,0.5)" }] : []),
              ].map((stat) => (
                <span key={stat.label} className="text-xs text-[rgba(255,255,255,0.3)]">
                  {stat.label}{" "}
                  <span style={{ color: stat.color, fontWeight: 500 }}>{stat.value}</span>
                </span>
              ))}
            </div>

            <div className="warm-card" style={{ padding: 16 }}>
              <BiometricChart
                data={bioData.hrTimeline}
                messageCorrelations={bioData.messageCorrelations}
                baseline={bioData.baseline}
              />
            </div>

            {bioData.messageCorrelations.length > 0 && (
              <div className="space-y-3">
                {bioData.messageCorrelations.map((corr, idx) => (
                  <MessageCorrelationCard key={idx} correlation={corr} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* AI Narrative */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">What I noticed</p>
          <div className="warm-card">
            <p className="text-[rgba(255,255,255,0.8)] leading-relaxed italic" style={{ fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              {bioData?.overallInsight || conversation.aiNarrative}
            </p>
          </div>
        </div>

        {/* Transcript Section */}
        {conversation.transcriptSegments && conversation.transcriptSegments.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">Transcript</p>
              <button
                onClick={() => setShowTranscript(!showTranscript)}
                className="text-xs text-[#D4B07A]"
              >
                {showTranscript ? "Collapse" : "Show"}
              </button>
            </div>
            {showTranscript && (
              <div className="warm-card space-y-3 max-h-96 overflow-y-auto">
                {conversation.transcriptSegments.map((seg, idx) => {
                  const timeStr = formatTime(Math.round(seg.startMs / 1000));
                  const isMe = seg.speaker.toLowerCase() === "me" || seg.speaker === "S0";
                  return (
                    <div key={idx} className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
                      <div
                        className={`flex-1 rounded-lg px-3 py-2 ${
                          isMe
                            ? "bg-[#D4B07A]/15 text-[rgba(255,255,255,0.9)]"
                            : "bg-[rgba(255,255,255,0.05)] text-[rgba(255,255,255,0.8)]"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium" style={{ color: isMe ? "#D4B07A" : "#6AAAB4" }}>
                            {seg.speaker}
                          </span>
                          <span className="text-[10px] text-[rgba(255,255,255,0.3)]">{timeStr}</span>
                        </div>
                        <p className="text-sm leading-relaxed">{seg.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Key Moments Mini-Timeline */}
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wider text-[#8A7E72] font-light">Key Moments</p>
          <div className="relative pl-6">
            <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-[rgba(255,255,255,0.06)]"></div>
            <div className="space-y-6">
              {conversation.keyMoments.map((moment) => {
                const bio = bioData ? interpolateHR(bioData.hrTimeline, moment.timestamp) : null;
                const dotColor = bio ? getStressColor(bio.stress) : moment.color;
                return (
                  <button
                    key={moment.id}
                    onClick={() => handleMomentClick(moment)}
                    className="relative flex items-start gap-4 group w-full text-left"
                  >
                    <div
                      className="w-6 h-6 rounded-full -ml-8 transition-all group-hover:scale-125 z-10"
                      style={{
                        backgroundColor: dotColor,
                        color: dotColor,
                        boxShadow: `0 0 12px ${dotColor}, inset 0 0 8px rgba(255, 255, 255, 0.1)`
                      }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-[rgba(255,255,255,0.5)]">
                          {moment.timeDisplay}
                        </span>
                        {bio && (
                          <span className="text-[10px]" style={{ color: dotColor, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
                            HR {bio.hr} · Stress {bio.stress}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[rgba(255,255,255,0.8)] leading-relaxed">
                        {moment.description}
                      </p>
                    </div>
                  </button>
                );
              })}
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
