import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, RefreshCw, Save, CheckCircle, Flame } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../constants/languages';


interface ScoreRecord {
  score_id: number;
  reading_score: number;
  writing_score: number;
  comprehension_score: number;
  overall_proficiency: string;
  evaluated_at: string;
}

interface ProfileDashboardProps {
  onRequestLanguageAssessment?: (pendingLangs: { targetLang?: string; nativeLang?: string }) => void;
}

export const ProfileDashboard: React.FC<ProfileDashboardProps> = ({ onRequestLanguageAssessment }) => {
  const { user, token, updateUser, apiBaseUrl, logout } = useAuth();
  
  // Profile update states
  const [name, setName] = useState(user?.name || '');
  const [nativeLang, setNativeLang] = useState(user?.native_language || user?.preferred_language || 'en');
  const [targetLang, setTargetLang] = useState(user?.target_language || 'hi');
  const [age, setAge] = useState<number | ''>(user?.age || '');
  const [eduLevel, setEduLevel] = useState(user?.education_level || 'none');
  
  // Language Change Guard State
  const [showLangModal, setShowLangModal] = useState(false);
  
  // UI States
  const [history, setHistory] = useState<ScoreRecord[]>([]);
  const [completedLessonsCount, setCompletedLessonsCount] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/history/${user.user_id}`);
      if (!response.ok) throw new Error("Could not load progress history.");
      const data = await response.json();
      setHistory(data);
    } catch (err: any) {
      console.warn("Could not retrieve score history from backend");
    } finally {
      setLoadingHistory(false);
    }
  };

  const fetchCompletionCount = async () => {
    if (!user) return;
    try {
      const response = await fetch(`${apiBaseUrl}/api/attempts/completion/${user.user_id}`);
      if (response.ok) {
        const data = await response.json();
        setCompletedLessonsCount(data.length);
      }
    } catch (e) {
      console.warn("Failed fetching completion list in profile");
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchCompletionCount();
  }, [user]);

  const handleDeleteProfile = async () => {
    if (!user) return;
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/profile/${user.user_id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (!response.ok) {
        throw new Error("Failed to delete profile.");
      }
      logout();
    } catch (err: any) {
      setError(err.message || "Failed to delete account.");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Check if target or native language was changed
    const currentNative = user.native_language || user.preferred_language || 'en';
    const isLangChanged = (targetLang !== user.target_language) || (nativeLang !== currentNative);
    if (isLangChanged) {
      setShowLangModal(true);
      return;
    }

    setSaving(true);
    setSaveSuccess(false);
    setError(null);

    const payload = {
      user_id: user.user_id,
      name,
      preferred_language: nativeLang,
      native_language: nativeLang,
      target_language: targetLang,
      age: Number(age) || null,
      education_level: eduLevel
    };

    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed updating profile settings.");
      }

      updateUser(data.user);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      setError(err.message || "Could not update user settings.");
    } finally {
      setSaving(false);
    }
  };

  // Badges calculations
  const badgesList = [
    {
      id: "first_words",
      title: "First Steps",
      description: "Complete your first lesson practice exercise.",
      icon: "🌱",
      unlocked: completedLessonsCount >= 1
    },
    {
      id: "book_worm",
      title: "Book Worm",
      description: "Complete 5 lesson practice exercises.",
      icon: "📚",
      unlocked: completedLessonsCount >= 5
    },
    {
      id: "scholar",
      title: "Super Scholar",
      description: "Complete 15 lesson practice exercises.",
      icon: "🎓",
      unlocked: completedLessonsCount >= 15
    },
    {
      id: "streak_starter",
      title: "Streak Starter",
      description: "Maintain a daily learning streak of 2 days.",
      icon: "⚡",
      unlocked: (user?.streak_count || 1) >= 2
    },
    {
      id: "streak_master",
      title: "Streak Master",
      description: "Maintain a daily learning streak of 5 days.",
      icon: "🔥",
      unlocked: (user?.streak_count || 1) >= 5
    },
    {
      id: "eagle_eye",
      title: "Diagnostic Ace",
      description: "Score 80%+ on any category of a diagnostic check.",
      icon: "🎯",
      unlocked: history.some(h => h.reading_score >= 80 || h.comprehension_score >= 80 || h.writing_score >= 80)
    },
    {
      id: "polyglot",
      title: "Polyglot Explorer",
      description: "Select a learning target language other than English.",
      icon: "🌎",
      unlocked: targetLang !== 'en'
    }
  ];

  return (
    <div className="max-w-5xl w-full mx-auto px-6 py-8 grid grid-cols-1 md:grid-cols-3 gap-8 z-10 relative font-sans text-left">
      
      {/* Column 1: Settings Form */}
      <div className="md:col-span-1 bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-5 shadow-md h-fit">
        <h3 className="text-sm font-bold text-[var(--studio-text-primary)] tracking-tight mb-5 flex items-center gap-2">
          <User className="w-4 h-4 text-[var(--studio-blue)]" />
          Account Details
        </h3>

        {saveSuccess && (
          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 animate-pulse">
            <CheckCircle className="w-4 h-4" />
            Your profile changes are saved!
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider">Account Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="studio-input text-xs"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider">Email Address</label>
            <input
              type="email"
              disabled
              value={user?.email || ''}
              className="studio-input text-xs opacity-50 cursor-not-allowed"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider">Native Language</label>
            <select
              value={nativeLang}
              onChange={(e) => setNativeLang(e.target.value)}
              className="studio-input text-xs"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={`prof_native_${lang.code}`} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider">Target Language</label>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              className="studio-input text-xs"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={`prof_target_${lang.code}`} value={lang.code}>
                  {lang.name}
                </option>
              ))}
            </select>
          </div>


          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider">Age (years)</label>
            <input
              type="number"
              value={age}
              onChange={(e) => setAge(e.target.value !== '' ? Number(e.target.value) : '')}
              className="studio-input text-xs"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider">Education Level</label>
            <select
              value={eduLevel}
              onChange={(e) => setEduLevel(e.target.value)}
              className="studio-input text-xs"
            >
              <option value="none">Primary Literacy / No Schooling</option>
              <option value="primary">Elementary (Grade 1-5)</option>
              <option value="middle">Middle School (Grade 6-8)</option>
              <option value="secondary">Secondary / High School</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full studio-btn-primary text-xs flex items-center justify-center gap-1.5 py-2.5 font-semibold cursor-pointer shadow-md mt-4"
          >
            {saving ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Save Account Details</span>
              </>
            )}
          </button>
        </form>

        {/* Delete Profile button */}
        <div className="mt-8 pt-4 border-t border-[var(--studio-border)]">
          {!showDeleteConfirm ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full text-xs text-rose-400 hover:bg-rose-500/10 p-2 rounded-lg transition-colors font-mono cursor-pointer border border-rose-500/20"
            >
              Delete Account
            </button>
          ) : (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl space-y-2 font-mono">
              <p className="text-[11px] font-bold text-rose-400">Permanently delete user profile?</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteProfile}
                  disabled={deleting}
                  className="flex-1 bg-rose-600 text-white text-[10px] font-bold py-1.5 rounded-md cursor-pointer"
                >
                  {deleting ? "Deleting..." : "Confirm Delete"}
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-3 bg-[var(--studio-card)] text-[var(--studio-text-secondary)] text-[10px] font-bold rounded-md cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Column 2 & 3: Achievements & Score Profile */}
      <div className="md:col-span-2 space-y-6">
        
        {/* Streak & Metrics Header */}
        <div className="bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-5 shadow-md flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Flame className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase">Learning Velocity Streak</span>
              <h4 className="text-xl font-bold text-[var(--studio-text-primary)]">
                {user?.streak_count || 1} Day Streak
              </h4>
            </div>
          </div>

          <div className="flex gap-4 font-mono">
            <div className="text-right">
              <span className="text-[9px] text-[var(--studio-text-secondary)] font-bold uppercase block">Completed Lessons</span>
              <span className="text-lg font-bold text-[var(--studio-blue)]">{completedLessonsCount}</span>
            </div>
          </div>
        </div>

        {/* Unlocked Badges */}
        <div className="bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-5 shadow-md space-y-4">
          <div className="flex justify-between items-center border-b border-[var(--studio-border)] pb-3">
            <h4 className="text-xs font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider">Unlocked Achievement Badges</h4>
            <span className="text-[10px] font-mono text-[var(--studio-blue)]">
              {badgesList.filter(b => b.unlocked).length}/{badgesList.length} Unlocked
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {badgesList.map(b => (
              <div 
                key={b.id} 
                className={`p-3.5 rounded-xl border flex items-start gap-3 transition-all ${
                  b.unlocked 
                    ? 'bg-[var(--studio-card)] border-emerald-500/30' 
                    : 'bg-[var(--studio-card)]/50 border-[var(--studio-border)] opacity-40'
                }`}
              >
                <div className="text-2xl p-1 bg-[var(--studio-surface)] rounded-lg border border-[var(--studio-border)] flex-shrink-0">
                  {b.icon}
                </div>
                <div>
                  <h5 className="font-bold text-xs text-[var(--studio-text-primary)]">{b.title}</h5>
                  <p className="text-[11px] text-[var(--studio-text-secondary)] leading-relaxed mt-0.5">{b.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Progression History */}
        <div className="bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-5 shadow-md space-y-4">
          <div className="flex justify-between items-center border-b border-[var(--studio-border)] pb-3 font-mono">
            <h4 className="text-xs font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider">Progress History</h4>
            <button
              onClick={fetchHistory}
              className="p-1 text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>

          {loadingHistory ? (
            <div className="py-10 text-center text-xs font-mono text-[var(--studio-text-secondary)]">Fetching your progress history...</div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-[var(--studio-text-secondary)] border border-dashed border-[var(--studio-border)] rounded-xl">
              No diagnostic checks completed yet.
            </div>
          ) : (
            <div className="space-y-3 font-mono text-xs">
              {history.map(rec => (
                <div key={rec.score_id} className="p-3 bg-[var(--studio-card)] border border-[var(--studio-border)] rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-[var(--studio-text-secondary)] font-bold block">
                      {new Date(rec.evaluated_at).toLocaleDateString()}
                    </span>
                    <span className="font-bold text-sm text-[var(--studio-text-primary)] font-sans">
                      {rec.overall_proficiency} Level
                    </span>
                  </div>
                  <div className="flex gap-4 text-xs font-bold">
                    <span className="text-[var(--studio-blue)]">R: {rec.reading_score}%</span>
                    <span className="text-purple-400">W: {rec.writing_score}%</span>
                    <span className="text-emerald-400">C: {rec.comprehension_score}%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Language Assessment Required Modal */}
      {showLangModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-6 max-w-md w-full shadow-2xl text-left space-y-4 font-sans">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <RefreshCw className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-[var(--studio-text-primary)]">Assessment Required</h3>
            </div>

            <p className="text-xs text-[var(--studio-text-secondary)] leading-relaxed">
              Your target and native languages are calibrated to your learning track. To switch to <strong className="text-[var(--studio-blue)]">{targetLang.toUpperCase()}</strong>, you must complete a quick assessment check-in for that language. Your curriculum will update after the assessment.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowLangModal(false);
                  setNativeLang(user?.native_language || user?.preferred_language || 'en');
                  setTargetLang(user?.target_language || 'hi');
                }}
                className="flex-1 studio-btn-secondary text-xs py-2 font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLangModal(false);
                  onRequestLanguageAssessment?.({ targetLang, nativeLang });
                }}
                className="flex-1 studio-btn-primary text-xs py-2 font-semibold cursor-pointer"
              >
                Take Assessment Now
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
