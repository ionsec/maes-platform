import React, { createContext, useContext, useState, useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider, CssBaseline } from '@mui/material';
import { themes, getThemeById } from './themes';

const ThemeContext = createContext();

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export const ThemeProvider = ({ children }) => {
  const [currentThemeId, setCurrentThemeId] = useState('dark'); // Default to dark theme for DFIR

  useEffect(() => {
    // Load theme preference from localStorage
    const savedThemeId = localStorage.getItem('maes-theme-id');
    if (savedThemeId && themes[savedThemeId]) {
      setCurrentThemeId(savedThemeId);
    }
  }, []);

  const setTheme = (themeId) => {
    if (themes[themeId]) {
      setCurrentThemeId(themeId);
      localStorage.setItem('maes-theme-id', themeId);
    }
  };

  const toggleTheme = () => {
    // Legacy function for backward compatibility - toggles between dark and light
    const newThemeId = currentThemeId === 'light' ? 'dark' : 'light';
    setTheme(newThemeId);
  };

  const currentTheme = getThemeById(currentThemeId);
  const isDarkMode = currentTheme.theme.palette.mode === 'dark';

  const value = {
    currentThemeId,
    currentTheme,
    isDarkMode,
    themes,
    setTheme,
    toggleTheme,
    theme: currentTheme.theme // For backward compatibility
  };

  return (
    <ThemeContext.Provider value={value}>
      <MuiThemeProvider theme={currentTheme.theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;