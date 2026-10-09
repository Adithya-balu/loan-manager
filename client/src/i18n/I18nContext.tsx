import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en, type MessageKey } from './en';
import { ta } from './ta';

export type Lang = 'en' | 'ta';

export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ta', label: 'தமிழ்' },
];

const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = { en, ta };

type Vars = Record<string, string | number>;

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Translate a key, replacing `{name}` placeholders with `vars`. */
  t: (key: MessageKey, vars?: Vars) => string;
  /** Like `t`, but placeholders may be React nodes (e.g. a <strong> amount). */
  tNode: (key: MessageKey, vars: Record<string, ReactNode>) => ReactNode;
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const STORAGE_KEY = 'lm_lang';

function getInitialLang(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ta') return stored;
  } catch {
    // Storage unavailable; fall back to English.
  }
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore; the choice just won't persist.
    }
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);

  const t = useCallback(
    (key: MessageKey, vars?: Vars) => {
      const template = DICTIONARIES[lang][key] ?? en[key];
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (m, name: string) =>
        name in vars ? String(vars[name]) : m,
      );
    },
    [lang],
  );

  const tNode = useCallback(
    (key: MessageKey, vars: Record<string, ReactNode>) => {
      const template = DICTIONARIES[lang][key] ?? en[key];
      // split with a capture group alternates literal text and placeholder names.
      return template.split(/\{(\w+)\}/g).map((part, i) =>
        i % 2 === 1 ? <Fragment key={i}>{part in vars ? vars[part] : `{${part}}`}</Fragment> : part,
      );
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t, tNode }), [lang, setLang, t, tNode]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
