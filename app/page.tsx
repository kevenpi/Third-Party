"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HomePage() {
  const router = useRouter();
  
  useEffect(() => {
    router.replace("/timeline");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#12110F]">
      <div className="text-center space-y-4">
        <div className="w-16 h-16 rounded-full pulse-glow mx-auto" style={{ backgroundColor: "#D4B07A", color: "#D4B07A" }}></div>
        <p className="text-[rgba(255,255,255,0.7)]">Loading...</p>
      </div>
    </div>
  );
}
