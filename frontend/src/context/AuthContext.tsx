import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  user_id: number;
  name: string;
  email: string;
  preferred_language: string;
  native_language?: string;
  target_language?: string;
  streak_count?: number;
  age?: number;
  education_level?: string;
  created_at?: string;
}

export type ThemeMode = 'light' | 'dark' | 'cyber';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (userData: User, token: string) => void;
  logout: () => void;
  updatePreferredLanguage: (lang: string) => void;
  updateUser: (userData: User) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
  setThemeMode: (theme: ThemeMode) => void;
  apiBaseUrl: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>('light');
  
  // Base URL of the FastAPI Backend (Supports Vercel/Production deployment via VITE_API_URL)
  const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const applyThemeClass = (targetTheme: ThemeMode) => {
    document.documentElement.classList.remove('light', 'dark', 'cyber');
    if (targetTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (targetTheme === 'cyber') {
      document.documentElement.classList.add('dark', 'cyber');
    } else {
      document.documentElement.classList.add('light');
    }
  };

  // Sync theme class on init
  useEffect(() => {
    const storedTheme = (localStorage.getItem('neo_theme') as ThemeMode) || 'light';
    setTheme(storedTheme);
    applyThemeClass(storedTheme);
  }, []);

  useEffect(() => {
    const storedUser = localStorage.getItem('neo_user');
    const storedToken = localStorage.getItem('neo_token');
    if (storedUser && storedToken) {
      try {
        setUser(JSON.parse(storedUser));
        setToken(storedToken);
      } catch (e) {
        localStorage.removeItem('neo_user');
        localStorage.removeItem('neo_token');
      }
    }
  }, []);

  const login = (userData: User, userToken: string) => {
    setUser(userData);
    setToken(userToken);
    localStorage.setItem('neo_user', JSON.stringify(userData));
    localStorage.setItem('neo_token', userToken);
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('neo_user');
    localStorage.removeItem('neo_token');
  };

  const updatePreferredLanguage = (lang: string) => {
    if (user) {
      const updatedUser = { ...user, preferred_language: lang };
      setUser(updatedUser);
      localStorage.setItem('neo_user', JSON.stringify(updatedUser));
    }
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('neo_user', JSON.stringify(updatedUser));
  };

  const setThemeMode = (targetTheme: ThemeMode) => {
    setTheme(targetTheme);
    localStorage.setItem('neo_theme', targetTheme);
    applyThemeClass(targetTheme);
  };

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'light' ? 'dark' : 'light';
    setThemeMode(nextTheme);
  };

  const isAuthenticated = !!token;

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, login, logout, updatePreferredLanguage, updateUser, theme, toggleTheme, setThemeMode, apiBaseUrl }}>
      {children}
    </AuthContext.Provider>
  );
};


export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
