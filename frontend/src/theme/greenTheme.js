import { createTheme } from '@mui/material/styles';

// Matrix/terminal-inspired green theme
const greenTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00ff41', // Matrix green
      light: '#4dff6d',
      dark: '#00cc34',
      contrastText: '#000000',
    },
    secondary: {
      main: '#ffeb3b', // Warning yellow
      light: '#fff176',
      dark: '#fbc02d',
      contrastText: '#000000',
    },
    error: {
      main: '#ff1744',
      light: '#ff5983',
      dark: '#d50000',
    },
    warning: {
      main: '#ff9800',
      light: '#ffb74d',
      dark: '#f57c00',
    },
    info: {
      main: '#00e676',
      light: '#66ffa6',
      dark: '#00c853',
    },
    success: {
      main: '#00ff41',
      light: '#4dff6d',
      dark: '#00cc34',
    },
    background: {
      default: '#000000', // Pure black
      paper: '#0d1b0d',   // Very dark green
      elevated: '#1a331a', // Dark green
      terminal: '#001100', // Terminal green-black
    },
    text: {
      primary: '#00ff41',
      secondary: '#4dff6d',
      disabled: '#004d00',
      hint: '#006600',
    },
    divider: '#004d00',
    action: {
      active: '#00ff41',
      hover: 'rgba(0, 255, 65, 0.08)',
      selected: 'rgba(0, 255, 65, 0.12)',
      disabled: 'rgba(0, 255, 65, 0.26)',
      disabledBackground: 'rgba(0, 255, 65, 0.12)',
    },
    // Custom matrix green colors
    dfir: {
      critical: '#ff1744',
      high: '#ff5722',
      medium: '#ff9800',
      low: '#ffeb3b',
      info: '#00e676',
      success: '#00ff41',
      neutral: '#4caf50',
      terminal: '#001100',
      matrix: '#00ff41',
      forensic: '#76ff03',
      threat: '#ff1744',
      safe: '#00ff41',
    },
  },
  typography: {
    fontFamily: [
      'Roboto Mono',
      'Courier New',
      'monospace',
    ].join(','),
    h1: {
      fontWeight: 700,
      fontSize: '2.5rem',
      lineHeight: 1.2,
      letterSpacing: '0.02em',
      textShadow: '0 0 10px #00ff41',
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.4,
      letterSpacing: '0.01em',
    },
    body1: {
      fontFamily: 'Roboto Mono, monospace',
      fontSize: '0.9rem',
    },
    monospace: {
      fontFamily: 'Roboto Mono, Courier New, monospace',
      fontSize: '0.875rem',
      lineHeight: 1.4,
    },
  },
  shape: {
    borderRadius: 4,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: '#00ff41 #000000',
          backgroundColor: '#000000',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            backgroundColor: '#000000',
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            backgroundColor: '#00ff41',
            borderRadius: '2px',
            '&:hover': {
              backgroundColor: '#4dff6d',
            },
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#0d1b0d',
          borderBottom: '1px solid #00ff41',
          boxShadow: '0 0 20px rgba(0, 255, 65, 0.3)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#0d1b0d',
          border: '1px solid #00ff41',
          boxShadow: '0 0 20px rgba(0, 255, 65, 0.2)',
          '&:hover': {
            borderColor: '#4dff6d',
            boxShadow: '0 0 30px rgba(77, 255, 109, 0.4)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: '#0d1b0d',
          border: '1px solid #004d00',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'uppercase',
          fontWeight: 600,
          fontFamily: 'Roboto Mono, monospace',
          letterSpacing: '0.05em',
          '&:hover': {
            transform: 'translateY(-1px)',
            textShadow: '0 0 10px currentColor',
          },
          transition: 'all 0.2s ease-in-out',
        },
        contained: {
          backgroundColor: '#00ff41',
          color: '#000000',
          boxShadow: '0 0 20px rgba(0, 255, 65, 0.5)',
          '&:hover': {
            backgroundColor: '#4dff6d',
            boxShadow: '0 0 30px rgba(0, 255, 65, 0.8)',
          },
        },
        outlined: {
          borderColor: '#00ff41',
          color: '#00ff41',
          '&:hover': {
            borderColor: '#4dff6d',
            backgroundColor: 'rgba(0, 255, 65, 0.08)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            fontFamily: 'Roboto Mono, monospace',
            '& fieldset': {
              borderColor: '#004d00',
            },
            '&:hover fieldset': {
              borderColor: '#00ff41',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#00ff41',
              boxShadow: '0 0 10px rgba(0, 255, 65, 0.5)',
            },
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: '#1a331a',
            color: '#00ff41',
            fontWeight: 700,
            fontFamily: 'Roboto Mono, monospace',
            borderBottom: '2px solid #00ff41',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: 'Roboto Mono, monospace',
          fontWeight: 600,
          '&.MuiChip-colorPrimary': {
            backgroundColor: 'rgba(0, 255, 65, 0.2)',
            color: '#00ff41',
            border: '1px solid #00ff41',
          },
        },
      },
    },
  },
});

export default greenTheme;