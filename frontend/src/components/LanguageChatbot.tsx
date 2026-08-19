import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Send, Mic, Volume2, Sparkles, AlertCircle, Bot, User, ChevronDown,
  Copy, Check, Maximize2, Minimize2, Lightbulb, Play,
  MessageSquare, Headphones
} from 'lucide-react';
import { getSpeechRecognitionLang } from '../constants/languages';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  isLanguageRelated?: boolean;
  timestamp: string;
  suggestedFollowups?: string[];
}

interface LanguageChatbotProps {
  targetLang?: string;
  nativeLang?: string;
}

/**
 * Safely unpacks nested JSON strings, markdown code fences, or stringified objects.
 */
export const extractCleanText = (input: any): string => {
  if (!input) return '';
  if (typeof input === 'object') {
    if (input.response && typeof input.response === 'string') return extractCleanText(input.response);
    if (input.message && typeof input.message === 'string') return extractCleanText(input.message);
    if (input.text && typeof input.text === 'string') return extractCleanText(input.text);
    if (input.answer && typeof input.answer === 'string') return extractCleanText(input.answer);
    if (input.content && typeof input.content === 'string') return extractCleanText(input.content);
    return JSON.stringify(input);
  }
  if (typeof input !== 'string') return String(input);

  let trimmed = input.trim();

  // Strip code fences if wrapped in ```json ... ```
  if (trimmed.startsWith('```')) {
    const firstNewline = trimmed.indexOf('\n');
    if (firstNewline !== -1) {
      trimmed = trimmed.slice(firstNewline + 1);
    }
    if (trimmed.endsWith('```')) {
      trimmed = trimmed.slice(0, -3).trim();
    }
  }

  // If JSON object format: e.g. {"response": "..."}
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        const inner = parsed.response || parsed.message || parsed.text || parsed.answer || parsed.content || parsed.output || parsed.translation;
        if (inner && typeof inner === 'string') {
          return extractCleanText(inner);
        }
      }
    } catch {
      // Not JSON, continue
    }
  }

  return trimmed;
};

interface LanguageCardData {
  index?: string;
  category: string;
  phrase?: string;
  pronunciation?: string;
  transliteration?: string;
  example?: string;
  exampleTranslation?: string;
  notes?: string[];
}

type ParsedSection = 
  | { type: 'card'; data: LanguageCardData }
  | { type: 'callout'; text: string }
  | { type: 'text'; text: string };

/**
 * Parses raw text into structured language breakdown cards, callouts, and paragraphs.
 */
