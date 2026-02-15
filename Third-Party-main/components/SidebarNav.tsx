"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Heart, 
  Wind, 
  Lock, 
  Menu, 
  X,
  Compass,
  Navigation
} from "lucide-react";
import { useState, ReactNode } from "react";
import { cn } from "@/lib/ui";

interface SidebarNavProps {
  children?: ReactNode;
}

const navItems = [
  { href: "/", icon: Heart, label: "The Pulse", tab: "pulse" },
  { href: "/timeline", icon: Compass, label: "Bridge Builder", tab: "bridge" },
  { href: "/session", icon: Wind, label: "Presence", tab: "presence" },
  { href: "/settings", icon: Lock, label: "Sanctuary", tab: "privacy" }
];

export function SidebarNav({ children }: SidebarNavProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const getActiveTab = () => {
    if (pathname === "/") return "pulse";
    if (pathname.startsWith("/timeline")) return "bridge";
    if (pathname.startsWith("/session")) return "presence";
    if (pathname.startsWith("/review")) return "bridge";
    return "pulse";
  };

  const activeTab = getActiveTab();

  const NavItem = ({ href, icon: Icon, label, tab }: { href: string, icon: any, label: string, tab: string }) => {
    const isActive = activeTab === tab;
    return (
      <Link
        href={href}
        onClick={() => setIsMobileMenuOpen(false)}
        className={cn(
          "flex items-center gap-4 px-8 py-5 transition-all duration-700 w-full relative group",
          isActive 
            ? "text-[#2E2A25]" 
            : "text-[#2E2A25]/20 hover:text-[#2E2A25]/50"
        )}
      >
        <Icon className={cn(
          "w-5 h-5 transition-all duration-700",
          isActive ? "scale-110 text-[#E5989B]" : "group-hover:scale-105"
        )} />
        <span className="text-[10px] tracking-[0.4em] uppercase font-bold">{label}</span>
        {isActive && (
          <div className="absolute left-0 w-[2px] h-8 bg-[#E5989B] rounded-full shadow-[0_0_10px_rgba(229,152,155,0.2)]"></div>
        )}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Mobile Navigation Bar */}
      <div className="md:hidden flex items-center justify-between p-8 bg-[#F5F1E8]/80 backdrop-blur-md sticky top-0 z-50 border-b border-[#2E2A25]/5">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full border border-[#E5989B]/20 flex items-center justify-center serif italic font-bold text-[#E5989B]">3P</div>
          <span className="serif italic text-2xl text-[#2E2A25]/80">ThirdParty</span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-[#2E2A25]/60">
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Persistent Sidebar */}
      <aside className={cn(
        "fixed inset-0 z-40 md:relative md:flex md:flex-col",
        "w-full md:w-80 lg:w-96 bg-[#F5F1E8] border-r border-[#2E2A25]/5",
        "transition-all duration-700 ease-in-out",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="hidden md:flex flex-col items-center py-20">
          <div className="w-16 h-16 rounded-full border border-[#E5989B]/20 flex items-center justify-center serif italic font-bold text-2xl mb-6 text-[#E5989B]/40 group hover:border-[#E5989B]/60 transition-all duration-1000">
            3P
          </div>
          <span className="text-3xl serif italic tracking-tight text-[#2E2A25]/80">ThirdParty</span>
          <span className="text-[10px] text-[#E5989B]/30 uppercase mt-3 tracking-[0.6em] font-bold">Sacred Space</span>
        </div>

        <nav className="flex-grow pt-8 space-y-2">
          {navItems.map((item) => (
            <NavItem key={item.href} href={item.href} icon={item.icon} label={item.label} tab={item.tab} />
          ))}
        </nav>

        <div className="p-10 space-y-10">
          <div className="p-8 bg-white/50 rounded-[2.5rem] border border-[#E5989B]/10 space-y-4">
            <div className="flex items-center gap-3">
              <Navigation className="w-3 h-3 text-[#E5989B]/60" />
              <span className="text-[9px] uppercase font-bold tracking-[0.4em] text-[#E5989B]/50">Current State</span>
            </div>
            <p className="text-sm text-[#2E2A25]/60 leading-relaxed italic">"A quiet, easeful resonance is settling between you."</p>
          </div>
          
          <div className="flex items-center gap-6 px-2 opacity-60 hover:opacity-100 transition-all cursor-pointer">
            <div className="w-12 h-12 rounded-full border border-[#E5989B]/10 overflow-hidden shadow-sm">
              <img src="https://picsum.photos/seed/sacred/150/150" alt="Shared Life" className="grayscale contrast-[0.9] group-hover:grayscale-0 transition-all" />
            </div>
            <div>
              <p className="text-sm font-bold serif italic text-[#2E2A25]/80">Alex & Jordan</p>
              <p className="text-[9px] text-[#E5989B]/40 uppercase tracking-[0.3em] font-black">United</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Sanctuary Area */}
      <main className="flex-grow overflow-y-auto p-6 md:p-12 lg:p-24 relative">
        <div className="max-w-5xl mx-auto w-full h-full">
          {children}
        </div>
      </main>
    </div>
  );
}
