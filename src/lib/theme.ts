import { useEffect, useState, useCallback } from 'react';
import { storage, type ThemePref } from './storage';

function getSystemTheme(): ThemePref {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
    return 'dark';
  }
  return 'light';
}

function applyTheme(theme: ThemePref) {
  document.documentElement.dataset.theme = theme;
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemePref>(getSystemTheme);
  const [userOverride, setUserOverride] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    storage.getThemePref().then((stored) => {
      if (cancelled) return;
      if (stored) {
        setUserOverride(true);
        setTheme(stored);
      } else {
        setTheme(getSystemTheme());
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (userOverride) return;
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? 'dark' : 'light');
    };
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [userOverride]);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: ThemePref = prev === 'dark' ? 'light' : 'dark';
      void storage.setThemePref(next);
      setUserOverride(true);
      return next;
    });
  }, []);

  return { theme, toggle };
}
