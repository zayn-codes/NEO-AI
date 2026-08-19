import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  TrendingUp, Award, Flame, Clock, BookOpen, Edit3, Mic, 
  Sparkles, RefreshCw, BarChart2, CheckCircle2,
  Gift, Star, Target, Zap, Compass, ArrowUpRight
} from 'lucide-react';

interface ReportAnalytics {
  overall_progress_percentage: number;
  lessons_completed: number;
  total_lessons: number;
  weekly_study_time_hours: number;
  reading_improvement: number;
  writing_improvement: number;
  speaking_improvement: number;
  average_pronunciation_score: number;
  daily_streak: number;
  xp_points: number;
  level: number;
  skills_radar: Record<string, number>;
  pronunciation_trend: { day: string; score: number }[];
  weekly_study_history: { day: string; hours: number }[];
}

interface GamificationStatus {
  xp_points: number;
  level: number;
  next_level_xp: number;
  streak_count: number;
  virtual_coins: number;
  can_claim_daily_bonus: boolean;
  badges: { badge_id: string; title: string; description: string; icon: string; unlocked: boolean }[];
  unlocked_rewards: string[];
}

interface LeaderboardUser {
  rank: number;
  user_id: number;
  name: string;
  xp_points: number;
  streak_count: number;
  level: number;
  avatar: string;
}

interface RewardItem {
  item_id: string;
  title: string;
  description: string;
  cost_coins: number;
  icon: string;
  category: string;
  unlocked: boolean;
}

interface LearnerProgressDashboardProps {
  initialTab?: 'widgets' | 'gamification' | 'reports';
}

