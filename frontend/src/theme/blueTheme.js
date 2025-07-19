import { createTheme } from '@mui/material/styles';

// Professional blue theme focused on security operations
const blueTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#1e88e5', // Bright blue
      light: '#42a5f5',
      dark: '#1565c0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#ffc107', // Amber
      light: '#ffd54f',
      dark: '#ff8f00',
      contrastText: '#000000',
    },
    error: {
      main: '#f44336',
      light: '#ef5350',
      dark: '#d32f2f',
    },
    warning: {
      main: '#ff9800',
      light: '#ffb74d',
      dark: '#f57c00',
    },
    info: {
      main: '#2196f3',
      light: '#64b5f6',
      dark: '#1976d2',
    },
    success: {
      main: '#4caf50',
      light: '#66bb6a',
      dark: '#388e3c',
    },
    background: {
      default: '#0d1421', // Deep navy
      paper: '#1e2a3a',   // Navy blue
      elevated: '#2c3e50', // Slate blue
      terminal: '#0f1419', // Dark navy
    },
    text: {
      primary: '#ffffff',
      secondary: '#b0bec5',
      disabled: '#666666',
      hint: '#888888',
    },
    divider: '#37474f',
    action: {
      active: '#1e88e5',
      hover: 'rgba(30, 136, 229, 0.08)',
      selected: 'rgba(30, 136, 229, 0.12)',
      disabled: 'rgba(255, 255, 255, 0.26)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
    },
    // Custom blue theme colors
    dfir: {
      critical: '#f44336',
      high: '#ff5722',
      medium: '#ff9800',
      low: '#ffc107',
      info: '#2196f3',
      success: '#4caf50',
      neutral: '#607d8b',
      terminal: '#0f1419',
      matrix: '#4caf50',
      forensic: '#9c27b0',
      threat: '#f44336',
      safe: '#4caf50',
    },
  },
  typography: {
    fontFamily: [
      'Roboto',
      'Inter',
      '-apple-system',
      'BlinkMacSystemFont',
      'Segoe UI',
      'sans-serif',
    ].join(','),
    h1: {
      fontWeight: 700,
      fontSize: '2.5rem',
      lineHeight: 1.2,
      letterSpacing: '-0.01em',
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.4,
    },
    monospace: {
      fontFamily: 'Roboto Mono, Consolas, Monaco, monospace',
      fontSize: '0.875rem',
      lineHeight: 1.4,
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: '#37474f #0d1421',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            backgroundColor: '#0d1421',
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            backgroundColor: '#37474f',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: '#546e7a',
            },
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#1e2a3a',
          borderBottom: '1px solid #37474f',
          boxShadow: '0 2px 10px rgba(30, 136, 229, 0.2)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1e2a3a',
          border: '1px solid #37474f',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          '&:hover': {
            borderColor: '#1e88e5',
            boxShadow: '0 6px 25px rgba(30, 136, 229, 0.3)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 15px rgba(30, 136, 229, 0.3)',
          },
          transition: 'all 0.2s ease-in-out',
        },
        contained: {
          background: 'linear-gradient(135deg, #1e88e5, #1565c0)',
          boxShadow: '0 4px 15px rgba(30, 136, 229, 0.4)',
          '&:hover': {
            background: 'linear-gradient(135deg, #42a5f5, #1e88e5)',
          },
        },
      },
    },
  },
});

export default blueTheme;