const parseResponseBlocks = (rawText: string): ParsedSection[] => {
  const text = extractCleanText(rawText);
  if (!text) return [];

  const rawBlocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  const sections: ParsedSection[] = [];

  for (const block of rawBlocks) {
    // Check for encouragement / conclusion banners
    if (
      block.includes('🌟') ||
      block.includes('🎉') ||
      block.toLowerCase().includes('keep up the great work') ||
      block.toLowerCase().includes('feel free to ask') ||
      block.startsWith('💡 Tip:') ||
      block.startsWith('Note:')
    ) {
      sections.push({ type: 'callout', text: block });
      continue;
    }

    // Check if this block is a structured language card (e.g. 1. **Standard / Formal:** with phrase/pronunciation/example)
    const cardMatch = block.match(/^(\d+)?[\.\)]?\s*\*\*(.+?)\*\*[:\s]*([\s\S]*)$/);
    const hasStructuredSubfields = 
      block.includes('**Phrase:**') || 
      block.includes('**Pronunciation:**') || 
      block.includes('**Example:**') ||
      block.includes('**Meaning:**') ||
      block.includes('- Phrase:') ||
      block.includes('- Pronunciation:') ||
      block.includes('- Example:');

    if (cardMatch && hasStructuredSubfields) {
      const index = cardMatch[1] || '';
      const category = cardMatch[2].replace(/:$/, '').trim();
      const content = cardMatch[3] || '';

      let phrase = '';
      let pronunciation = '';
      let transliteration = '';
      let example = '';
      const notes: string[] = [];

      const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (/^[-*•]?\s*\*\*Phrase:\*\*/i.test(line) || /^Phrase:/i.test(line)) {
          phrase = line.replace(/^[-*•]?\s*\*\*Phrase:\*\*\s*/i, '').replace(/^Phrase:\s*/i, '').trim();
        } else if (/^[-*•]?\s*\*\*Pronunciation:\*\*/i.test(line) || /^Pronunciation:/i.test(line)) {
          const pronRaw = line.replace(/^[-*•]?\s*\*\*Pronunciation:\*\*\s*/i, '').replace(/^Pronunciation:\s*/i, '').trim();
          // Extract IPA and transliteration if available: e.g. /θæŋk juː/ (*thangk yoo*)
          const ipaMatch = pronRaw.match(/(\/[^\/]+\/)/);
          const transMatch = pronRaw.match(/\((.*?)\)/);
          if (ipaMatch) {
            pronunciation = ipaMatch[1];
          } else {
            pronunciation = pronRaw;
          }
          if (transMatch) {
            transliteration = transMatch[1].replace(/^\*/, '').replace(/\*$/, '');
          }
        } else if (/^[-*•]?\s*\*\*Example:\*\*/i.test(line) || /^Example:/i.test(line)) {
          example = line.replace(/^[-*•]?\s*\*\*Example:\*\*\s*/i, '').replace(/^Example:\s*/i, '').trim();
        } else {
          notes.push(line.replace(/^[-*•]\s*/, ''));
        }
      }

      sections.push({
        type: 'card',
        data: {
          index,
          category,
          phrase: phrase.replace(/^"/, '').replace(/"$/, ''),
          pronunciation,
          transliteration,
          example: example.replace(/^"/, '').replace(/"$/, ''),
          notes: notes.length > 0 ? notes : undefined
        }
      });
      continue;
    }

    // Default text section
    sections.push({ type: 'text', text: block });
  }

  return sections;
};

/**
 * Renders inline markdown text: **bold**, *italic*, `code`, quotes, etc.
 */
const FormattedInlineText: React.FC<{ text: string }> = ({ text }) => {
  // Regex to split by bold (**...**), italics (*...*), and code (`...`)
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);

  return (
    <span>
      {parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={idx} className="font-bold text-[var(--studio-text-primary)]">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith('*') && part.endsWith('*')) {
          return (
            <em key={idx} className="italic text-[var(--studio-text-secondary)] font-medium">
              {part.slice(1, -1)}
            </em>
          );
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code key={idx} className="px-1.5 py-0.5 rounded bg-blue-500/10 text-[var(--studio-blue)] font-mono text-[11px] border border-blue-500/20">
              {part.slice(1, -1)}
            </code>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </span>
  );
};

/**
 * Render single structured language card
 */
