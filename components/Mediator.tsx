
import React, { useState } from 'react';
import { Sparkles, Heart, Compass, Flower2 } from 'lucide-react';
import { mediateConflict } from '../services/geminiService';

const MOCK_MOMENT = [
  { speaker: 'Jordan', text: 'I feel like my perspective got lost in that discussion.', tone: 'Gentle Concern' },
  { speaker: 'Alex', text: 'I truly want to understand. Tell me more about what I missed.', tone: 'Open' },
];

const Mediator: React.FC = () => {
  const [analyzing, setAnalyzing] = useState(false);
  const [resolution, setResolution] = useState<string | null>(null);

  const handleMediate = async () => {
    setAnalyzing(true);
    try {
      const result = await mediateConflict(MOCK_MOMENT);
      setResolution(result ?? null);
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-16 py-12 fade-in-section">
      <header className="text-center space-y-6">
        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-[#E5989B]/10">
          <Heart className="w-10 h-10 text-[#E5989B]/60" />
        </div>
        <div className="space-y-2">
          <h2 className="text-5xl font-light serif italic">The Bridge Builder</h2>
          <p className="text-[#2E2A25]/40 text-lg italic">Returning to understanding through shared breath.</p>
        </div>
      </header>

      <div className="soft-card p-12 md:p-16 space-y-12 relative overflow-hidden">
        {/* Warm glow behind content */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#E5989B]/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="flex items-center gap-4 border-b border-[#E5989B]/10 pb-6">
          <Compass className="w-4 h-4 text-[#E5989B]" />
          <span className="text-[10px] uppercase tracking-[0.4em] font-bold text-[#E5989B]/50">The Moment Held</span>
        </div>
        
        <div className="space-y-12">
          {MOCK_MOMENT.map((msg, i) => (
            <div key={i} className="group">
              <div className="flex items-center gap-4 mb-3">
                <span className="serif italic text-lg text-[#2E2A25]/80">{msg.speaker}</span>
                <span className="text-[10px] text-[#E5989B] uppercase tracking-widest font-medium opacity-0 group-hover:opacity-100 transition-opacity">{msg.tone}</span>
              </div>
              <p className="text-2xl serif italic text-[#2E2A25]/60 leading-relaxed border-l-2 border-[#E5989B]/20 pl-8">
                "{msg.text}"
              </p>
            </div>
          ))}
        </div>

        <div className="pt-12">
          {!resolution ? (
            <button
              onClick={handleMediate}
              disabled={analyzing}
              className="w-full py-6 bg-[#E5989B] text-white font-bold rounded-full transition-all hover:bg-[#B5838D] disabled:opacity-50 flex items-center justify-center gap-4 text-xs tracking-[0.3em] uppercase shadow-lg shadow-[#E5989B]/20"
            >
              {analyzing ? (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {analyzing ? 'Listening deeply...' : 'Seek Shared Wisdom'}
            </button>
          ) : (
            <div className="animate-in fade-in slide-in-from-bottom-6 duration-1000 space-y-10">
              <div className="flex items-center gap-3 text-[#E5989B]">
                <Heart className="w-5 h-5" />
                <span className="text-xs font-bold uppercase tracking-[0.4em]">Compassionate Insight</span>
              </div>
              <div className="text-xl leading-relaxed text-[#2E2A25]/70 serif italic whitespace-pre-wrap border-l-2 border-[#E5989B]/20 pl-8">
                {resolution}
              </div>
              <div className="flex flex-col md:flex-row gap-4 pt-8">
                <button className="flex-grow py-5 bg-[#E5989B] text-white rounded-full text-xs font-bold uppercase tracking-[0.2em] transition-all hover:bg-[#B5838D]">
                  Walk toward this path
                </button>
                <button 
                  onClick={() => setResolution(null)}
                  className="flex-grow py-5 bg-white border border-[#2E2A25]/10 text-[#2E2A25]/40 rounded-full text-xs font-bold uppercase tracking-[0.2em] transition-all hover:bg-[#F9EBEA]"
                >
                  Return to Presence
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="text-center">
        <p className="text-xs italic text-[#2E2A25]/30">This space is sacred and private to you both.</p>
      </div>
    </div>
  );
};

export default Mediator;
