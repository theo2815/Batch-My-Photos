import { useState, useEffect, useCallback } from 'react';

/**
 * Hook for managing theme state and persistence.
 */
export function useTheme() {
  const [theme, setTheme] = useState('dark');

  // Load saved theme on mount
  useEffect(() => {
    const loadTheme = async () => {
      if (window.electronAPI?.getTheme) {
        const savedTheme = await window.electronAPI.getTheme();
        setTheme(savedTheme);
      }
    };
    loadTheme();
  }, []);

  // Apply theme to document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(async () => {
    try {
      const newTheme = theme === 'dark' ? 'light' : 'dark';
      setTheme(newTheme);
      if (window.electronAPI?.setTheme) {
        await window.electronAPI.setTheme(newTheme);
      }
    } catch (err) {
      console.error('Failed to toggle theme:', err);
    }
  }, [theme]);

  return { theme, toggleTheme };
}
