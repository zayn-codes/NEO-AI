import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Mic, MicOff, Volume2, Sparkles,
  Globe, AlertCircle, ArrowUpRight, Play, Square, Lightbulb, Send,
  Timer, Trophy, Target, TrendingUp, CheckCircle2, XCircle
} from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../constants/languages';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface DialogueMessage {
  id: string;
  sender: 'user' | 'ai';
  text_target_lang: string;
  translation_native_lang?: string;
  grammar_feedback?: string;
  pronunciation_score?: number;
  pronunciation_feedback?: string;
  timestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Language Maps
// ─────────────────────────────────────────────────────────────────────────────
const VOICE_LANG_MAP: Record<string, string> = {
  "en": "en-US", "hi": "hi-IN", "kn": "kn-IN", "ta": "ta-IN", "te": "te-IN",
  "ml": "ml-IN", "mr": "mr-IN", "bn": "bn-IN", "gu": "gu-IN", "pa": "pa-IN",
  "es": "es-ES", "fr": "fr-FR", "de": "de-DE", "zh": "zh-CN", "ja": "ja-JP",
  "ar": "ar-SA", "pt": "pt-PT", "ru": "ru-RU", "it": "it-IT", "ko": "ko-KR", "uz": "uz-UZ",
  "english": "en-US", "hindi": "hi-IN", "kannada": "kn-IN", "tamil": "ta-IN", "telugu": "te-IN",
  "malayalam": "ml-IN", "marathi": "mr-IN", "bengali": "bn-IN", "gujarati": "gu-IN", "punjabi": "pa-IN",
  "spanish": "es-ES", "french": "fr-FR", "german": "de-DE", "chinese": "zh-CN", "japanese": "ja-JP",
  "arabic": "ar-SA", "portuguese": "pt-PT", "russian": "ru-RU", "italian": "it-IT", "korean": "ko-KR", "uzbek": "uz-UZ"
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Pronunciation score colour
// ─────────────────────────────────────────────────────────────────────────────
function scoreColor(s: number) {
  if (s >= 85) return { ring: '#22c55e', text: 'text-green-400', label: 'Excellent' };
  if (s >= 65) return { ring: '#3b82f6', text: 'text-blue-400', label: 'Good' };
  if (s >= 40) return { ring: '#f59e0b', text: 'text-amber-400', label: 'Fair' };
  return { ring: '#ef4444', text: 'text-rose-400', label: 'Needs Work' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Circular Gauge component
// ─────────────────────────────────────────────────────────────────────────────
const ScoreGauge: React.FC<{ score: number; size?: number }> = ({ score, size = 72 }) => {
  const r = (size / 2) - 6;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const { ring, text, label } = scoreColor(score);
  return (
    <div className="flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={ring} strokeWidth={5} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className={`-mt-[${size - 8}px] text-sm font-extrabold font-mono ${text}`} style={{ marginTop: -(size - 8) }}>{score}</span>
      <span className={`text-[9px] font-bold uppercase tracking-wider ${text} mt-0.5`}>{label}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Timer presets
// ─────────────────────────────────────────────────────────────────────────────
const TIMER_PRESETS = [
  { label: '2 min', seconds: 120 },
  { label: '3 min', seconds: 180 },
  { label: '5 min', seconds: 300 },
  { label: 'Custom', seconds: -1 },
];

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────
export const ConversationalVoiceArena: React.FC = () => {
  const { user, apiBaseUrl } = useAuth();
  const userId = user?.user_id || 101;

  // Language state
  const [activeTargetLang, setActiveTargetLang] = useState<string>(user?.target_language || 'english');
  const [activeNativeLang, setActiveNativeLang] = useState<string>(user?.native_language || 'english');

  // Conversation state
  const [messages, setMessages] = useState<DialogueMessage[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [manualText, setManualText] = useState('');
  const [suggestedReplies, setSuggestedReplies] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pronunciation state
  const [pronScores, setPronScores] = useState<number[]>([]);
  const avgPronScore = pronScores.length > 0
    ? Math.round(pronScores.reduce((a, b) => a + b, 0) / pronScores.length)
    : null;

  // Timer state
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);   // seconds, null = not started
  const [customMins, setCustomMins] = useState<string>('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);               // seconds remaining
  const [timerRunning, setTimerRunning] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs
  const recognitionRef = useRef<any>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // ── Init welcome ──
  useEffect(() => {
    setMessages([{
      id: 'msg-welcome',
      sender: 'ai',
      text_target_lang: `Hello! I am your AI Voice Assistant. Let's practice speaking in ${activeTargetLang.toUpperCase()} together!`,
      translation_native_lang: `Hello! I am your AI Voice Assistant. Let's practice speaking in ${activeTargetLang.toUpperCase()} together!`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    setSuggestedReplies([
      `Hello! I want to improve my ${activeTargetLang} speaking.`,
      `What topic should we talk about today?`,
      `Tell me a short story in ${activeTargetLang}.`
    ]);
    setPronScores([]);
    stopTimer();
    setSessionExpired(false);
  }, [activeTargetLang, activeNativeLang]);

  // ── Auto scroll ──
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript]);

  // ── Timer countdown ──
  useEffect(() => {
    if (!timerRunning) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!);
          setTimerRunning(false);
          setSessionExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  // ── Timer helpers ──
  const startTimer = (secs: number) => {
    setTimeLeft(secs);
    setTimerRunning(true);
    setSessionExpired(false);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimerRunning(false);
    setTimeLeft(null);
    setSelectedPreset(null);
    setShowCustomInput(false);
    setSessionExpired(false);
  };

  const handlePresetClick = (preset: typeof TIMER_PRESETS[0]) => {
    if (preset.seconds === -1) {
      setShowCustomInput(true);
      setSelectedPreset(-1);
    } else {
      setShowCustomInput(false);
      setSelectedPreset(preset.seconds);
      startTimer(preset.seconds);
    }
  };

  const handleCustomStart = () => {
    const mins = parseInt(customMins, 10);
    if (!isNaN(mins) && mins > 0 && mins <= 60) {
      startTimer(mins * 60);
    }
  };

  // Timer progress fraction for arc
  const timerTotal = selectedPreset && selectedPreset > 0 ? selectedPreset :
    (customMins ? parseInt(customMins) * 60 : 1);
  const timerFraction = timeLeft !== null ? timeLeft / timerTotal : 1;
  const timerUrgent = timeLeft !== null && timeLeft <= 30;

  // ── Speech Synthesis ──
  const speakTextOutLoud = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const cleanTarget = (activeTargetLang || '').toLowerCase().trim();
    const langCode = VOICE_LANG_MAP[cleanTarget] || 'en-US';
    utterance.lang = langCode;
    utterance.rate = 0.95;
    if (window.speechSynthesis.getVoices) {
      const voices = window.speechSynthesis.getVoices();
      const match = voices.find(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase().substring(0, 2)));
      if (match) utterance.voice = match;
    }
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [activeTargetLang]);

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // ── Send spoken / typed text ──
  const handleSendSpokenText = async (spokenText: string) => {
    if (!spokenText.trim() || isProcessing || sessionExpired) return;

    const userMsg: DialogueMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text_target_lang: spokenText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInterimTranscript('');
    setIsProcessing(true);
    setErrorMsg(null);

    const historyPayload = newMessages.slice(-6).map(m => ({
      role: m.sender === 'user' ? 'user' : 'model',
      text: m.text_target_lang
    }));

    try {
      const res = await fetch(`${apiBaseUrl}/api/speech/conversational-tutor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          user_spoken_text: spokenText,
          target_language: activeTargetLang,
          native_language: activeNativeLang,
          conversation_history: historyPayload
        })
      });

      if (res.ok) {
        const data = await res.json();

        // Store pronunciation score
        if (typeof data.pronunciation_score === 'number') {
          setPronScores(prev => [...prev, data.pronunciation_score]);
          // Update the user message with score
          setMessages(prev => prev.map(m =>
            m.id === userMsg.id
              ? { ...m, pronunciation_score: data.pronunciation_score, pronunciation_feedback: data.pronunciation_feedback }
              : m
          ));
        }

        const aiMsg: DialogueMessage = {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text_target_lang: data.reply_target_lang,
          translation_native_lang: data.translation_native_lang,
          grammar_feedback: data.grammar_feedback,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, aiMsg]);
        setSuggestedReplies(data.suggested_replies || []);
        speakTextOutLoud(data.reply_target_lang);
      } else {
        setErrorMsg('Failed to connect to AI Voice Assistant.');
      }
    } catch (err) {
      console.error('Voice Assistant request error:', err);
      setErrorMsg('Connection error. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Speech Recognition ──
  const toggleSpeechRecognition = () => {
    stopSpeaking();
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg('Browser Speech Recognition not supported. Use the text box below!');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      const cleanTarget = (activeTargetLang || '').toLowerCase().trim();
      recognition.lang = VOICE_LANG_MAP[cleanTarget] || 'en-US';
      recognition.interimResults = true;
      recognition.continuous = false;

      recognition.onstart = () => { setIsListening(true); setErrorMsg(null); };
      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        setInterimTranscript(transcript);
        if (event.results[0].isFinal) {
          setIsListening(false);
          handleSendSpokenText(transcript);
        }
      };
      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error !== 'no-speech') setErrorMsg(`Voice notice: ${event.error}. Try typing below.`);
      };
      recognition.onend = () => setIsListening(false);
      recognition.start();
    } catch (e) {
      console.error('Speech recognition start error:', e);
      setIsListening(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 font-sans text-left">

      {/* ── 1. Header Banner ── */}
      <div className="p-5 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-xl">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-6 h-6 text-cyan-400" />
              <h2 className="text-2xl font-bold text-[var(--studio-text-primary)] tracking-tight">
                AI Voice Conversational Arena
              </h2>
            </div>
            <p className="text-xs text-[var(--studio-text-secondary)] max-w-2xl leading-relaxed">
              Practice speaking with Gemini in&nbsp;
              <strong className="text-cyan-400">{activeTargetLang.toUpperCase()}</strong>.
              Get voice responses, grammar coaching, and real-time pronunciation scoring!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
            {/* Target language */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)]">
              <Globe className="w-4 h-4 text-cyan-400" />
              <span className="text-[var(--studio-text-secondary)] font-bold">Target:</span>
              <select
                value={activeTargetLang}
                onChange={e => setActiveTargetLang(e.target.value)}
                className="bg-transparent text-[var(--studio-text-primary)] font-bold border-none focus:outline-none cursor-pointer"
              >
                {SUPPORTED_LANGUAGES.map(l => (
                  <option key={l.code} value={l.name.split(' ')[0]} className="bg-[#0f172a] text-white">{l.name}</option>
                ))}
              </select>
            </div>
            {/* Native language */}
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)]">
              <span className="text-[var(--studio-text-secondary)] font-bold">Explain in:</span>
              <select
                value={activeNativeLang}
                onChange={e => setActiveNativeLang(e.target.value)}
                className="bg-transparent text-[var(--studio-text-primary)] font-bold border-none focus:outline-none cursor-pointer"
              >
                {SUPPORTED_LANGUAGES.map(l => (
                  <option key={l.code} value={l.name.split(' ')[0]} className="bg-[#0f172a] text-white">{l.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Stats Row: Timer + Score ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Session Timer Card */}
        <div className="p-5 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Timer className="w-4 h-4 text-violet-400" />
              <span className="text-xs font-bold text-[var(--studio-text-primary)] uppercase tracking-wider font-mono">Session Timer</span>
            </div>
            {timerRunning && (
              <button
                onClick={stopTimer}
                className="text-[10px] font-mono px-2 py-1 rounded bg-rose-500/20 border border-rose-500/30 text-rose-300 hover:bg-rose-500/30 cursor-pointer"
              >
                Stop
              </button>
            )}
          </div>

          {/* Preset buttons */}
          {!timerRunning && !sessionExpired && (
            <div className="flex flex-wrap gap-2">
              {TIMER_PRESETS.map(preset => (
                <button
                  key={preset.label}
                  onClick={() => handlePresetClick(preset)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono border transition-all cursor-pointer ${
                    selectedPreset === preset.seconds
                      ? 'bg-violet-500 border-violet-400 text-white'
                      : 'bg-[var(--studio-card)] border-[var(--studio-border)] text-[var(--studio-text-secondary)] hover:border-violet-400 hover:text-violet-300'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          {/* Custom input */}
          {showCustomInput && !timerRunning && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={60}
                value={customMins}
                onChange={e => setCustomMins(e.target.value)}
                placeholder="Minutes (1-60)"
                className="w-36 px-3 py-1.5 rounded-lg bg-[var(--studio-card)] border border-[var(--studio-border)] text-[var(--studio-text-primary)] text-xs font-mono focus:outline-none focus:border-violet-400"
              />
              <button
                onClick={handleCustomStart}
                disabled={!customMins || parseInt(customMins) < 1}
                className="px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold font-mono disabled:opacity-50 cursor-pointer"
              >
                Start
              </button>
            </div>
          )}

          {/* Countdown display */}
          {timerRunning && timeLeft !== null && (
            <div className="flex items-center space-x-4">
              {/* Mini arc */}
              <svg width={56} height={56} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
                <circle cx={28} cy={28} r={22} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={5} />
                <circle
                  cx={28} cy={28} r={22} fill="none"
                  stroke={timerUrgent ? '#ef4444' : '#a78bfa'}
                  strokeWidth={5} strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 22}
                  strokeDashoffset={(2 * Math.PI * 22) * (1 - timerFraction)}
                  style={{ transition: 'stroke-dashoffset 0.9s linear' }}
                />
              </svg>
              <div>
                <p className={`text-3xl font-extrabold font-mono ${timerUrgent ? 'text-rose-400' : 'text-violet-300'}`}>
                  {fmtTime(timeLeft)}
                </p>
                <p className="text-[10px] text-[var(--studio-text-secondary)] font-mono">remaining</p>
              </div>
            </div>
          )}

          {/* Session expired banner */}
          {sessionExpired && (
            <div className="flex items-center space-x-2 p-3 rounded-xl bg-violet-500/10 border border-violet-500/30">
              <Trophy className="w-5 h-5 text-violet-400 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-violet-300 font-mono">Session Complete!</p>
                <p className="text-[10px] text-[var(--studio-text-secondary)]">
                  {pronScores.length} exchanges — avg score {avgPronScore ?? '—'}/100
                </p>
              </div>
              <button
                onClick={stopTimer}
                className="ml-auto text-[10px] font-mono px-2 py-1 rounded bg-violet-500/20 border border-violet-400/30 text-violet-300 hover:bg-violet-500/30 cursor-pointer"
              >
                Reset
              </button>
            </div>
          )}

          {/* Not started hint */}
          {!timerRunning && !sessionExpired && selectedPreset === null && (
            <p className="text-[11px] text-[var(--studio-text-secondary)] font-mono italic">
              Choose a duration to start a timed session.
            </p>
          )}
        </div>

        {/* Pronunciation Score Card */}
        <div className="p-5 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-lg space-y-3">
          <div className="flex items-center space-x-2">
            <Target className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-[var(--studio-text-primary)] uppercase tracking-wider font-mono">Pronunciation Score</span>
          </div>

          {avgPronScore !== null ? (
            <div className="flex items-center gap-5">
              <ScoreGauge score={avgPronScore} size={80} />
              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--studio-text-secondary)] font-mono">Session Average</span>
                  <span className={`text-sm font-extrabold font-mono ${scoreColor(avgPronScore).text}`}>{avgPronScore}/100</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${avgPronScore}%`, backgroundColor: scoreColor(avgPronScore).ring }}
                  />
                </div>
                <div className="flex items-center space-x-1.5 mt-1">
                  <TrendingUp className="w-3 h-3 text-[var(--studio-text-secondary)]" />
                  <span className="text-[10px] text-[var(--studio-text-secondary)] font-mono">
                    {pronScores.length} sample{pronScores.length !== 1 ? 's' : ''} recorded
                  </span>
                </div>
                {/* Last 5 scores mini-bar */}
                <div className="flex items-center gap-1 pt-1">
                  {pronScores.slice(-8).map((s, i) => (
                    <div
                      key={i}
                      title={`${s}/100`}
                      className="flex-1 rounded-sm"
                      style={{ height: 20, backgroundColor: scoreColor(s).ring + '99', minWidth: 8 }}
                    >
                      <div
                        style={{ height: `${s}%`, backgroundColor: scoreColor(s).ring, borderRadius: 2, marginTop: `${100 - s}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-4 space-y-2 text-center">
              <div className="w-14 h-14 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <Mic className="w-6 h-6 text-cyan-400/50" />
              </div>
              <p className="text-[11px] text-[var(--studio-text-secondary)] font-mono italic">
                Speak or type your first response to get your pronunciation score!
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── 3. Voice Orb + Controls ── */}
      <div className="p-8 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-xl flex flex-col items-center justify-center space-y-5">

        {/* Orb */}
        <div className="relative flex items-center justify-center">
          <div className={`w-32 h-32 rounded-full transition-all duration-500 flex items-center justify-center shrink-0 ${
            isListening
              ? 'bg-rose-500/20 border-2 border-rose-500 shadow-[0_0_40px_rgba(244,63,94,0.5)] animate-pulse'
              : isSpeaking
                ? 'bg-cyan-500/20 border-2 border-cyan-400 shadow-[0_0_40px_rgba(6,182,212,0.5)] animate-pulse'
                : isProcessing
                  ? 'bg-purple-500/20 border-2 border-purple-400 animate-spin'
                  : 'bg-[var(--studio-card)] border border-[var(--studio-border)] shadow-inner'
          }`}>
            <button
              onClick={toggleSpeechRecognition}
              disabled={isProcessing || sessionExpired}
              className={`w-24 h-24 rounded-full flex items-center justify-center p-0 shrink-0 transition-all cursor-pointer shadow-lg ${
                isListening
                  ? 'bg-rose-500 text-white scale-105 shadow-rose-500/40'
                  : isSpeaking
                    ? 'bg-cyan-500 text-white shadow-cyan-500/40'
                    : sessionExpired
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white hover:scale-105 shadow-blue-500/30'
              }`}
            >
              {isListening ? <MicOff className="w-10 h-10 animate-bounce" />
                : isSpeaking ? <Volume2 className="w-10 h-10 animate-pulse" />
                  : <Mic className="w-10 h-10" />}
            </button>
          </div>
        </div>

        {/* Status label */}
        <div className="text-center space-y-1 font-mono">
          <p className="text-xs font-bold text-[var(--studio-text-primary)]">
            {sessionExpired
              ? '⏰ Session ended. Reset timer to continue.'
              : isListening
                ? `Listening... Speak in ${activeTargetLang.toUpperCase()}`
                : isProcessing
                  ? 'AI is thinking...'
                  : isSpeaking
                    ? 'AI is speaking...'
                    : `Tap Mic to speak in ${activeTargetLang.toUpperCase()}`}
          </p>
          {interimTranscript && (
            <p className="text-xs text-cyan-300 italic max-w-md mx-auto">"{interimTranscript}"</p>
          )}
        </div>

        {isSpeaking && (
          <button
            onClick={stopSpeaking}
            className="text-[10px] font-mono px-3 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center space-x-1 cursor-pointer hover:bg-rose-500/30"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop Audio</span>
          </button>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* ── 4. Dialogue Transcript ── */}
      <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-4 min-h-[300px] flex flex-col justify-between">
        <div className="space-y-4 overflow-y-auto max-h-[500px] pr-2">
          {messages.map(m => (
            <div
              key={m.id}
              className={`flex flex-col space-y-1.5 ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center space-x-2 text-[10px] font-mono text-[var(--studio-text-secondary)] px-1">
                <span>{m.sender === 'user' ? 'You (Learner)' : 'AI Voice Assistant'}</span>
                <span>• {m.timestamp}</span>
                {/* Inline score badge on user messages */}
                {m.sender === 'user' && m.pronunciation_score !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border ${
                      m.pronunciation_score >= 85 ? 'text-green-400 border-green-500/40 bg-green-500/10' :
                      m.pronunciation_score >= 65 ? 'text-blue-400 border-blue-500/40 bg-blue-500/10' :
                      m.pronunciation_score >= 40 ? 'text-amber-400 border-amber-500/40 bg-amber-500/10' :
                      'text-rose-400 border-rose-500/40 bg-rose-500/10'
                    }`}
                  >
                    Pron. {m.pronunciation_score}/100
                  </span>
                )}
              </div>

              <div className={`p-4 rounded-2xl max-w-xl text-xs space-y-2 leading-relaxed ${
                m.sender === 'user'
                  ? 'bg-blue-600/20 text-white border border-blue-500/40 rounded-tr-none'
                  : 'bg-[var(--studio-card)] text-[var(--studio-text-primary)] border border-[var(--studio-border)] rounded-tl-none shadow-sm'
              }`}>
                <div className="flex justify-between items-start gap-2">
                  <p className="font-semibold">{m.text_target_lang}</p>
                  {m.sender === 'ai' && (
                    <button
                      onClick={() => speakTextOutLoud(m.text_target_lang)}
                      className="p-1 text-[var(--studio-text-secondary)] hover:text-cyan-400 transition-colors"
                      title="Replay Audio"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}
                </div>

                {m.translation_native_lang && (
                  <p className="text-[11px] text-[var(--studio-text-secondary)] border-t border-[var(--studio-border)]/60 pt-1.5 italic">
                    "{m.translation_native_lang}"
                  </p>
                )}

                {/* Grammar feedback */}
                {m.grammar_feedback && (
                  <div className="mt-1 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[10px] flex items-start space-x-1.5 font-mono">
                    <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    <span><strong>Grammar:</strong> {m.grammar_feedback}</span>
                  </div>
                )}

                {/* Pronunciation feedback on user bubble */}
                {m.sender === 'user' && m.pronunciation_feedback && (
                  <div className="mt-1 p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-[10px] flex items-start space-x-1.5 font-mono">
                    {m.pronunciation_score !== undefined && m.pronunciation_score >= 65
                      ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                      : <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />}
                    <span><strong>Pronunciation:</strong> {m.pronunciation_feedback}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={chatBottomRef} />
        </div>

        {/* Quick Replies */}
        {suggestedReplies.length > 0 && !sessionExpired && (
          <div className="pt-4 border-t border-[var(--studio-border)] space-y-2">
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--studio-text-secondary)] block">
              Suggested Replies:
            </span>
            <div className="flex flex-wrap gap-2">
              {suggestedReplies.map((r, i) => (
                <button
                  key={i}
                  onClick={() => handleSendSpokenText(r)}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded-lg bg-[var(--studio-card)] hover:bg-cyan-500/20 border border-[var(--studio-border)] hover:border-cyan-500/40 text-[var(--studio-text-primary)] hover:text-cyan-300 text-xs font-mono transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <span>"{r}"</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Manual text input */}
        {!sessionExpired && (
          <form
            onSubmit={e => {
              e.preventDefault();
              if (manualText.trim()) {
                handleSendSpokenText(manualText);
                setManualText('');
              }
            }}
            className="flex items-center gap-2 pt-3 border-t border-[var(--studio-border)]"
          >
            <input
              type="text"
              value={manualText}
              onChange={e => setManualText(e.target.value)}
              placeholder={`Type your response in ${activeTargetLang.toUpperCase()} or use Mic above...`}
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] text-[var(--studio-text-primary)] focus:outline-none focus:border-cyan-400 font-mono"
            />
            <button
              type="submit"
              disabled={!manualText.trim() || isProcessing}
              className="studio-btn-primary px-4 py-2 text-xs font-bold rounded-xl flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
            >
              <span>Send</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>

    </div>
  );
};
