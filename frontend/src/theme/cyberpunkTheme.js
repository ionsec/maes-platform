import { createTheme } from '@mui/material/styles';

// Cyberpunk-inspired theme with neon colors
const cyberpunkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#ff0080', // Hot pink
      light: '#ff3d9b',
      dark: '#cc0066',
      contrastText: '#000000',
    },
    secondary: {
      main: '#00ffff', // Cyan
      light: '#4dffff',
      dark: '#00cccc',
      contrastText: '#000000',
    },
    error: {
      main: '#ff0040',
      light: '#ff4d6d',
      dark: '#cc0033',
    },
    warning: {
      main: '#ffaa00',
      light: '#ffbb33',
      dark: '#cc8800',
    },
    info: {
      main: '#00ffff',
      light: '#4dffff',
      dark: '#00cccc',
    },
    success: {
      main: '#00ff41',
      light: '#4dff6d',
      dark: '#00cc34',
    },
    background: {
      default: '#0a0a0f', // Very dark purple
      paper: '#1a0a2e',   // Dark purple
      elevated: '#2a1f3d', // Purple
      terminal: '#0f0f23', // Dark blue-purple
    },
    text: {
      primary: '#ffffff',
      secondary: '#ff00ff',
      disabled: '#666666',
      hint: '#888888',
    },
    divider: '#ff0080',
    action: {
      active: '#ff0080',
      hover: 'rgba(255, 0, 128, 0.08)',
      selected: 'rgba(255, 0, 128, 0.12)',
      disabled: 'rgba(255, 255, 255, 0.26)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
    },
    // Custom cyberpunk colors
    dfir: {
      critical: '#ff0040',
      high: '#ff0080',
      medium: '#ffaa00',
      low: '#ffff00',
      info: '#00ffff',
      success: '#00ff41',
      neutral: '#9e9e9e',
      terminal: '#0f0f23',
      matrix: '#00ff41',
      forensic: '#ff00ff',
      threat: '#ff0040',
      safe: '#00ff41',
    },
  },
  typography: {
    fontFamily: [
      'Orbitron',
      'Roboto Mono',
      'monospace',
    ].join(','),
    h1: {
      fontWeight: 700,
      fontSize: '2.5rem',
      lineHeight: 1.2,
      letterSpacing: '0.05em',
      textShadow: '0 0 10px #ff0080',
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.4,
      letterSpacing: '0.02em',
    },
    monospace: {
      fontFamily: 'Roboto Mono, Consolas, Monaco, monospace',
      fontSize: '0.875rem',
      lineHeight: 1.4,
    },
  },
  shape: {
    borderRadius: 0, // Sharp edges for cyberpunk feel
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: '#ff0080 #0a0a0f',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            backgroundColor: '#0a0a0f',
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            backgroundColor: '#ff0080',
            borderRadius: '0px',
            '&:hover': {
              backgroundColor: '#ff3d9b',
            },
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#1a0a2e',
          borderBottom: '2px solid #ff0080',
          boxShadow: '0 0 20px rgba(255, 0, 128, 0.5)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1a0a2e',
          border: '1px solid #ff0080',
          borderRadius: 0,
          boxShadow: '0 0 20px rgba(255, 0, 128, 0.3)',
          '&:hover': {
            borderColor: '#00ffff',
            boxShadow: '0 0 30px rgba(0, 255, 255, 0.5)',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'uppercase',
          fontWeight: 700,
          borderRadius: 0,
          padding: '8px 16px',
          letterSpacing: '0.05em',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 0 20px currentColor',
          },
          transition: 'all 0.3s ease-in-out',
        },
        contained: {
          background: 'linear-gradient(45deg, #ff0080, #ff3d9b)',
          boxShadow: '0 0 20px rgba(255, 0, 128, 0.5)',
          '&:hover': {
            background: 'linear-gradient(45deg, #ff3d9b, #ff0080)',
            boxShadow: '0 0 30px rgba(255, 0, 128, 0.8)',
          },
        },
        outlined: {
          borderColor: '#ff0080',
          color: '#ff0080',
          '&:hover': {
            borderColor: '#00ffff',
            color: '#00ffff',
            backgroundColor: 'rgba(0, 255, 255, 0.08)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: '#ff0080',
            },
            '&:hover fieldset': {
              borderColor: '#ff3d9b',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#00ffff',
              boxShadow: '0 0 10px rgba(0, 255, 255, 0.5)',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700,
          letterSpacing: '0.02em',
          border: '1px solid currentColor',
          '&.MuiChip-colorPrimary': {
            backgroundColor: 'rgba(255, 0, 128, 0.2)',
            color: '#ff0080',
            boxShadow: '0 0 10px rgba(255, 0, 128, 0.3)',
          },
        },
      },
    },
  },
});

export default cyberpunkTheme;