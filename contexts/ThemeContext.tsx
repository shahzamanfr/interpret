import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const [theme, setTheme] = useState<Theme>(() => {
    // Check localStorage first, then system preference
    const savedTheme = localStorage.getItem('theme') as Theme;
    if (savedTheme) {
      return savedTheme;
    }
    
    // Check system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    
    return 'dark'; // Default to dark theme
  });

  useEffect(() => {
    // Save theme to localStorage
    localStorage.setItem('theme', theme);
    
    // Apply Tailwind class-based dark mode on root html element
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Play a professional, slow chime on theme toggle (Web Audio API)
  const playToggleSound = () => {
    try {
      const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Gentle master gain
      const master = ctx.createGain();
      master.gain.setValueAtTime(0.6, now);

      // Soft low-pass filter for warm tone
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3800, now);
      lp.Q.setValueAtTime(0.7, now);

      master.connect(lp).connect(ctx.destination);

      const createTone = (frequency: number, start: number, duration: number, gainLevel: number, pan: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const panner = (ctx as any).createStereoPanner ? (ctx as any).createStereoPanner() : null;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(frequency, now + start);
        // ADSR-like envelope
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.linearRampToValueAtTime(gainLevel, now + start + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
        if (panner) {
          panner.pan.setValueAtTime(pan, now + start);
          osc.connect(gain).connect(panner).connect(master);
        } else {
          osc.connect(gain).connect(master);
        }
        osc.start(now + start);
        osc.stop(now + start + duration + 0.1);
      };

      // Three-note soft arpeggio, spaced slowly for a professional feel
      // C5, E5, B5
      createTone(523.25, 0.00, 1.20, 0.045, -0.2);
      createTone(659.25, 0.20, 1.10, 0.040,  0.0);
      createTone(987.77, 0.50, 1.00, 0.035,  0.2);

      // Close the context after the tail
      setTimeout(() => ctx.close(), 1800);
    } catch (_) {
      // ignore sound errors
    }
  };

  // Add a temporary transition class to html for smooth theme transitions
  const withThemeTransition = () => {
    const htmlEl = document.documentElement;
    const bodyEl = document.body;
    
    // Ensure all scroll-animated elements are visible and stay visible permanently
    const animatedElements = document.querySelectorAll('[data-scroll-animate]');
    animatedElements.forEach((el) => {
      // Add animate-in class if not already present
      if (!el.classList.contains('animate-in')) {
        el.classList.add('animate-in');
      }
      // Add permanent inline styles to prevent disappearing
      (el as HTMLElement).style.setProperty('opacity', '1', 'important');
      (el as HTMLElement).style.setProperty('transform', 'translateY(0)', 'important');
      (el as HTMLElement).style.setProperty('visibility', 'visible', 'important');
    });
    
    // force reflow so transition applies consistently
    // and add transition classes
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    htmlEl.offsetHeight;
    htmlEl.classList.add('theme-transition');
    bodyEl.classList.add('theme-transition');
    window.setTimeout(() => {
      htmlEl.classList.remove('theme-transition');
      bodyEl.classList.remove('theme-transition');
      // Don't clean up inline styles - keep them permanent to prevent disappearing
    }, 200);
  };

  const toggleTheme = () => {
    withThemeTransition();
    playToggleSound();
    setTheme(prevTheme => prevTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
