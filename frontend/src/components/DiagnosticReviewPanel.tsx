import React, { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Info, HelpCircle, Sparkles, RotateCcw } from 'lucide-react';

interface DiagnosticReviewPanelProps {
  userId?: number;
}

interface SavedDiagnostic {
  questions: Array<{
    id: string;
    question: string;
    options: string[];
    answer: string;
    section: string;
    difficulty: string;
  }>;
  answers: Record<string, string>;
  level: string;
  timestamp: string;
}

export const DiagnosticReviewPanel: React.FC<DiagnosticReviewPanelProps> = ({ userId }) => {
  const [data, setData] = useState<SavedDiagnostic | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      const saved = localStorage.getItem(`neo_diagnostic_result_${userId}`);
      if (saved) {
        try {
          setData(JSON.parse(saved));
        } catch (e) {
          console.warn("Failed parsing saved diagnostics from localStorage", e);
        }
      }
    }
  }, [userId]);

  const handleOptionClick = (qId: string, opt: string) => {
    if (!data || !userId) return;
    const updatedAnswers = { ...data.answers, [qId]: opt };
    const updatedData = { ...data, answers: updatedAnswers };
    try {
      localStorage.setItem(`neo_diagnostic_result_${userId}`, JSON.stringify(updatedData));
    } catch (e) {
      console.warn("Failed saving updated result to localStorage", e);
    }
    setData(updatedData);
  };

  if (!userId) {
    return (
      <div className="text-center py-10 text-[var(--studio-text-secondary)] font-sans">
        <Info className="w-10 h-10 mx-auto text-[var(--studio-text-muted)] mb-2" />
        <p className="text-xs">Please log in to view improvement report history.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 border border-dashed border-[var(--studio-border)] rounded-2xl p-5 font-sans">
        <HelpCircle className="w-10 h-10 mx-auto text-[var(--studio-text-muted)] mb-3" />
        <h4 className="font-bold text-xs text-[var(--studio-text-primary)]">No Check-in History Yet</h4>
        <p className="text-[10px] text-[var(--studio-text-secondary)] mt-1 font-mono">
          Complete a quick check-in to see your detailed progress report here.
        </p>
      </div>
    );
  }

  const dateStr = new Date(data.timestamp).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const totalQuestions = data.questions.length;
  const correctAnswersCount = data.questions.filter(q => data.answers[q.id] === q.answer).length;
  const percentage = Math.round((correctAnswersCount / totalQuestions) * 100);

  return (
    <div className="space-y-6 text-left font-sans">
      {/* Overview Card */}
      <div className="bg-[var(--studio-card)] border border-[var(--studio-border)] rounded-2xl p-5 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider">Progress Report Summary</span>
          <h2 className="text-lg font-bold text-[var(--studio-text-primary)] flex items-center gap-2 mt-1">
            <Sparkles className="w-5 h-5 text-[var(--studio-blue)]" />
            Your Proficiency Level: <span className="text-[var(--studio-blue)]">{data.level} Learner</span>
          </h2>
          <p className="text-[10px] text-[var(--studio-text-secondary)] font-mono">Evaluated: {dateStr}</p>
        </div>

        <div className="flex gap-4 items-center bg-[var(--studio-surface)] p-3 rounded-xl border border-[var(--studio-border)] font-mono">
          <div className="text-center">
            <p className="text-[9px] font-bold text-[var(--studio-text-secondary)] uppercase">Correct</p>
            <p className="text-sm font-bold text-emerald-400 mt-0.5">{correctAnswersCount}/{totalQuestions}</p>
          </div>
          <div className="h-6 w-[1px] bg-[var(--studio-border)]" />
          <div className="text-center">
            <p className="text-[9px] font-bold text-[var(--studio-text-secondary)] uppercase">Your Score</p>
            <p className="text-sm font-bold text-[var(--studio-blue)] mt-0.5">{percentage}%</p>
          </div>
        </div>
      </div>

      {/* Questions list */}
      <div className="space-y-4">
        <h3 className="text-xs font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider">Check-in Questions</h3>
        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
          {data.questions.map((q, idx) => {
            const userAnswer = data.answers[q.id] || "(No Answer)";
            const isCorrect = userAnswer === q.answer;
            const isRetryingThis = retryingId === q.id;

            return (
              <div key={q.id} className="p-4 bg-[var(--studio-card)] border border-[var(--studio-border)] rounded-xl space-y-3 text-left">
                <div className="flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="text-xs font-bold bg-[var(--studio-surface)] text-[var(--studio-text-primary)] w-6 h-6 rounded-md border border-[var(--studio-border)] flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <span className="text-[10px] font-bold bg-blue-500/10 text-[var(--studio-blue)] border border-blue-500/20 px-2 py-0.5 rounded">
                      {q.section}
                    </span>
                    <span className="text-[10px] font-bold bg-[var(--studio-surface)] text-[var(--studio-text-secondary)] px-2 py-0.5 rounded border border-[var(--studio-border)]">
                      {q.difficulty}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {isCorrect ? (
                      <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3.5 h-3.5" /> passed
                      </span>
                    ) : (
                      <>
                        <span className="flex items-center gap-1 text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          <XCircle className="w-3.5 h-3.5" /> TRY AGAIN
                        </span>
                        <button
                          onClick={() => setRetryingId(isRetryingThis ? null : q.id)}
                          className="flex items-center gap-1 text-[10px] font-mono font-bold text-[var(--studio-blue)] bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 rounded-full transition-all cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {isRetryingThis ? "Cancel Retry" : "Retry Question"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <p className="text-xs font-semibold text-[var(--studio-text-primary)] leading-relaxed font-sans">
                  {q.question}
                </p>

                {isRetryingThis && (
                  <p className="text-[10px] text-[var(--studio-blue)] font-mono font-semibold">
                    💡 Click on the correct option below to retry and update your score!
                  </p>
                )}

                {/* Grid of options */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {q.options.map((opt) => {
                    const isSelected = opt === userAnswer;
                    const isCorrectOpt = opt === q.answer;
                    
                    let optStyle = "border-[var(--studio-border)] text-[var(--studio-text-primary)] bg-[var(--studio-surface)]";
                    if (isCorrectOpt && isCorrect) {
                      optStyle = "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-bold";
                    } else if (isSelected && !isCorrect) {
                      optStyle = "border-rose-500/30 bg-rose-500/10 text-rose-400 font-bold";
                    }

                    if (!isCorrect) {
                      optStyle += " cursor-pointer hover:border-[var(--studio-blue)] hover:bg-[var(--studio-card-hover)]";
                    }

                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => {
                          if (!isCorrect || isRetryingThis) {
                            handleOptionClick(q.id, opt);
                          }
                        }}
                        className={`p-2.5 border rounded-xl text-xs leading-relaxed transition-all flex items-center justify-between text-left ${optStyle}`}
                      >
                        <span>{opt}</span>
                        {isCorrectOpt && isCorrect && (
                          <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded">Target</span>
                        )}
                        {isSelected && !isCorrect && (
                          <span className="text-[9px] font-mono font-bold text-rose-400 bg-rose-500/20 px-1.5 py-0.5 rounded">Previous Pick</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
