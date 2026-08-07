import React from 'react'

/**
 * Shell-level state screens can read: the shared time range owned by the
 * topbar, live platform health, and whether we're in the narrow single-column
 * layout. Lives in its own module so pages don't have to import App.
 */
export const ShellContext = React.createContext({
  range: '7d',
  setRange: () => {},
  health: {},
  narrow: false,
})

export const useShell = () => React.useContext(ShellContext)

export default ShellContext
