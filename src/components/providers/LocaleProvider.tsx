'use client';

import { useState, useCallback, useEffect, type ReactNode } from 'react';
import { LocaleContext, setLocaleCookie, defaultLocale, type Locale } from '@/i18n/client';

function getInitialLocale(): Locale {
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/NEXT_LOCALE=(es|en)/);
    if (match) return match[1] as Locale;
  }
  return defaultLocale;
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
  }, []);

  // Update document lang attribute when locale changes
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}
