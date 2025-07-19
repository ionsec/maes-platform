import { createTheme } from '@mui/material/styles';

// Professional light theme for daytime use
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2', // Professional blue
      light: '#42a5f5',
      dark: '#1565c0',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#dc004e', // Alert red
      light: '#f06292',
      dark: '#c51162',
      contrastText: '#ffffff',
    },
    error: {
      main: '#d32f2f',
      light: '#ef5350',
      dark: '#c62828',
    },
    warning: {
      main: '#ed6c02',
      light: '#ff9800',
      dark: '#e65100',
    },
    info: {
      main: '#0288d1',
      light: '#03a9f4',
      dark: '#01579b',
    },
    success: {
      main: '#2e7d32',
      light: '#4caf50',
      dark: '#1b5e20',
    },
    background: {
      default: '#fafafa',
      paper: '#ffffff',
      elevated: '#f5f5f5',
      terminal: '#f8f9fa',
    },
    text: {
      primary: '#212121',
      secondary: '#666666',
      disabled: '#9e9e9e',
      hint: '#757575',
    },
    divider: '#e0e0e0',
    action: {
      active: '#1976d2',
      hover: 'rgba(25, 118, 210, 0.04)',
      selected: 'rgba(25, 118, 210, 0.08)',
      disabled: 'rgba(0, 0, 0, 0.26)',
      disabledBackground: 'rgba(0, 0, 0, 0.12)',
    },
    // Custom DFIR colors adapted for light theme
    dfir: {
      critical: '#d32f2f',
      high: '#f44336',
      medium: '#ff9800',
      low: '#ffc107',
      info: '#2196f3',
      success: '#4caf50',
      neutral: '#757575',
      terminal: '#f8f9fa',
      matrix: '#388e3c',
      forensic: '#7b1fa2',
      threat: '#d32f2f',
      safe: '#388e3c',
    },
  },
  typography: {
    fontFamily: [
      'Inter',
      'Roboto',
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
          scrollbarColor: '#c0c0c0 #f0f0f0',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            backgroundColor: '#f0f0f0',
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            backgroundColor: '#c0c0c0',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: '#a0a0a0',
            },
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e0e0e0',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(25, 118, 210, 0.15)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          '&:hover': {
            transform: 'translateY(-1px)',
          },
          transition: 'all 0.2s ease-in-out',
        },
      },
    },
  },
});

export default lightTheme;