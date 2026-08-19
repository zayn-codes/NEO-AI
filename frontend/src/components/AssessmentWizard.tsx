import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Check, X, ArrowLeft, ArrowRight, Award, ShieldAlert, Sun, Moon, Volume2, Mic, CheckCircle2, AlertCircle, Sparkles } from 'lucide-react';
import { getSpeechRecognitionLang } from '../constants/languages';

interface Question {
  id: string;
  question: string;
  options: string[];
  answer: string;
  points?: number;
}

interface Assessment {
  assessment_id: number;
  assessment_type: string;
  language_code: string;
  passage_text: string;
  question_data: Question[];
}

interface AssessmentWizardProps {
  onClose: () => void;
  pendingTargetLang?: string;
  pendingNativeLang?: string;
}

export const AssessmentWizard: React.FC<AssessmentWizardProps> = ({ onClose, pendingTargetLang, pendingNativeLang }) => {
  const { user, token, updateUser, theme, toggleTheme, apiBaseUrl } = useAuth();
  
  // States
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState(0); 
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  
  // STT States
  const [isRecording, setIsRecording] = useState(false);
  const [sttTranscript, setSttTranscript] = useState('');
  const [accuracyScore, setAccuracyScore] = useState<number | null>(null);
  const [incorrectFeedback, setIncorrectFeedback] = useState<string | null>(null);

  interface FlatQuestion {
    assessment_id: number;
    assessment_type: string;
    passage_text: string;
    question: Question;
  }
  const [flatQuestions, setFlatQuestions] = useState<FlatQuestion[]>([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [results, setResults] = useState<{
    reading_score: number;
    writing_score: number;
    comprehension_score: number;
    overall_proficiency: string;
  } | null>(null);

  const fetchAssessments = async () => {
    setLoading(true);
    const targetL = pendingTargetLang || user?.target_language || 'hi';
    const nativeL = pendingNativeLang || user?.native_language || user?.preferred_language || 'en';
    const lang = targetL;
    try {
      const response = await fetch(`${apiBaseUrl}/api/assessments?target_lang=${targetL}&native_lang=${nativeL}`);
      if (!response.ok) throw new Error("Failed to fetch assessments");
      const data = await response.json();
      setupQuestions(data);
    } catch (err) {
      console.warn("Backend assessments unavailable, loading mock assessment data");
      
      const mockAssessments: Assessment[] = [
        {
          assessment_id: 101,
          assessment_type: "Reading",
          language_code: lang,
          passage_text: "A red bird sits on a green tree branch. The bird sings a sweet song.",
          question_data: [
            { id: "q1", question: "Read this sentence aloud: 'A red bird sits on a green tree branch.'", options: [], answer: "A red bird sits on a green tree branch." }
          ]
        },
        {
          assessment_id: 102,
          assessment_type: "Comprehension",
          language_code: lang,
          passage_text: "Rani buys five bananas and three apples. She walks home happily.",
          question_data: [
            { id: "q3", question: "How many bananas did Rani buy?", options: ["Three", "Five", "Two", "Eight"], answer: "Five" }
          ]
        },
        {
          assessment_id: 103,
          assessment_type: "Writing",
          language_code: lang,
          passage_text: "Introduce yourself to the system.",
          question_data: [
            { id: "q5", question: "Explain what you want to learn today in a simple sentence.", options: [], answer: "" }
          ]
        }
      ];
      setupQuestions(mockAssessments);
    } finally {
      setLoading(false);
    }
  };

  const setupQuestions = (assessments: Assessment[]) => {
    const list: FlatQuestion[] = [];
    assessments.forEach(ass => {
      if (Array.isArray(ass.question_data)) {
        ass.question_data.forEach(q => {
          list.push({
            assessment_id: ass.assessment_id,
            assessment_type: ass.assessment_type,
            passage_text: ass.passage_text,
            question: q
          });
        });
      }
    });
    setFlatQuestions(list);
  };

  useEffect(() => {
    fetchAssessments();
  }, []);

  const handleSelectOption = (option: string) => {
    setSelectedAnswer(option);
    const qId = flatQuestions[activeStep].question.id;
    setAnswers(prev => ({ ...prev, [qId]: option }));

    const currentQ = flatQuestions[activeStep].question;
    if (currentQ.answer && option !== currentQ.answer && currentQ.options && currentQ.options.length > 0) {
      setIncorrectFeedback(`Not quite. The correct answer was "${currentQ.answer}".`);
    } else {
      setIncorrectFeedback(null);
    }
  };

  const speakPrompt = (passage: string, questionText: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const fullText = passage ? `${passage}. ${questionText}` : questionText;
    const utterance = new SpeechSynthesisUtterance(fullText);
    const targetL = user?.target_language || 'hi';
    utterance.lang = getSpeechRecognitionLang(targetL);
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  const computeSimilarity = (str1: string, str2: string) => {
    const clean1 = str1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const clean2 = str2.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!clean1 || !clean2) return 0;
    if (clean1 === clean2) return 100;
    let matches = 0;
    const minLen = Math.min(clean1.length, clean2.length);
    for (let i = 0; i < minLen; i++) {
      if (clean1[i] === clean2[i]) matches++;
    }
    return Math.round((matches / Math.max(clean1.length, clean2.length)) * 100);
  };

  const handleVoiceRecord = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    const targetL = user?.target_language || 'hi';
    recognition.lang = getSpeechRecognitionLang(targetL);

    recognition.onstart = () => {
      setIsRecording(true);
      setSttTranscript('');
      setIncorrectFeedback(null);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setSttTranscript(transcript);
      setIsRecording(false);
      handleSelectOption(transcript);

      const targetText = flatQuestions[activeStep].question.answer || flatQuestions[activeStep].passage_text;
      const score = computeSimilarity(transcript, targetText);
      setAccuracyScore(score);

      if (score < 50) {
        setIncorrectFeedback(`You're close! That scored ${score}%. Try pronouncing clearly, or click the mic to try again.`);
      }
    };

    recognition.onerror = () => setIsRecording(false);
    recognition.start();
  };

  const handleNext = () => {
    if (activeStep < flatQuestions.length - 1) {
      setActiveStep(prev => prev + 1);
      const nextQId = flatQuestions[activeStep + 1].question.id;
      setSelectedAnswer(answers[nextQId] || null);
      setSttTranscript(answers[nextQId] || '');
      setAccuracyScore(null);
      setIncorrectFeedback(null);
    } else {
      handleSubmitAssessment();
    }
  };

  const handleBack = () => {
    if (activeStep > 0) {
      setActiveStep(prev => prev - 1);
      const prevQId = flatQuestions[activeStep - 1].question.id;
      setSelectedAnswer(answers[prevQId] || null);
      setSttTranscript(answers[prevQId] || '');
      setAccuracyScore(null);
      setIncorrectFeedback(null);
    }
  };

  const handleSubmitAssessment = async () => {
    setSubmitLoading(true);
    let totalScore = 0;
    let readingHits = 0;
    let writingHits = 0;
    let compHits = 0;

    flatQuestions.forEach(q => {
      const uAns = answers[q.question.id] || "";
      const type = q.assessment_type.toLowerCase();
      
      let isHit = false;
      if (type === 'reading') {
        const score = computeSimilarity(uAns, q.question.answer || q.passage_text);
        if (score >= 50) isHit = true;
      } else if (type === 'writing') {
        if (uAns.trim().length >= 3) isHit = true;
      } else {
        if (uAns === q.question.answer) isHit = true;
      }

      if (isHit) {
        totalScore += 1;
        if (type === 'reading') readingHits++;
        else if (type === 'writing') writingHits++;
        else compHits++;
      }
    });

    const totalCount = flatQuestions.length || 1;
    const finalPct = Math.round((totalScore / totalCount) * 100);

    let assignedLevel = "Beginner";
    if (finalPct >= 75) assignedLevel = "Advanced";
    else if (finalPct >= 40) assignedLevel = "Intermediate";

    const calculatedResults = {
      reading_score: Math.min(100, Math.round((readingHits / Math.max(1, flatQuestions.filter(q => q.assessment_type.toLowerCase() === 'reading').length)) * 100)),
      writing_score: Math.min(100, Math.round((writingHits / Math.max(1, flatQuestions.filter(q => q.assessment_type.toLowerCase() === 'writing').length)) * 100)),
      comprehension_score: Math.min(100, Math.round((compHits / Math.max(1, flatQuestions.filter(q => q.assessment_type.toLowerCase() === 'comprehension').length)) * 100)),
      overall_proficiency: assignedLevel
    };

    setResults(calculatedResults);
    setIsSubmitted(true);
    setSubmitLoading(false);

    if (user) {
      const activeTargetL = pendingTargetLang || user.target_language || 'hi';
      const activeNativeL = pendingNativeLang || user.native_language || user.preferred_language || 'en';

      try {
        localStorage.setItem(`neo_diagnostic_result_${user.user_id}`, JSON.stringify({
          questions: flatQuestions.map(q => ({ ...q.question, section: q.assessment_type, difficulty: 'Placement' })),
          answers,
          level: assignedLevel,
          timestamp: new Date().toISOString()
        }));

        if (pendingTargetLang || pendingNativeLang) {
          const profilePayload = {
            user_id: user.user_id,
            target_language: activeTargetL,
            native_language: activeNativeL,
            preferred_language: activeNativeL
          };
          const updateRes = await fetch(`${apiBaseUrl}/api/auth/profile`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(profilePayload)
          });
          if (updateRes.ok) {
            const updateData = await updateRes.json();
            updateUser(updateData.user);
          }
        }

        await fetch(`${apiBaseUrl}/api/auth/history`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: user.user_id,
            reading_score: calculatedResults.reading_score,
            writing_score: calculatedResults.writing_score,
            comprehension_score: calculatedResults.comprehension_score,
            overall_proficiency: assignedLevel
          })
        });
      } catch (e) {
        console.warn("Failed recording diagnostic score history to backend.");
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--studio-bg)] flex flex-col items-center justify-center gap-3 font-sans">
        <span className="w-8 h-8 border-3 border-[var(--studio-blue)] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-mono font-semibold text-[var(--studio-text-secondary)]">Getting your check-in questions ready...</p>
      </div>
    );
  }

  if (flatQuestions.length === 0) {
    return (
      <div className="min-h-screen bg-[var(--studio-bg)] flex flex-col items-center justify-center p-6 text-center font-sans">
        <ShieldAlert className="w-12 h-12 text-[var(--studio-blue)] mb-4" />
        <h2 className="font-bold text-lg text-[var(--studio-text-primary)]">Couldn't load your check-in questions right now</h2>
        <p className="text-xs text-[var(--studio-text-secondary)] font-mono mt-1">Please refresh or try again later.</p>
        <button onClick={onClose} className="mt-6 studio-btn-secondary text-xs">
          Return Home
        </button>
      </div>
    );
  }

  const currentQuestionItem = flatQuestions[activeStep];
  const progressPercent = Math.round(((activeStep + 1) / flatQuestions.length) * 100);
  const isReadingType = currentQuestionItem.assessment_type.toLowerCase() === 'reading';
  const isWritingType = currentQuestionItem.assessment_type.toLowerCase() === 'writing';

  return (
    <div className="min-h-screen bg-[var(--studio-bg)] text-[var(--studio-text-primary)] flex flex-col justify-between transition-colors relative font-sans">

      {/* Header */}
      <header className="bg-[var(--studio-surface)] border-b border-[var(--studio-border)] py-3 px-6 transition-colors z-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg border border-[var(--studio-border)] bg-[var(--studio-card)] text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {/* Progress Bar */}
          <div className="flex-1 max-w-xl bg-[var(--studio-card)] h-2 rounded-full overflow-hidden border border-[var(--studio-border)] relative font-mono">
            <div 
              style={{ width: `${progressPercent}%` }}
              className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-300"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-1.5 border border-[var(--studio-border)] rounded-lg bg-[var(--studio-card)] text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] transition-colors cursor-pointer flex items-center justify-center"
              title="Toggle theme mode"
            >
              {theme === 'light' ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
            </button>

            <div className="flex items-center gap-1.5 font-mono text-xs font-semibold">
              <Sparkles className="w-4 h-4 text-[var(--studio-blue)]" />
              <span className="text-[var(--studio-text-primary)]">Improvement Report</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Questionnaire */}
      {!isSubmitted ? (
        <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-10 flex flex-col justify-center z-10">
          <div className="bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-6 md:p-8 shadow-2xl">
            
            {/* Step Subtitle */}
            <div className="flex justify-between items-center mb-6 font-mono">
              <span className="text-[10px] font-bold text-[var(--studio-text-secondary)] uppercase">
                Item {activeStep + 1} of {flatQuestions.length}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--studio-card)] text-[var(--studio-blue)] border border-[var(--studio-border)]">
                  Category: {currentQuestionItem.assessment_type}
                </span>
                
                <button
                  onClick={() => speakPrompt(currentQuestionItem.passage_text, currentQuestionItem.question.question)}
                  className="p-1 hover:bg-[var(--studio-card)] rounded text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] transition-colors cursor-pointer"
                  title="Read question aloud"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Passage Box */}
            {currentQuestionItem.passage_text && currentQuestionItem.passage_text.trim() !== "" && (
              <div className="mb-6 bg-[var(--studio-card)] border border-[var(--studio-border)] p-4 rounded-xl text-left">
                <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase block mb-1">Passage Text</span>
                <p className="text-sm font-semibold text-[var(--studio-text-primary)] leading-relaxed">
                  "{currentQuestionItem.passage_text}"
                </p>
              </div>
            )}

            {/* Question Text */}
            <h3 className="font-semibold text-base text-[var(--studio-text-primary)] mb-5 text-left">
              {currentQuestionItem.question.question}
            </h3>

            {/* Content Switch */}
            {isReadingType ? (
              <div className="space-y-4 pt-2">
                <div className="flex flex-col items-center justify-center gap-3">
                  <button
                    onClick={handleVoiceRecord}
                    className={`w-16 h-16 rounded-full flex items-center justify-center p-0 shrink-0 border cursor-pointer transition-all shadow-md ${
                      isRecording
                        ? 'bg-rose-600 text-white border-rose-600 animate-mic-pulse'
                        : 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-blue-500 hover:scale-105'
                    }`}
                  >
                    <Mic className="w-7 h-7" />
                  </button>
                  <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-widest">
                    {isRecording ? 'Listening...' : 'Click Mic to read sentence aloud'}
                  </span>
                </div>

                {sttTranscript && (
                  <div className="mt-4 p-4 bg-[var(--studio-card)] border border-[var(--studio-border)] rounded-xl text-center font-mono">
                    <span className="text-[10px] font-bold text-[var(--studio-text-secondary)] uppercase block mb-1">Transcription</span>
                    <p className="text-xs font-semibold text-[var(--studio-text-primary)] font-sans">
                      "{sttTranscript}"
                    </p>
                    {accuracyScore !== null && (
                      <span className="inline-block mt-3 px-2 py-0.5 rounded bg-[var(--studio-surface)] text-[var(--studio-blue)] border border-[var(--studio-border)] text-xs font-bold">
                        Accuracy score: {accuracyScore}%
                      </span>
                    )}
                  </div>
                )}
              </div>
            ) : isWritingType ? (
              <div className="space-y-4">
                <div className="relative">
                  <textarea
                    value={sttTranscript}
                    onChange={(e) => {
                      setSttTranscript(e.target.value);
                      handleSelectOption(e.target.value);
                    }}
                    placeholder="Type your response here or click the microphone to dictate..."
                    rows={4}
                    className="w-full text-xs studio-input pr-10"
                  />
                  <button
                    onClick={handleVoiceRecord}
                    className={`absolute right-3.5 bottom-3.5 p-2 rounded-lg transition-colors cursor-pointer ${
                      isRecording
                        ? 'bg-rose-600 text-white animate-mic-pulse'
                        : 'bg-[var(--studio-card)] text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
                    }`}
                    title="Dictate with voice"
                  >
                    <Mic className="w-4 h-4" />
                  </button>
                </div>
                {sttTranscript && (
                  <p className="text-[10px] font-mono text-[var(--studio-text-secondary)] font-semibold text-right">
                    Word count: {sttTranscript.trim().split(/\s+/).filter(Boolean).length} words.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {currentQuestionItem.question.options.map((option, idx) => {
                  const isSelected = selectedAnswer === option;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectOption(option)}
                      className={`w-full p-3.5 text-left text-xs font-medium border rounded-xl transition-all flex justify-between items-center cursor-pointer ${
                        isSelected 
                          ? 'bg-[var(--studio-blue-light)] text-[var(--studio-blue)] border-[var(--studio-blue)] font-bold' 
                          : 'bg-[var(--studio-card)] text-[var(--studio-text-primary)] border-[var(--studio-border)] hover:bg-[var(--studio-card-hover)]'
                      }`}
                    >
                      <span>{option}</span>
                      {isSelected && <Check className="w-4 h-4 stroke-[3]" />}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Wrong Answer Feedback Overlay inside Wizard step */}
            {incorrectFeedback && (
              <div className="mt-6 p-4 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-semibold flex items-start gap-2.5 text-left">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Evaluation Note</p>
                  <p className="text-[11px] leading-relaxed mt-0.5">{incorrectFeedback}</p>
                </div>
              </div>
            )}

          </div>
        </main>
      ) : (
        /* Completion Panel */
        <main className="flex-1 max-w-2xl w-full mx-auto px-6 py-10 flex flex-col justify-center z-10">
          <div className="bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-8 text-center shadow-2xl relative overflow-hidden">
            
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-[var(--studio-blue)]/30 text-[var(--studio-blue)] mx-auto mb-4 flex items-center justify-center">
              <Award className="w-8 h-8" />
            </div>

            <h2 className="font-bold text-xl text-[var(--studio-text-primary)] mb-1">
              Check-in Complete!
            </h2>
            <p className="text-[var(--studio-text-secondary)] text-xs font-mono mb-6">
              Your results have been saved to your profile.
            </p>

            {/* Score Grid */}
            <div className="grid grid-cols-3 gap-4 mb-6 font-mono">
              <div className="bg-[var(--studio-card)] border border-[var(--studio-border)] rounded-xl p-3">
                <span className="block text-[10px] font-bold text-[var(--studio-text-secondary)] uppercase mb-1">Reading</span>
                <span className="text-lg font-bold text-[var(--studio-blue)]">{results?.reading_score}%</span>
              </div>
              <div className="bg-[var(--studio-card)] border border-[var(--studio-border)] rounded-xl p-3">
                <span className="block text-[10px] font-bold text-[var(--studio-text-secondary)] uppercase mb-1">Comprehension</span>
                <span className="text-lg font-bold text-[var(--studio-blue)]">{results?.comprehension_score}%</span>
              </div>
              <div className="bg-[var(--studio-card)] border border-[var(--studio-border)] rounded-xl p-3">
                <span className="block text-[10px] font-bold text-[var(--studio-text-secondary)] uppercase mb-1">Writing</span>
                <span className="text-lg font-bold text-[var(--studio-blue)]">{results?.writing_score}%</span>
              </div>
            </div>

            {/* Level Banner */}
            <div className="border border-[var(--studio-border)] rounded-xl p-5 mb-8 max-w-md mx-auto bg-[var(--studio-card)]">
              <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase block mb-1">Assigned Level</span>
              <div className="text-base font-bold text-[var(--studio-text-primary)] uppercase flex justify-center items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                {results?.overall_proficiency} Learner Track Active
              </div>
              <p className="text-xs text-[var(--studio-text-secondary)] mt-2 font-sans leading-relaxed">
                {results?.overall_proficiency === 'Beginner' && "We've set up your Beginner track! You'll start with fundamental letter sounds and simple words."}
                {results?.overall_proficiency === 'Intermediate' && "We've set up your Intermediate track! You'll work on action words, building sentences, and expanding vocabulary."}
                {results?.overall_proficiency === 'Advanced' && "We've set up your Advanced track! You'll explore reading longer stories, conversational practice, and writing."}
              </p>
            </div>

            <button
              onClick={onClose}
              className="w-full max-w-xs studio-btn-primary text-xs flex items-center justify-center gap-1.5 mx-auto py-2.5 font-semibold cursor-pointer"
            >
              Return to Learning Hub
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </main>
      )}

      {/* Footer Controls */}
      {!isSubmitted && (
        <footer className="bg-[var(--studio-surface)] border-t border-[var(--studio-border)] py-3 px-6 z-10">
          <div className="max-w-4xl mx-auto flex justify-between gap-4">
            <button
              onClick={handleBack}
              disabled={activeStep === 0}
              className="studio-btn-secondary text-xs flex items-center gap-1.5 py-2 font-semibold cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <button
              onClick={handleNext}
              disabled={selectedAnswer === null || submitLoading}
              className="studio-btn-primary text-xs flex items-center gap-1.5 py-2 font-semibold cursor-pointer"
            >
              {submitLoading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : activeStep < flatQuestions.length - 1 ? (
                <>
                  Next
                  <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                "Submit Assessment"
              )}
            </button>
          </div>
        </footer>
      )}

    </div>
  );
};
