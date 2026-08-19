import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Sparkles, ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../constants/languages';


interface LoginRegisterProps {
  initialIsLogin?: boolean;
  onBackToHome?: () => void;
}

export const LoginRegister: React.FC<LoginRegisterProps> = ({ initialIsLogin = true, onBackToHome }) => {
  const { login, apiBaseUrl } = useAuth();
  const [isLogin, setIsLogin] = useState(initialIsLogin);
  const [regStep, setRegStep] = useState(1);

  // States
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Form input fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [nativeLang, setNativeLang] = useState('en');
  const [targetLang, setTargetLang] = useState('hi');
  const [age, setAge] = useState<number | ''>(18);
  const [eduLevel, setEduLevel] = useState('none');

  // Placement quiz
  const [placementQuestions, setPlacementQuestions] = useState<any[]>([]);
  const [quizStep, setQuizStep] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [assignedLevel, setAssignedLevel] = useState<string | null>(null);
  const [unlockedUser, setUnlockedUser] = useState<any>(null);
  const [unlockedToken, setUnlockedToken] = useState<string | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(false);

  // Forgot password flow states
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotToken, setForgotToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setError(null);
    setForgotSuccess(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to submit request.");
      setForgotSuccess(`Verification code generated: ${data.token}.`);
      setForgotToken(data.token);
      setForgotStep(2);
    } catch (err: any) {
      setError(err.message || "Failed to process forgot password.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    setError(null);
    setForgotSuccess(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: forgotEmail,
          token: forgotToken,
          new_password: newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to reset password.");
      setForgotSuccess("Password reset successfully! You can now log in.");
      setForgotMode(false);
      setIsLogin(true);
      setEmail(forgotEmail);
      setPassword(newPassword);
    } catch (err: any) {
      setError(err.message || "Failed to reset password.");
    } finally {
      setForgotLoading(false);
    }
  };

  const startPlacementQuiz = async () => {
    setLoadingQuiz(true);
    setError(null);
    try {
      const userSeed = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const res = await fetch(
        `${apiBaseUrl}/api/assessments/registration-quiz?target_lang=${targetLang}&native_lang=${nativeLang}&edu_level=${eduLevel}&seed=${userSeed}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error("Failed to load placement quiz");
      const questionsList = Array.isArray(data) ? data : data.questions || [];
      setPlacementQuestions(questionsList);
      setQuizStep(0);
      setRegStep(3);
    } catch (err: any) {
      setError(err.message || "Unable to fetch placement test");
    } finally {
      setLoadingQuiz(false);
    }
  };

  const handleSelectQuizAnswer = (option: string) => {
    const q = placementQuestions[quizStep];
    if (q) {
      setQuizAnswers((prev) => ({
        ...prev,
        [q.id]: option,
      }));
    }
  };

  const handleNextQuizStep = () => {
    if (quizStep < placementQuestions.length - 1) {
      setQuizStep(quizStep + 1);
    } else {
      submitRegistrationWithQuiz();
    }
  };

  const submitRegistrationWithQuiz = async () => {
    setRegStep(4);
    setLoading(true);
    setError(null);

    const answersList = placementQuestions.map((q) => ({
      question_id: q.id,
      selected_option: quizAnswers[q.id] || '',
      correct_answer: q.answer || '',
    }));

    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/register-with-placement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          name,
          preferred_language: nativeLang,
          target_language: targetLang,
          age: Number(age) || 18,
          schooling_level: eduLevel,
          quiz_answers: answersList,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Registration failed");

      setAssignedLevel(data.proficiency_level);
      setUnlockedUser(data.user);
      setUnlockedToken(data.access_token);
    } catch (err: any) {
      setError(err.message || "Registration failed");
      setRegStep(2);
    } finally {
      setLoading(false);
    }
  };


  const handleFinishOnboarding = () => {
    if (unlockedToken && unlockedUser) {
      login(unlockedUser, unlockedToken);
    }
  };

  const handleDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Invalid login credentials");

      login(data.user, data.access_token);
    } catch (err: any) {
      setError(err.message || "Failed to log in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--studio-bg)] text-[var(--studio-text-primary)] flex flex-col justify-center items-center px-4 py-8 relative font-sans">
      
      {/* Background Glow */}
      <div className="absolute top-1/4 left-1/3 w-80 h-80 bg-blue-500/10 dark:bg-blue-500/15 rounded-full filter blur-[100px] pointer-events-none"></div>

      {/* Main Container Card */}
      <div className="w-full max-w-md bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl p-6 sm:p-8 shadow-2xl z-10 transition-colors">
        
        {/* Back Link */}
        {onBackToHome && (
          <button
            onClick={onBackToHome}
            className="flex items-center gap-1.5 text-xs text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] mb-6 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </button>
        )}

        {/* Logo Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-500 via-purple-500 to-cyan-400 text-white shadow-md mb-3 animate-gemini-sparkle">
            <Sparkles className="w-6 h-6 fill-white stroke-[1.5]" />
          </div>
          <h2 className="text-xl font-bold text-[var(--studio-text-primary)] tracking-tight">
            NeoAI Account
          </h2>
          <p className="text-xs text-[var(--studio-text-secondary)] mt-1">
            {isLogin ? "Sign in to access your literacy learning path" : "Create a new account"}
          </p>
        </div>

        {/* Tab Switcher */}
        {!forgotMode && (
          <div className="flex bg-[var(--studio-card)] p-1 rounded-xl border border-[var(--studio-border)] mb-6">
            <button
              onClick={() => {
                setIsLogin(true);
                setError(null);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                isLogin ? 'bg-[var(--studio-surface)] text-[var(--studio-text-primary)] shadow-sm' : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => {
                setIsLogin(false);
                setError(null);
                setRegStep(1);
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                !isLogin ? 'bg-[var(--studio-surface)] text-[var(--studio-text-primary)] shadow-sm' : 'text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)]'
              }`}
            >
              Register Account
            </button>
          </div>
        )}

        {/* Error Notification */}
        {error && (
          <div className="p-3 mb-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Forgot Password Flow */}
        {forgotMode ? (
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-[var(--studio-text-primary)]">Password Recovery</h3>
            {forgotSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                {forgotSuccess}
              </div>
            )}

            {forgotStep === 1 ? (
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--studio-text-secondary)]">Registered Email</label>
                  <input
                    type="email"
                    required
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="name@organization.com"
                    className="studio-input text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full studio-btn-primary text-xs flex items-center justify-center gap-1.5 py-2.5 font-semibold"
                >
                  {forgotLoading ? "Generating token..." : "Send Reset Token"}
                </button>
                <button
                  type="button"
                  onClick={() => setForgotMode(false)}
                  className="w-full text-xs text-[var(--studio-text-secondary)] hover:underline mt-2 text-center"
                >
                  Back to Sign In
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--studio-text-secondary)]">Verification Token</label>
                  <input
                    type="text"
                    required
                    value={forgotToken}
                    onChange={(e) => setForgotToken(e.target.value)}
                    placeholder="Enter reset token"
                    className="studio-input text-xs"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--studio-text-secondary)]">New Password</label>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    className="studio-input text-xs"
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full studio-btn-primary text-xs flex items-center justify-center gap-1.5 py-2.5 font-semibold"
                >
                  {forgotLoading ? "Resetting..." : "Confirm Reset Password"}
                </button>
              </form>
            )}
          </div>
        ) : isLogin ? (
          /* Sign In Form */
          <form onSubmit={handleDirectLogin} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-[var(--studio-text-secondary)]">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="learner@neoai.internal"
                className="studio-input text-xs"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold text-[var(--studio-text-secondary)]">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(true);
                    setError(null);
                  }}
                  className="text-[11px] text-[var(--studio-blue)] hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="studio-input text-xs"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full studio-btn-primary text-xs flex items-center justify-center gap-1.5 py-2.5 font-semibold cursor-pointer shadow-md mt-2"
            >
              {loading ? (
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Enter Learning Hub
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          /* Registration Stepper */
          <div>
            {regStep === 1 && (
              <div className="space-y-4">
                <span className="text-[10px] font-bold font-mono text-[var(--studio-text-secondary)] uppercase tracking-wider block">
                  Step 1 of 3: Account Credentials
                </span>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--studio-text-secondary)]">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="studio-input text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--studio-text-secondary)]">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="studio-input text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--studio-text-secondary)]">Password</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="studio-input text-xs"
                  />
                </div>

                <button
                  onClick={() => {
                    if (!name || !email || !password) {
                      setError("Please fill out all credentials.");
                    } else {
                      setError(null);
                      setRegStep(2);
                    }
                  }}
                  className="w-full studio-btn-primary text-xs flex items-center justify-center gap-1.5 py-2.5 font-semibold cursor-pointer mt-2"
                >
                  Continue to Preferences
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {regStep === 2 && (
              <div className="space-y-4">
                <span className="text-[10px] font-bold font-mono text-[var(--studio-text-secondary)] uppercase tracking-wider block">
                  Step 2 of 3: Model Parameters & Languages
                </span>
                
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--studio-text-secondary)]">Native Language</label>
                  <select
                    value={nativeLang}
                    onChange={(e) => setNativeLang(e.target.value)}
                    className="studio-input text-xs"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={`native_${lang.code}`} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--studio-text-secondary)]">Target Learning Language</label>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="studio-input text-xs"
                  >
                    {SUPPORTED_LANGUAGES.map((lang) => (
                      <option key={`target_${lang.code}`} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                </div>


                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--studio-text-secondary)]">Age</label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value !== '' ? Number(e.target.value) : '')}
                    className="studio-input text-xs"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-[var(--studio-text-secondary)]">Prior Literacy Level</label>
                  <select
                    value={eduLevel}
                    onChange={(e) => setEduLevel(e.target.value)}
                    className="studio-input text-xs"
                  >
                    <option value="none">Primary / Beginner Literacy</option>
                    <option value="primary">Elementary School (Grade 1-5)</option>
                    <option value="middle">Middle School (Grade 6-8)</option>
                    <option value="secondary">High School / Secondary</option>
                  </select>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => setRegStep(1)}
                    className="w-1/3 studio-btn-secondary text-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={() => {
                      if (!age) {
                        setError("Age is required.");
                      } else {
                        startPlacementQuiz();
                      }
                    }}
                    disabled={loadingQuiz}
                    className="flex-1 studio-btn-primary text-xs flex items-center justify-center gap-1.5 font-semibold cursor-pointer"
                  >
                    {loadingQuiz ? (
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        Start Quick Check-in
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {regStep === 3 && placementQuestions.length > 0 && placementQuestions[quizStep] && (
              <div className="space-y-4">
                <div className="flex justify-between items-center font-mono">
                  <span className="text-[10px] font-bold text-[var(--studio-text-secondary)] uppercase">Quick Check-in</span>
                  <span className="text-xs text-[var(--studio-text-secondary)]">
                    Q{quizStep + 1}/{placementQuestions.length}
                  </span>
                </div>

                <div className="bg-[var(--studio-card)] border border-[var(--studio-border)] p-4 rounded-xl">
                  <span className="text-[10px] font-mono font-bold uppercase text-[var(--studio-blue)] block mb-1">
                    {placementQuestions[quizStep].section} evaluation
                  </span>
                  <h4 className="text-xs font-semibold text-[var(--studio-text-primary)] leading-relaxed">
                    {placementQuestions[quizStep].question}
                  </h4>
                </div>

                {/* Option Cards */}
                <div className="flex flex-col gap-2">
                  {placementQuestions[quizStep].options.map((option: string, idx: number) => {
                    const questionId = placementQuestions[quizStep].id;
                    const isSelected = quizAnswers[questionId] === option;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSelectQuizAnswer(option)}
                        className={`w-full p-3 text-left text-xs font-medium border rounded-xl transition-all flex items-center justify-between cursor-pointer ${
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

                <div className="flex gap-2 mt-4">
                  <button
                    onClick={() => {
                      if (quizStep > 0) {
                        setQuizStep(quizStep - 1);
                      } else {
                        setRegStep(2);
                      }
                    }}
                    className="w-1/3 studio-btn-secondary text-xs flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    onClick={handleNextQuizStep}
                    disabled={!quizAnswers[placementQuestions[quizStep].id]}
                    className="flex-1 studio-btn-primary text-xs flex items-center justify-center gap-1.5 font-semibold cursor-pointer"
                  >
                    {quizStep < placementQuestions.length - 1 ? (
                      <>
                        Next
                        <ArrowRight className="w-4 h-4" />
                      </>
                    ) : (
                      "Complete Setup"
                    )}
                  </button>
                </div>
              </div>
            )}

            {regStep === 4 && (
              <div className="text-center py-6 space-y-4">
                {loading ? (
                  <div className="space-y-3">
                    <span className="w-8 h-8 border-3 border-[var(--studio-blue)] border-t-transparent rounded-full animate-spin block mx-auto" />
                    <h3 className="font-semibold text-base text-[var(--studio-text-primary)]">Setting up your profile...</h3>
                    <p className="text-xs text-[var(--studio-text-secondary)] font-mono">Preparing your personalized learning path...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-16 h-16 bg-blue-500/10 border border-[var(--studio-blue)]/30 rounded-2xl mx-auto flex items-center justify-center text-3xl">
                      {assignedLevel === 'Beginner' && '🌱'}
                      {assignedLevel === 'Intermediate' && '🚀'}
                      {assignedLevel === 'Advanced' && '👑'}
                    </div>

                    <div>
                      <h3 className="font-bold text-base text-[var(--studio-text-primary)]">Welcome aboard!</h3>
                      <p className="text-xs text-[var(--studio-text-secondary)] mt-1">
                        Your Learning Level:
                      </p>
                      <span className="inline-block px-3 py-1 mt-2.5 text-xs font-mono font-bold uppercase rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {assignedLevel} Learner Track
                      </span>
                    </div>

                    <button
                      onClick={handleFinishOnboarding}
                      className="w-full studio-btn-primary text-xs flex items-center justify-center gap-1.5 py-2.5 font-semibold cursor-pointer mt-4"
                    >
                      Enter Learning Hub
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
