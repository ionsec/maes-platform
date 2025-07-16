import { createTheme } from '@mui/material/styles';

// DFIR-focused dark theme with cyber security aesthetics
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00E5FF', // Cyber blue
      light: '#4FC3F7',
      dark: '#0097A7',
      contrastText: '#000000',
    },
    secondary: {
      main: '#FF4444', // Alert red
      light: '#FF6B6B',
      dark: '#CC0000',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#FF4444',
      light: '#FF6B6B',
      dark: '#CC0000',
    },
    warning: {
      main: '#FF9800',
      light: '#FFB74D',
      dark: '#F57C00',
    },
    info: {
      main: '#00E5FF',
      light: '#4FC3F7',
      dark: '#0097A7',
    },
    success: {
      main: '#00E676',
      light: '#4CAF50',
      dark: '#00C853',
    },
    background: {
      default: '#0A0A0A', // Deep black
      paper: '#1A1A1A',   // Dark gray
      elevated: '#262626', // Elevated surfaces
      terminal: '#0D1117', // Terminal-like background
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#B0B0B0',
      disabled: '#666666',
      hint: '#888888',
    },
    divider: '#333333',
    action: {
      active: '#00E5FF',
      hover: 'rgba(0, 229, 255, 0.08)',
      selected: 'rgba(0, 229, 255, 0.12)',
      disabled: 'rgba(255, 255, 255, 0.26)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
    },
    // Custom DFIR colors
    dfir: {
      critical: '#FF0000',
      high: '#FF4444',
      medium: '#FF9800',
      low: '#FFC107',
      info: '#00E5FF',
      success: '#00E676',
      neutral: '#9E9E9E',
      terminal: '#0D1117',
      matrix: '#00FF00',
      forensic: '#8A2BE2',
      threat: '#DC143C',
      safe: '#32CD32',
    },
  },
  typography: {
    fontFamily: [
      'Inter',
      'Roboto Mono',
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
    h2: {
      fontWeight: 600,
      fontSize: '2rem',
      lineHeight: 1.3,
      letterSpacing: '-0.01em',
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.5rem',
      lineHeight: 1.4,
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.4,
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.125rem',
      lineHeight: 1.4,
    },
    h6: {
      fontWeight: 600,
      fontSize: '1rem',
      lineHeight: 1.4,
    },
    subtitle1: {
      fontWeight: 500,
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    subtitle2: {
      fontWeight: 500,
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    body1: {
      fontSize: '1rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.5,
      fontWeight: 400,
    },
    overline: {
      fontSize: '0.75rem',
      lineHeight: 1.5,
      fontWeight: 500,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
    },
    // Monospace for code/logs
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
          scrollbarColor: '#333333 #0A0A0A',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            backgroundColor: '#0A0A0A',
            width: '8px',
            height: '8px',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            backgroundColor: '#333333',
            borderRadius: '4px',
            '&:hover': {
              backgroundColor: '#555555',
            },
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#1A1A1A',
          borderBottom: '1px solid #333333',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1A1A1A',
          borderRight: '1px solid #333333',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#1A1A1A',
          border: '1px solid #333333',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
          '&:hover': {
            borderColor: '#00E5FF',
            boxShadow: '0 4px 16px rgba(0, 229, 255, 0.1)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: '#1A1A1A',
          border: '1px solid #333333',
        },
        elevation1: {
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.3)',
        },
        elevation2: {
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
        },
        elevation3: {
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.15)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          borderRadius: 8,
          padding: '8px 16px',
          '&:hover': {
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 12px rgba(0, 229, 255, 0.2)',
          },
          transition: 'all 0.2s ease-in-out',
        },
        contained: {
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)',
          '&:hover': {
            boxShadow: '0 4px 16px rgba(0, 229, 255, 0.3)',
          },
        },
        outlined: {
          borderColor: '#333333',
          '&:hover': {
            borderColor: '#00E5FF',
            backgroundColor: 'rgba(0, 229, 255, 0.08)',
          },
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: '#262626',
            color: '#FFFFFF',
            fontWeight: 600,
            borderBottom: '2px solid #333333',
          },
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:nth-of-type(even)': {
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
          },
          '&:hover': {
            backgroundColor: 'rgba(0, 229, 255, 0.05)',
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          '&.MuiChip-colorPrimary': {
            backgroundColor: 'rgba(0, 229, 255, 0.2)',
            color: '#00E5FF',
            border: '1px solid rgba(0, 229, 255, 0.3)',
          },
          '&.MuiChip-colorSecondary': {
            backgroundColor: 'rgba(255, 68, 68, 0.2)',
            color: '#FF4444',
            border: '1px solid rgba(255, 68, 68, 0.3)',
          },
          '&.MuiChip-colorSuccess': {
            backgroundColor: 'rgba(0, 230, 118, 0.2)',
            color: '#00E676',
            border: '1px solid rgba(0, 230, 118, 0.3)',
          },
          '&.MuiChip-colorWarning': {
            backgroundColor: 'rgba(255, 152, 0, 0.2)',
            color: '#FF9800',
            border: '1px solid rgba(255, 152, 0, 0.3)',
          },
          '&.MuiChip-colorError': {
            backgroundColor: 'rgba(255, 68, 68, 0.2)',
            color: '#FF4444',
            border: '1px solid rgba(255, 68, 68, 0.3)',
          },
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: '#333333',
            },
            '&:hover fieldset': {
              borderColor: '#555555',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#00E5FF',
            },
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#1A1A1A',
          border: '1px solid #333333',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          backgroundColor: '#1A1A1A',
          color: '#FFFFFF',
          '& .MuiTypography-root': {
            color: '#FFFFFF',
          },
          '& .MuiTypography-body1': {
            color: '#FFFFFF',
          },
          '& .MuiTypography-body2': {
            color: '#B0B0B0',
          },
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          backgroundColor: '#1A1A1A',
          color: '#FFFFFF',
          borderBottom: '1px solid #333333',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          backgroundColor: '#1A1A1A',
          borderTop: '1px solid #333333',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        standardError: {
          backgroundColor: 'rgba(255, 68, 68, 0.1)',
          color: '#FF4444',
          border: '1px solid rgba(255, 68, 68, 0.3)',
        },
        standardWarning: {
          backgroundColor: 'rgba(255, 152, 0, 0.1)',
          color: '#FF9800',
          border: '1px solid rgba(255, 152, 0, 0.3)',
        },
        standardInfo: {
          backgroundColor: 'rgba(0, 229, 255, 0.1)',
          color: '#00E5FF',
          border: '1px solid rgba(0, 229, 255, 0.3)',
        },
        standardSuccess: {
          backgroundColor: 'rgba(0, 230, 118, 0.1)',
          color: '#00E676',
          border: '1px solid rgba(0, 230, 118, 0.3)',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: '#333333',
          borderRadius: 4,
        },
        bar: {
          backgroundColor: '#00E5FF',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: 'rgba(0, 229, 255, 0.08)',
          },
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          '&:hover': {
            boxShadow: '0 6px 24px rgba(0, 229, 255, 0.4)',
            transform: 'translateY(-2px)',
          },
          transition: 'all 0.2s ease-in-out',
        },
      },
    },
  },
});

export default darkTheme;