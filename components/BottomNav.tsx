"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Users, MessageSquare, Mic } from "lucide-react";
import { cn } from "@/lib/ui";

export function BottomNav() {
  const pathname = usePathname();

  const tabs = [
    { href: "/timeline", icon: Clock, label: "Timeline", id: "timeline" },
    { href: "/people", icon: Users, label: "People", id: "people" },
    { href: "/agent", icon: MessageSquare, label: "Agent", id: "agent" },
    { href: "/voice", icon: Mic, label: "Voice", id: "voice" },
  ];

  const isActive = (href: string) => {
    if (href === "/timeline") {
      return pathname === "/" || pathname === "/timeline" || pathname.startsWith("/conversation");
    }
    if (href === "/people") {
      return pathname.startsWith("/people") || pathname.startsWith("/glaze");
    }
    if (href === "/voice") {
      return pathname.startsWith("/voice");
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#1E1B18]/95 backdrop-blur-md border-t border-[rgba(255,255,255,0.06)]">
      <div className="max-w-md mx-auto flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 h-full transition-all relative",
                active
                  ? "text-transparent bg-clip-text bg-gradient-to-b from-[#D4B07A] to-[#E8C97A]"
                  : "text-[#4A4440]"
              )}
            >
              <Icon className={cn("w-5 h-5 transition-all", active && "scale-110")} />
              <span className="text-[10px] font-medium tracking-wide">
                {active ? (
                  <span className="bg-gradient-to-b from-[#D4B07A] to-[#E8C97A] bg-clip-text text-transparent">
                    {tab.label}
                  </span>
                ) : (
                  tab.label
                )}
              </span>
              {active && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-[#D4B07A] to-[#E8C97A] rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
