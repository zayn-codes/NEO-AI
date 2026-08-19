export interface LanguageOption {
  code: string;
  name: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', name: 'English (EN)' },
  { code: 'hi', name: 'Hindi (HI - हिन्दी)' },
  { code: 'kn', name: 'Kannada (KN - ಕನ್ನಡ)' },
  { code: 'ta', name: 'Tamil (TA - தமிழ்)' },
  { code: 'te', name: 'Telugu (TE - తెలుగు)' },
  { code: 'ml', name: 'Malayalam (ML - മലയാളം)' },
  { code: 'mr', name: 'Marathi (MR - मराठी)' },
  { code: 'bn', name: 'Bengali (BN - বাংলা)' },
  { code: 'gu', name: 'Gujarati (GU - ગુજરાતી)' },
  { code: 'pa', name: 'Punjabi (PA - ਪੰਜਾਬੀ)' },
  { code: 'es', name: 'Spanish (ES - Español)' },
  { code: 'fr', name: 'French (FR - Français)' },
  { code: 'de', name: 'German (DE - Deutsch)' },
  { code: 'zh', name: 'Chinese (ZH - 中文)' },
  { code: 'ja', name: 'Japanese (JA - 日本語)' },
  { code: 'ar', name: 'Arabic (AR - العربية)' },
  { code: 'pt', name: 'Portuguese (PT - Português)' },
  { code: 'ru', name: 'Russian (RU - Русский)' },
  { code: 'it', name: 'Italian (IT - Italiano)' },
  { code: 'ko', name: 'Korean (KO - 한국어)' },
  { code: 'uz', name: 'Uzbek (UZ - Oʻzbek tili)' },
];

export const getSpeechRecognitionLang = (code: string): string => {
  const c = (code || 'en').toLowerCase();
  const map: Record<string, string> = {
    'en': 'en-US',
    'hi': 'hi-IN',
    'kn': 'kn-IN',
    'ta': 'ta-IN',
    'te': 'te-IN',
    'ml': 'ml-IN',
    'mr': 'mr-IN',
    'bn': 'bn-IN',
    'gu': 'gu-IN',
    'pa': 'pa-IN',
    'es': 'es-ES',
    'fr': 'fr-FR',
    'de': 'de-DE',
    'zh': 'zh-CN',
    'ja': 'ja-JP',
    'ar': 'ar-SA',
    'pt': 'pt-PT',
    'ru': 'ru-RU',
    'it': 'it-IT',
    'ko': 'ko-KR',
    'uz': 'uz-UZ'
  };
  return map[c] || 'en-US';
};
