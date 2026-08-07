import React from 'react'
import { Box, Typography, Button, IconButton, Tooltip } from '@mui/material'
import { surface, line, ink, accent, sev, sevForScore, pill, dot, chipQuiet, eyebrow, MONO, MOTION } from '../../theme/tokens'

/**
 * Primitives from the MAES Redesign spec. Each one is a shape the design uses
 * on more than one screen — severity pills, status dots, the KPI strip, the
 * quiet filter row, panels and the page header block.
 */

/** Uppercase severity/status pill. `level` accepts severity keys or API statuses. */
export const SeverityPill = ({ level, label, sx, ...rest }) => {
  const color = sev(level)
  return (
    <Box component="span" sx={{ ...pill(color), ...sx }} {...rest}>
      {label ?? String(level ?? '').replace(/_/g, ' ')}
    </Box>
  )
}

/** Bare colored dot. */
export const StatusDot = ({ level, color, size = 7, sx, ...rest }) => (
  <Box component="span" sx={{ ...dot(color || sev(level), size), ...sx }} {...rest} />
)

/** Dot + label, as used in the platform-health and legend rows. */
export const StatusPip = ({ level, color, label, sx }) => (
  <Box
    component="span"
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      height: 22,
      px: '8px',
      border: `1px solid ${line.base}`,
      borderRadius: '11px',
      fontSize: '.6875rem',
      color: ink.muted,
      whiteSpace: 'nowrap',
      ...sx,
    }}
  >
    <StatusDot level={level} color={color} size={6} />
    {label}
  </Box>
)

/**
 * Hairline-joined metric strip. `items` are
 * `{ label, value, unit, note, level }` — `note`/`unit`/`level` optional.
 * `dense` renders the single-line variant the list pages use.
 */
export const KpiStrip = ({ items = [], dense = false, sx }) => (
  <Box
    sx={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: '1px',
      background: line.base,
      border: `1px solid ${line.base}`,
      borderRadius: 2,
      overflow: 'hidden',
      ...sx,
    }}
  >
    {items.map((k, i) => {
      const color = k.color || (k.level ? sev(k.level) : ink.body)
      return dense ? (
        <Box
          key={k.label ?? i}
          sx={{
            background: surface.panel,
            p: '11px 14px',
            display: 'flex',
            alignItems: 'baseline',
            gap: 1,
            flex: '1 1 150px',
            minWidth: 150,
          }}
        >
          <Box component="span" sx={{ fontSize: '1.0625rem', fontWeight: 600, letterSpacing: '-.2px', color }}>
            {k.value}
          </Box>
          <Box component="span" sx={{ fontSize: '.75rem', color: ink.secondary }}>
            {k.label}
          </Box>
        </Box>
      ) : (
        <Box
          key={k.label ?? i}
          sx={{
            background: surface.panel,
            p: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            flex: '1 1 184px',
            minWidth: 184,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {k.level && <StatusDot level={k.level} />}
            <Box
              component="span"
              sx={{
                fontSize: '.6875rem',
                fontWeight: 600,
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                color: ink.secondary,
              }}
            >
              {k.label}
            </Box>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Box
              component="span"
              sx={{
                fontSize: '1.5rem',
                fontWeight: 600,
                letterSpacing: '-.5px',
                lineHeight: 1,
                color: k.level === 'ok' ? ink.body : color,
              }}
            >
              {k.value}
            </Box>
            {k.unit && (
              <Box component="span" sx={{ fontSize: '.75rem', color: ink.faint }}>
                {k.unit}
              </Box>
            )}
          </Box>
          {k.note && (
            <Box component="span" sx={{ fontSize: '.75rem', color: ink.tertiary }}>
              {k.note}
            </Box>
          )}
        </Box>
      )
    })}
  </Box>
)

/** One quiet filter chip. */
export const FilterChip = ({ label, active, onClick, sx }) => (
  <Box component="span" onClick={onClick} sx={{ ...chipQuiet(active), ...sx }}>
    {label}
  </Box>
)

/**
 * Filter chip row. `options` is `[{ value, label }]` (or plain strings);
 * `value` marks the active one.
 */
export const FilterChips = ({ options = [], value, onChange, sx }) => (
  <Box sx={{ display: 'flex', gap: '6px', flexWrap: 'wrap', ...sx }}>
    {options.map((o) => {
      const opt = typeof o === 'string' ? { value: o, label: o } : o
      return (
        <FilterChip
          key={opt.value}
          label={opt.label}
          active={opt.value === value}
          onClick={() => onChange && onChange(opt.value)}
        />
      )
    })}
  </Box>
)

/** 3px severity-colored progress bar. */
export const MiniBar = ({ value = 0, level, color, width, height = 3, sx }) => (
  <Box sx={{ width: width || '100%', height, borderRadius: '2px', background: '#242424', overflow: 'hidden', ...sx }}>
    <Box
      sx={{
        height: '100%',
        width: `${Math.max(0, Math.min(100, Number(value) || 0))}%`,
        background: color || sev(level || 'low'),
        transition: `width .24s ${MOTION}`,
      }}
    />
  </Box>
)

/** Bar + monospace readout, the table's progress cell. */
export const BarCell = ({ value = 0, label, level, color }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <MiniBar value={value} width={70} level={level || sevForScore(value)} color={color} />
    <Box component="span" sx={{ fontSize: '.6875rem', color: ink.secondary, fontFamily: MONO }}>
      {label ?? `${Math.round(value)}%`}
    </Box>
  </Box>
)

/** Uppercase section eyebrow. */
export const Eyebrow = ({ children, sx }) => (
  <Box sx={{ ...eyebrow, mb: '10px', ...sx }}>{children}</Box>
)

/** Bordered panel — the redesign's only card shape. */
export const Panel = ({ children, pad = false, sx, ...rest }) => (
  <Box
    sx={{
      background: surface.panel,
      border: `1px solid ${line.base}`,
      borderRadius: 2,
      overflow: 'hidden',
      ...(pad ? { p: '14px 16px' } : null),
      ...sx,
    }}
    {...rest}
  >
    {children}
  </Box>
)

/** Panel header: title, optional meta pill, right-aligned action slot. */
export const PanelHeader = ({ title, meta, action, sx }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      p: '12px 16px',
      borderBottom: `1px solid ${line.base}`,
      ...sx,
    }}
  >
    <Box component="span" sx={{ fontSize: '.8125rem', fontWeight: 600 }}>
      {title}
    </Box>
    {meta && (
      <Box
        component="span"
        sx={{
          fontSize: '.6875rem',
          color: ink.secondary,
          border: `1px solid ${line.strong}`,
          borderRadius: '10px',
          px: '7px',
          whiteSpace: 'nowrap',
        }}
      >
        {meta}
      </Box>
    )}
    {action && <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>{action}</Box>}
  </Box>
)

