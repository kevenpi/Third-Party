
import React from 'react';
import { Leaf, Heart, Sun, CloudRain } from 'lucide-react';

const Dashboard: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-12 fade-in-section">
      <div className="max-w-2xl w-full soft-card p-12 md:p-20 text-center space-y-12 transition-all duration-1000 relative overflow-hidden">
        {/* Subtle decorative elements */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#FFB5A7]/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#E5989B]/10 rounded-full blur-3xl"></div>

        <header className="space-y-2">
          <p className="text-[10px] uppercase tracking-[0.5em] text-[#E5989B] font-bold">Relational Reflection</p>
          <h1 className="text-5xl md:text-6xl font-light serif italic leading-tight">Today Between You</h1>
        </header>

        <div className="py-8">
          <div className="w-16 h-[1px] bg-[#E5989B]/30 mx-auto mb-12"></div>
          
          <div className="space-y-10">
            <p className="text-xl md:text-2xl leading-relaxed serif italic text-[#2E2A25]/80">
              "There was a soft tension this afternoon during your shared quiet time. It felt like words were held back."
            </p>
            
            <p className="text-lg leading-relaxed text-[#2E2A25]/60 font-light max-w-lg mx-auto">
              You both found resonance in the evening, moving back into a gentle rhythm. Jordan's presence felt particularly <span className="text-[#E5989B] font-medium italic">supportive</span> when the pace of the day quickened.
            </p>
          </div>

          <div className="w-16 h-[1px] bg-[#E5989B]/30 mx-auto mt-12"></div>
        </div>

        <div className="space-y-6">
          <p className="text-sm italic text-[#E5989B] font-medium">Would you like to reflect on that moment together?</p>
          <button className="px-10 py-4 bg-[#E5989B] text-white rounded-full text-xs font-bold uppercase tracking-[0.2em] hover:bg-[#B5838D] transition-all transform hover:scale-[1.02] shadow-lg shadow-[#E5989B]/20">
            Begin Gentle Review
          </button>
        </div>
      </div>

      <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        <div className="flex items-start gap-6 p-8 rounded-[2rem] border border-[#E5989B]/10 bg-white/40 group hover:bg-white/60 transition-all">
          <Heart className="w-6 h-6 text-[#E5989B] shrink-0" />
          <div className="space-y-2">
            <h4 className="serif italic text-xl">A Bright Morning</h4>
            <p className="text-sm text-[#2E2A25]/50 leading-relaxed">Your early connection was clear and easeful. There was a lovely sense of mutual interest in each other's inner worlds.</p>
          </div>
        </div>
        <div className="flex items-start gap-6 p-8 rounded-[2rem] border border-[#E5989B]/10 bg-white/40 group hover:bg-white/60 transition-all">
          <Sun className="w-6 h-6 text-[#D4A373] shrink-0" />
          <div className="space-y-2">
            <h4 className="serif italic text-xl">Weathering the Storm</h4>
            <p className="text-sm text-[#2E2A25]/50 leading-relaxed">When external stress entered the space, you both held a quiet resilience. The repair was swift and sincere.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
