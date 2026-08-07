import { createTheme } from '@mui/material/styles'
import { surface, line, ink, accent, severity, EASE, MOTION, MONO } from './tokens'

/**
 * MAES Command — the "MAES Redesign" design spec expressed as an MUI theme.
 *
 * Everything the redesign says about surfaces, hairlines, density and control
 * geometry lives here, so the existing MUI pages inherit the new look without
 * being rewritten. Screen-level layout lives in the pages; the repeated
 * primitives live in `components/ui`.
 */
const maesTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: accent.main,
      light: accent.light,
      dark: accent.dark,
      contrastText: accent.on,
    },
    secondary: {
      main: severity.critical,
      light: '#FF6B6B',
      dark: '#CC0000',
      contrastText: '#FFFFFF',
    },
    error: { main: severity.critical, light: '#FF6B6B', dark: '#CC0000' },
    warning: { main: severity.high, light: '#FFB74D', dark: '#F57C00' },
    info: { main: accent.main, light: accent.light, dark: accent.dark },
    success: { main: severity.ok, light: '#4CAF50', dark: '#00C853' },
    background: {
      default: surface.page,
      paper: surface.panel,
      elevated: surface.raised,
      chrome: surface.chrome,
      terminal: surface.page,
    },
    text: {
      primary: ink.primary,
      secondary: ink.secondary,
      disabled: ink.dim,
      hint: ink.faint,
    },
    divider: line.base,
    action: {
      active: accent.main,
      hover: 'rgba(255, 255, 255, 0.05)',
      selected: accent.wash,
      disabled: 'rgba(255, 255, 255, 0.26)',
      disabledBackground: 'rgba(255, 255, 255, 0.12)',
    },
    // Severity ramp, kept under the legacy `dfir` key so existing pages that
    // read palette.dfir.* keep working — now on the redesign's ramp.
    dfir: {
      critical: severity.critical,
      high: severity.high,
      medium: severity.medium,
      low: severity.low,
      info: severity.info,
      success: severity.ok,
      neutral: ink.tertiary,
      terminal: surface.page,
      matrix: severity.ok,
      forensic: '#8A2BE2',
      threat: severity.critical,
      safe: severity.ok,
    },
  },

  typography: {
    fontFamily: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'].join(','),
    // The redesign runs a compact scale: page titles are 1.25rem/600, never larger.
    h1: { fontWeight: 600, fontSize: '1.25rem', lineHeight: 1.3, letterSpacing: '-.2px' },
    h2: { fontWeight: 600, fontSize: '1.25rem', lineHeight: 1.3, letterSpacing: '-.2px' },
    h3: { fontWeight: 600, fontSize: '1.25rem', lineHeight: 1.3, letterSpacing: '-.2px' },
    h4: { fontWeight: 600, fontSize: '1.25rem', lineHeight: 1.3, letterSpacing: '-.2px' },
    h5: { fontWeight: 600, fontSize: '1rem', lineHeight: 1.35 },
    h6: { fontWeight: 600, fontSize: '.9375rem', lineHeight: 1.35 },
    subtitle1: { fontWeight: 600, fontSize: '.875rem', lineHeight: 1.4 },
    subtitle2: { fontWeight: 600, fontSize: '.8125rem', lineHeight: 1.4 },
    body1: { fontSize: '.8125rem', lineHeight: 1.5 },
    body2: { fontSize: '.75rem', lineHeight: 1.5 },
    caption: { fontSize: '.6875rem', lineHeight: 1.45 },
    overline: {
      fontSize: '.625rem',
      fontWeight: 600,
      lineHeight: 1.5,
      textTransform: 'uppercase',
      letterSpacing: '.1em',
    },
    button: { fontSize: '.8125rem', fontWeight: 600, textTransform: 'none' },
    monospace: { fontFamily: MONO, fontSize: '.75rem', lineHeight: 1.4 },
  },

  shape: { borderRadius: 8 },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        'html, body': { margin: 0, padding: 0, background: surface.page },
        body: {
          color: ink.primary,
          fontVariantNumeric: 'tabular-nums',
          WebkitFontSmoothing: 'antialiased',
          scrollbarColor: `${line.strong} ${surface.page}`,
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            backgroundColor: surface.page,
            width: 8,
            height: 8,
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            backgroundColor: line.strong,
            borderRadius: 4,
            '&:hover': { backgroundColor: '#555555' },
          },
        },
        'button, input, table, td, th': { fontVariantNumeric: 'tabular-nums' },
        a: {
          color: accent.main,
          textDecoration: 'none',
          '&:hover': { color: accent.light, textDecoration: 'underline' },
        },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0, color: 'transparent' },
      styleOverrides: {
        root: {
          backgroundColor: surface.chrome,
          backgroundImage: 'none',
          borderBottom: `1px solid ${line.base}`,
          boxShadow: 'none',
        },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: surface.chrome,
          backgroundImage: 'none',
          borderRight: `1px solid ${line.base}`,
        },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: surface.panel,
          backgroundImage: 'none',
          border: `1px solid ${line.base}`,
        },
        // Popovers/menus float above the chrome, so they take the chrome tone.
        elevation8: { backgroundColor: surface.chrome, boxShadow: '0 8px 32px rgba(0,0,0,.5)' },
      },
    },

    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundColor: surface.panel,
          backgroundImage: 'none',
          border: `1px solid ${line.base}`,
          borderRadius: 8,
          boxShadow: 'none',
          transition: `border-color ${MOTION}`,
        },
      },
    },
    MuiCardHeader: {
      styleOverrides: {
        root: { padding: '12px 16px', borderBottom: `1px solid ${line.base}` },
        title: { fontSize: '.8125rem', fontWeight: 600 },
        subheader: { fontSize: '.75rem', color: ink.secondary },
        action: { margin: 0, alignSelf: 'center' },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: { padding: '14px 16px', '&:last-child': { paddingBottom: 14 } },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '.8125rem',
          borderRadius: 6,
          minHeight: 30,
          padding: '0 12px',
          boxShadow: 'none',
          transition: `background ${MOTION}, border-color ${MOTION}, color ${MOTION}`,
          '&:hover': { boxShadow: 'none' },
        },
        sizeSmall: { minHeight: 26, padding: '0 10px', fontSize: '.75rem' },
        sizeLarge: { minHeight: 34, padding: '0 16px' },
        containedPrimary: {
          backgroundColor: accent.main,
          color: accent.on,
          '&:hover': { backgroundColor: accent.hover },
        },
        outlined: {
          fontWeight: 500,
          borderColor: line.strong,
          color: ink.strong,
          '&:hover': { borderColor: '#454545', backgroundColor: 'rgba(255,255,255,.03)' },
        },
        outlinedPrimary: {
          borderColor: accent.border,
          color: accent.main,
          fontWeight: 600,
          '&:hover': { borderColor: accent.main, backgroundColor: accent.washSoft },
        },
        text: { fontWeight: 500 },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          color: ink.strong,
          transition: `background ${MOTION}, color ${MOTION}`,
          '&:hover': { backgroundColor: 'rgba(255,255,255,.05)' },
        },
        sizeSmall: { padding: 5 },
      },
    },

    MuiChip: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: {
          height: 20,
          borderRadius: 10,
          fontSize: '.6875rem',
          fontWeight: 600,
          letterSpacing: '.02em',
          backgroundColor: 'transparent',
          border: `1px solid ${line.base}`,
          color: ink.muted,
        },
        label: { padding: '0 8px' },
        icon: { fontSize: 13, marginLeft: 5, marginRight: -3 },
        deleteIcon: { fontSize: 14 },
        outlined: { backgroundColor: 'transparent' },
        colorPrimary: {
          backgroundColor: accent.wash,
          color: accent.main,
          border: `1px solid ${accent.washRing}`,
        },
        colorSuccess: {
          backgroundColor: 'rgba(0,230,118,.12)',
          color: severity.ok,
          border: '1px solid rgba(0,230,118,.28)',
        },
        colorWarning: {
          backgroundColor: 'rgba(255,152,0,.14)',
          color: severity.high,
          border: '1px solid rgba(255,152,0,.3)',
        },
        colorError: {
          backgroundColor: 'rgba(255,68,68,.14)',
          color: severity.critical,
          border: '1px solid rgba(255,68,68,.3)',
        },
        colorInfo: {
          backgroundColor: accent.wash,
          color: accent.main,
          border: `1px solid ${accent.washRing}`,
        },
        colorSecondary: {
          backgroundColor: 'rgba(255,68,68,.14)',
          color: severity.critical,
          border: '1px solid rgba(255,68,68,.3)',
        },
      },
    },

    // Dense forensic table: raised uppercase head, hairline rows, hover lift.
    MuiTableContainer: {
      styleOverrides: { root: { backgroundColor: 'transparent' } },
    },
    MuiTable: {
      defaultProps: { size: 'small' },
      styleOverrides: { root: { borderCollapse: 'collapse' } },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            backgroundColor: surface.raised,
            color: ink.secondary,
            fontWeight: 600,
            fontSize: '.6875rem',
            letterSpacing: '.06em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            padding: '8px 14px',
            borderBottom: `1px solid ${line.base}`,
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '9px 14px',
          fontSize: '.8125rem',
          color: ink.body,
          borderBottom: `1px solid ${line.faint}`,
          verticalAlign: 'middle',
        },
        sizeSmall: { padding: '9px 14px' },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: `background ${MOTION}`,
          '&:hover': { backgroundColor: surface.hover },
          '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: surface.raised },
          '&:last-child .MuiTableCell-body': { borderBottom: 'none' },
        },
      },
    },
    MuiTableSortLabel: {
      styleOverrides: {
        root: {
          color: 'inherit',
          '&:hover, &.Mui-active': { color: accent.main },
          '&.Mui-active .MuiTableSortLabel-icon': { color: accent.main },
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        root: { borderTop: `1px solid ${line.base}`, color: ink.secondary },
        selectLabel: { fontSize: '.75rem' },
        displayedRows: { fontSize: '.75rem' },
      },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: surface.input,
          fontSize: '.8125rem',
          '& fieldset': { borderColor: '#2B2B2B' },
          '&:hover fieldset': { borderColor: '#3A3A3A' },
          '&.Mui-focused fieldset': { borderColor: accent.main, borderWidth: 1 },
        },
        input: { padding: '9px 10px', height: 'auto' },
        inputSizeSmall: { padding: '7px 10px' },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { fontSize: '.8125rem', color: ink.secondary },
      },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { fontSize: '.6875rem', color: ink.faint, marginLeft: 2 } },
    },
    MuiSelect: {
      styleOverrides: { select: { fontSize: '.8125rem' } },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: '.8125rem',
          minHeight: 34,
          '&:hover': { backgroundColor: 'rgba(255,255,255,.05)' },
          '&.Mui-selected': {
            backgroundColor: accent.washSoft,
            color: accent.main,
            '&:hover': { backgroundColor: accent.wash },
          },
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          '&:hover': { backgroundColor: 'rgba(255,255,255,.05)' },
          '&.Mui-selected': {
            backgroundColor: accent.washSoft,
            color: accent.main,
            '&:hover': { backgroundColor: accent.wash },
          },
        },
      },
    },
    MuiListItemText: {
      styleOverrides: {
        primary: { fontSize: '.8125rem' },
        secondary: { fontSize: '.6875rem', color: ink.faint },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: { '&.Mui-checked + .MuiSwitch-track': { backgroundColor: accent.track } },
        thumb: { boxShadow: 'none' },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 38, borderBottom: `1px solid ${line.base}` },
        indicator: { height: 2, backgroundColor: accent.main },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 38,
          padding: '0 14px',
          textTransform: 'none',
          fontSize: '.8125rem',
          fontWeight: 500,
          color: ink.secondary,
          '&.Mui-selected': { color: accent.main, fontWeight: 600 },
        },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: surface.panel,
          backgroundImage: 'none',
          border: `1px solid ${line.base}`,
          borderRadius: 8,
          boxShadow: '0 16px 48px rgba(0,0,0,.6)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontSize: '.9375rem',
          fontWeight: 600,
          padding: '14px 20px',
          borderBottom: `1px solid ${line.base}`,
        },
      },
    },
    MuiDialogContent: { styleOverrides: { root: { padding: '18px 20px' } } },
    MuiDialogActions: {
      styleOverrides: { root: { padding: '12px 20px', borderTop: `1px solid ${line.base}`, gap: 8 } },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 6, fontSize: '.8125rem', alignItems: 'center' },
        standardError: {
          backgroundColor: 'rgba(255,68,68,.10)',
          color: severity.critical,
          border: '1px solid rgba(255,68,68,.3)',
        },
        standardWarning: {
          backgroundColor: 'rgba(255,152,0,.10)',
          color: severity.high,
          border: '1px solid rgba(255,152,0,.3)',
        },
        standardInfo: {
          backgroundColor: accent.washSoft,
          color: accent.main,
          border: `1px solid ${accent.washRing}`,
        },
        standardSuccess: {
          backgroundColor: 'rgba(0,230,118,.10)',
          color: severity.ok,
          border: '1px solid rgba(0,230,118,.28)',
        },
      },
    },

    MuiLinearProgress: {
      styleOverrides: {
        root: { height: 3, borderRadius: 2, backgroundColor: '#242424' },
        bar: { borderRadius: 2, backgroundColor: accent.main },
      },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: line.base } } },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: surface.raised,
          border: `1px solid ${line.base}`,
          fontSize: '.6875rem',
          fontWeight: 500,
          padding: '5px 8px',
        },
        arrow: { color: surface.raised },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontSize: '.625rem',
          fontWeight: 600,
          height: 16,
          minWidth: 16,
          padding: '0 4px',
          border: `2px solid ${surface.chrome}`,
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          backgroundColor: surface.knob,
          color: ink.primary,
          fontSize: '.6875rem',
          fontWeight: 600,
        },
      },
    },
    MuiFab: {
      styleOverrides: {
        root: {
          boxShadow: '0 4px 16px rgba(0,0,0,.4)',
          transition: `transform .16s ${EASE}, box-shadow .16s ${EASE}`,
          '&:hover': { boxShadow: `0 6px 24px rgba(0,229,255,.3)`, transform: 'translateY(-1px)' },
        },
      },
    },
    MuiSkeleton: { styleOverrides: { root: { backgroundColor: '#1F1F1F' } } },
    MuiAccordion: {
      styleOverrides: {
        root: {
          backgroundColor: surface.panel,
          border: `1px solid ${line.base}`,
          '&:before': { display: 'none' },
        },
      },
    },
    MuiStepIcon: { styleOverrides: { root: { '&.Mui-active': { color: accent.main } } } },
  },
})

export default maesTheme