const LanguageCardItem: React.FC<{
  card: LanguageCardData;
  targetLang: string;
  onSpeak: (text: string) => void;
  isPlaying: boolean;
}> = ({ card, targetLang, onSpeak, isPlaying }) => {
  const [copiedPhrase, setCopiedPhrase] = useState(false);

  const handleCopyPhrase = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!card.phrase) return;
    navigator.clipboard.writeText(card.phrase);
    setCopiedPhrase(true);
    setTimeout(() => setCopiedPhrase(false), 1800);
  };

  const getCategoryBadgeColor = (category: string) => {
    const cat = category.toLowerCase();
    if (cat.includes('formal') || cat.includes('standard')) {
      return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    }
    if (cat.includes('casual') || cat.includes('informal')) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
    }
    if (cat.includes('emphatic') || cat.includes('grateful') || cat.includes('polite')) {
      return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
    }
    return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
  };

  return (
    <div className="bg-[var(--studio-surface)]/90 border border-[var(--studio-border)] hover:border-[var(--studio-blue)]/50 rounded-xl p-3 shadow-sm transition-all duration-200 space-y-2.5 my-1.5">
      {/* Category Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {card.index && (
            <span className="w-4 h-4 rounded-full bg-[var(--studio-blue)]/20 text-[var(--studio-blue)] text-[9px] font-mono font-bold flex items-center justify-center border border-[var(--studio-blue)]/30">
              {card.index}
            </span>
          )}
          <span className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${getCategoryBadgeColor(card.category)}`}>
            {card.category}
          </span>
        </div>

        {card.phrase && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSpeak(card.phrase!)}
              className="p-1 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-[var(--studio-blue)] transition-colors cursor-pointer"
              title="Listen to pronunciation"
            >
              <Volume2 className={`w-3.5 h-3.5 ${isPlaying ? 'animate-pulse text-cyan-400' : ''}`} />
            </button>
            <button
              onClick={handleCopyPhrase}
              className="p-1 rounded-md bg-[var(--studio-card)] hover:bg-[var(--studio-card-hover)] text-[var(--studio-text-secondary)] hover:text-[var(--studio-text-primary)] transition-colors cursor-pointer"
              title="Copy phrase"
            >
              {copiedPhrase ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>

      {/* Target Phrase */}
      {card.phrase && (
        <div className="bg-[var(--studio-card)]/70 rounded-lg p-2.5 border border-[var(--studio-border)] flex items-center justify-between">
          <div>
            <span className="text-[9px] font-mono uppercase text-[var(--studio-text-secondary)] block mb-0.5">
              Phrase ({targetLang.toUpperCase()})
            </span>
            <span className="font-bold text-sm text-[var(--studio-text-primary)] tracking-wide">
              "{card.phrase}"
            </span>
          </div>
        </div>
      )}

      {/* Pronunciation & Transliteration */}
      {(card.pronunciation || card.transliteration) && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono bg-indigo-500/5 border border-indigo-500/20 px-2.5 py-1.5 rounded-lg">
          <Headphones className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          {card.pronunciation && (
            <span className="font-semibold text-indigo-300">
              {card.pronunciation}
            </span>
          )}
          {card.transliteration && (
            <span className="text-[var(--studio-text-secondary)] italic">
              ({card.transliteration})
            </span>
          )}
        </div>
      )}

      {/* Example Context */}
      {card.example && (
        <div className="bg-emerald-500/5 border-l-2 border-emerald-400 px-2.5 py-1.5 rounded-r-lg space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-mono uppercase text-emerald-400 font-bold flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              <span>Example in Context</span>
            </span>
            <button
              onClick={() => onSpeak(card.example!)}
              className="text-[9px] text-[var(--studio-text-secondary)] hover:text-emerald-300 flex items-center gap-0.5 cursor-pointer"
            >
              <Play className="w-2.5 h-2.5" />
              <span>Speak</span>
            </button>
          </div>
          <p className="text-xs italic text-[var(--studio-text-primary)] leading-relaxed">
            "{card.example}"
          </p>
        </div>
      )}

      {/* Additional Notes / Sub-bullets */}
      {card.notes && card.notes.length > 0 && (
        <ul className="space-y-1 pt-1 border-t border-[var(--studio-border)]">
          {card.notes.map((note, nIdx) => (
            <li key={nIdx} className="text-[11px] text-[var(--studio-text-secondary)] flex items-start gap-1.5">
              <span className="w-1 h-1 rounded-full bg-[var(--studio-blue)] mt-1.5 shrink-0" />
              <span><FormattedInlineText text={note} /></span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * Rich Presentation for Chatbot Bot Messages
 */
const RichChatResponse: React.FC<{
  rawText: string;
  targetLang: string;
  onSpeak: (text: string) => void;
  playingText?: string | null;
}> = ({ rawText, targetLang, onSpeak, playingText }) => {
  const sections = parseResponseBlocks(rawText);

  return (
    <div className="space-y-2 text-xs leading-relaxed">
      {sections.map((sec, idx) => {
        if (sec.type === 'card') {
          return (
            <LanguageCardItem
              key={idx}
              card={sec.data}
              targetLang={targetLang}
              onSpeak={onSpeak}
              isPlaying={playingText === sec.data.phrase || playingText === sec.data.example}
            />
          );
        }

        if (sec.type === 'callout') {
          return (
            <div
              key={idx}
              className="bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-indigo-500/10 border border-purple-500/30 rounded-xl p-2.5 flex items-start gap-2 shadow-sm text-[11px]"
            >
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-[var(--studio-text-primary)] font-medium">
                <FormattedInlineText text={sec.text} />
              </div>
            </div>
          );
        }

        // Standard Text Block
        return (
          <div key={idx} className="text-[var(--studio-text-primary)]">
            {sec.text.split('\n').map((line, lIdx) => {
              const trimmed = line.trim();
              if (!trimmed) return <div key={lIdx} className="h-1" />;

              // Check if bullet point
              if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
                return (
                  <div key={lIdx} className="flex items-start gap-1.5 my-1 ml-1 text-[11px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--studio-blue)] mt-1 shrink-0" />
                    <span><FormattedInlineText text={trimmed.replace(/^[-*•]\s*/, '')} /></span>
                  </div>
                );
              }

              return (
                <p key={lIdx} className="my-1">
                  <FormattedInlineText text={line} />
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

export const LanguageChatbot: React.FC<LanguageChatbotProps> = ({
  targetLang = 'hi',
  nativeLang = 'en'
}) => {
  const { apiBaseUrl } = useAuth();
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [playingMsgId, setPlayingMsgId] = useState<string | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_1',
      sender: 'bot',
      text: `Hello! I am your AI Language Tutor 🎯. Ask me anything about grammar, vocabulary, pronunciation, translations, or reading in ${targetLang.toUpperCase()}!`,
      isLanguageRelated: true,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedFollowups: [
        `How to say "Thank you" in ${targetLang.toUpperCase()}?`,
        `Explain basic grammar rules for ${targetLang.toUpperCase()}`,
        `Check sentence: "I am learning language"`,
        `Common vocabulary for food items`
      ]
    }
  ]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const quickPrompts = [
    `How to say "Thank you" in ${targetLang.toUpperCase()}?`,
    `Explain basic grammar rules for ${targetLang.toUpperCase()}`,
    `Check sentence: "I am learning language"`,
    `Common vocabulary for food items`
  ];

  const handleSendMessage = async (textToSend?: string) => {
    const queryText = (textToSend || input).trim();
    if (!queryText || loading) return;

    const userMsgId = `user_${Date.now()}`;
    const newMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: queryText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const historyPayload = messages.slice(-6).map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: extractCleanText(m.text)
      }));

      const res = await fetch(`${apiBaseUrl}/api/chatbot/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: queryText,
          target_lang: targetLang,
          native_lang: nativeLang,
          conversation_history: historyPayload
        })
      });

      if (!res.ok) throw new Error("Chatbot API failed");
      const data = await res.json();

      const botMsg: ChatMessage = {
        id: `bot_${Date.now()}`,
        sender: 'bot',
        text: extractCleanText(data.response),
        isLanguageRelated: data.is_language_related,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedFollowups: data.suggested_followups || [
          `Give me another example in ${targetLang.toUpperCase()}`,
          `How do I pronounce these phrases?`,
          `Explain the grammar rule behind this`
        ]
      };

      setMessages(prev => [...prev, botMsg]);
    } catch (e) {
      setMessages(prev => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'bot',
          text: `I'm currently optimizing my language engines. Ask me any simple grammar or translation question in ${targetLang.toUpperCase()}!`,
          isLanguageRelated: true,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleMicDictation = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in your browser.");
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = getSpeechRecognitionLang(targetLang);
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsRecording(true);
      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        setInput(text);
        setIsRecording(false);
      };
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);
      recognition.start();
    } catch (e) {
      setIsRecording(false);
    }
  };

  const handlePlayTTS = (msgId: string, text: string) => {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      if (playingMsgId === msgId) {
        setPlayingMsgId(null);
        return;
      }
      const cleanToSpeak = extractCleanText(text).replace(/[\*\_`#]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanToSpeak);
      utterance.lang = getSpeechRecognitionLang(targetLang);
      utterance.rate = 0.9;
      utterance.onstart = () => setPlayingMsgId(msgId);
      utterance.onend = () => setPlayingMsgId(null);
      utterance.onerror = () => setPlayingMsgId(null);
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      setPlayingMsgId(null);
    }
  };

  const handleCopyMessage = (msgId: string, text: string) => {
    navigator.clipboard.writeText(extractCleanText(text));
    setCopiedMsgId(msgId);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  return (
    <div className="fixed bottom-6 right-6 z-[99999] font-sans">
      {/* Floating Toggle Action Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white rounded-full shadow-[0_4px_25px_rgba(37,99,235,0.4)] hover:shadow-[0_6px_30px_rgba(37,99,235,0.6)] hover:scale-105 transition-all duration-300 cursor-pointer border border-white/30 active:scale-95"
          title="Open AI Language Tutor"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 fill-white/20 text-white animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-slate-900 shadow-sm" />
          </div>
          <span className="text-xs font-bold tracking-wide pr-1 drop-shadow-sm">AI Language Tutor</span>
          <span className="px-2 py-0.5 text-[9px] font-mono font-bold bg-white/20 border border-white/20 rounded-full">
            {targetLang.toUpperCase()}
          </span>
        </button>
      )}

      {/* Chatbot Window Container */}
      {isOpen && (
        <div className={`bg-[var(--studio-surface)] border border-[var(--studio-border)] rounded-2xl shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl transition-all duration-300 relative ${
          isExpanded 
            ? 'w-[90vw] sm:w-[540px] h-[640px]' 
            : 'w-[360px] sm:w-[420px] h-[540px]'
        }`}>
          
          {/* Header Bar */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-700 p-3 text-white flex items-center justify-between shrink-0 shadow-md">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-xl bg-white/10 backdrop-blur border border-white/20">
                <Bot className="w-5 h-5 text-cyan-300" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-xs tracking-tight">Neo AI Language Assistant</h3>
                  <span className="px-1.5 py-0.2 bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 text-[9px] font-mono rounded-full">Online</span>
                </div>
                <p className="text-[10px] text-blue-100/80 font-mono">
                  Track: {targetLang.toUpperCase()} | Native: {nativeLang.toUpperCase()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsExpanded(prev => !prev)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                title={isExpanded ? "Compact View" : "Expand View"}
              >
                {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
                title="Close Chatbot"
              >
                <ChevronDown className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Topic Scope Banner */}
          <div className="bg-blue-500/10 border-b border-blue-500/20 px-3 py-1.5 flex items-center justify-between text-[10px] font-mono text-[var(--studio-blue)]">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>Grammar, vocabulary, phonetics & contextual practice</span>
            </span>
            <span className="text-[9px] text-[var(--studio-text-secondary)]">AI Powered</span>
          </div>

          {/* Message Stream */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 bg-[var(--studio-bg)] text-xs">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'bot' && (
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-[var(--studio-blue)]" />
                  </div>
                )}

                <div className={`max-w-[88%] rounded-2xl p-3 shadow-sm text-left relative ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-none'
                    : msg.isLanguageRelated === false
                    ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-bl-none'
                    : 'bg-[var(--studio-card)] border border-[var(--studio-border)] text-[var(--studio-text-primary)] rounded-bl-none'
                }`}>
                  {msg.isLanguageRelated === false && (
                    <div className="flex items-center gap-1 text-[10px] font-mono text-amber-400 font-bold mb-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Language Learning Guardrail</span>
                    </div>
                  )}

                  {/* Render Message Body */}
                  {msg.sender === 'user' ? (
                    <p className="whitespace-pre-line font-sans text-xs leading-relaxed">{msg.text}</p>
                  ) : (
                    <RichChatResponse
                      rawText={msg.text}
                      targetLang={targetLang}
                      onSpeak={(text) => handlePlayTTS(msg.id, text)}
                      playingText={playingMsgId === msg.id ? msg.text : null}
                    />
                  )}

                  {/* Message Action Footer */}
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-[var(--studio-border)]/60 text-[9px] opacity-80 font-mono">
                    <span>{msg.timestamp}</span>
                    
                    {msg.sender === 'bot' && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopyMessage(msg.id, msg.text)}
                          className="hover:text-[var(--studio-blue)] cursor-pointer flex items-center gap-1 transition-colors"
                          title="Copy message"
                        >
                          {copiedMsgId === msg.id ? (
                            <Check className="w-3 h-3 text-emerald-400" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>{copiedMsgId === msg.id ? 'Copied' : 'Copy'}</span>
                        </button>

                        <button
                          onClick={() => handlePlayTTS(msg.id, msg.text)}
                          className={`hover:text-cyan-300 cursor-pointer flex items-center gap-1 transition-colors ${
                            playingMsgId === msg.id ? 'text-cyan-400 font-bold animate-pulse' : 'text-[var(--studio-text-secondary)]'
                          }`}
                          title="Listen audio response"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>{playingMsgId === msg.id ? 'Playing...' : 'Listen All'}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Suggested Follow-up Action Chips */}
                  {msg.sender === 'bot' && msg.suggestedFollowups && msg.suggestedFollowups.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-[var(--studio-border)]/50">
                      <span className="text-[9px] font-mono uppercase text-[var(--studio-text-secondary)] block mb-1.5 flex items-center gap-1">
                        <Lightbulb className="w-3 h-3 text-amber-400" />
                        <span>Suggested Follow-ups:</span>
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.suggestedFollowups.map((fText, fIdx) => (
                          <button
                            key={fIdx}
                            onClick={() => handleSendMessage(fText)}
                            disabled={loading}
                            className="text-[10px] bg-[var(--studio-surface)] hover:bg-[var(--studio-card-hover)] border border-[var(--studio-border)] hover:border-[var(--studio-blue)] text-[var(--studio-text-primary)] px-2 py-0.5 rounded-full font-sans transition-all cursor-pointer truncate max-w-full text-left"
                          >
                            💬 {fText}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {msg.sender === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5 text-white">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--studio-text-secondary)] py-2">
                <span className="w-3.5 h-3.5 border-2 border-[var(--studio-blue)] border-t-transparent rounded-full animate-spin" />
                <span>AI Tutor is formulating visual lesson...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts Carousel */}
          <div className="bg-[var(--studio-surface)] border-t border-[var(--studio-border)] p-2 flex gap-1.5 overflow-x-auto no-scrollbar">
            {quickPrompts.map((promptText, pIdx) => (
              <button
                key={pIdx}
                onClick={() => handleSendMessage(promptText)}
                disabled={loading}
                className="shrink-0 text-[10px] bg-[var(--studio-card)] hover:bg-[var(--studio-card-hover)] border border-[var(--studio-border)] text-[var(--studio-text-primary)] px-2.5 py-1 rounded-full font-mono transition-colors cursor-pointer truncate max-w-[220px]"
              >
                💡 {promptText}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <div className="p-2.5 bg-[var(--studio-surface)] border-t border-[var(--studio-border)] flex items-center gap-2">
            <button
              onClick={handleMicDictation}
              disabled={loading}
              className={`p-2 rounded-xl border transition-all cursor-pointer ${
                isRecording ? 'bg-rose-600 text-white border-rose-600 animate-mic-pulse' : 'bg-[var(--studio-card)] hover:bg-[var(--studio-card-hover)] text-[var(--studio-text-secondary)] border-[var(--studio-border)]'
              }`}
              title="Dictate with voice"
            >
              <Mic className="w-4 h-4" />
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder={`Ask a question about ${targetLang.toUpperCase()} language...`}
              disabled={loading}
              className="flex-1 studio-input text-xs py-2 px-3 rounded-xl border border-[var(--studio-border)] bg-[var(--studio-bg)] text-[var(--studio-text-primary)] focus:outline-none focus:border-[var(--studio-blue)]"
            />

            <button
              onClick={() => handleSendMessage()}
              disabled={loading || !input.trim()}
              className="p-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl shadow transition-all cursor-pointer flex items-center justify-center shrink-0"
              title="Send Query"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

        </div>
      )}
    </div>
  );
};
