import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  BookOpen, LogOut, ClipboardList, Sun, Moon, Volume2, Mic, CheckCircle2, 
  X, Check, AlertCircle, Sparkles, RefreshCw, Lock, ArrowRight, FileText, 
  PanelLeft, Terminal, Cpu, Zap, ChevronRight, RotateCcw, Clock, BarChart2, TrendingUp,
  Lightbulb
} from 'lucide-react';
import { ProfileDashboard } from './ProfileDashboard';
import { DiagnosticReviewPanel } from './DiagnosticReviewPanel';
import { PersonalizedLearningPath } from './PersonalizedLearningPath';
import { LearnerProgressDashboard } from './LearnerProgressDashboard';
import { StudyGuide } from './StudyGuide';
import { ConversationalVoiceArena } from './ConversationalVoiceArena';
import { LanguageChatbot } from './LanguageChatbot';
import { SUPPORTED_LANGUAGES, getSpeechRecognitionLang } from '../constants/languages';




interface Lesson {
  lesson_id: number;
  title_key: string;
  translated_title: string;
  body_text: string;
  exercise_data: any;
}

interface Curriculum {
  curriculum_id: number;
  difficulty_level: string;
  category: string;
  sequence_order: number;
  lessons: Lesson[];
}

interface RoadmapProps {
  onStartAssessment: (pendingLangs?: { targetLang?: string; nativeLang?: string }) => void;
}

interface AIExercise {
  type: string; // pictorial, text_based, voice_based, reading_based, learning_based, read, quiz, listening, comprehension, write
  instruction: string;
  text?: string;
  prompt?: string;
  passage?: string;
  concept_explanation?: string;
  question?: string;
  options?: string[];
  answer: string;
  hint?: string;
  svg_icon?: string;
  audio_prompt?: string;
  audio_text?: string;
}

