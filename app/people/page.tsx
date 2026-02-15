"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Plus, Camera } from "lucide-react";

interface PersonSummary {
  id: string;
  name: string;
  conversationCount: number;
  totalDurationMin: number;
  lastTalked: string | null;
  dominantColors: string[];
  photoCount: number;
  avatarUrl?: string | null;
}

// No hardcoded fallback — sample data is seeded into the timeline by the API.

function getInitials(name: string): string {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function formatLastTalked(date: string | null): string {
  if (!date) return "never";
  const d = new Date(date);
  const today = new Date();
  const diffDays = Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function gradientForPerson(colors: string[]): string {
  if (colors.length === 0) return "from-[#C4B496] to-[#6AAAB4]";
  const first = colors[0];
  const second = colors.length > 1 ? colors[1] : colors[0];
  // Map hex to tailwind gradient stops
  return `from-[${first}] to-[${second}]`;
}

export default function PeoplePage() {
  const router = useRouter();
  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [enrollName, setEnrollName] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    fetch("/api/people")
      .then((r) => r.json())
      .then((data) => {
        const apiPeople = data.people as PersonSummary[] | undefined;
        setPeople(apiPeople && apiPeople.length > 0 ? apiPeople : []);
        setLoading(false);
      })
      .catch(() => {
        setPeople([]);
        setLoading(false);
      });
  }, []);

  const filteredPeople = people.filter((person) =>
    person.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ------------------------------------------------------------------
  // Face enrollment modal
  // ------------------------------------------------------------------

  const openEnrollModal = useCallback(async () => {
    setShowEnrollModal(true);
    setEnrollName("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      cameraStreamRef.current = stream;
      // Wait for the video ref to be attached in next render
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      }, 100);
    } catch {
      /* camera not available */
    }
  }, []);

  const closeEnrollModal = useCallback(() => {
    setShowEnrollModal(false);
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
  }, []);

  const handleEnroll = useCallback(async () => {
    if (!enrollName.trim()) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    if (video.readyState < 2) return;

    setEnrolling(true);

    // Capture frame
    canvas.width = Math.min(512, video.videoWidth);
    canvas.height = Math.round(
      (canvas.width / video.videoWidth) * video.videoHeight
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) { setEnrolling(false); return; }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const imageBase64 = dataUrl.split(",")[1] ?? "";

    const personId = enrollName.trim().toLowerCase().replace(/\s+/g, "_");

    try {
      await fetch("/api/face/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personId, name: enrollName.trim(), imageBase64 }),
      });

      // Refresh people list
      const res = await fetch("/api/people");
      const data = await res.json();
      if (data.people?.length > 0) setPeople(data.people);

      closeEnrollModal();
    } catch {
      /* ignore */
    } finally {
      setEnrolling(false);
    }
  }, [enrollName, closeEnrollModal]);

  return (
    <div className="min-h-screen bg-[#12110F] pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-40 bg-[#12110F]/80 backdrop-blur-md border-b border-[rgba(255,255,255,0.06)]">
        <div className="max-w-md mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-normal" style={{ fontFamily: "Fraunces, serif" }}>
            People
          </h1>
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
                style={{ fontFamily: "Plus Jakarta Sans, sans-serif" }}
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[rgba(255,255,255,0.4)]" />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 p-1">
                  <X className="w-4 h-4 text-[rgba(255,255,255,0.4)]" />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* People List */}
      <div className="max-w-md mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12">
            <p className="text-[rgba(255,255,255,0.5)]">Loading...</p>
          </div>
        ) : filteredPeople.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[rgba(255,255,255,0.5)]">No people found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPeople.map((person) => (
              <button
                key={person.id}
                onClick={() => router.push(`/people/${person.id}`)}
                className="w-full warm-card flex items-center gap-4 hover:bg-[#2A2623] transition-all text-left"
              >
                {/* Avatar */}
                <div className="w-14 h-14 rounded-full shrink-0 overflow-hidden">
                  {person.avatarUrl ? (
                    <img
                      src={person.avatarUrl}
                      alt={person.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center text-[#12110F] font-semibold"
                      style={{
                        background: `linear-gradient(135deg, ${person.dominantColors[0] ?? "#C4B496"}, ${person.dominantColors[1] ?? "#6AAAB4"})`,
                      }}
                    >
                      {getInitials(person.name)}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-medium text-[rgba(255,255,255,0.95)] truncate">
                    {person.name}
                  </h3>
                  <p className="text-sm text-[rgba(255,255,255,0.7)] mt-1">
                    {person.conversationCount} conversation{person.conversationCount !== 1 ? "s" : ""} · {Math.round(person.totalDurationMin)} min total
                  </p>
                  <p className="text-xs text-[rgba(255,255,255,0.4)] mt-1">
                    Last talked {formatLastTalked(person.lastTalked)}
                    {person.photoCount > 0 && (
                      <span className="ml-2 text-[#D4B07A]">
                        · {person.photoCount} face{person.photoCount !== 1 ? "s" : ""} enrolled
                      </span>
                    )}
                  </p>
                </div>

                {/* Emotional Colors */}
                <div className="flex gap-1 shrink-0">
                  {person.dominantColors.slice(0, 5).map((color, idx) => (
                    <div key={idx} className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  ))}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Enroll New Person Button */}
        <button
          onClick={openEnrollModal}
          className="w-full mt-6 py-4 px-6 bg-[#1E1B18] border border-[rgba(255,255,255,0.06)] rounded-2xl flex items-center justify-center gap-2 text-[rgba(255,255,255,0.7)] hover:bg-[#2A2623] transition-all"
        >
          <Camera className="w-5 h-5" />
          <span className="font-medium">Enroll a new face</span>
        </button>
      </div>

      {/* Enroll Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#1E1B18] rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-[rgba(255,255,255,0.06)]">
              <h2 className="text-lg font-normal text-[rgba(255,255,255,0.95)]" style={{ fontFamily: "Fraunces, serif" }}>
                Enroll New Face
              </h2>
            </div>

            {/* Camera preview */}
            <div className="relative bg-black aspect-[4/3]">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>

            <div className="p-4 space-y-4">
              <input
                type="text"
                value={enrollName}
                onChange={(e) => setEnrollName(e.target.value)}
                placeholder="Person's name..."
                className="w-full px-4 py-3 bg-[#12110F] border border-[rgba(255,255,255,0.06)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[rgba(212,176,122,0.3)] text-[rgba(255,255,255,0.9)] placeholder-[rgba(255,255,255,0.4)]"
              />

              <div className="flex gap-3">
                <button
                  onClick={handleEnroll}
                  disabled={!enrollName.trim() || enrolling}
                  className="flex-1 py-3 bg-gradient-to-r from-[#D4B07A] to-[#E8C97A] text-[#12110F] rounded-lg font-medium disabled:opacity-50"
                >
                  {enrolling ? "Enrolling..." : "Capture & Enroll"}
                </button>
                <button
                  onClick={closeEnrollModal}
                  className="px-6 py-3 border border-[rgba(255,255,255,0.06)] rounded-lg text-[rgba(255,255,255,0.5)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
