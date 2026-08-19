import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginRegister } from './components/LoginRegister';
import { Roadmap } from './components/Roadmap';
import { AssessmentWizard } from './components/AssessmentWizard';

import { Homepage } from './components/Homepage';

import { LanguageChatbot } from './components/LanguageChatbot';
import { InstallPwaPrompt } from './components/InstallPwaPrompt';

const AppContent: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [isTakingAssessment, setIsTakingAssessment] = useState(false);
  const [pendingLangChange, setPendingLangChange] = useState<{ targetLang?: string; nativeLang?: string } | null>(null);
  const [viewState, setViewState] = useState<'homepage' | 'auth'>('homepage');
  const [loginMode, setLoginMode] = useState(true);

  // If not logged in, show homepage first
  if (!isAuthenticated) {
    if (viewState === 'homepage') {
      return (
        <Homepage 
          onEnterAuth={(isLogin) => {
            setLoginMode(isLogin);
            setViewState('auth');
          }} 
        />
      );
    }
    return (
      <LoginRegister 
        initialIsLogin={loginMode} 
        onBackToHome={() => setViewState('homepage')} 
      />
    );
  }

  // If logged in and taking diagnostic assessment
  if (isTakingAssessment) {
    return (
      <AssessmentWizard 
        pendingTargetLang={pendingLangChange?.targetLang}
        pendingNativeLang={pendingLangChange?.nativeLang}
        onClose={() => {
          setIsTakingAssessment(false);
          setPendingLangChange(null);
        }} 
      />
    );
  }

  // Default logged-in screen is the Curriculum Roadmap
  return (
    <Roadmap 
      onStartAssessment={(pendingLangs) => {
        setPendingLangChange(pendingLangs || null);
        setIsTakingAssessment(true);
      }} 
    />
  );
};

const GlobalLanguageChatbot: React.FC = () => {
  const { user } = useAuth();
  return (
    <LanguageChatbot 
      targetLang={user?.target_language || 'hi'} 
      nativeLang={user?.preferred_language || 'en'} 
    />
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
      <GlobalLanguageChatbot />
      <InstallPwaPrompt />
    </AuthProvider>
  );
}

export default App;