export const Roadmap: React.FC<RoadmapProps> = ({ onStartAssessment }) => {
  const { user, token, logout, theme, toggleTheme, apiBaseUrl } = useAuth();
  const [curriculumData, setCurriculumData] = useState<Curriculum[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLang, setSelectedLang] = useState(user?.preferred_language || 'en');
  const [selectedTargetLang, setSelectedTargetLang] = useState(user?.target_language || 'hi');
  const [viewMode, setViewMode] = useState<'roadmap' | 'ai-path' | 'history' | 'profile' | 'diagnostic' | 'resources' | 'dashboard' | 'voice-arena'>('ai-path');
  const [dashboardTab, setDashboardTab] = useState<'widgets' | 'gamification' | 'reports'>('reports');
  const [activeTrack, setActiveTrack] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Beginner');

  // Sidebar Layout State
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(true);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  const handlePlayTargetAudio = (textToSpeak?: string) => {
    if (!textToSpeak || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      const targetL = selectedTargetLang || 'hi';
      utterance.lang = getSpeechRecognitionLang(targetL);
      utterance.rate = 0.88;
      utterance.onstart = () => setIsPlayingAudio(true);
      utterance.onend = () => setIsPlayingAudio(false);
      utterance.onerror = () => setIsPlayingAudio(false);
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("TTS playback failed:", e);
      setIsPlayingAudio(false);
    }
  };

  const renderPictorialGraphic = (svgIcon?: string) => {
    const key = (svgIcon || 'apple').toLowerCase();
    switch (key) {
      case 'apple':
        return (
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-rose-500/20 via-red-500/10 to-pink-500/20 border border-rose-500/30 flex items-center justify-center p-3 shadow-lg">
            <svg className="w-16 h-16 text-rose-500 filter drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C10.5 2 9.5 3 9.5 3C9.5 3 8.5 2 7 2C4.2 2 2 4.2 2 7C2 11.5 7.5 16.8 11.5 20.8C11.8 21.1 12.2 21.1 12.5 20.8C16.5 16.8 22 11.5 22 7C22 4.2 19.8 2 17 2C15.5 2 14.5 3 14.5 3C14.5 3 13.5 2 12 2Z" fill="url(#appleGrad)" />
              <defs>
                <linearGradient id="appleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#f43f5e" />
                  <stop offset="100%" stopColor="#be123c" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        );
      case 'car':
        return (
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-blue-500/20 via-cyan-500/10 to-indigo-500/20 border border-blue-500/30 flex items-center justify-center p-3 shadow-lg">
            <svg className="w-16 h-16 text-blue-400 filter drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.85 7h10.29l1.04 3H5.81l1.04-3zM7.5 17C6.67 17 6 16.33 6 15.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>
          </div>
        );
      case 'house':
      case 'home':
        return (
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-amber-500/20 via-orange-500/10 to-yellow-500/20 border border-amber-500/30 flex items-center justify-center p-3 shadow-lg">
            <svg className="w-16 h-16 text-amber-400 filter drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
          </div>
        );
      case 'tree':
        return (
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-emerald-500/20 via-teal-500/10 to-green-500/20 border border-emerald-500/30 flex items-center justify-center p-3 shadow-lg">
            <svg className="w-16 h-16 text-emerald-400 filter drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L4 12h3v8h10v-8h3L12 2z"/>
            </svg>
          </div>
        );
      case 'book':
      case 'reading':
        return (
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-purple-500/20 via-indigo-500/10 to-violet-500/20 border border-purple-500/30 flex items-center justify-center p-3 shadow-lg">
            <svg className="w-16 h-16 text-purple-400 filter drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
            </svg>
          </div>
        );
      case 'running':
        return (
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-cyan-500/20 via-blue-500/10 to-teal-500/20 border border-cyan-500/30 flex items-center justify-center p-3 shadow-lg">
            <svg className="w-16 h-16 text-cyan-400 filter drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-3.6 13.9l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.7-1-.4 2 6.6 1.4z"/>
            </svg>
          </div>
        );
      case 'writing':
        return (
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-violet-500/20 via-fuchsia-500/10 to-pink-500/20 border border-violet-500/30 flex items-center justify-center p-3 shadow-lg">
            <svg className="w-16 h-16 text-violet-400 filter drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </div>
        );
      case 'briefcase':
        return (
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-emerald-500/20 via-green-500/10 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center p-3 shadow-lg">
            <svg className="w-16 h-16 text-emerald-400 filter drop-shadow-md" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 6h-4V4c0-1.11-.89-2-2-2h-4c-1.11 0-2 .89-2 2v2H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-6 0h-4V4h4v2z"/>
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-indigo-500/20 via-blue-500/10 to-cyan-500/20 border border-indigo-500/30 flex items-center justify-center p-3 shadow-lg">
            <Sparkles className="w-14 h-14 text-indigo-400 animate-pulse" />
          </div>
        );
    }
  };

  // Language Change Modal Guard State
  const [showLangSwitchModal, setShowLangSwitchModal] = useState<boolean>(false);
  const [pendingLangSwitch, setPendingLangSwitch] = useState<{ targetLang: string; nativeLang: string } | null>(null);

  // Completion statuses
  const [completedLessons, setCompletedLessons] = useState<number[]>([]);

  // Q&A History log states
  const [historyAttempts, setHistoryAttempts] = useState<any[]>([]);
  const [loadingHistoryAttempts, setLoadingHistoryAttempts] = useState(false);

  // Exercise modal states
  const [activeExercise, setActiveExercise] = useState<Lesson | null>(null);
  const [activeAIExercise, setActiveAIExercise] = useState<AIExercise | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [exerciseTranscript, setExerciseTranscript] = useState('');
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [writingInput, setWritingInput] = useState('');
  const [exerciseSuccess, setExerciseSuccess] = useState(false);
  const [incorrectFeedback, setIncorrectFeedback] = useState<string | null>(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState<number>(0);
  const [currentQuestionPassed, setCurrentQuestionPassed] = useState<boolean>(false);
  const [userProficiency, setUserProficiency] = useState<string>('Beginner');
  const [isPersonalizing, setIsPersonalizing] = useState<boolean>(false);



  // User active time tracking
  const [activeTimeSeconds, setActiveTimeSeconds] = useState<number>(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTimeSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync active study time to backend every 30 seconds for logged in user
  useEffect(() => {
    if (activeTimeSeconds > 0 && activeTimeSeconds % 30 === 0 && user?.user_id) {
      fetch(`${apiBaseUrl}/api/reports/record-study-time?user_id=${user.user_id}&seconds=30`, { method: 'POST' })
        .catch(err => console.warn("Failed to record active study time:", err));
    }
  }, [activeTimeSeconds, user?.user_id, apiBaseUrl]);

  const formatActiveTime = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) {
      return `${mins}m ${secs}s`;
    }
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${remMins}m`;
  };

  const fetchCurriculum = async (nativeL: string, targetL: string, trackParam?: string, forceRegen?: boolean) => {
    const activeTrk = trackParam || activeTrack || 'Beginner';
    const cacheKey = `neoai_curriculum_${user?.user_id || 'guest'}_${nativeL}_${targetL}_${activeTrk}`;
    const cachedStr = localStorage.getItem(cacheKey);
    let loadedFromCache = false;

    if (forceRegen) {
      setIsPersonalizing(true);
      localStorage.removeItem(cacheKey);
    } else if (cachedStr) {
      try {
        const parsed = JSON.parse(cachedStr);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCurriculumData(parsed);
          loadedFromCache = true;
          setLoading(false);
        }
      } catch (e) {
        console.warn("Failed parsing cached curriculum:", e);
      }
    }

    if (!loadedFromCache && !forceRegen) {
      setLoading(true);
    }

    try {
      const userParam = user?.user_id ? `&user_id=${user.user_id}` : '';
      const regenParam = forceRegen ? '&force_regenerate=true' : '';
      const response = await fetch(`${apiBaseUrl}/api/curriculum?lang=${nativeL}&target_lang=${targetL}${userParam}&track=${activeTrk}${regenParam}`);
      if (!response.ok) throw new Error('Failed to fetch from server.');
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        // Detect unformatted fallback titles or placeholder text requiring AI personalization
        const hasFallbackPlaceholder = data.some((m: any) =>
          m.difficulty_level === activeTrk && m.lessons?.some((l: any) =>
            (l.translated_title && (l.translated_title.includes('Complexvocabulary') || l.translated_title.includes('lesson_'))) ||
            (l.body_text && l.body_text.includes('Select this track to generate full AI exercises'))
          )
        );

        if (hasFallbackPlaceholder && !forceRegen) {
          setIsPersonalizing(true);
          setCurriculumData(data);
          // Trigger automatic backend regeneration to replace fallbacks with rich personalized content
          fetchCurriculum(nativeL, targetL, trackParam, true);
          return;
        }

        setCurriculumData(data);
        localStorage.setItem(cacheKey, JSON.stringify(data));
      }
    } catch (err) {
      console.warn("Backend unavailable, using fallback or cached data");
    } finally {
      setLoading(false);
      setIsPersonalizing(false);
    }
  };

  const fetchUserProficiency = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/history/${user.user_id}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const latestProf = data[0].overall_proficiency;
          if (latestProf && (latestProf === 'Beginner' || latestProf === 'Intermediate' || latestProf === 'Advanced')) {
            setUserProficiency(latestProf);
            setActiveTrack(latestProf);
          }
        }
      }
    } catch (e) {
      console.warn("Failed fetching user score history for initial proficiency level mapping");
    }
  };


  const fetchCompletion = async () => {
    if (!user) return;
    const cacheKey = `neoai_completed_${user.user_id}`;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setCompletedLessons(parsed);
        }
      } catch (e) {}
    }

    try {
      const response = await fetch(`${apiBaseUrl}/api/attempts/completion/${user.user_id}`);
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          setCompletedLessons(data);
          localStorage.setItem(cacheKey, JSON.stringify(data));
        }
      }
    } catch (e) {
      console.warn("Failed fetching completion list");
    }
  };

  const fetchHistoryAttempts = async () => {
    if (!user) return;
    setLoadingHistoryAttempts(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/attempts/history/${user.user_id}`);
      if (response.ok) {
        const data = await response.json();
        setHistoryAttempts(data);
      }
    } catch (e) {
      console.warn("Failed fetching history list");
    } finally {
      setLoadingHistoryAttempts(false);
    }
  };

  const handleRetryAttempt = (attemptId: any) => {
    setHistoryAttempts(prev => prev.map(item => {
      if (item.attempt_id === attemptId) {
        return {
          ...item,
          is_correct: true,
          feedback_text: 'Retried & Passed'
        };
      }
      return item;
    }));
  };

  useEffect(() => {
    if (user?.native_language || user?.preferred_language) {
      setSelectedLang(user.native_language || user.preferred_language || 'en');
    }
    if (user?.target_language) {
      setSelectedTargetLang(user.target_language);
    }
  }, [user]);

  useEffect(() => {
    fetchCurriculum(selectedLang, selectedTargetLang);
    fetchCompletion();
    fetchUserProficiency();
  }, [selectedLang, selectedTargetLang]);

  useEffect(() => {
    if (viewMode === 'history') {
      fetchHistoryAttempts();
    }
  }, [viewMode]);

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    if (lang !== selectedLang) {
      setPendingLangSwitch({ targetLang: selectedTargetLang, nativeLang: lang });
      setShowLangSwitchModal(true);
    }
  };

  const handleTargetLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newTarget = e.target.value;
    if (newTarget !== selectedTargetLang) {
      setPendingLangSwitch({ targetLang: newTarget, nativeLang: selectedLang });
      setShowLangSwitchModal(true);
    }
  };

  const speakLesson = (title: string, body: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const text = `${title}. ${body}`;
    const utterance = new SpeechSynthesisUtterance(text);
    
    const targetL = selectedTargetLang || 'hi';
    utterance.lang = getSpeechRecognitionLang(targetL);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const handleStartExercise = (lesson: Lesson) => {
    setActiveExercise(lesson);
    setActiveAIExercise(null);
    setSelectedQuizOption(null);
    setQuizFeedback(null);
    setWritingInput('');
    setExerciseTranscript('');
    setExerciseSuccess(false);
    setIncorrectFeedback(null);
    setCurrentQuestionIdx(0);
    setCurrentQuestionPassed(false);
  };

  const getCurrentQuestion = () => {
    if (!activeExercise || !Array.isArray(activeExercise.exercise_data)) return null;
    return activeExercise.exercise_data[currentQuestionIdx] || null;
  };

  const handleNextQuestion = () => {
    if (activeAIExercise) {
      handleStartAIExercise();
      return;
    }
    if (!activeExercise || !Array.isArray(activeExercise.exercise_data)) return;
    if (currentQuestionIdx < activeExercise.exercise_data.length - 1) {
      setCurrentQuestionIdx(prev => prev + 1);
      setCurrentQuestionPassed(false);
      setSelectedQuizOption(null);
      setQuizFeedback(null);
      setWritingInput('');
      setExerciseTranscript('');
      setIncorrectFeedback(null);
    } else {
      handleCompleteLesson();
    }
  };

  const handleCompleteLesson = async () => {
    if (!activeExercise || !user) return;
    setExerciseSuccess(true);

    const lessonId = activeExercise.lesson_id;
    setCompletedLessons(prev => {
      const next = prev.includes(lessonId) ? prev : [...prev, lessonId];
      localStorage.setItem(`neoai_completed_${user.user_id}`, JSON.stringify(next));
      return next;
    });

    try {
      await fetch(`${apiBaseUrl}/api/attempts/record`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: user.user_id,
          lesson_id: lessonId,
          question_id: `lesson_${lessonId}_completion`,
          user_answer: 'completed',
          correct_answer: 'completed',
          is_correct: true,
          question_text: `Completed exercise checkpoint for ${activeExercise.translated_title}`
        })
      });
      fetchCompletion();
      fetchUserProficiency();
    } catch (e) {
      console.warn("Failed recording completion log");
    }
  };

  const recordQuestionAttemptLog = async (questionText: string, userAnswerText: string, correctAnswerText: string, isCorrect: boolean) => {
    if (!user) return;
    try {
      await fetch(`${apiBaseUrl}/api/attempts/record`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_id: user.user_id,
          lesson_id: activeExercise ? activeExercise.lesson_id : null,
          question_id: activeExercise ? `q_${activeExercise.lesson_id}_${currentQuestionIdx}` : 'ai_exercise',
          user_answer: userAnswerText,
          correct_answer: correctAnswerText,
          is_correct: isCorrect,
          question_text: questionText
        })
      });
    } catch (e) {
      console.warn("Failed posting question attempt log");
    }
  };

  const computeSimilarity = (str1: string, str2: string) => {
    if (!str1 || !str2) return 0;
    const clean = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').trim() || s.toLowerCase().replace(/[\s\.,!\?]/g, '');
    const c1 = clean(str1);
    const c2 = clean(str2);
    if (!c1 || !c2) return 0;
    if (c1 === c2 || c1.includes(c2) || c2.includes(c1)) return 100;
    
    let matches = 0;
    const minLen = Math.min(c1.length, c2.length);
    for (let i = 0; i < minLen; i++) {
      if (c1[i] === c2[i]) matches++;
    }
    return Math.round((matches / Math.max(c1.length, c2.length)) * 100);
  };

  const handleSpeakPractice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      const targetL = selectedTargetLang || 'hi';
      recognition.lang = getSpeechRecognitionLang(targetL);
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
        setExerciseTranscript('');
        setIncorrectFeedback(null);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          finalTranscript += event.results[i][0].transcript;
        }
        setExerciseTranscript(finalTranscript);
        
        const targetText = activeExercise ? (getCurrentQuestion()?.text || '') : (activeAIExercise?.text || '');
        const score = computeSimilarity(finalTranscript, targetText);

        const isPass = score >= 40 || finalTranscript.trim().length > 0;
        recordQuestionAttemptLog(`Speak aloud: "${targetText}"`, finalTranscript, targetText, isPass);

        if (user) {
          fetch(`${apiBaseUrl}/api/speech/assess-pronunciation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: user.user_id,
              lesson_id: activeExercise ? activeExercise.lesson_id : null,
              expected_text: targetText,
              learner_transcript: finalTranscript
            })
          }).catch(() => console.warn("Pronunciation assessment submit skipped"));
        }

        if (isPass) {
          setCurrentQuestionPassed(true);
          setIncorrectFeedback(null);
          if (activeExercise && Array.isArray(activeExercise.exercise_data) && currentQuestionIdx === activeExercise.exercise_data.length - 1) {
            handleCompleteLesson();
          }
        } else {
          setIncorrectFeedback("Try pronouncing clearly or click microphone to try again.");
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        setIsRecording(false);
        if (event.error === 'not-allowed') {
          setIncorrectFeedback("Microphone access was denied. Please allow microphone permissions in your browser settings.");
        } else if (event.error === 'no-speech') {
          setIncorrectFeedback("No speech detected. Please speak clearly into your microphone.");
        } else {
          setIncorrectFeedback(`Voice recognition notice: ${event.error || 'Check microphone'}. You can click Mic to try again.`);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
      };

      recognition.start();
    } catch (err: any) {
      console.warn("Failed starting speech recognition:", err);
      setIsRecording(false);
      setIncorrectFeedback("Could not initialize microphone. Please check browser permissions.");
    }
  };

  const handleQuizSubmit = (opt: string) => {
    setSelectedQuizOption(opt);
    const q = activeExercise ? getCurrentQuestion() : activeAIExercise;
    const correctOpt = activeExercise ? q?.answer : activeAIExercise?.answer;

    const isCorrect = opt === correctOpt;
    setQuizFeedback(isCorrect ? 'correct' : 'incorrect');

    recordQuestionAttemptLog(q?.question || "MCQ Quiz", opt, correctOpt || "", isCorrect);

    if (isCorrect) {
      setIncorrectFeedback(null);
      setCurrentQuestionPassed(true);
      if (activeExercise && Array.isArray(activeExercise.exercise_data) && currentQuestionIdx === activeExercise.exercise_data.length - 1) {
        handleCompleteLesson();
      }
    } else {
      setIncorrectFeedback(`That option is incorrect. The expected answer is "${correctOpt}". Please select again.`);
    }
  };

  const handleWritingSubmit = () => {
    const q = activeExercise ? getCurrentQuestion() : activeAIExercise;
    const correctVal = q?.answer || '';
    const minWords = (q as any)?.min_words || 1;
    const inputWords = writingInput.trim().split(/\s+/).filter(Boolean).length;
    
    // Writing evaluation: either matches answer closely, or for open prompts satisfies word requirement and relevance
    const similarity = computeSimilarity(writingInput, correctVal);
    const isCorrect = (correctVal ? similarity >= 40 : true) && inputWords >= minWords;

    recordQuestionAttemptLog(q?.prompt || q?.instruction || "Writing task", writingInput, correctVal || "Written response", isCorrect);

    if (isCorrect) {
      setIncorrectFeedback(null);
      setCurrentQuestionPassed(true);
      if (activeExercise && Array.isArray(activeExercise.exercise_data) && currentQuestionIdx === activeExercise.exercise_data.length - 1) {
        handleCompleteLesson();
      }
    } else {
      if (inputWords < minWords) {
        setIncorrectFeedback(`Please write at least ${minWords} word${minWords > 1 ? 's' : ''} to complete this writing exercise.`);
      } else {
        setIncorrectFeedback(`Your written response needs improvement. Target: "${correctVal}". Try adjusting your sentence!`);
      }
    }
  };

  const handleWriteDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = getSpeechRecognitionLang(selectedTargetLang || 'en');

    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setWritingInput(text);
    };

    recognition.start();
  };

  const handleStartAIExercise = async () => {
    setAiLoading(true);
    setActiveExercise(null);
    setCurrentQuestionPassed(false);
    setCurrentQuestionIdx(0);
    setWritingInput('');
    setSelectedQuizOption(null);
    setQuizFeedback(null);
    setExerciseTranscript('');
    setExerciseSuccess(false);
    setIncorrectFeedback(null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/curriculum/ai-exercise?level=${activeTrack}&target_lang=${selectedTargetLang}&native_lang=${selectedLang}`);
      if (!response.ok) throw new Error("Failed fetching AI exercise");
      const data = await response.json();
      setActiveAIExercise(data);
    } catch (e) {
      const fallbackList: AIExercise[] = [
        { type: 'write', instruction: 'Writing Studio: Construct a complete greeting sentence in your target language:', prompt: 'Write a sentence introducing yourself (e.g. "Hello, my name is...")', answer: 'Hello, my name is', hint: 'Write at least 2 words' },
        { type: 'pictorial', instruction: 'Identify the object shown in the visual illustration:', question: 'What object is represented here?', svg_icon: 'apple', options: ['Apple', 'Car', 'Tree', 'Book'], answer: 'Apple', hint: 'Sweet red fruit' },
        { type: 'text_based', instruction: 'Fill in the blank with the correct word:', question: 'The sun rises in the ____ every morning.', options: ['East', 'West', 'North', 'South'], answer: 'East', hint: 'Direction' },
        { type: 'voice_based', instruction: 'Listen to the native pronunciation and repeat out loud:', text: 'Good morning, friend!', audio_prompt: 'Good morning, friend!', answer: 'Good morning, friend!' },
        { type: 'reading_based', instruction: 'Read the short passage and answer the comprehension question:', passage: 'Ramu has a small white dog named Tommy. Tommy loves playing with a blue ball in the park.', question: 'What is the dog\'s name?', options: ['Ramu', 'Tommy', 'Park', 'Blue'], answer: 'Tommy' },
        { type: 'learning_based', instruction: 'Learn this basic word concept and test your memory:', concept_explanation: '💡 Concept: Greetings\nIn English, say "Thank you" to express gratitude when someone assists you.', question: 'Which phrase expresses gratitude in English?', options: ['Hello', 'Goodbye', 'Thank you', 'Sorry'], answer: 'Thank you' }
      ];
      const randomEx = fallbackList[Math.floor(Math.random() * fallbackList.length)];
      setActiveAIExercise(randomEx);
    } finally {
      setAiLoading(false);
    }
  };

  // Track Progress Math
  const filteredCurriculums = curriculumData.filter(c => c.difficulty_level === activeTrack);
  const allTrackLessons = filteredCurriculums.flatMap(c => c.lessons);
  const totalTrackCount = allTrackLessons.length;
  const completedTrackCount = allTrackLessons.filter(l => completedLessons.includes(l.lesson_id)).length;
  const currentTrackPercent = totalTrackCount > 0 ? Math.round((completedTrackCount / totalTrackCount) * 100) : 0;

  const beginnerLessons = curriculumData.filter(c => c.difficulty_level === 'Beginner').flatMap(c => c.lessons);
  const beginnerPercent = beginnerLessons.length > 0 ? Math.round((beginnerLessons.filter(l => completedLessons.includes(l.lesson_id)).length / beginnerLessons.length) * 100) : 0;

  const intermediateLessons = curriculumData.filter(c => c.difficulty_level === 'Intermediate').flatMap(c => c.lessons);
  const intermediatePercent = intermediateLessons.length > 0 ? Math.round((intermediateLessons.filter(l => completedLessons.includes(l.lesson_id)).length / intermediateLessons.length) * 100) : 0;

  const advancedLessons = curriculumData.filter(c => c.difficulty_level === 'Advanced').flatMap(c => c.lessons);
  const advancedPercent = advancedLessons.length > 0 ? Math.round((advancedLessons.filter(l => completedLessons.includes(l.lesson_id)).length / advancedLessons.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[var(--studio-bg)] text-[var(--studio-text-primary)] flex flex-col font-sans transition-colors duration-200 relative overflow-x-hidden">

      {/* 1. Header Navigation */}
      <header className="bg-[var(--studio-surface)] border-b border-[var(--studio-border)] sticky top-0 z-40 px-4 py-2.5 flex items-center justify-between transition-colors shadow-sm">
        
        {/* Brand Logo & Sidebar Toggle */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsLeftSidebarOpen(!isLeftSidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-[var(--studio-card)] text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] transition-colors cursor-pointer"
            title="Toggle Navigation Menu"
          >
            <PanelLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gradient-to-tr from-blue-500 via-purple-500 to-cyan-400 text-white shadow-md animate-gemini-sparkle">
              <Sparkles className="w-4 h-4 fill-white stroke-[1.5]" />
            </div>
            <h1 className="font-bold text-base text-[var(--studio-text-primary)] tracking-tight">
              NeoAI
            </h1>
          </div>
        </div>

        {/* Learning Mode Tabs (Center Navigation) */}
        <div className="hidden lg:flex items-center gap-1 bg-[var(--studio-card)] p-1 rounded-lg border border-[var(--studio-border)] font-mono text-xs">
          <button
            onClick={() => {
              setDashboardTab('widgets');
              setViewMode('dashboard');
            }}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer font-medium flex items-center gap-1.5 ${
              viewMode === 'dashboard' && dashboardTab === 'widgets'
                ? 'bg-[var(--studio-surface)] text-[var(--studio-blue)] shadow-sm font-bold border border-[var(--studio-border)]' 
                : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => setViewMode('ai-path')}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer font-medium flex items-center gap-1.5 ${
              viewMode === 'ai-path' 
                ? 'bg-[var(--studio-surface)] text-[var(--studio-blue)] shadow-sm font-bold border border-[var(--studio-border)]' 
                : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>AI Path</span>
          </button>

          <button
            onClick={() => setViewMode('roadmap')}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer font-medium flex items-center gap-1.5 ${
              viewMode === 'roadmap' 
                ? 'bg-[var(--studio-surface)] text-[var(--studio-blue)] shadow-sm font-bold border border-[var(--studio-border)]' 
                : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Roadmap</span>
          </button>

          <button
            onClick={() => {
              setDashboardTab('reports');
              setViewMode('dashboard');
            }}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer font-medium flex items-center gap-1.5 ${
              viewMode === 'dashboard' && dashboardTab === 'reports'
                ? 'bg-[var(--studio-surface)] text-[var(--studio-blue)] shadow-sm font-bold border border-[var(--studio-border)]' 
                : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Improvement Report</span>
          </button>

          <button
            onClick={() => setViewMode('resources')}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer font-medium flex items-center gap-1.5 ${
              viewMode === 'resources' 
                ? 'bg-[var(--studio-surface)] text-[var(--studio-blue)] shadow-sm font-bold border border-[var(--studio-border)]' 
                : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Study Guide</span>
          </button>

          <button
            onClick={() => setViewMode('history')}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer font-medium flex items-center gap-1.5 ${
              viewMode === 'history' 
                ? 'bg-[var(--studio-surface)] text-[var(--studio-blue)] shadow-sm font-bold border border-[var(--studio-border)]' 
                : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>History</span>
          </button>

          <button
            onClick={() => setViewMode('profile')}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer font-medium flex items-center gap-1.5 ${
              viewMode === 'profile' 
                ? 'bg-[var(--studio-surface)] text-[var(--studio-blue)] shadow-sm font-bold border border-[var(--studio-border)]' 
                : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>
        </div>

        {/* Right Header Controls */}
        <div className="flex items-center gap-2.5">
          {/* Language Selector Dropdowns */}
          <div className="hidden sm:flex items-center gap-2 bg-[var(--studio-card)] p-1 rounded-lg border border-[var(--studio-border)] text-xs">
            <select
              value={selectedLang}
              onChange={handleLanguageChange}
              className="bg-transparent text-[var(--studio-text-primary)] text-xs focus:outline-none cursor-pointer px-1 py-0.5"
              title="Native Language"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={`rm_native_${lang.code}`} value={lang.code}>
                  Native: {lang.name}
                </option>
              ))}
            </select>

            <span className="text-[var(--studio-text-secondary)]">→</span>

            <select
              value={selectedTargetLang}
              onChange={handleTargetLanguageChange}
              className="bg-transparent text-[var(--studio-text-primary)] font-semibold text-xs focus:outline-none cursor-pointer px-1 py-0.5 text-[var(--studio-blue)]"
              title="Target Language to Learn"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={`rm_target_${lang.code}`} value={lang.code}>
                  Target: {lang.name}
                </option>
              ))}
            </select>
          </div>


          {/* Diagnostic Placement CTA */}
          <button
            onClick={() => {
              setDashboardTab('reports');
              setViewMode('dashboard');
            }}
            className="studio-btn-primary text-xs flex items-center gap-1.5 py-1 px-3 font-semibold cursor-pointer"
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Improvement Report</span>
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className="p-1.5 border border-[var(--studio-border)] rounded-lg bg-[var(--studio-card)] text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] transition-colors cursor-pointer"
            title="Toggle theme mode"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>

          {/* Logout */}
          <button
            onClick={logout}
            className="p-1.5 border border-[var(--studio-border)] rounded-lg bg-[var(--studio-card)] hover:bg-rose-500/10 text-[var(--studio-text-secondary)] hover:text-rose-400 transition-colors cursor-pointer"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Main Workbench Layout Body */}
      <div className="flex-1 flex w-full relative overflow-hidden">
        
        {/* LEFT COLLAPSIBLE SIDEBAR */}
        {isLeftSidebarOpen && (
          <aside className="w-64 bg-[var(--studio-surface)] border-r border-[var(--studio-border)] p-4 flex flex-col justify-between flex-shrink-0 z-20 font-sans transition-all duration-200">
            
            <div className="space-y-6">
              {/* + Quick Practice Button */}
              <button
                onClick={handleStartAIExercise}
                disabled={aiLoading}
                className="w-full studio-btn-primary text-xs flex items-center justify-center gap-2 py-2.5 font-semibold text-white cursor-pointer shadow-md"
              >
                {aiLoading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>+ Quick Practice</span>
                  </>
                )}
              </button>

              {/* Navigation Menu */}
              <div>
                <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider block mb-2 px-2">
                  Navigation
                </span>

                <div className="space-y-1 text-xs font-medium">
                  <button
                    onClick={() => setViewMode('dashboard')}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                      viewMode === 'dashboard' ? 'bg-[var(--studio-card-hover)] text-[var(--studio-blue)] font-bold' : 'text-[var(--studio-text-secondary)] hover:bg-[var(--studio-card)] hover:text-[var(--studio-text-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <BarChart2 className="w-4 h-4" />
                      <span>Progress Dashboard</span>
                    </span>
                    {viewMode === 'dashboard' && <ChevronRight className="w-3.5 h-3.5 text-[var(--studio-blue)]" />}
                  </button>

                  <button
                    onClick={() => setViewMode('ai-path')}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                      viewMode === 'ai-path' ? 'bg-[var(--studio-card-hover)] text-[var(--studio-blue)] font-bold' : 'text-[var(--studio-text-secondary)] hover:bg-[var(--studio-card)] hover:text-[var(--studio-text-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      <span>AI Learning Path</span>
                    </span>
                    {viewMode === 'ai-path' && <ChevronRight className="w-3.5 h-3.5 text-[var(--studio-blue)]" />}
                  </button>

                  <button
                    onClick={() => setViewMode('voice-arena')}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                      viewMode === 'voice-arena' ? 'bg-[var(--studio-card-hover)] text-[var(--studio-blue)] font-bold' : 'text-[var(--studio-text-secondary)] hover:bg-[var(--studio-card)] hover:text-[var(--studio-text-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Mic className="w-4 h-4 text-cyan-400" />
                      <span>Voice Practice</span>
                    </span>
                    {viewMode === 'voice-arena' && <ChevronRight className="w-3.5 h-3.5 text-[var(--studio-blue)]" />}
                  </button>


                  <button
                    onClick={() => setViewMode('roadmap')}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                      viewMode === 'roadmap' ? 'bg-[var(--studio-card-hover)] text-[var(--studio-blue)] font-bold' : 'text-[var(--studio-text-secondary)] hover:bg-[var(--studio-card)] hover:text-[var(--studio-text-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      <span>Curriculum Roadmap</span>
                    </span>
                    {viewMode === 'roadmap' && <ChevronRight className="w-3.5 h-3.5 text-[var(--studio-blue)]" />}
                  </button>
                  <button
                    onClick={() => {
                      setDashboardTab('reports');
                      setViewMode('dashboard');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                      viewMode === 'dashboard' && dashboardTab === 'reports' ? 'bg-[var(--studio-card-hover)] text-[var(--studio-blue)] font-bold' : 'text-[var(--studio-text-secondary)] hover:bg-[var(--studio-card)] hover:text-[var(--studio-text-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <span>Improvement Report</span>
                    </span>
                    {viewMode === 'dashboard' && dashboardTab === 'reports' && <ChevronRight className="w-3.5 h-3.5 text-[var(--studio-blue)]" />}
                  </button>

                  <button
                    onClick={() => setViewMode('resources')}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                      viewMode === 'resources' ? 'bg-[var(--studio-card-hover)] text-[var(--studio-blue)] font-bold' : 'text-[var(--studio-text-secondary)] hover:bg-[var(--studio-card)] hover:text-[var(--studio-text-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      <span>Study Guidebook</span>
                    </span>
                    {viewMode === 'resources' && <ChevronRight className="w-3.5 h-3.5 text-[var(--studio-blue)]" />}
                  </button>

                  <button
                    onClick={() => setViewMode('history')}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                      viewMode === 'history' ? 'bg-[var(--studio-card-hover)] text-[var(--studio-blue)] font-bold' : 'text-[var(--studio-text-secondary)] hover:bg-[var(--studio-card)] hover:text-[var(--studio-text-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Terminal className="w-4 h-4" />
                      <span>History</span>
                    </span>
                    {viewMode === 'history' && <ChevronRight className="w-3.5 h-3.5 text-[var(--studio-blue)]" />}
                  </button>

                  <button
                    onClick={() => setViewMode('profile')}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-between ${
                      viewMode === 'profile' ? 'bg-[var(--studio-card-hover)] text-[var(--studio-blue)] font-bold' : 'text-[var(--studio-text-secondary)] hover:bg-[var(--studio-card)] hover:text-[var(--studio-text-primary)]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Cpu className="w-4 h-4" />
                      <span>Profile</span>
                    </span>
                    {viewMode === 'profile' && <ChevronRight className="w-3.5 h-3.5 text-[var(--studio-blue)]" />}
                  </button>
                </div>
              </div>

              {/* Tracks Selection */}
              <div>
                <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider block mb-2 px-2">
                  Learning Level Track
                </span>

                <div className="space-y-1.5 text-xs font-semibold">
                  <button
                    onClick={() => {
                      setActiveTrack('Beginner');
                      setViewMode('roadmap');
                      fetchCurriculum(selectedLang, selectedTargetLang, 'Beginner');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors cursor-pointer flex justify-between items-center ${
                      activeTrack === 'Beginner' ? 'bg-[var(--studio-blue-light)] text-[var(--studio-blue)] font-bold border border-[var(--studio-blue)]' : 'bg-[var(--studio-card)] text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
                    }`}
                  >
                    <span>🌱 Beginner Track</span>
                    <span className="font-mono text-[10px]">{beginnerPercent}%</span>
                  </button>

                  <button
                    disabled={!(userProficiency === 'Intermediate' || userProficiency === 'Advanced' || beginnerPercent >= 75)}
                    onClick={() => {
                      setActiveTrack('Intermediate');
                      setViewMode('roadmap');
                      fetchCurriculum(selectedLang, selectedTargetLang, 'Intermediate');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex justify-between items-center ${
                      !(userProficiency === 'Intermediate' || userProficiency === 'Advanced' || beginnerPercent >= 75)
                        ? 'opacity-40 cursor-not-allowed bg-[var(--studio-card)] text-[var(--studio-text-muted)]' 
                        : 'cursor-pointer ' + (activeTrack === 'Intermediate' ? 'bg-[var(--studio-blue-light)] text-[var(--studio-blue)] font-bold border border-[var(--studio-blue)]' : 'bg-[var(--studio-card)] text-[var(--studio-text-secondary)]')
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {!(userProficiency === 'Intermediate' || userProficiency === 'Advanced' || beginnerPercent >= 75) ? (
                        <Lock className="w-3 h-3 text-[var(--studio-text-muted)]" />
                      ) : (
                        '🚀'
                      )}
                      <span>Intermediate</span>
                    </span>
                    <span className="font-mono text-[10px]">{intermediatePercent}%</span>
                  </button>

                  <button
                    disabled={!(userProficiency === 'Advanced' || intermediatePercent >= 75)}
                    onClick={() => {
                      setActiveTrack('Advanced');
                      setViewMode('roadmap');
                      fetchCurriculum(selectedLang, selectedTargetLang, 'Advanced');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors flex justify-between items-center ${
                      !(userProficiency === 'Advanced' || intermediatePercent >= 75)
                        ? 'opacity-40 cursor-not-allowed bg-[var(--studio-card)] text-[var(--studio-text-muted)]' 
                        : 'cursor-pointer ' + (activeTrack === 'Advanced' ? 'bg-[var(--studio-blue-light)] text-[var(--studio-blue)] font-bold border border-[var(--studio-blue)]' : 'bg-[var(--studio-card)] text-[var(--studio-text-secondary)]')
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {!(userProficiency === 'Advanced' || intermediatePercent >= 75) ? (
                        <Lock className="w-3 h-3 text-[var(--studio-text-muted)]" />
                      ) : (
                        '👑'
                      )}
                      <span>Advanced</span>
                    </span>
                    <span className="font-mono text-[10px]">{advancedPercent}%</span>
                  </button>
                </div>
              </div>

            </div>

            {/* User Active Time Footer */}
            <div className="pt-4 border-t border-[var(--studio-border)] font-mono text-[11px] text-[var(--studio-text-secondary)] space-y-1">
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[var(--studio-blue)]" />
                  <span>Active Time:</span>
                </span>
                <span className="text-[var(--studio-blue)] font-bold">{formatActiveTime(activeTimeSeconds)}</span>
              </div>
            </div>

          </aside>
        )}

        {/* CENTRAL WORKBENCH CANVAS */}
        <main className="flex-1 overflow-y-auto p-6 z-10">
          
          {/* Top Mobile Mode Selector Pills */}
          <div className="lg:hidden flex overflow-x-auto gap-2 pb-4 mb-4 border-b border-[var(--studio-border)] text-xs font-mono">
            <button
              onClick={() => setViewMode('ai-path')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${viewMode === 'ai-path' ? 'bg-[var(--studio-blue)] text-white font-bold' : 'bg-[var(--studio-card)]'}`}
            >
              AI Path
            </button>
            <button
              onClick={() => setViewMode('roadmap')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${viewMode === 'roadmap' ? 'bg-[var(--studio-blue)] text-white font-bold' : 'bg-[var(--studio-card)]'}`}
            >
              Roadmap
            </button>
            <button
              onClick={() => {
                setDashboardTab('reports');
                setViewMode('dashboard');
              }}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${viewMode === 'dashboard' && dashboardTab === 'reports' ? 'bg-[var(--studio-blue)] text-white font-bold' : 'bg-[var(--studio-card)]'}`}
            >
              Improvement Report
            </button>
            <button
              onClick={() => setViewMode('resources')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${viewMode === 'resources' ? 'bg-[var(--studio-blue)] text-white font-bold' : 'bg-[var(--studio-card)]'}`}
            >
              Study Guide
            </button>
            <button
              onClick={() => setViewMode('voice-arena')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap flex items-center space-x-1.5 ${viewMode === 'voice-arena' ? 'bg-[var(--studio-blue)] text-white font-bold' : 'bg-[var(--studio-card)]'}`}
            >
              <Mic className="w-3.5 h-3.5 text-cyan-400" />
              <span>Conversational Practice</span>
            </button>
            <button
              onClick={() => setViewMode('history')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${viewMode === 'history' ? 'bg-[var(--studio-blue)] text-white font-bold' : 'bg-[var(--studio-card)]'}`}
            >
              History
            </button>
            <button
              onClick={() => setViewMode('profile')}
              className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${viewMode === 'profile' ? 'bg-[var(--studio-blue)] text-white font-bold' : 'bg-[var(--studio-card)]'}`}
            >
              Profile
            </button>
          </div>

          {/* VIEW MODE CONDITIONAL RENDER */}
          {viewMode === 'dashboard' ? (
            <div className="max-w-6xl mx-auto space-y-6">
              <LearnerProgressDashboard initialTab={dashboardTab} />
            </div>
          ) : viewMode === 'ai-path' ? (
            <div className="max-w-6xl mx-auto space-y-6">
              <PersonalizedLearningPath 
                completedLessons={completedLessons}
                onSelectLesson={(lessonId) => {
                  let foundLesson: Lesson | null = null;
                  let foundTrack: 'Beginner' | 'Intermediate' | 'Advanced' | null = null;
                  for (const curr of curriculumData) {
                    const l = curr.lessons.find(item => item.lesson_id === lessonId);
                    if (l) {
                      foundLesson = l;
                      foundTrack = curr.difficulty_level as 'Beginner' | 'Intermediate' | 'Advanced';
                      break;
                    }
                  }
                  if (foundTrack && foundTrack !== activeTrack) {
                    setActiveTrack(foundTrack);
                  }
                  if (foundLesson) {
                    setActiveExercise(foundLesson);
                    setViewMode('roadmap');
                  } else {
                    setViewMode('roadmap');
                  }
                }}
              />
            </div>
          ) : viewMode === 'voice-arena' ? (
            <div className="max-w-6xl mx-auto space-y-6">
              <ConversationalVoiceArena />
            </div>
          ) : viewMode === 'profile' ? (

            <ProfileDashboard 
              onRequestLanguageAssessment={(pendingLangs) => {
                setPendingLangSwitch(pendingLangs ? { targetLang: pendingLangs.targetLang || selectedTargetLang, nativeLang: pendingLangs.nativeLang || selectedLang } : null);
                setShowLangSwitchModal(true);
              }}
            />
          ) : viewMode === 'diagnostic' ? (
            <div className="max-w-4xl mx-auto bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-6 shadow-xl">
              <DiagnosticReviewPanel userId={user?.user_id} />
            </div>
          ) : viewMode === 'resources' ? (
            <div className="max-w-6xl mx-auto space-y-6">
              <StudyGuide />
            </div>

          ) : viewMode === 'history' ? (
            <div className="max-w-4xl mx-auto bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-6 shadow-xl">
              <div className="flex justify-between items-center mb-6 border-b border-[var(--studio-border)] pb-4">
                <div className="text-left">
                  <h2 className="text-lg font-bold text-[var(--studio-text-primary)] tracking-tight">Practice History</h2>
                  <p className="text-xs text-[var(--studio-text-secondary)] mt-0.5 font-mono">View your recent responses and exercise history</p>
                </div>
                <button 
                  onClick={fetchHistoryAttempts}
                  className="p-1.5 border border-[var(--studio-border)] rounded-lg bg-[var(--studio-card)] text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] transition-colors cursor-pointer"
                  title="Refresh log"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {loadingHistoryAttempts ? (
                <div className="flex flex-col items-center justify-center py-20 gap-2">
                  <span className="w-8 h-8 border-3 border-[var(--studio-blue)] border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs font-mono font-semibold text-[var(--studio-text-secondary)]">Loading your practice history...</p>
                </div>
              ) : historyAttempts.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-[var(--studio-border)] rounded-xl p-5">
                  <h4 className="font-bold text-xs text-[var(--studio-text-primary)]">No practice sessions recorded yet</h4>
                  <p className="text-[10px] text-[var(--studio-text-secondary)] mt-1 font-mono">Complete lesson exercises or check-ins to see your history here.</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                  {historyAttempts.map((att) => {
                    const dateStr = new Date(att.attempted_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                    return (
                      <div key={att.attempt_id} className="p-4 bg-[var(--studio-card)] border border-[var(--studio-border)] rounded-xl text-left space-y-2 font-mono text-xs">
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] text-[var(--studio-text-secondary)]">{dateStr}</span>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${att.is_correct ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                              {att.is_correct ? 'passed' : 'TRY AGAIN'}
                            </span>
                            {!att.is_correct && (
                              <button
                                onClick={() => handleRetryAttempt(att.attempt_id)}
                                className="flex items-center gap-1 px-2.5 py-0.5 text-[10px] font-mono font-bold text-[var(--studio-blue)] bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-full transition-all cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                Retry Question
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[9px] font-bold text-[var(--studio-text-secondary)] uppercase">Task</p>
                          <p className="text-xs font-semibold text-[var(--studio-text-primary)] font-sans">{att.question_text || "Practice task: reading / speaking check"}</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[var(--studio-border)]">
                          <div>
                            <span className="text-[9px] text-[var(--studio-text-secondary)] font-bold uppercase block">Your Answer</span>
                            <span className="text-[var(--studio-text-primary)] font-medium">{att.user_answer || att.user_transcript || "None"}</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-[var(--studio-text-secondary)] font-bold uppercase block">Expected Answer</span>
                            <span className="text-emerald-400 font-semibold">{att.correct_answer || att.feedback_text || "Checked"}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ROADMAP CURRICULUM VIEW */
            <div className="max-w-5xl mx-auto space-y-6">
              
              {/* Track Completion Header */}
              <div className="bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-5 shadow-md flex flex-col gap-2 text-left">
                <div className="flex justify-between items-center text-xs font-bold font-mono">
                  <span className="text-[var(--studio-text-secondary)] uppercase tracking-wider text-[10px]">Track Completion ({activeTrack})</span>
                  <span className="text-[var(--studio-blue)]">{currentTrackPercent}%</span>
                </div>
                <div className="bg-[var(--studio-card)] h-2.5 rounded-full overflow-hidden border border-[var(--studio-border)]">
                  <div style={{ width: `${currentTrackPercent}%` }} className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-300" />
                </div>
              </div>

              <div className="flex justify-between items-center border-b border-[var(--studio-border)] pb-4 flex-wrap gap-3">
                <div className="text-left">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="inline-block text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--studio-card)] text-[var(--studio-blue)] border border-[var(--studio-border)]">
                      {activeTrack} LEVEL MODULES
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      ✨ AI-Personalized Learning Track
                    </span>
                  </div>
                  <h2 className="text-xl font-bold tracking-tight text-[var(--studio-text-primary)] mt-1">Modules & Lesson Sequences</h2>
                </div>

                {/* Track Switcher Pills */}
                <div className="flex items-center gap-1 bg-[var(--studio-card)] p-1 rounded-xl border border-[var(--studio-border)]">
                  {(['Beginner', 'Intermediate', 'Advanced'] as const).map((trk) => {
                    const isUnlocked = 
                      trk === 'Beginner' ||
                      (trk === 'Intermediate' && (userProficiency === 'Intermediate' || userProficiency === 'Advanced' || beginnerPercent >= 75)) ||
                      (trk === 'Advanced' && (userProficiency === 'Advanced' || intermediatePercent >= 75));

                    return (
                      <button
                        key={trk}
                        disabled={!isUnlocked}
                        onClick={() => {
                          setActiveTrack(trk);
                          setViewMode('roadmap');
                          fetchCurriculum(selectedLang, selectedTargetLang, trk);
                        }}
                        className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 cursor-pointer ${
                          activeTrack === trk 
                            ? 'bg-[var(--studio-blue)] text-white shadow-sm font-bold' 
                            : isUnlocked 
                              ? 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]' 
                              : 'opacity-40 cursor-not-allowed text-[var(--studio-text-muted)]'
                        }`}
                      >
                        {!isUnlocked && <Lock className="w-3 h-3 text-[var(--studio-text-muted)]" />}
                        <span>{trk}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Personalizing Notification Banner */}
              {isPersonalizing && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-cyan-500/20 border border-blue-500/40 text-blue-200 flex items-center justify-between shadow-lg animate-pulse mb-4">
                  <div className="flex items-center gap-3 text-left">
                    <Sparkles className="w-5 h-5 text-cyan-400 animate-spin flex-shrink-0" />
                    <div>
                      <h4 className="text-xs font-bold text-white tracking-wide uppercase font-mono">We are personalizing your curriculum...</h4>
                      <p className="text-[11px] text-blue-200/80 mt-0.5">Generating customized topics, vocabulary, and interactive exercises for your target language.</p>
                    </div>
                  </div>
                  <span className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                </div>
              )}

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <span className="w-8 h-8 border-3 border-[var(--studio-blue)] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm font-semibold text-[var(--studio-text-secondary)]">Loading curriculum modules...</p>
                </div>
              ) : filteredCurriculums.length === 0 ? (
                <div className="text-center py-16 bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-8">
                  <span className="text-3xl">📭</span>
                  <h4 className="font-bold text-sm mt-4 text-[var(--studio-text-primary)]">No curriculum content found for this track</h4>
                  <p className="text-xs text-[var(--studio-text-secondary)] mt-1">More modules are being added.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredCurriculums.map((curr, idx) => {
                    const moduleCompletedCount = curr.lessons.filter(l => completedLessons.includes(l.lesson_id)).length;
                    const isModuleFinished = curr.lessons.length > 0 && moduleCompletedCount === curr.lessons.length;

                    // 50% completion prerequisite check on previous module in track
                    let isModuleUnlocked = true;
                    let prevModulePercent = 100;
                    if (idx > 0) {
                      const prevCurr = filteredCurriculums[idx - 1];
                      const prevCompleted = prevCurr.lessons.filter(l => completedLessons.includes(l.lesson_id)).length;
                      const prevTotal = prevCurr.lessons.length || 1;
                      prevModulePercent = Math.round((prevCompleted / prevTotal) * 100);
                      isModuleUnlocked = prevModulePercent >= 50;
                    }

                    return (
                      <div key={curr.curriculum_id} className={`bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl shadow-sm overflow-hidden text-left transition-all ${!isModuleUnlocked ? 'opacity-80' : ''}`}>
                        
                        <div className="bg-[var(--studio-card)] border-b border-[var(--studio-border)] px-5 py-3.5 flex justify-between items-center font-mono">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold text-[var(--studio-text-secondary)] uppercase">Module {idx + 1}</span>
                              {isModuleFinished ? (
                                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                  <Check className="w-3 h-3 stroke-[3]" /> Module Completed
                                </span>
                              ) : !isModuleUnlocked ? (
                                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                  <Lock className="w-3 h-3 text-amber-400" /> Locked (Complete 50% of Module {idx} to unlock)
                                </span>
                              ) : null}
                            </div>
                            <h4 className="font-bold text-sm text-[var(--studio-text-primary)] font-sans mt-0.5">{curr.category}</h4>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-[var(--studio-text-secondary)] font-semibold">
                              {moduleCompletedCount}/{curr.lessons.length} Completed
                            </span>
                          </div>
                        </div>

                        <div className="divide-y divide-[var(--studio-border)]">
                          {curr.lessons.map((lesson, lIdx) => {
                            const isLessonCompleted = completedLessons.includes(lesson.lesson_id);
                            return (
                              <div key={lesson.lesson_id} className={`px-5 py-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition-colors ${!isModuleUnlocked ? 'bg-[var(--studio-card)]/40' : 'hover:bg-[var(--studio-card)]'}`}>
                                <div className="flex items-start gap-3">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5 font-mono ${
                                    !isModuleUnlocked
                                      ? 'bg-[var(--studio-card)] border border-[var(--studio-border)] text-[var(--studio-text-muted)]'
                                      : isLessonCompleted 
                                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400' 
                                      : 'bg-[var(--studio-card)] border border-[var(--studio-border)] text-[var(--studio-text-primary)]'
                                  }`}>
                                    {!isModuleUnlocked ? (
                                      <Lock className="w-3.5 h-3.5 text-[var(--studio-text-muted)]" />
                                    ) : isLessonCompleted ? (
                                      <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
                                    ) : (
                                      lIdx + 1
                                    )}
                                  </div>
                                  <div className="flex flex-col text-left">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h5 className="font-bold text-sm text-[var(--studio-text-primary)]">{lesson.translated_title}</h5>
                                      {isLessonCompleted ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                          <Check className="w-3 h-3 stroke-[3]" /> Completed
                                        </span>
                                      ) : !isModuleUnlocked ? (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                          Prerequisite Locked
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-[var(--studio-card)] text-[var(--studio-text-secondary)] border border-[var(--studio-border)]">
                                          Pending
                                        </span>
                                      )}
                                      <button
                                        onClick={() => speakLesson(lesson.translated_title, lesson.body_text)}
                                        className="p-1 hover:bg-[var(--studio-card-hover)] rounded text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] transition-colors cursor-pointer"
                                        title="Read lesson aloud"
                                      >
                                        <Volume2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <p className="text-xs text-[var(--studio-text-secondary)] font-medium mt-1 max-w-xl">
                                      {lesson.body_text}
                                    </p>
                                  </div>
                                </div>

                                <button
                                  disabled={!isModuleUnlocked}
                                  onClick={() => handleStartExercise(lesson)}
                                  className={`text-xs py-1.5 px-3 self-start sm:self-center flex items-center gap-1.5 font-semibold rounded-lg transition-all ${
                                    !isModuleUnlocked
                                      ? 'bg-[var(--studio-card)] text-[var(--studio-text-muted)] border border-[var(--studio-border)] opacity-60 cursor-not-allowed'
                                      : isLessonCompleted
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 cursor-pointer'
                                      : 'studio-btn-secondary cursor-pointer'
                                  }`}
                                >
                                  {!isModuleUnlocked ? (
                                    <>
                                      <Lock className="w-3.5 h-3.5 text-[var(--studio-text-muted)]" />
                                      <span>Locked</span>
                                    </>
                                  ) : (
                                    <>
                                      <span>{isLessonCompleted ? 'Revisit Exercise' : 'Start Exercise'}</span>
                                      {isLessonCompleted ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400 stroke-[2.5]" />
                                      ) : (
                                        <BookOpen className="w-3.5 h-3.5 text-[var(--studio-text-secondary)]" />
                                      )}
                                    </>
                                  )}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </main>

      </div>

      {/* INTERACTIVE EXERCISE MODAL */}
      {(activeExercise || activeAIExercise) && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 font-sans">
          <div className="bg-[var(--studio-surface)] border border-[var(--studio-border)] max-w-lg w-full rounded-2xl shadow-2xl overflow-hidden relative p-6">
            
            <button
              onClick={() => {
                setActiveExercise(null);
                setActiveAIExercise(null);
              }}
              className="absolute top-4 right-4 p-1.5 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-card)] text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Dynamic Category Badges */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-[var(--studio-blue)] border border-blue-500/20 text-[11px] font-mono font-bold uppercase mb-2">
              <Sparkles className="w-3.5 h-3.5 text-[var(--studio-blue)]" />
              {activeAIExercise ? (
                activeAIExercise.type === 'pictorial' ? '🎨 Pictorial Visual Recognition' :
                activeAIExercise.type === 'text_based' ? '📝 Text & Grammar Challenge' :
                activeAIExercise.type === 'voice_based' ? '🎙️ Voice & Pronunciation Practice' :
                activeAIExercise.type === 'reading_based' ? '📖 Reading Passage & Comprehension' :
                activeAIExercise.type === 'learning_based' ? '💡 Learning Concept & Recall' :
                '✨ AI Quick Practice Task'
              ) : 'Curriculum Checkpoint'}
            </span>

            <h3 className="font-bold text-base text-[var(--studio-text-primary)] mb-2 text-left">
              {activeExercise ? activeExercise.translated_title : (
                activeAIExercise?.type === 'pictorial' ? 'Visual Recognition Task' :
                activeAIExercise?.type === 'text_based' ? 'Grammar & Text Challenge' :
                activeAIExercise?.type === 'voice_based' ? 'Voice Speaking Practice' :
                activeAIExercise?.type === 'reading_based' ? 'Reading Story Checkpoint' :
                activeAIExercise?.type === 'learning_based' ? 'Concept Knowledge Check' :
                `AI Task: ${activeAIExercise?.type}`
              )}
            </h3>

            <p className="text-xs text-[var(--studio-text-secondary)] mb-6 bg-[var(--studio-card)] p-3 rounded-xl border border-[var(--studio-border)] text-left leading-relaxed font-medium">
              {activeExercise ? activeExercise.body_text : activeAIExercise?.instruction}
            </p>

            {/* Progress bar for multi-step questions */}
            {activeExercise && Array.isArray(activeExercise.exercise_data) && (
              <div className="flex gap-1.5 mb-5 mt-2">
                {activeExercise.exercise_data.map((_, idx) => (
                  <div
                    key={idx}
                    className={`flex-1 h-1 rounded-full transition-all ${
                      idx < currentQuestionIdx
                        ? 'bg-emerald-500'
                        : idx === currentQuestionIdx
                        ? 'bg-[var(--studio-blue)]'
                        : 'bg-[var(--studio-border)]'
                    }`}
                  />
                ))}
              </div>
            )}

            {aiLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3 font-mono">
                <span className="w-8 h-8 border-3 border-[var(--studio-blue)] border-t-transparent rounded-full animate-spin" />
                <p className="text-xs font-bold text-[var(--studio-text-primary)]">Generating target-language AI practice question...</p>
                <p className="text-[10px] text-[var(--studio-text-secondary)]">Customizing task in {selectedTargetLang.toUpperCase()} for your track</p>
              </div>
            ) : (
              <>
                {/* 1. PICTORIAL QUESTION RENDERER */}
                {activeAIExercise && activeAIExercise.type === 'pictorial' && (
                  <div className="space-y-4 text-left">
                    <div className="flex flex-col items-center justify-center gap-3 py-2 bg-[var(--studio-card)] border border-[var(--studio-border)] rounded-2xl p-4">
                      {renderPictorialGraphic(activeAIExercise.svg_icon)}
                      <h4 className="font-bold text-sm text-[var(--studio-text-primary)] text-center">
                        {activeAIExercise.question}
                      </h4>
                      {activeAIExercise.hint && (
                        <p className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full flex items-center gap-1 font-mono">
                          <Lightbulb className="w-3 h-3 flex-shrink-0" />
                          <span>Hint: {activeAIExercise.hint}</span>
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      {activeAIExercise.options?.map((opt: string, oIdx: number) => {
                        const isSelected = selectedQuizOption === opt;
                        let optClass = 'bg-[var(--studio-card)] hover:bg-[var(--studio-card-hover)] border-[var(--studio-border)] text-[var(--studio-text-primary)]';
                        if (isSelected) {
                          if (quizFeedback === 'correct' || currentQuestionPassed) {
                            optClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 font-bold';
                          } else {
                            optClass = 'bg-rose-500/10 text-rose-400 border-rose-500/40 font-bold';
                          }
                        }
                        return (
                          <button
                            key={oIdx}
                            onClick={() => handleQuizSubmit(opt)}
                            disabled={currentQuestionPassed}
                            className={`p-3.5 text-center text-xs font-semibold border rounded-xl transition-all cursor-pointer shadow-sm hover:scale-[1.02] ${optClass}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. TEXT-BASED & GRAMMAR QUESTION RENDERER */}
                {activeAIExercise && activeAIExercise.type === 'text_based' && (
                  <div className="space-y-4 text-left">
                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-left">
                      <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase block mb-1">Sentence Challenge:</span>
                      <h4 className="font-bold text-sm text-[var(--studio-text-primary)] leading-relaxed">
                        {activeAIExercise.question}
                      </h4>
                    </div>

                    {activeAIExercise.hint && (
                      <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-xs text-amber-400">
                        <Lightbulb className="w-4 h-4 flex-shrink-0" />
                        <span>{activeAIExercise.hint}</span>
                      </div>
                    )}

                    <div className="flex flex-col gap-2 pt-1">
                      {activeAIExercise.options?.map((opt: string, oIdx: number) => {
                        const isSelected = selectedQuizOption === opt;
                        let optClass = 'bg-[var(--studio-card)] hover:bg-[var(--studio-card-hover)] border-[var(--studio-border)] text-[var(--studio-text-primary)]';
                        if (isSelected) {
                          if (quizFeedback === 'correct' || currentQuestionPassed) {
                            optClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 font-bold';
                          } else {
                            optClass = 'bg-rose-500/10 text-rose-400 border-rose-500/40 font-bold';
                          }
                        }
                        return (
                          <button
                            key={oIdx}
                            onClick={() => handleQuizSubmit(opt)}
                            disabled={currentQuestionPassed}
                            className={`w-full p-3 text-left text-xs font-medium border rounded-xl transition-all cursor-pointer ${optClass}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. VOICE-BASED & PRONUNCIATION RENDERER */}
                {((activeExercise && (getCurrentQuestion()?.type === 'read' || getCurrentQuestion()?.type === 'speak')) || 
                  (activeAIExercise && (activeAIExercise.type === 'voice_based' || activeAIExercise.type === 'read'))) && (
                  <div className="space-y-4">
                    <p className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider text-left">Target Language Audio & Speech:</p>
                    
                    <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-center space-y-3">
                      <span className="text-base font-bold text-[var(--studio-blue)] block leading-relaxed">
                        "{activeExercise ? getCurrentQuestion()?.text : (activeAIExercise?.text || activeAIExercise?.audio_prompt)}"
                      </span>

                      <button
                        onClick={() => handlePlayTargetAudio(activeExercise ? getCurrentQuestion()?.text : (activeAIExercise?.text || activeAIExercise?.audio_prompt))}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          isPlayingAudio ? 'bg-cyan-500 text-white animate-pulse' : 'bg-[var(--studio-card)] hover:bg-[var(--studio-card-hover)] text-[var(--studio-blue)] border border-blue-500/30'
                        }`}
                      >
                        <Volume2 className="w-4 h-4" />
                        <span>{isPlayingAudio ? 'Playing Native Voice...' : 'Listen Native Speaker'}</span>
                      </button>
                    </div>

                    <div className="flex flex-col items-center justify-center gap-2.5 pt-2">
                      <button
                        onClick={handleSpeakPractice}
                        disabled={currentQuestionPassed}
                        className={`w-16 h-16 rounded-full flex items-center justify-center p-0 shrink-0 border cursor-pointer transition-all shadow-md ${
                          isRecording
                            ? 'bg-rose-600 text-white border-rose-600 animate-mic-pulse'
                            : currentQuestionPassed
                            ? 'bg-emerald-600 text-white border-emerald-600 opacity-60'
                            : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-blue-500 hover:scale-105'
                        }`}
                      >
                        <Mic className="w-7 h-7" />
                      </button>
                      <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-widest">
                        {isRecording ? 'Listening...' : currentQuestionPassed ? 'Passed' : 'Click Mic to Speak'}
                      </span>
                    </div>

                    {exerciseTranscript && (
                      <div className="mt-3 p-3 bg-[var(--studio-card)] border border-[var(--studio-border)] rounded-xl text-center">
                        <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase block">Recognized Audio Speech:</span>
                        <p className="text-xs font-semibold text-[var(--studio-text-primary)] mt-1">
                          "{exerciseTranscript}"
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. LISTENING COMPREHENSION QUESTION RENDERER */}
                {((activeExercise && getCurrentQuestion()?.type === 'listening') ||
                  (activeAIExercise && (activeAIExercise.type === 'listening' || activeAIExercise.type === 'voice_comprehension'))) && (
                  <div className="space-y-4 text-left">
                    <div className="p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border border-emerald-500/30 rounded-2xl space-y-3 text-center">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-emerald-400 uppercase flex items-center gap-1.5">
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Auditory Listening Challenge</span>
                        </span>
                        <span className="text-[10px] font-mono text-[var(--studio-text-secondary)]">Listen & Select</span>
                      </div>

                      <div className="py-2">
                        <button
                          onClick={() => {
                            const spoken = activeExercise 
                              ? (getCurrentQuestion()?.audio_text || getCurrentQuestion()?.text || getCurrentQuestion()?.answer)
                              : (activeAIExercise?.audio_text || activeAIExercise?.audio_prompt || activeAIExercise?.text);
                            handlePlayTargetAudio(spoken);
                          }}
                          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer ${
                            isPlayingAudio 
                              ? 'bg-emerald-500 text-white animate-pulse' 
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30 hover:scale-105'
                          }`}
                        >
                          <Volume2 className="w-4 h-4" />
                          <span>{isPlayingAudio ? 'Playing Audio Speech...' : '🔊 Play Audio Prompt'}</span>
                        </button>
                      </div>

                      <p className="text-[11px] text-[var(--studio-text-secondary)] italic">
                        Click above to hear the native pronunciation, then choose the correct matching answer below.
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase block mb-1">Question Prompt:</span>
                      <h4 className="font-semibold text-xs text-[var(--studio-text-primary)]">
                        {activeExercise ? (getCurrentQuestion()?.question || getCurrentQuestion()?.instruction) : (activeAIExercise?.question || activeAIExercise?.instruction)}
                      </h4>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      {(activeExercise ? getCurrentQuestion()?.options : activeAIExercise?.options)?.map((opt: string, oIdx: number) => {
                        const isSelected = selectedQuizOption === opt;
                        let optClass = 'bg-[var(--studio-card)] hover:bg-[var(--studio-card-hover)] border-[var(--studio-border)] text-[var(--studio-text-primary)]';
                        if (isSelected) {
                          if (quizFeedback === 'correct' || currentQuestionPassed) {
                            optClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 font-bold';
                          } else {
                            optClass = 'bg-rose-500/10 text-rose-400 border-rose-500/40 font-bold';
                          }
                        }
                        return (
                          <button
                            key={oIdx}
                            onClick={() => handleQuizSubmit(opt)}
                            disabled={currentQuestionPassed}
                            className={`w-full p-3 text-left text-xs font-medium border rounded-xl transition-all cursor-pointer ${optClass}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 5. READING-BASED PASSAGE COMPREHENSION RENDERER */}
                {((activeExercise && getCurrentQuestion()?.type === 'comprehension') ||
                  (activeAIExercise && (activeAIExercise.type === 'reading_based' || activeAIExercise.type === 'comprehension'))) && (
                  <div className="space-y-4 text-left">
                    <div className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-teal-400 uppercase">Context Passage:</span>
                        <button
                          onClick={() => {
                            const pText = activeExercise ? (getCurrentQuestion()?.passage || getCurrentQuestion()?.text) : activeAIExercise?.passage;
                            handlePlayTargetAudio(pText);
                          }}
                          className="p-1 rounded bg-[var(--studio-card)] text-teal-400 hover:bg-[var(--studio-card-hover)] transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
                          title="Listen to story passage"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Listen</span>
                        </button>
                      </div>
                      <p className="text-xs text-[var(--studio-text-primary)] leading-relaxed font-sans font-medium">
                        {activeExercise ? (getCurrentQuestion()?.passage || getCurrentQuestion()?.text) : activeAIExercise?.passage}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase block mb-1">Comprehension Question:</span>
                      <h4 className="font-semibold text-xs text-[var(--studio-text-primary)]">
                        {activeExercise ? getCurrentQuestion()?.question : activeAIExercise?.question}
                      </h4>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      {(activeExercise ? getCurrentQuestion()?.options : activeAIExercise?.options)?.map((opt: string, oIdx: number) => {
                        const isSelected = selectedQuizOption === opt;
                        let optClass = 'bg-[var(--studio-card)] hover:bg-[var(--studio-card-hover)] border-[var(--studio-border)] text-[var(--studio-text-primary)]';
                        if (isSelected) {
                          if (quizFeedback === 'correct' || currentQuestionPassed) {
                            optClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 font-bold';
                          } else {
                            optClass = 'bg-rose-500/10 text-rose-400 border-rose-500/40 font-bold';
                          }
                        }
                        return (
                          <button
                            key={oIdx}
                            onClick={() => handleQuizSubmit(opt)}
                            disabled={currentQuestionPassed}
                            className={`w-full p-3 text-left text-xs font-medium border rounded-xl transition-all cursor-pointer ${optClass}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 6. LEARNING-BASED CONCEPT FLASHCARD RENDERER */}
                {activeAIExercise && activeAIExercise.type === 'learning_based' && (
                  <div className="space-y-4 text-left">
                    <div className="p-4 bg-gradient-to-br from-amber-500/10 via-yellow-500/10 to-orange-500/10 border border-amber-500/30 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-amber-400 uppercase flex items-center gap-1">
                          <Lightbulb className="w-3.5 h-3.5" />
                          <span>Did You Know? Concept Lesson</span>
                        </span>
                        <button
                          onClick={() => handlePlayTargetAudio(activeAIExercise.concept_explanation)}
                          className="p-1 rounded bg-[var(--studio-card)] text-amber-400 hover:bg-[var(--studio-card-hover)] transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Listen</span>
                        </button>
                      </div>
                      <p className="text-xs text-[var(--studio-text-primary)] leading-relaxed font-sans font-medium whitespace-pre-line">
                        {activeAIExercise.concept_explanation}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase block mb-1">Knowledge Recall Test:</span>
                      <h4 className="font-semibold text-xs text-[var(--studio-text-primary)]">
                        {activeAIExercise.question}
                      </h4>
                    </div>

                    <div className="flex flex-col gap-2 pt-1">
                      {activeAIExercise.options?.map((opt: string, oIdx: number) => {
                        const isSelected = selectedQuizOption === opt;
                        let optClass = 'bg-[var(--studio-card)] hover:bg-[var(--studio-card-hover)] border-[var(--studio-border)] text-[var(--studio-text-primary)]';
                        if (isSelected) {
                          if (quizFeedback === 'correct' || currentQuestionPassed) {
                            optClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 font-bold';
                          } else {
                            optClass = 'bg-rose-500/10 text-rose-400 border-rose-500/40 font-bold';
                          }
                        }
                        return (
                          <button
                            key={oIdx}
                            onClick={() => handleQuizSubmit(opt)}
                            disabled={currentQuestionPassed}
                            className={`w-full p-3 text-left text-xs font-medium border rounded-xl transition-all cursor-pointer ${optClass}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 7. Quiz & Grammar Multiple Choice Renderer */}
                {((activeExercise && (getCurrentQuestion()?.type === 'quiz' || getCurrentQuestion()?.type === 'pictorial')) || 
                  (activeAIExercise && (activeAIExercise.type === 'quiz'))) && (
                  <div className="space-y-4 text-left">
                    <p className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider">Question Prompt:</p>
                    <h4 className="font-semibold text-xs text-[var(--studio-text-primary)] text-left">
                      {activeExercise ? getCurrentQuestion()?.question : activeAIExercise?.question}
                    </h4>

                    <div className="flex flex-col gap-2 pt-1">
                      {(activeExercise ? getCurrentQuestion()?.options : activeAIExercise?.options)?.map((opt: string, oIdx: number) => {
                        const isSelected = selectedQuizOption === opt;
                        let optClass = 'bg-[var(--studio-card)] hover:bg-[var(--studio-card-hover)] border-[var(--studio-border)] text-[var(--studio-text-primary)]';
                        if (isSelected) {
                          if (quizFeedback === 'correct' || currentQuestionPassed) {
                            optClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/40 font-bold';
                          } else {
                            optClass = 'bg-rose-500/10 text-rose-400 border-rose-500/40 font-bold';
                          }
                        }
                        return (
                          <button
                            key={oIdx}
                            onClick={() => handleQuizSubmit(opt)}
                            disabled={currentQuestionPassed}
                            className={`w-full p-3 text-left text-xs font-medium border rounded-xl transition-all cursor-pointer ${optClass}`}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 8. Dedicated Writing & Sentence Composition Studio */}
                {((activeExercise && getCurrentQuestion()?.type === 'write') ||
                  (activeAIExercise && (activeAIExercise.type === 'write' || activeAIExercise.type === 'writing_based'))) && (
                  <div className="space-y-4 text-left">
                    <div className="p-4 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 border border-indigo-500/30 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-indigo-400 uppercase flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5" />
                          <span>✍️ Writing & Sentence Composition Studio</span>
                        </span>
                        <span className="text-[10px] font-mono text-[var(--studio-text-secondary)]">
                          {selectedTargetLang.toUpperCase()} Writing Practice
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-[var(--studio-text-primary)] leading-relaxed">
                        {activeExercise ? (getCurrentQuestion()?.prompt || getCurrentQuestion()?.instruction) : (activeAIExercise?.prompt || activeAIExercise?.instruction)}
                      </p>

                      {(activeExercise ? getCurrentQuestion()?.hint : activeAIExercise?.hint) && (
                        <p className="text-[11px] text-indigo-400 italic flex items-center gap-1">
                          <span>💡 Hint: {activeExercise ? getCurrentQuestion()?.hint : activeAIExercise?.hint}</span>
                        </p>
                      )}
                    </div>

                    <div className="relative">
                      <textarea
                        value={writingInput}
                        disabled={currentQuestionPassed}
                        onChange={(e) => setWritingInput(e.target.value)}
                        placeholder={`Type your written response in ${selectedTargetLang.toUpperCase()} or click the mic to dictate...`}
                        rows={4}
                        className="w-full text-xs studio-input pr-12 resize-none leading-relaxed"
                      />
                      <button
                        onClick={handleWriteDictation}
                        disabled={currentQuestionPassed}
                        className="absolute right-3 bottom-3 p-2 bg-[var(--studio-card)] hover:bg-[var(--studio-card-hover)] text-indigo-400 rounded-lg transition-colors cursor-pointer border border-indigo-500/20"
                        title="Dictate with voice"
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[10px] font-mono text-[var(--studio-text-secondary)]">
                      <span>
                        Words: {writingInput.trim().split(/\s+/).filter(Boolean).length} / min {(activeExercise ? (getCurrentQuestion() as any)?.min_words : (activeAIExercise as any)?.min_words) || 1}
                      </span>
                      <span>Press Submit when finished</span>
                    </div>

                    {!currentQuestionPassed && (
                      <button
                        onClick={handleWritingSubmit}
                        className="w-full studio-btn-primary text-xs flex items-center justify-center gap-1.5 py-2.5 mt-2 font-bold cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                        <span>Submit Written Response</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Multi-step Next Question Action */}
                {currentQuestionPassed && !exerciseSuccess && (
                  <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-left">
                    <span className="text-xs font-semibold text-emerald-400">Great job! Proceed to the next step.</span>
                    <button
                      onClick={handleNextQuestion}
                      className="studio-btn-primary text-xs py-1.5 px-3 flex items-center gap-1 cursor-pointer font-bold"
                    >
                      <span>Next Step</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </>
            )}

            {/* INCORRECT RESPONSE FEEDBACK */}
            {incorrectFeedback && (
              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-medium flex items-start gap-2.5 text-left">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Feedback Note</p>
                  <p className="text-[11px] leading-relaxed mt-0.5">{incorrectFeedback}</p>
                </div>
              </div>
            )}

            {/* Success feedback */}
            {exerciseSuccess && (
              <div className="mt-4 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex flex-col gap-3 text-left">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-sm">Awesome job! You finished this exercise.</p>
                    <p className="text-[11px] text-[var(--studio-text-secondary)] font-mono">Saved to your practice history.</p>
                  </div>
                </div>
                
                <div className="pt-2 border-t border-emerald-500/20 flex justify-end">
                  <button
                    onClick={() => {
                      setActiveExercise(null);
                      setActiveAIExercise(null);
                    }}
                    className="studio-btn-primary text-xs font-bold py-1.5 px-4 cursor-pointer"
                  >
                    Finish & Close
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Language Assessment Guard Modal */}
      {showLangSwitchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-6 max-w-md w-full shadow-2xl text-left space-y-4">
            <div className="flex items-center gap-3 text-[var(--studio-blue)]">
              <div className="p-2.5 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                <ClipboardList className="w-5 h-5 text-[var(--studio-blue)]" />
              </div>
              <div>
                <h3 className="font-bold text-base text-[var(--studio-text-primary)]">Assessment Required</h3>
                <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase">Language Calibration Check</span>
              </div>
            </div>

            <p className="text-xs text-[var(--studio-text-secondary)] leading-relaxed">
              Your curriculum is customized to your current target language. To switch your target language to <strong className="text-[var(--studio-blue)] font-bold">{pendingLangSwitch?.targetLang.toUpperCase()}</strong>, you must complete a quick placement check-in for that language. Your curriculum will update once you finish the assessment.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowLangSwitchModal(false);
                  setPendingLangSwitch(null);
                }}
                className="flex-1 studio-btn-secondary text-xs py-2 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLangSwitchModal(false);
                  if (pendingLangSwitch) {
                    onStartAssessment(pendingLangSwitch);
                  }
                }}
                className="flex-1 studio-btn-primary text-xs py-2 font-semibold cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Take Assessment</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating AI Language Tutor Chatbot */}
      <LanguageChatbot targetLang={selectedTargetLang} nativeLang={selectedLang} />

    </div>
  );
};
