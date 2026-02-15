
export type Mood = 'calm' | 'tense' | 'joyful' | 'frustrated' | 'withdrawn';

export interface Interaction {
  id: string;
  timestamp: number;
  duration: number;
  participants: string[];
  vibeScore: number; // 0-100
  powerBalance: number; // -1 to 1 (0 is equal, 1 is speaker A dominant)
  interruptionCount: number;
  stressPeak: number; // Cortisol proxy
  summary: string;
}

export interface RelationalStats {
  weeklyAverageVibe: number;
  dominanceRatio: number; // Interruption/Speech time skew
  conflictResolutionRate: number;
  totalSynchrony: number;
}

export interface ConflictFragment {
  speaker: string;
  text: string;
  tone: string;
  stressLevel: number;
}

export interface MediationSession {
  id: string;
  transcript: ConflictFragment[];
  aiAnalysis?: string;
  suggestedResolution?: string;
}