/**
 * Page header block: title, inline count, action slot, then a one-line
 * explanatory subtitle capped at a readable measure.
 */
export const PageHeader = ({ title, count, subtitle, actions, sx }) => (
  <Box sx={{ ...sx }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '12px', mb: '4px', flexWrap: 'wrap' }}>
      <Typography variant="h1">{title}</Typography>
      {count && (
        <Box component="span" sx={{ fontSize: '.75rem', color: ink.secondary, whiteSpace: 'nowrap' }}>
          {count}
        </Box>
      )}
      {actions && (
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>{actions}</Box>
      )}
    </Box>
    {subtitle && (
      <Typography sx={{ m: 0, mb: 2, fontSize: '.8125rem', color: ink.secondary, maxWidth: '76ch', textWrap: 'pretty' }}>
        {subtitle}
      </Typography>
    )}
  </Box>
)

/** Key/value evidence row — 104px label gutter, monospace value. */
export const FactRow = ({ label, value, labelWidth = 104, mono = true }) => (
  <Box sx={{ display: 'flex', gap: '12px', py: '5px' }}>
    <Box component="span" sx={{ width: labelWidth, flex: 'none', fontSize: '.75rem', color: ink.faint }}>
      {label}
    </Box>
    <Box
      component="span"
      sx={{
        flex: 1,
        minWidth: 0,
        fontSize: '.75rem',
        color: ink.body,
        wordBreak: 'break-all',
        ...(mono ? { fontFamily: MONO } : null),
      }}
    >
      {value}
    </Box>
  </Box>
)

/** Vertical timeline entry with a severity dot and a connecting rule. */
export const TimelineRow = ({ level, color, text, time, last = false }) => (
  <Box sx={{ display: 'flex', gap: '10px', pb: last ? 0 : '12px' }}>
    <Box sx={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <StatusDot level={level} color={color} size={8} />
      {!last && <Box sx={{ width: '1px', flex: 1, background: line.base }} />}
    </Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Box sx={{ fontSize: '.75rem', color: ink.body, textWrap: 'pretty' }}>{text}</Box>
      <Box sx={{ fontSize: '.6875rem', color: ink.dim, mt: '2px' }}>{time}</Box>
    </Box>
  </Box>
)

/** Primary 30px cyan action. */
export const PrimaryAction = ({ children, ...rest }) => (
  <Button variant="contained" color="primary" {...rest}>
    {children}
  </Button>
)

/** 30px bordered icon button, matching the topbar/list-header controls. */
export const BoxIconButton = ({ title, children, sx, ...rest }) => {
  const btn = (
    <IconButton
      sx={{
        width: 30,
        height: 30,
        border: `1px solid ${line.base}`,
        borderRadius: '6px',
        color: ink.strong,
        ...sx,
      }}
      {...rest}
    >
      {children}
    </IconButton>
  )
  return title ? <Tooltip title={title}>{btn}</Tooltip> : btn
}

/** Empty state for a panel body. */
export const EmptyState = ({ icon, title, hint, action }) => (
  <Box sx={{ p: '32px 16px', textAlign: 'center' }}>
    {icon && <Box sx={{ color: ink.dim, mb: 1, '& svg': { fontSize: 28 } }}>{icon}</Box>}
    <Box sx={{ fontSize: '.8125rem', color: ink.muted }}>{title}</Box>
    {hint && <Box sx={{ fontSize: '.75rem', color: ink.faint, mt: '4px' }}>{hint}</Box>}
    {action && <Box sx={{ mt: 2 }}>{action}</Box>}
  </Box>
)

/** Segmented control (the topbar time-range switch). */
export const Segmented = ({ options = [], value, onChange, sx }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      height: 30,
      border: `1px solid ${line.base}`,
      borderRadius: '6px',
      overflow: 'hidden',
      ...sx,
    }}
  >
    {options.map((o) => {
      const opt = typeof o === 'string' ? { value: o, label: o } : o
      const active = opt.value === value
      return (
        <Box
          key={opt.value}
          onClick={() => onChange && onChange(opt.value)}
          sx={{
            height: 28,
            display: 'flex',
            alignItems: 'center',
            px: '10px',
            fontSize: '.75rem',
            fontWeight: 500,
            cursor: 'pointer',
            userSelect: 'none',
            transition: `background ${MOTION}, color ${MOTION}`,
            ...(active
              ? { background: accent.wash, color: accent.main }
              : { color: ink.secondary, '&:hover': { color: ink.muted } }),
          }}
        >
          {opt.label}
        </Box>
      )
    })}
  </Box>
)

export { sev, sevForScore, pill, dot, chipQuiet }
