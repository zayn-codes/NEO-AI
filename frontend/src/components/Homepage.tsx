import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Sun, Moon, ArrowRight, BookOpen, 
  Sparkles, Volume2, Mic, Target, Calendar, 
  TrendingUp, ShieldCheck, Zap, ChevronRight
} from 'lucide-react';

interface HomepageProps {
  onEnterAuth: (loginMode: boolean) => void;
}

export const Homepage: React.FC<HomepageProps> = ({ onEnterAuth }) => {
  const { theme, toggleTheme } = useAuth();
  const [activeVoiceLang, setActiveVoiceLang] = useState<'en' | 'hi' | 'kn'>('en');

  const speakIntroduction = () => {
    if (!('speechSynthesis' in window)) {
      alert("Text-to-speech is not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();
    
    let text = "";
    let lang = "en-US";

    if (activeVoiceLang === 'hi') {
      text = "नमस्ते! नियो एआई साक्षरता सहायक में आपका स्वागत है। हम आपको अंग्रेजी, हिंदी और कन्नड़ पढ़ने, लिखने और बोलने में मदद करते हैं। शुरू करने के लिए गेट स्टार्टेड पर क्लिक करें।";
      lang = "hi-IN";
    } else if (activeVoiceLang === 'kn') {
      text = "ನಮಸ್ಕಾರ! ನವ-ಸಾಕ್ಷರ ಕಲಿಕಾ ಸಹಾಯಕಕ್ಕೆ ಸುಸ್ವಾಗತ. ನಾವು ನಿಮಗೆ ಇಂಗ್ಲಿಷ್, ಹಿಂದಿ ಮತ್ತು ಕನ್ನಡದಲ್ಲಿ ಓದಲು, ಬರೆಯಲು ಮತ್ತು ಮಾತನಾಡಲು ಸಹಾಯ ಮಾಡುತ್ತೇವೆ.";
      lang = "kn-IN";
    } else {
      text = "Hello and welcome to Neo AI! Learning a new language or improving your literacy skills should feel warm, empowering, and natural. Click Get Started to begin your quick placement benchmark!";
      lang = "en-US";
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="min-h-screen bg-[var(--studio-bg)] text-[var(--studio-text-primary)] transition-colors duration-200 relative overflow-hidden flex flex-col justify-between font-sans">
      
      {/* ── 1. Header Navigation ── */}
      <header className="bg-[var(--studio-surface)]/90 backdrop-blur-md border-b border-[var(--studio-border)] sticky top-0 z-40 px-6 py-3.5 transition-colors shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 via-purple-600 to-cyan-400 text-white shadow-md animate-gemini-sparkle">
              <Sparkles className="w-5 h-5 fill-white stroke-[1.5]" />
            </div>
            <div>
              <h1 className="font-extrabold text-xl text-[var(--studio-text-primary)] tracking-tight flex items-center gap-2">
                Neo AI
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[var(--studio-blue-light)] text-[var(--studio-blue)] border border-[var(--studio-blue)]">
                  v2.5
                </span>
              </h1>
              <p className="text-[10px] font-mono text-[var(--studio-text-secondary)] hidden sm:block">AI Literacy & Language Assistant</p>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-3 text-xs font-medium">
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 border border-[var(--studio-border)] rounded-xl bg-[var(--studio-card)] hover:bg-[var(--studio-card-hover)] text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] transition-all cursor-pointer shadow-xs"
              title="Toggle Light/Dark/Cyber Theme"
            >
              {theme === 'light' ? <Moon className="w-4.5 h-4.5" /> : <Sun className="w-4.5 h-4.5 text-amber-400" />}
            </button>

            {/* Sign In */}
            <button
              onClick={() => onEnterAuth(true)}
              className="text-xs font-semibold text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] transition-colors cursor-pointer px-3 py-2"
            >
              Sign In
            </button>

            {/* Get Started CTA */}
            <button
              onClick={() => onEnterAuth(false)}
              className="studio-btn-primary text-xs flex items-center gap-2 py-2 px-4.5 font-bold shadow-md cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Get Started Free</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── 2. Hero Section ── */}
      <main className="flex-1 flex flex-col items-center text-center px-6 py-12 max-w-6xl mx-auto z-10 w-full space-y-12">
        
        {/* Top Announcement Pill */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-cyan-500/10 border border-blue-500/30 text-xs font-mono text-[var(--studio-text-primary)] shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-[var(--studio-blue)] animate-spin" />
          <span className="font-semibold">Next-Gen Multilingual Voice & Reading Coach</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--studio-blue)] text-white">NEW</span>
        </div>

        {/* Hero Title */}
        <div className="space-y-4 max-w-4xl">
          <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-tight">
            Learn Reading, Writing & Speaking with <span className="gemini-text-gradient">Natural AI Guidance</span>
          </h2>
          <p className="text-[var(--studio-text-secondary)] text-base sm:text-lg max-w-3xl mx-auto leading-relaxed font-sans">
            Welcome to Neo AI! Learning should feel encouraging, warm, and built around your pace. Whether you're mastering foundational phonics, practicing natural conversation, or preparing for real-world writing, our intelligent assistant is right beside you at every step.
          </p>
        </div>

        {/* Audio Intro Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-3 bg-[var(--studio-surface)] backdrop-blur-md p-3 rounded-2xl border border-[var(--studio-border)] shadow-lg max-w-md w-full">
          <div className="flex gap-1 bg-[var(--studio-card)] p-1 rounded-xl border border-[var(--studio-border)] w-full sm:w-auto justify-center">
            <button
              onClick={() => setActiveVoiceLang('en')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                activeVoiceLang === 'en' ? 'bg-[var(--studio-blue)] text-white shadow-sm' : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
              }`}
            >
              English
            </button>
            <button
              onClick={() => setActiveVoiceLang('hi')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                activeVoiceLang === 'hi' ? 'bg-[var(--studio-blue)] text-white shadow-sm' : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
              }`}
            >
              हिन्दी
            </button>
            <button
              onClick={() => setActiveVoiceLang('kn')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                activeVoiceLang === 'kn' ? 'bg-[var(--studio-blue)] text-white shadow-sm' : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
              }`}
            >
              ಕನ್ನಡ
            </button>
          </div>
          
          <button
            onClick={speakIntroduction}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-rose-500 via-purple-600 to-indigo-600 text-white font-bold text-xs py-2 px-4 rounded-xl hover:opacity-95 transition-all shadow-md cursor-pointer"
          >
            <Volume2 className="w-4 h-4 animate-pulse" />
            <span>Listen Voice Intro</span>
          </button>
        </div>

        {/* Main Action CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <button
            onClick={() => onEnterAuth(false)}
            className="studio-btn-primary text-sm flex items-center gap-2 py-3.5 px-8 font-bold text-white shadow-xl cursor-pointer hover:scale-105 transition-all"
          >
            <span>Begin Placement Benchmark</span>
            <ArrowRight className="w-4.5 h-4.5" />
          </button>

          <button
            onClick={() => onEnterAuth(true)}
            className="studio-btn-secondary text-sm flex items-center gap-2 py-3.5 px-7 cursor-pointer font-semibold"
          >
            <BookOpen className="w-4.5 h-4.5 text-[var(--studio-blue)]" />
            <span>Open Learning Hub</span>
          </button>
        </div>

        {/* ── 3. Exclusive Features Grid ── */}
        <div className="w-full space-y-6 pt-12">
          <div className="text-center space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--studio-blue)]">
              EXCLUSIVE FEATURES
            </span>
            <h3 className="text-2xl sm:text-3xl font-extrabold text-[var(--studio-text-primary)] tracking-tight">
              Everything You Need to Unlock Full Multilingual Literacy
            </h3>
            <p className="text-xs text-[var(--studio-text-secondary)] max-w-xl mx-auto font-sans">
              Engineered with advanced speech recognition, real-time feedback, and dynamic curriculum generation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            
            {/* Feature 1: Conversational Voice Arena */}
            <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] hover:border-cyan-400 transition-all shadow-sm hover:shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-4">
                  <Mic className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-base text-[var(--studio-text-primary)] mb-1">Conversational Voice Arena</h4>
                <p className="text-xs text-[var(--studio-text-secondary)] leading-relaxed font-sans">
                  Speak naturally with an empathetic AI voice partner. Get instant pronunciation scores, accent analysis, and real-time grammar suggestions as you speak.
                </p>
              </div>
              <div className="pt-3 border-t border-[var(--studio-border)] flex items-center justify-between text-[11px] font-mono text-cyan-400 font-bold">
                <span>Real-Time Speech Engine</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            {/* Feature 2: 7-Day Adaptive Schedule */}
            <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] hover:border-[var(--studio-blue)] transition-all shadow-sm hover:shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-[var(--studio-blue)] mb-4">
                  <Calendar className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-base text-[var(--studio-text-primary)] mb-1">7-Day Adaptive Schedule</h4>
                <p className="text-xs text-[var(--studio-text-secondary)] leading-relaxed font-sans">
                  Personalized weekly routines tailored dynamically to your daily scores. Complete interactive exercises to unlock your next week's custom schedule.
                </p>
              </div>
              <div className="pt-3 border-t border-[var(--studio-border)] flex items-center justify-between text-[11px] font-mono text-[var(--studio-blue)] font-bold">
                <span>Daily Practice Routines</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            {/* Feature 3: Interactive Study Guide */}
            <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] hover:border-purple-400 transition-all shadow-sm hover:shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-base text-[var(--studio-text-primary)] mb-1">Multilingual Study Guide</h4>
                <p className="text-xs text-[var(--studio-text-secondary)] leading-relaxed font-sans">
                  Explore curated chapter manuals with audio narration, unlockable chapter tests, and downloadable PDF study kits for offline practice.
                </p>
              </div>
              <div className="pt-3 border-t border-[var(--studio-border)] flex items-center justify-between text-[11px] font-mono text-purple-400 font-bold">
                <span>Chapter Tests & PDF Downloads</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            {/* Feature 4: Placement Benchmark */}
            <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] hover:border-emerald-400 transition-all shadow-sm hover:shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
                  <Target className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-base text-[var(--studio-text-primary)] mb-1">Diagnostic Placement Quiz</h4>
                <p className="text-xs text-[var(--studio-text-secondary)] leading-relaxed font-sans">
                  A 10-question adaptive assessment evaluating phonics, vocabulary, and reading comprehension to place you in the perfect level track.
                </p>
              </div>
              <div className="pt-3 border-t border-[var(--studio-border)] flex items-center justify-between text-[11px] font-mono text-emerald-400 font-bold">
                <span>Beginner • Intermediate • Advanced</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            {/* Feature 5: Skill Growth Analytics */}
            <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] hover:border-amber-400 transition-all shadow-sm hover:shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-base text-[var(--studio-text-primary)] mb-1">Predictive Growth Analytics</h4>
                <p className="text-xs text-[var(--studio-text-secondary)] leading-relaxed font-sans">
                  Track reading, writing, comprehension, and speaking progress over time with 2-week growth projections and detailed improvement reports.
                </p>
              </div>
              <div className="pt-3 border-t border-[var(--studio-border)] flex items-center justify-between text-[11px] font-mono text-amber-400 font-bold">
                <span>Skill Reports & Metrics</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            {/* Feature 6: Speech & Dictation */}
            <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] hover:border-indigo-400 transition-all shadow-sm hover:shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4">
                  <Zap className="w-5 h-5" />
                </div>
                <h4 className="font-bold text-base text-[var(--studio-text-primary)] mb-1">Speech & Writing Dictation</h4>
                <p className="text-xs text-[var(--studio-text-secondary)] leading-relaxed font-sans">
                  Dictate responses hands-free or read passages out loud. Our evaluation system matches your spoken output against target exercises instantly.
                </p>
              </div>
              <div className="pt-3 border-t border-[var(--studio-border)] flex items-center justify-between text-[11px] font-mono text-indigo-400 font-bold">
                <span>Multimodal Input Evaluation</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

          </div>
        </div>

        {/* ── 4. Step-by-Step Workflow ── */}
        <div className="w-full bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-3xl p-8 shadow-xl text-left space-y-8">
          <div className="text-center space-y-2 max-w-2xl mx-auto">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--studio-blue)]">
              HOW IT WORKS
            </span>
            <h3 className="text-2xl font-bold text-[var(--studio-text-primary)]">
              Your 4-Step Journey to Literacy & Fluency
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            <div className="space-y-3 p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)]">
              <span className="w-8 h-8 rounded-full bg-[var(--studio-blue)] text-white font-mono font-bold flex items-center justify-center text-sm shadow-md">
                1
              </span>
              <h5 className="font-bold text-sm text-[var(--studio-text-primary)]">Take Placement Quiz</h5>
              <p className="text-xs text-[var(--studio-text-secondary)] leading-relaxed">
                Complete a short diagnostic test to determine your starting level track.
              </p>
            </div>

            <div className="space-y-3 p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)]">
              <span className="w-8 h-8 rounded-full bg-cyan-500 text-white font-mono font-bold flex items-center justify-center text-sm shadow-md">
                2
              </span>
              <h5 className="font-bold text-sm text-[var(--studio-text-primary)]">Follow Daily Schedule</h5>
              <p className="text-xs text-[var(--studio-text-secondary)] leading-relaxed">
                Work through your 7-day adaptive plan tailored to your target language.
              </p>
            </div>

            <div className="space-y-3 p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)]">
              <span className="w-8 h-8 rounded-full bg-purple-500 text-white font-mono font-bold flex items-center justify-center text-sm shadow-md">
                3
              </span>
              <h5 className="font-bold text-sm text-[var(--studio-text-primary)]">Practice Voice Speaking</h5>
              <p className="text-xs text-[var(--studio-text-secondary)] leading-relaxed">
                Engage in interactive voice sessions to build speech rate and pronunciation.
              </p>
            </div>

            <div className="space-y-3 p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)]">
              <span className="w-8 h-8 rounded-full bg-emerald-500 text-white font-mono font-bold flex items-center justify-center text-sm shadow-md">
                4
              </span>
              <h5 className="font-bold text-sm text-[var(--studio-text-primary)]">Unlock Next Modules</h5>
              <p className="text-xs text-[var(--studio-text-secondary)] leading-relaxed">
                Complete 50% of each module to unlock advanced learning tracks.
              </p>
            </div>

          </div>
        </div>

        {/* ── 5. Supported Languages Showcase ── */}
        <div className="w-full text-center space-y-4 pt-4">
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--studio-text-secondary)]">
            MULTILINGUAL LEARNING SUPPORT
          </span>
          <div className="flex flex-wrap items-center justify-center gap-3 max-w-4xl mx-auto text-xs font-mono">
            {['English', 'Hindi (हिन्दी)', 'Kannada (ಕನ್ನಡ)', 'Tamil (தமிழ்)', 'Telugu (తెలుగు)', 'Malayalam (മലയാളം)', 'Marathi (मराठी)', 'Bengali (বাংলা)', 'Gujarati (ગુજરાતી)', 'Punjabi (ਪੰਜਾਬੀ)'].map((lang, lIdx) => (
              <span 
                key={lIdx}
                className="px-3.5 py-1.5 rounded-xl bg-[var(--studio-surface)] border border-[var(--studio-border)] text-[var(--studio-text-primary)] font-semibold shadow-xs"
              >
                {lang}
              </span>
            ))}
          </div>
        </div>

      </main>

      {/* ── 6. Footer ── */}
      <footer className="border-t border-[var(--studio-border)] bg-[var(--studio-surface)] py-6 px-6 text-center text-xs text-[var(--studio-text-secondary)] transition-colors z-10 font-sans mt-12">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--studio-blue)]" />
            <p>© 2026 Neo AI Literacy Assistant. Empowering learners everywhere.</p>
          </div>
          <div className="flex gap-4 font-mono text-[11px]">
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> SYSTEM READY
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
};
