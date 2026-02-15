
import React from 'react';
import { Lock, ShieldCheck, Share2, Key, Trash2, Heart } from 'lucide-react';

const Settings: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto space-y-20 py-12 fade-in-section">
      <header className="space-y-4 text-center">
        <h2 className="text-5xl font-light serif italic">Sanctuary Control</h2>
        <p className="text-[#2E2A25]/40 text-lg">Your relational safety is our only commitment.</p>
      </header>

      <section className="space-y-8">
        <h3 className="text-xs font-bold text-[#E5989B] uppercase tracking-[0.5em] text-center">Privacy Foundations</h3>
        <div className="soft-card p-12 space-y-12">
          <div className="flex justify-between items-center group">
            <div className="space-y-1">
              <p className="text-xl serif italic">Personal Sovereignty</p>
              <p className="text-sm text-[#2E2A25]/30">All moments are encrypted and belong to you alone.</p>
            </div>
            <div className="w-14 h-7 bg-[#E5989B]/10 border border-[#E5989B]/20 rounded-full flex items-center px-1">
              <div className="w-5 h-5 bg-[#E5989B] rounded-full translate-x-7 transition-transform duration-500 shadow-sm"></div>
            </div>
          </div>
          
          <div className="flex justify-between items-center group">
            <div className="space-y-1">
              <p className="text-xl serif italic">Quiet Observation</p>
              <p className="text-sm text-[#2E2A25]/30">Analysis is local, ensuring your intimacy remains offline.</p>
            </div>
            <div className="w-14 h-7 bg-[#E5989B]/10 border border-[#E5989B]/20 rounded-full flex items-center px-1">
              <div className="w-5 h-5 bg-[#E5989B] rounded-full translate-x-7 transition-transform duration-500 shadow-sm"></div>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-8">
        <h3 className="text-xs font-bold text-[#E5989B] uppercase tracking-[0.5em] text-center">Shared Clearances</h3>
        <div className="space-y-4">
          {[
            { name: 'JORDAN', role: 'Partner', active: true },
            { name: 'DR. SAMUELS', role: 'Support', active: false },
          ].map((node, i) => (
            <div key={i} className="soft-card p-8 flex items-center justify-between hover:bg-white/60 transition-all cursor-default">
              <div className="flex items-center gap-8">
                <div className="w-14 h-14 rounded-full bg-[#F5F1E8] border border-[#E5989B]/10 flex items-center justify-center serif italic text-xl text-[#E5989B]/20">
                  {node.name[0]}
                </div>
                <div>
                  <p className="text-xl serif italic text-[#2E2A25]/80">{node.name}</p>
                  <p className="text-[10px] text-[#2E2A25]/30 uppercase tracking-[0.2em] font-bold">{node.role}</p>
                </div>
              </div>
              <span className={`text-[10px] font-bold tracking-widest uppercase px-4 py-2 rounded-full ${node.active ? 'bg-[#E5989B]/10 text-[#E5989B]' : 'bg-[#2E2A25]/5 text-[#2E2A25]/20'}`}>
                {node.active ? 'Trusted' : 'Restricted'}
              </span>
            </div>
          ))}
          <button className="w-full py-8 border border-dashed border-[#E5989B]/20 rounded-[2.5rem] text-[#E5989B]/50 text-xs font-bold uppercase tracking-[0.4em] hover:border-[#E5989B]/50 hover:text-[#E5989B] transition-all duration-700 bg-transparent">
            + Invite New Support
          </button>
        </div>
      </section>

      <section className="pt-12 flex flex-col items-center gap-8">
        <div className="flex flex-col md:flex-row gap-4 w-full">
          <button className="flex-grow py-6 px-10 flex items-center justify-center gap-4 bg-white/40 border border-[#2E2A25]/5 rounded-full text-xs font-bold uppercase tracking-[0.2em] text-[#2E2A25]/40 hover:bg-white transition-all">
            <Key className="w-4 h-4 opacity-40" /> Vault Key Recovery
          </button>
          <button className="flex-grow py-6 px-10 flex items-center justify-center gap-4 bg-rose-50 border border-rose-100 rounded-full text-xs font-bold uppercase tracking-[0.2em] text-rose-300 hover:bg-rose-100 transition-all">
            <Trash2 className="w-4 h-4" /> Clear All Memories
          </button>
        </div>
        
        <div className="flex items-center gap-3 opacity-20">
          <Heart className="w-4 h-4 text-[#E5989B]" />
          <span className="text-[10px] uppercase tracking-[0.5em] font-bold">End-to-End Flourishing</span>
        </div>
      </section>
    </div>
  );
};

export default Settings;