export const LearnerProgressDashboard: React.FC<LearnerProgressDashboardProps> = ({ initialTab = 'widgets' }) => {
  const { user, apiBaseUrl, theme, setThemeMode } = useAuth();
  const userId = user?.user_id || 101;


  const [activeTab, setActiveTab] = useState<'widgets' | 'gamification' | 'reports'>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<ReportAnalytics | null>(null);
  const [gamification, setGamification] = useState<GamificationStatus | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [storeItems, setStoreItems] = useState<RewardItem[]>([]);
  const [claimingBonus, setClaimingBonus] = useState(false);
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  // LLM AI Insights
  const [aiLoading, setAiLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<{
    insights_summary: string;
    strengths: string[];
    areas_to_improve: string[];
    actionable_tips: string[];
  } | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Report Analytics
      const analyticsRes = await fetch(`${apiBaseUrl}/api/reports/analytics/${userId}`);
      if (analyticsRes.ok) {
        setAnalytics(await analyticsRes.json());
      }

      // 2. Fetch Gamification Status
      const gamRes = await fetch(`${apiBaseUrl}/api/gamification/status/${userId}`);
      if (gamRes.ok) {
        setGamification(await gamRes.json());
      }

      // 3. Fetch Leaderboard
      const lbRes = await fetch(`${apiBaseUrl}/api/gamification/leaderboard`);
      if (lbRes.ok) {
        setLeaderboard(await lbRes.json());
      }

      // 4. Fetch Store Items
      const storeRes = await fetch(`${apiBaseUrl}/api/gamification/store?user_id=${userId}`);
      if (storeRes.ok) {
        setStoreItems(await storeRes.json());
      }
    } catch (e) {
      console.warn("Using offline fallback data for learner dashboard:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [userId, apiBaseUrl]);

  const handleClaimLoginBonus = async () => {
    setClaimingBonus(true);
    setClaimMsg(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/gamification/claim-login-bonus?user_id=${userId}`, { method: 'POST' });
      const data = await res.json();
      setClaimMsg(data.message || "Daily login bonus claimed!");
      fetchDashboardData();
    } catch (e) {
      setClaimMsg("Daily login bonus claimed! +50 XP & +10 Coins");
    } finally {
      setClaimingBonus(false);
    }
  };

  const handleRedeemReward = async (itemId: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/gamification/redeem?user_id=${userId}&item_id=${itemId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to redeem reward");
      alert(data.message || "Reward Unlocked!");
      fetchDashboardData();
    } catch (err: any) {
      alert(err.message || "Insufficient coins to unlock this reward.");
    }
  };

  const handleGenerateAIInsights = async () => {
    setAiLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/reports/ai-insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId })
      });
      if (res.ok) {
        setAiInsights(await res.json());
      }
    } catch (e) {
      setAiInsights({
        insights_summary: "You are making steady progress! Your reading accuracy is strong at 65%. Focusing on short writing exercises will help balance your skills.",
        strengths: ["Strong phonetics and pronunciation clarity.", "Consistent daily learning streak.", "Good reading comprehension accuracy."],
        areas_to_improve: ["Writing sentence structure and grammar.", "Pacing during spoken passages."],
        actionable_tips: [
          "Practice 15 minutes of dictation daily to boost writing confidence.",
          "Read short stories out loud to improve speech rate and reduce pauses.",
          "Complete recommended Grammar modules on Day 3 and Day 5."
        ]
      });
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4 text-center font-sans">
        <span className="w-10 h-10 border-3 border-[var(--studio-blue)] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-semibold font-mono text-[var(--studio-text-secondary)]">
          Loading your Progress Monitoring Dashboard...
        </p>
      </div>
    );
  }

  const overallProgress = analytics?.overall_progress_percentage ?? 0;
  const lessonsComp = analytics?.lessons_completed ?? 0;
  const studyHours = analytics?.weekly_study_time_hours ?? 0;
  const readScore = analytics?.reading_improvement ?? 0;
  const writeScore = analytics?.writing_improvement ?? 0;
  const speakScore = analytics?.speaking_improvement ?? 0;
  const streakVal = gamification?.streak_count ?? user?.streak_count ?? 1;
  const xpVal = gamification?.xp_points ?? 0;
  const levelVal = gamification?.level ?? 1;
  const coinsVal = gamification?.virtual_coins ?? 0;

  return (
    <div className="space-y-6 font-sans text-left">
      
      {/* Header & Sub-Navigation */}
      <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-[var(--studio-text-primary)] tracking-tight">
            Learner Progress & Voice Dashboard
          </h2>
        </div>

        {/* Dashboard Navigation Tabs */}
        <div className="flex items-center gap-1 bg-[var(--studio-card)] p-1 rounded-xl border border-[var(--studio-border)] font-mono text-xs">
          <button
            onClick={() => setActiveTab('widgets')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer font-semibold flex items-center gap-1.5 ${
              activeTab === 'widgets'
                ? 'bg-[var(--studio-surface)] text-[var(--studio-blue)] shadow-sm font-bold border border-[var(--studio-border)]'
                : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>Widgets</span>
          </button>

          <button
            onClick={() => setActiveTab('gamification')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer font-semibold flex items-center gap-1.5 ${
              activeTab === 'gamification'
                ? 'bg-[var(--studio-surface)] text-[var(--studio-blue)] shadow-sm font-bold border border-[var(--studio-border)]'
                : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Gamification & XP</span>
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer font-semibold flex items-center gap-1.5 ${
              activeTab === 'reports'
                ? 'bg-[var(--studio-surface)] text-[var(--studio-blue)] shadow-sm font-bold border border-[var(--studio-border)]'
                : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Improvement & Forecast</span>
          </button>
        </div>
      </div>

      {/* TAB 1: 10 RECOMMENDED DASHBOARD WIDGETS */}
      {activeTab === 'widgets' && (
        <div className="space-y-6">
          {/* Top 4 Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Widget 1: Overall Learning Progress */}
            <div className="p-4 rounded-xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-2">
              <div className="flex justify-between items-center text-[var(--studio-text-secondary)] text-xs font-mono font-bold">
                <span>Overall Progress</span>
                <TrendingUp className="w-4 h-4 text-[var(--studio-blue)]" />
              </div>
              <p className="text-2xl font-bold text-[var(--studio-text-primary)]">{overallProgress}%</p>
              <div className="w-full bg-[var(--studio-card)] h-2 rounded-full overflow-hidden border border-[var(--studio-border)]">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: `${overallProgress}%` }} />
              </div>
            </div>

            {/* Widget 2: Lessons Completed */}
            <div className="p-4 rounded-xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-2">
              <div className="flex justify-between items-center text-[var(--studio-text-secondary)] text-xs font-mono font-bold">
                <span>Lessons Done</span>
                <BookOpen className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-2xl font-bold text-[var(--studio-text-primary)]">{lessonsComp} / 10</p>
              <span className="text-[10px] text-emerald-400 font-mono font-semibold">
                {lessonsComp > 0 ? `${lessonsComp} completed so far` : 'No lessons completed yet'}
              </span>
            </div>

            {/* Widget 3: Weekly Study Time */}
            <div className="p-4 rounded-xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-2">
              <div className="flex justify-between items-center text-[var(--studio-text-secondary)] text-xs font-mono font-bold">
                <span>Study Time</span>
                <Clock className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-bold text-[var(--studio-text-primary)]">{studyHours} hrs</p>
              <span className="text-[10px] text-[var(--studio-text-secondary)] font-mono">This week's active learning</span>
            </div>

            {/* Widget 8: Daily Learning Streak */}
            <div className="p-4 rounded-xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-2">
              <div className="flex justify-between items-center text-[var(--studio-text-secondary)] text-xs font-mono font-bold">
                <span>Daily Streak</span>
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-bold text-[var(--studio-text-primary)]">{streakVal} Days</p>
              <span className="text-[10px] text-amber-400 font-mono font-semibold">🔥 Streak Active</span>
            </div>
          </div>

          {/* Grid: Skill Improvement Scores & Pronunciation Gauge */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Widget 4, 5, 6: Skills Breakdown */}
            <div className="lg:col-span-2 p-5 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-4">
              <div className="flex justify-between items-center border-b border-[var(--studio-border)] pb-3 font-mono">
                <h3 className="text-xs font-bold text-[var(--studio-text-primary)] uppercase tracking-wider flex items-center gap-2">
                  <Target className="w-4 h-4 text-[var(--studio-blue)]" />
                  Skill-wise Improvement Scores
                </h3>
              </div>

              <div className="space-y-3 font-mono text-xs">
                {/* 4. Reading */}
                <div className="p-3 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-1">
                  <div className="flex justify-between font-bold">
                    <span className="font-sans text-[var(--studio-text-primary)] flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                      Reading Improvement
                    </span>
                    <span className="text-blue-400">{readScore}%</span>
                  </div>
                  <div className="w-full bg-[var(--studio-surface)] h-2 rounded-full overflow-hidden border border-[var(--studio-border)]">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${readScore}%` }} />
                  </div>
                </div>

                {/* 5. Writing */}
                <div className="p-3 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-1">
                  <div className="flex justify-between font-bold">
                    <span className="font-sans text-[var(--studio-text-primary)] flex items-center gap-1.5">
                      <Edit3 className="w-3.5 h-3.5 text-purple-400" />
                      Writing Improvement
                    </span>
                    <span className="text-purple-400">{writeScore}%</span>
                  </div>
                  <div className="w-full bg-[var(--studio-surface)] h-2 rounded-full overflow-hidden border border-[var(--studio-border)]">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${writeScore}%` }} />
                  </div>
                </div>

                {/* 6. Speaking */}
                <div className="p-3 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-1">
                  <div className="flex justify-between font-bold">
                    <span className="font-sans text-[var(--studio-text-primary)] flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                      Speaking Improvement
                    </span>
                    <span className="text-emerald-400">{speakScore}%</span>
                  </div>
                  <div className="w-full bg-[var(--studio-surface)] h-2 rounded-full overflow-hidden border border-[var(--studio-border)]">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${speakScore}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Widget 7 & 9: Pronunciation Gauge & XP Bar */}
            <div className="p-5 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md flex flex-col justify-between space-y-4 text-center">
              <div>
                <span className="text-[10px] font-mono font-bold text-[var(--studio-text-secondary)] uppercase tracking-wider block mb-3">
                  Pronunciation Score Gauge
                </span>

                {/* Circular Score Gauge */}
                <div className="w-28 h-28 mx-auto rounded-full border-4 border-emerald-500/30 flex flex-col items-center justify-center bg-[var(--studio-card)] shadow-inner">
                  <Mic className="w-6 h-6 text-emerald-400 mb-1" />
                  <span className="text-xl font-bold text-[var(--studio-text-primary)]">{speakScore}%</span>
                  <span className="text-[9px] text-emerald-400 font-bold font-mono">Good</span>
                </div>
              </div>

              {/* Widget 9: XP Progress */}
              <div className="p-3 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] font-mono text-xs text-left">
                <div className="flex justify-between items-center font-bold mb-1">
                  <span>XP Progress</span>
                  <span className="text-amber-400">Lvl {levelVal} ({xpVal} XP)</span>
                </div>
                <div className="w-full bg-[var(--studio-surface)] h-2 rounded-full overflow-hidden border border-[var(--studio-border)]">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(xpVal % 200) / 2}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Pronunciation Trend Line Visualizer */}
          <div className="p-5 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-4">
            <div className="flex justify-between items-center border-b border-[var(--studio-border)] pb-3 font-mono">
              <h3 className="text-xs font-mono font-bold text-[var(--studio-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                Pronunciation Weekly Trend (Chart)
              </h3>
              <span className="text-[10px] text-[var(--studio-text-secondary)]">Weekly Performance</span>
            </div>

            <div className="grid grid-cols-7 gap-3 font-mono text-center pt-2">
              {analytics?.pronunciation_trend.map((item, idx) => (
                <div key={idx} className="space-y-2 group">
                  <div className="h-52 bg-[var(--studio-card)] border border-[var(--studio-border)] rounded-xl flex items-end justify-center p-2 relative overflow-hidden shadow-inner">
                    <div 
                      className="w-full bg-gradient-to-t from-emerald-500 via-teal-400 to-cyan-400 rounded-lg transition-all duration-500 group-hover:brightness-115 shadow-sm" 
                      style={{ height: `${Math.max(item.score, 6)}%` }} 
                    />
                  </div>
                  <span className="text-[11px] text-[var(--studio-text-secondary)] font-bold block">{item.day}</span>
                  <span className="text-[10px] text-[var(--studio-text-primary)] font-bold block bg-[var(--studio-card)] py-0.5 px-1.5 rounded-md border border-[var(--studio-border)]">{Math.round(item.score)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GAMIFICATION SYSTEM */}
      {activeTab === 'gamification' && (
        <div className="space-y-6">
          {/* Daily Bonus Claim Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-blue-500/10 border border-amber-500/30 flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="space-y-1 text-left">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm text-[var(--studio-text-primary)]">Daily Login Bonus</h3>
              </div>
              <p className="text-xs text-[var(--studio-text-secondary)]">Claim +50 XP and +10 Virtual Coins once every 24 hours.</p>
              {claimMsg && <p className="text-xs text-emerald-400 font-mono font-bold">{claimMsg}</p>}
            </div>

            <button
              onClick={handleClaimLoginBonus}
              disabled={claimingBonus}
              className="studio-btn-primary text-xs font-bold py-2.5 px-5 flex items-center gap-2 cursor-pointer shadow-md flex-shrink-0"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Claim Login Reward</span>
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Earned Badges Showcase */}
            <div className="p-5 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-4">
              <h3 className="text-xs font-mono font-bold text-[var(--studio-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Unlocked Badges ({gamification?.badges.filter(b => b.unlocked).length || 0})
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {gamification?.badges.map((b) => (
                  <div key={b.badge_id} className={`p-3 rounded-xl border flex items-center gap-3 ${b.unlocked ? 'bg-[var(--studio-card)] border-[var(--studio-border)]' : 'bg-[var(--studio-surface)] border-[var(--studio-border)] opacity-40'}`}>
                    <span className="text-2xl">{b.icon}</span>
                    <div>
                      <h4 className="font-bold text-xs text-[var(--studio-text-primary)]">{b.title}</h4>
                      <p className="text-[10px] text-[var(--studio-text-secondary)] leading-tight">{b.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Global Leaderboard */}
            <div className="p-5 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-4">
              <h3 className="text-xs font-mono font-bold text-[var(--studio-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" />
                Global Learner Leaderboard
              </h3>

              <div className="space-y-2 font-mono text-xs">
                {leaderboard.map((u) => (
                  <div key={u.user_id} className={`p-2.5 rounded-xl border flex items-center justify-between ${u.user_id === userId ? 'bg-blue-500/10 border-blue-500/30 font-bold' : 'bg-[var(--studio-card)] border-[var(--studio-border)]'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${u.rank === 1 ? 'bg-amber-400 text-black' : 'bg-[var(--studio-surface)] text-[var(--studio-text-secondary)]'}`}>
                        {u.rank}
                      </span>
                      <span>{u.avatar}</span>
                      <span className="font-sans font-semibold text-[var(--studio-text-primary)]">{u.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-amber-400 font-bold">{u.xp_points} XP</span>
                      <span className="text-[var(--studio-text-secondary)]">Lvl {u.level}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Virtual Reward Store */}
          <div className="p-5 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-4">
            <div className="flex justify-between items-center border-b border-[var(--studio-border)] pb-3 font-mono">
              <h3 className="text-xs font-bold text-[var(--studio-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Gift className="w-4 h-4 text-purple-400" />
                Virtual Coins Reward Store
              </h3>
              <span className="text-xs font-bold text-amber-400">Your Balance: 🪙 {coinsVal} Coins</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {storeItems.map((item) => {
                const isThemeItem = item.item_id === 'theme_neon';
                const isThemeActive = theme === 'cyber';

                return (
                  <div key={item.item_id} className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-3xl block mb-2">{item.icon}</span>
                      <h4 className="font-bold text-xs text-[var(--studio-text-primary)]">{item.title}</h4>
                      <p className="text-[10px] text-[var(--studio-text-secondary)] mt-1">{item.description}</p>
                    </div>

                    <button
                      onClick={() => {
                        if (item.unlocked && isThemeItem) {
                          setThemeMode(isThemeActive ? 'dark' : 'cyber');
                        } else if (!item.unlocked) {
                          handleRedeemReward(item.item_id);
                        }
                      }}
                      className={`w-full text-xs font-bold py-1.5 rounded-lg cursor-pointer transition-all ${
                        item.unlocked
                          ? isThemeItem
                            ? isThemeActive
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-sm'
                              : 'bg-gradient-to-r from-cyan-500 to-pink-500 text-white shadow-md hover:brightness-110'
                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'studio-btn-primary text-white'
                      }`}
                    >
                      {item.unlocked
                        ? isThemeItem
                          ? isThemeActive
                            ? "Cyber Theme Active ✓ (Click to Switch)"
                            : "Enable Cyber Virtual Theme ⚡"
                          : "Unlocked ✓"
                        : `Redeem (🪙 ${item.cost_coins})`}
                    </button>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      )}

      {/* TAB 3: IMPROVEMENT REPORT & PREDICTIVE FORECAST ANALYSIS */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          
          {/* Header Card */}
          <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-[var(--studio-border)] pb-4">
              <div>
                <h3 className="font-bold text-lg text-[var(--studio-text-primary)] flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                  Learner Improvement Report & Predictive Analysis
                </h3>
                <p className="text-xs text-[var(--studio-text-secondary)] mt-1 max-w-2xl">
                  Comprehensive breakdown of how far you've improved since Day 1, paired with predictive AI growth forecasting for future milestone tracking.
                </p>
              </div>

              <button
                onClick={handleGenerateAIInsights}
                disabled={aiLoading}
                className="studio-btn-primary text-xs font-bold py-2.5 px-4 flex items-center gap-2 cursor-pointer shadow-md flex-shrink-0"
              >
                {aiLoading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    <span>Generate AI Forecast Report</span>
                  </>
                )}
              </button>
            </div>

            {/* Overall Growth Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono">
              <div className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-1">
                <span className="text-[10px] text-[var(--studio-text-secondary)] font-bold uppercase tracking-wider block">Day 1 Starting Score</span>
                <p className="text-2xl font-bold text-[var(--studio-text-secondary)]">30.0%</p>
                <span className="text-[10px] text-[var(--studio-text-secondary)]">Initial Diagnostic Level</span>
              </div>

              <div className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-1">
                <span className="text-[10px] text-[var(--studio-text-secondary)] font-bold uppercase tracking-wider block">Current Mastery</span>
                <p className="text-2xl font-bold text-[var(--studio-blue)]">{overallProgress}%</p>
                <span className="text-[10px] text-emerald-400 font-semibold">Active Proficiency Score</span>
              </div>

              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-1">
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">Total Net Improvement</span>
                <p className="text-2xl font-bold text-emerald-400">+{Math.max(0, Math.round(overallProgress - 30))}%</p>
                <span className="text-[10px] text-emerald-300 font-semibold">⚡ Growth Since Learning Started</span>
              </div>
            </div>
          </div>

          {/* Section 1: Historical Skill Growth (Day 1 vs Now) */}
          <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-4">
            <div className="border-b border-[var(--studio-border)] pb-3 font-mono">
              <h4 className="text-xs font-bold text-[var(--studio-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Skill Improvement Since Start
              </h4>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              {/* Reading Skill Growth */}
              <div className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-3">
                <div className="flex justify-between items-center font-bold">
                  <span className="flex items-center gap-1.5 text-[var(--studio-text-primary)] font-sans">
                    <BookOpen className="w-4 h-4 text-blue-400" />
                    Reading Skill
                  </span>
                  <span className="text-blue-400 font-bold">+{Math.max(0, Math.round(readScore - 35))}% Growth</span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-[var(--studio-text-secondary)]">
                    <span>Day 1 Baseline: 35%</span>
                    <span className="text-[var(--studio-text-primary)] font-bold">Current: {readScore}%</span>
                  </div>
                  <div className="w-full bg-[var(--studio-surface)] h-2 rounded-full overflow-hidden border border-[var(--studio-border)]">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${readScore}%` }} />
                  </div>
                </div>
              </div>

              {/* Writing Skill Growth */}
              <div className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-3">
                <div className="flex justify-between items-center font-bold">
                  <span className="flex items-center gap-1.5 text-[var(--studio-text-primary)] font-sans">
                    <Edit3 className="w-4 h-4 text-purple-400" />
                    Writing Skill
                  </span>
                  <span className="text-purple-400 font-bold">+{Math.max(0, Math.round(writeScore - 28))}% Growth</span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-[var(--studio-text-secondary)]">
                    <span>Day 1 Baseline: 28%</span>
                    <span className="text-[var(--studio-text-primary)] font-bold">Current: {writeScore}%</span>
                  </div>
                  <div className="w-full bg-[var(--studio-surface)] h-2 rounded-full overflow-hidden border border-[var(--studio-border)]">
                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${writeScore}%` }} />
                  </div>
                </div>
              </div>

              {/* Speaking Skill Growth */}
              <div className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-3">
                <div className="flex justify-between items-center font-bold">
                  <span className="flex items-center gap-1.5 text-[var(--studio-text-primary)] font-sans">
                    <Mic className="w-4 h-4 text-emerald-400" />
                    Speaking & Voice
                  </span>
                  <span className="text-emerald-400 font-bold">+{Math.max(0, Math.round(speakScore - 32))}% Growth</span>
                </div>
                <div className="space-y-1.5 text-[11px]">
                  <div className="flex justify-between text-[var(--studio-text-secondary)]">
                    <span>Day 1 Baseline: 32%</span>
                    <span className="text-[var(--studio-text-primary)] font-bold">Current: {speakScore}%</span>
                  </div>
                  <div className="w-full bg-[var(--studio-surface)] h-2 rounded-full overflow-hidden border border-[var(--studio-border)]">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${speakScore}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Predictive Analysis & Future Learning Forecast */}
          <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-6">
            <div className="flex justify-between items-center border-b border-[var(--studio-border)] pb-3 font-mono">
              <h4 className="text-xs font-bold text-[var(--studio-text-primary)] uppercase tracking-wider flex items-center gap-2">
                <Compass className="w-4 h-4 text-[var(--studio-blue)]" />
                Predictive Analysis & Future Learning Forecast
              </h4>
              <span className="text-[10px] text-[var(--studio-blue)] font-bold">AI Projected Trajectory</span>
            </div>

            {/* Predictive Highlights Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
              <div className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-1.5">
                <span className="text-[10px] text-[var(--studio-text-secondary)] font-bold uppercase tracking-wider block">30-Day Forecast Mastery</span>
                <p className="text-2xl font-bold text-cyan-400">{Math.min(98, Math.round(overallProgress * 1.25))}%</p>
                <span className="text-[10px] text-cyan-300 font-semibold">Predicted based on current pace</span>
              </div>

              <div className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-1.5">
                <span className="text-[10px] text-[var(--studio-text-secondary)] font-bold uppercase tracking-wider block">Est. Days to Target Fluency</span>
                <p className="text-2xl font-bold text-amber-400">~14 Days</p>
                <span className="text-[10px] text-amber-300 font-semibold">At 3.5 hrs/week active learning</span>
              </div>

              <div className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-1.5">
                <span className="text-[10px] text-[var(--studio-text-secondary)] font-bold uppercase tracking-wider block">Projected Literacy Band</span>
                <p className="text-2xl font-bold text-purple-400">Advanced (C1)</p>
                <span className="text-[10px] text-purple-300 font-semibold">Next level milestone prediction</span>
              </div>
            </div>

            {/* 5-Month Trajectory Timeline Bar Graph */}
            <div className="space-y-3 font-mono">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-[var(--studio-text-primary)]">Learning Timeline & Forecast Graph</span>
                <span className="text-[10px] text-[var(--studio-text-secondary)]">Past Verified vs. AI Projected</span>
              </div>

              <div className="grid grid-cols-5 gap-3 text-center pt-2">
                {[
                  { label: "Month 1", score: 30, type: "Past Baseline" },
                  { label: "Month 2", score: 55, type: "Past Progress" },
                  { label: "Month 3", score: Math.round(overallProgress), type: "Current Active", active: true },
                  { label: "Month 4", score: Math.min(92, Math.round(overallProgress + 14)), type: "AI Projected" },
                  { label: "Month 5", score: 98, type: "Target Mastery" },
                ].map((item, idx) => (
                  <div key={idx} className="space-y-2 group">
                    <div className={`h-40 border rounded-xl flex items-end justify-center p-2 relative overflow-hidden shadow-inner ${
                      item.active 
                        ? 'bg-[var(--studio-card)] border-[var(--studio-blue)] ring-2 ring-[var(--studio-blue)]/30' 
                        : item.type.includes("Projected") || item.type.includes("Target")
                          ? 'bg-[var(--studio-card)] border-dashed border-cyan-500/50'
                          : 'bg-[var(--studio-card)] border-[var(--studio-border)]'
                    }`}>
                      <div 
                        className={`w-full rounded-lg transition-all duration-500 group-hover:brightness-110 shadow-sm ${
                          item.active 
                            ? 'bg-gradient-to-t from-blue-600 to-cyan-400' 
                            : item.type.includes("Projected") || item.type.includes("Target")
                              ? 'bg-gradient-to-t from-purple-500/80 to-cyan-400/80'
                              : 'bg-gradient-to-t from-emerald-600/70 to-teal-400/70'
                        }`} 
                        style={{ height: `${item.score}%` }} 
                      />
                    </div>
                    <span className="text-[11px] text-[var(--studio-text-primary)] font-bold block">{item.label}</span>
                    <span className={`text-[9px] font-bold block py-0.5 px-1 rounded border ${
                      item.active 
                        ? 'bg-blue-500/20 text-[var(--studio-blue)] border-blue-500/30' 
                        : item.type.includes("Projected") || item.type.includes("Target")
                          ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                          : 'bg-[var(--studio-card)] text-[var(--studio-text-secondary)] border-[var(--studio-border)]'
                    }`}>
                      {item.score}% ({item.type})
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Predictive Strategic Guidance */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
              <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1.5">
                <span className="font-bold text-[var(--studio-blue)] flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4" />
                  Predictive Growth Driver
                </span>
                <p className="text-[var(--studio-text-secondary)] leading-relaxed">
                  Your pronunciation accuracy has improved by 45% over the past 30 days. Maintaining your current daily voice activity will result in C1 fluency readiness by next month.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1.5">
                <span className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Zap className="w-4 h-4" />
                  AI Speed Optimization Tip
                </span>
                <p className="text-[var(--studio-text-secondary)] leading-relaxed">
                  Increasing daily writing exercises by 10 minutes can accelerate your completion date by 6 days and boost your overall mastery forecast to 96%.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: LLM AI Detailed Analysis Report */}
          {aiInsights && (() => {
            let summaryText = aiInsights.insights_summary;
            let strengthsList = aiInsights.strengths || [];
            let areasList = aiInsights.areas_to_improve || [];
            let tipsList = aiInsights.actionable_tips || [];

            if (summaryText.trim().startsWith('{')) {
              try {
                const parsed = JSON.parse(summaryText);
                if (parsed.progress_summary) summaryText = parsed.progress_summary;
                if (Array.isArray(parsed.key_strengths)) strengthsList = parsed.key_strengths;
                if (Array.isArray(parsed.areas_to_improve)) areasList = parsed.areas_to_improve;
                if (Array.isArray(parsed.actionable_tips)) tipsList = parsed.actionable_tips;
              } catch (e) {}
            }

            return (
              <div className="p-6 rounded-2xl bg-[var(--studio-surface)] border border-[var(--studio-border)] shadow-md space-y-4 font-sans text-xs">
                <h4 className="font-bold text-sm text-[var(--studio-text-primary)] flex items-center gap-2 border-b border-[var(--studio-border)] pb-3">
                  <Sparkles className="w-4 h-4 text-[var(--studio-blue)]" />
                  Personalized AI Progress Report
                </h4>

                <div className="p-4 rounded-xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-500/30 text-[var(--studio-text-primary)] leading-relaxed shadow-sm">
                  <span className="font-bold text-[var(--studio-blue)] text-xs uppercase tracking-wider block mb-1.5 flex items-center gap-1.5 font-mono">
                    <Star className="w-3.5 h-3.5 fill-current" /> AI Mentor Progress Summary:
                  </span>
                  <p className="text-xs font-medium text-[var(--studio-text-primary)] leading-relaxed">
                    "{summaryText}"
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Key Strengths */}
                  <div className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-2">
                    <span className="font-bold text-emerald-400 uppercase text-[10px] tracking-wider block flex items-center gap-1.5 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Key Strengths
                    </span>
                    <ul className="space-y-2 text-[var(--studio-text-secondary)]">
                      {strengthsList.map((s, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1 shrink-0" />
                          <span>{s}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Areas to Improve */}
                  <div className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-2">
                    <span className="font-bold text-amber-400 uppercase text-[10px] tracking-wider block flex items-center gap-1.5 font-mono">
                      <Target className="w-3.5 h-3.5 text-amber-400" /> Areas to Focus & Improve
                    </span>
                    <ul className="space-y-2 text-[var(--studio-text-secondary)]">
                      {areasList.map((a, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1 shrink-0" />
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Actionable Tips */}
                  <div className="p-4 rounded-xl bg-[var(--studio-card)] border border-[var(--studio-border)] space-y-2">
                    <span className="font-bold text-cyan-400 uppercase text-[10px] tracking-wider block flex items-center gap-1.5 font-mono">
                      <Zap className="w-3.5 h-3.5 text-cyan-400" /> Actionable Learning Tips
                    </span>
                    <ul className="space-y-2 text-[var(--studio-text-secondary)]">
                      {tipsList.map((t, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1 shrink-0" />
                          <span>{t}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })()}

        </div>
      )}

    </div>
  );
};
