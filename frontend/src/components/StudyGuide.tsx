import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  BookOpen, Lock, CheckCircle2, ChevronRight,
  Trophy, AlertCircle, ArrowRight, ShieldCheck
} from 'lucide-react';

interface StudyGuideChapter {
  chapter_id: number;
  user_id: number;
  chapter_number: number;
  title: string;
  summary: string;
  content_markdown: string;
  target_language: string;
  native_language: string;
  difficulty_level: string;
  is_unlocked: boolean;
  required_lessons_count: number;
  completed_lessons_count: number;
  test_passed: boolean;
  created_at?: string;
}

interface StudyGuideData {
  user_id: number;
  chapters: StudyGuideChapter[];
  active_chapter_number: number;
  can_take_unlock_test: boolean;
  unlocked_count: number;
}

interface TestQuestion {
  question_id: number;
  prompt: string;
  options: string[];
  correct_option_index: number;
  explanation: string;
}

interface TestData {
  test_id: number;
  chapter_id: number;
  chapter_number: number;
  questions: TestQuestion[];
}

export const StudyGuide: React.FC = () => {
  const { user, apiBaseUrl } = useAuth();
  const userId = user?.user_id || 101;

  const [loading, setLoading] = useState<boolean>(true);
  const [guideData, setGuideData] = useState<StudyGuideData | null>(null);
  const [selectedChapterNum, setSelectedChapterNum] = useState<number>(1);

  // Test Modal State
  const [showTestModal, setShowTestModal] = useState<boolean>(false);
  const [testLoading, setTestLoading] = useState<boolean>(false);
  const [testData, setTestData] = useState<TestData | null>(null);
  const [userAnswers, setUserAnswers] = useState<number[]>([]);
  const [submittingTest, setSubmittingTest] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ passed: boolean; score: number; message: string } | null>(null);

  const fetchStudyGuide = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/study-guide/${userId}`);
      if (res.ok) {
        const data: StudyGuideData = await res.json();
        setGuideData(data);
        if (data.chapters && data.chapters.length > 0) {
          const unlocked = data.chapters.filter(c => c.is_unlocked);
          const highestUnlocked = unlocked.length > 0 ? Math.max(...unlocked.map(c => c.chapter_number)) : 1;
          setSelectedChapterNum(highestUnlocked);
        }
      }
    } catch (e) {
      console.error("Failed to fetch study guide:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudyGuide();
  }, [userId, apiBaseUrl]);

  const [isPersonalizingTest, setIsPersonalizingTest] = useState(false);

  const handleOpenUnlockTest = async (chapterId: number, forceRegen = false) => {
    setTestLoading(true);
    setTestResult(null);
    setShowTestModal(true);
    try {
      const url = `${apiBaseUrl}/api/study-guide/unlock-test/${chapterId}?user_id=${userId}${forceRegen ? '&force_regenerate=true' : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data: TestData = await res.json();
        
        // Detect raw placeholder text in questions
        const hasPlaceholder = data.questions.some(q => 
          q.prompt.includes("Practice Question #") || 
          q.prompt.includes("Select the correct") ||
          q.options.some(opt => opt.includes("Correct ") && opt.includes(" Phrase"))
        );

        if (hasPlaceholder && !forceRegen) {
          setIsPersonalizingTest(true);
          await handleOpenUnlockTest(chapterId, true);
          return;
        }

        setTestData(data);
        setUserAnswers(new Array(data.questions.length).fill(-1));
      }
    } catch (e) {
      console.error("Failed to load unlock test:", e);
    } finally {
      setTestLoading(false);
      setIsPersonalizingTest(false);
    }
  };

  const handleSubmitTest = async () => {
    if (!testData) return;
    setSubmittingTest(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/study-guide/submit-unlock-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          chapter_id: testData.chapter_id,
          answers: userAnswers
        })
      });
      if (res.ok) {
        const result = await res.json();
        setTestResult({
          passed: result.passed,
          score: result.score_percentage,
          message: result.message
        });

        if (result.passed) {
          setTimeout(() => {
            fetchStudyGuide();
          }, 1500);
        }
      }
    } catch (e) {
      console.error("Failed to submit unlock test:", e);
    } finally {
      setSubmittingTest(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center font-sans">
        <span className="w-10 h-10 border-3 border-[var(--studio-blue)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold font-mono text-[var(--studio-text-secondary)]">
          Generating your personalized progressive study guide...
        </p>
      </div>
    );
  }

  const activeChapter = guideData?.chapters.find(c => c.chapter_number === selectedChapterNum) || guideData?.chapters[0];

  return (
    <div className="space-y-6 font-sans text-left">
      
      {/* 1. Header Banner */}
      <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-6 h-6 text-[var(--studio-blue)]" />
              <h2 className="text-2xl font-bold text-[var(--studio-text-primary)] tracking-tight">
                Personalized Progressive Study Guide
              </h2>
            </div>
            <p className="text-xs text-[var(--studio-text-secondary)] max-w-2xl leading-relaxed">
              Step-by-step master guide tailored to your level. Fulfill track requirements & pass unlock tests to progressively reveal future chapters from Zero to Advanced.
            </p>
          </div>

          <div className="flex items-center space-x-3 font-mono text-xs">
            <span className="px-3 py-1.5 rounded-lg bg-[var(--studio-card)] border border-[var(--studio-border)] text-[var(--studio-text-secondary)]">
              Unlocked: <strong className="text-[var(--studio-blue)]">{guideData?.unlocked_count || 1} Chapters</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 2. Main Content Grid (Chapters Sidebar + Chapter Reader) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Chapters Navigation List (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--studio-text-secondary)] px-1">
            Course Curriculum Roadmap
          </h3>

          <div className="space-y-2.5">
            {guideData?.chapters.map((ch) => {
              const isSelected = ch.chapter_number === selectedChapterNum;
              return (
                <div
                  key={ch.chapter_id}
                  onClick={() => {
                    if (ch.is_unlocked) {
                      setSelectedChapterNum(ch.chapter_number);
                    }
                  }}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--studio-card)] border-[var(--studio-blue)] ring-2 ring-[var(--studio-blue)]/20 shadow-md'
                      : ch.is_unlocked
                        ? 'bg-[var(--studio-surface)] border-[var(--studio-border)] hover:border-[var(--studio-border-subtle)]'
                        : 'bg-[var(--studio-surface)]/50 border-[var(--studio-border)]/50 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2.5">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                        ch.is_unlocked 
                          ? ch.test_passed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-blue-500/20 text-[var(--studio-blue)] border border-blue-500/30'
                          : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'
                      }`}>
                        {ch.chapter_number}
                      </div>
                      <div>
                        <h4 className="font-bold text-xs text-[var(--studio-text-primary)] line-clamp-1">
                          {ch.title}
                        </h4>
                        <span className="text-[10px] font-mono text-[var(--studio-text-secondary)]">
                          {ch.difficulty_level} • {ch.target_language.toUpperCase()}
                        </span>
                      </div>
                    </div>

                    {ch.is_unlocked ? (
                      ch.test_passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[var(--studio-blue)] flex-shrink-0" />
                      )
                    ) : (
                      <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    )}
                  </div>

                  {/* Unlock Status Progress */}
                  {!ch.is_unlocked && (
                    <div className="mt-2.5 pt-2 border-t border-[var(--studio-border)]/50 text-[10px] font-mono text-gray-400 flex items-center justify-between">
                      <span>Pass Chapter {ch.chapter_number - 1} Test</span>
                      <span className="font-bold text-amber-400">Locked 🔒</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Chapter Reader View & Unlock Action Bar (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {activeChapter && (
            <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-6">
              
              {/* Chapter Header Info */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-4 border-b border-[var(--studio-border)]">
                <div>
                  <div className="flex items-center space-x-2 mb-1 font-mono text-xs">
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-[var(--studio-blue)] font-bold border border-blue-500/20">
                      Chapter {activeChapter.chapter_number}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold border border-purple-500/20">
                      {activeChapter.difficulty_level}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-[var(--studio-text-primary)]">
                    {activeChapter.title}
                  </h3>
                </div>

                {/* Unlock Test CTA Banner */}
                {activeChapter.is_unlocked && !activeChapter.test_passed && (
                  <button
                    onClick={() => handleOpenUnlockTest(activeChapter.chapter_id)}
                    className="studio-btn-primary text-xs font-bold py-2 px-3.5 flex items-center space-x-2 cursor-pointer shadow-md"
                  >
                    <Trophy className="w-4 h-4 text-amber-300" />
                    <span>Take Chapter {activeChapter.chapter_number} Test 🚀</span>
                  </button>
                )}

                {activeChapter.test_passed && (
                  <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-bold border border-emerald-500/20 flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Test Passed ✓</span>
                  </span>
                )}
              </div>

              {/* Unlock Prerequisite Status Bar */}
              <div className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] font-mono text-xs space-y-2">
                <div className="flex justify-between items-center font-bold">
                  <span className="text-[var(--studio-text-primary)]">Chapter Progress Prerequisites:</span>
                  <span className="text-[var(--studio-blue)]">
                    {activeChapter.completed_lessons_count}/{activeChapter.required_lessons_count} Track Lessons Completed
                  </span>
                </div>
                <div className="w-full bg-[var(--studio-surface)] h-2 rounded-full overflow-hidden border border-[var(--studio-border)]">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (activeChapter.completed_lessons_count / activeChapter.required_lessons_count) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Main Chapter Content Markdown Reader */}
              <div className="prose prose-invert max-w-none text-xs leading-relaxed space-y-4 text-[var(--studio-text-primary)] font-sans whitespace-pre-wrap">
                {activeChapter.content_markdown}
              </div>

              {/* Bottom Unlock Test Action Footer */}
              {!activeChapter.test_passed && (
                <div className="pt-4 border-t border-[var(--studio-border)] flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-xs text-[var(--studio-text-secondary)]">
                    Pass the Chapter {activeChapter.chapter_number} unlock test with 70%+ to unlock Chapter {activeChapter.chapter_number + 1}.
                  </div>
                  <button
                    onClick={() => handleOpenUnlockTest(activeChapter.chapter_id)}
                    className="studio-btn-primary text-xs font-bold py-2.5 px-4 flex items-center space-x-2"
                  >
                    <span>Start Unlock Test</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}

            </div>
          )}
        </div>
      </div>

      {/* 3. Unlock Test Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-2xl max-w-2xl w-full space-y-6 max-h-[90vh] overflow-y-auto">
            
            <div className="flex justify-between items-center border-b border-[var(--studio-border)] pb-3">
              <div className="flex items-center space-x-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm text-[var(--studio-text-primary)]">
                  Chapter {testData?.chapter_number || selectedChapterNum} Unlock Quiz
                </h3>
              </div>
              <button 
                onClick={() => setShowTestModal(false)}
                className="text-xs font-bold text-[var(--studio-text-secondary)] hover:text-white px-2 py-1"
              >
                ✕ Close
              </button>
            </div>

            {testLoading || isPersonalizingTest ? (
              <div className="p-8 text-center space-y-3">
                <span className="w-8 h-8 border-2 border-[var(--studio-blue)] border-t-transparent rounded-full animate-spin inline-block" />
                <p className="text-xs font-bold text-[var(--studio-text-primary)]">
                  {isPersonalizingTest 
                    ? "✨ We are personalizing your study guide unlock test..." 
                    : `Loading personalized quiz questions for Chapter ${selectedChapterNum}...`}
                </p>
                <p className="text-[10px] text-[var(--studio-text-secondary)] font-mono">
                  Generating customized target-language questions & answers
                </p>
              </div>
            ) : testResult ? (
              <div className="text-center p-6 space-y-4 font-mono">
                <div className={`inline-flex p-4 rounded-full ${testResult.passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                  {testResult.passed ? <CheckCircle2 className="w-10 h-10" /> : <AlertCircle className="w-10 h-10" />}
                </div>
                <h4 className="text-lg font-bold text-[var(--studio-text-primary)] font-sans">
                  {testResult.passed ? "Chapter Test Passed! 🎉" : "Keep Practicing!"}
                </h4>
                <p className="text-sm text-[var(--studio-text-secondary)]">
                  Score: <strong className={testResult.passed ? "text-emerald-400" : "text-rose-400"}>{testResult.score}%</strong> (Passing: 70%)
                </p>
                <p className="text-xs text-[var(--studio-text-secondary)] max-w-md mx-auto">
                  {testResult.message}
                </p>
                <button
                  onClick={() => setShowTestModal(false)}
                  className="studio-btn-primary text-xs font-bold py-2 px-6 mt-2"
                >
                  Continue Learning
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                <p className="text-xs text-[var(--studio-text-secondary)] font-sans leading-relaxed">
                  Answer the 5 questions below to prove your mastery and unlock the next chapter in your personalized study guide.
                </p>

                {testData?.questions.map((q, qIdx) => (
                  <div key={q.question_id} className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-3 text-xs">
                    <span className="font-bold text-[var(--studio-blue)] font-mono block">
                      Question {qIdx + 1} of 5
                    </span>
                    <p className="font-bold text-[var(--studio-text-primary)] font-sans">
                      {q.prompt}
                    </p>

                    <div className="space-y-2">
                      {q.options.map((opt, oIdx) => (
                        <label
                          key={oIdx}
                          className={`flex items-center space-x-3 p-2.5 rounded-lg border cursor-pointer transition-all ${
                            userAnswers[qIdx] === oIdx
                              ? 'bg-blue-500/20 border-[var(--studio-blue)] text-white font-semibold'
                              : 'bg-[var(--studio-surface)] border-[var(--studio-border)] text-[var(--studio-text-secondary)] hover:border-gray-500'
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q_${qIdx}`}
                            checked={userAnswers[qIdx] === oIdx}
                            onChange={() => {
                              const copy = [...userAnswers];
                              copy[qIdx] = oIdx;
                              setUserAnswers(copy);
                            }}
                            className="hidden"
                          />
                          <span className="w-4 h-4 rounded-full border border-gray-400 flex items-center justify-center text-[10px]">
                            {userAnswers[qIdx] === oIdx && <span className="w-2 h-2 rounded-full bg-[var(--studio-blue)]" />}
                          </span>
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                <button
                  onClick={handleSubmitTest}
                  disabled={submittingTest || userAnswers.includes(-1)}
                  className="w-full studio-btn-primary text-xs font-bold py-2.5 flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  {submittingTest ? (
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Submit & Evaluate Unlock Test</span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
