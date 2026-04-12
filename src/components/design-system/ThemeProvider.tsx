import React, { createContext, useContext } from 'react';
import type { TuiTheme } from '../../utils/tui-theme.js';
import { darkTuiTheme } from '../../utils/tui-theme.js';

export type ThemeContextValue = {
  theme: TuiTheme;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTuiTheme,
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Reserved for future preview flows; returns null in XibeCode CLI. */
export function usePreviewTheme(): null {
  return null;
}

export function useThemeSetting(): 'dark' {
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const value = React.useMemo(() => ({ theme: darkTuiTheme }), []);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
