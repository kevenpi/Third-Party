
import React, { useState } from 'react';
import { 
  Heart, 
  Wind, 
  Lock, 
  Menu, 
  X,
  Compass,
  Leaf,
  Navigation
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import Mediator from './components/Mediator';
import Settings from './components/Settings';

enum Tab {
  Pulse = 'pulse',
  Bridge = 'bridge',
  Presence = 'presence',
  Privacy = 'privacy'
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.Pulse);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const NavItem = ({ tab, icon: Icon, label }: { tab: Tab, icon: any, label: string }) => (
    <button
      onClick={() => {
        setActiveTab(tab);
        setIsMobileMenuOpen(false);
      }}
      className={`flex items-center gap-4 px-8 py-5 transition-all duration-700 w-full relative group ${
        activeTab === tab 
          ? 'text-[#2E2A25]' 
          : 'text-[#2E2A25]/20 hover:text-[#2E2A25]/50'
      }`}
    >
      <Icon className={`w-5 h-5 transition-all duration-700 ${activeTab === tab ? 'scale-110 text-[#E5989B]' : 'group-hover:scale-105'}`} />
      <span className="text-[10px] tracking-[0.4em] uppercase font-bold">{label}</span>
      {activeTab === tab && (
        <div className="absolute left-0 w-[2px] h-8 bg-[#E5989B] rounded-full shadow-[0_0_10px_rgba(229,152,155,0.2)]"></div>
      )}
    </button>
  );

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
      <aside className={`
        fixed inset-0 z-40 md:relative md:flex md:flex-col
        w-full md:w-80 lg:w-96 bg-[#F5F1E8] border-r border-[#2E2A25]/5
        transition-all duration-700 ease-in-out
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <div className="hidden md:flex flex-col items-center py-20">
          <div className="w-16 h-16 rounded-full border border-[#E5989B]/20 flex items-center justify-center serif italic font-bold text-2xl mb-6 text-[#E5989B]/40 group hover:border-[#E5989B]/60 transition-all duration-1000">
             3P
          </div>
          <span className="text-3xl serif italic tracking-tight text-[#2E2A25]/80">ThirdParty</span>
          <span className="text-[10px] text-[#E5989B]/30 uppercase mt-3 tracking-[0.6em] font-bold">Sacred Space</span>
        </div>

        <nav className="flex-grow pt-8 space-y-2">
          <NavItem tab={Tab.Pulse} icon={Heart} label="The Pulse" />
          <NavItem tab={Tab.Bridge} icon={Compass} label="Bridge Builder" />
          <NavItem tab={Tab.Presence} icon={Wind} label="Presence" />
          <NavItem tab={Tab.Privacy} icon={Lock} label="Sanctuary" />
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
          {activeTab === Tab.Pulse && <Dashboard />}
          {activeTab === Tab.Bridge && <Mediator />}
          {activeTab === Tab.Privacy && <Settings />}
          {activeTab === Tab.Presence && (
            <div className="flex flex-col items-center justify-center h-[70vh] space-y-16 animate-in fade-in duration-1000">
              <div className="relative">
                <div className="w-72 h-72 border border-[#E5989B]/10 rounded-full flex items-center justify-center">
                   <div className="w-56 h-56 bg-[#E5989B]/5 rounded-full blur-[80px] animate-pulse"></div>
                   <Wind className="w-20 h-20 text-[#E5989B]/30 absolute" />
                </div>
              </div>
              <div className="text-center space-y-6">
                <h2 className="text-5xl serif italic font-light text-[#2E2A25]/80">Presence Flow</h2>
                <p className="text-[#2E2A25]/40 text-lg max-w-sm mx-auto leading-relaxed italic">
                  Take a breath. ThirdParty is holding space while you connect. Focus on the heartbeat of your relationship.
                </p>
              </div>
              <button className="px-14 py-5 border border-[#E5989B]/20 rounded-full text-[10px] font-bold uppercase tracking-[0.4em] hover:bg-[#E5989B] hover:text-white transition-all duration-700 text-[#E5989B]/60 shadow-lg shadow-[#E5989B]/5">
                Begin Mindful Check-in
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
