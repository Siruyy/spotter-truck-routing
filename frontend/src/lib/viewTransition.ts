import { flushSync } from 'react-dom'

const MAX_WAIT_MS = 400

/**
 * Run a state change inside a View Transition so elements sharing a
 * `view-transition-name` (the planner card and the sidebar) morph into each
 * other. Falls back to an instant update without support, with reduced motion,
 * or if the browser does not start the transition promptly (e.g. a throttled
 * background tab), so the UI can never get stuck waiting on an animation.
 */
export function withViewTransition(update: () => void): void {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (typeof document.startViewTransition !== 'function' || reduced || document.hidden) {
    update()
    return
  }
  let applied = false
  const apply = () => {
    if (applied) return
    applied = true
    flushSync(update)
  }
  const transition = document.startViewTransition(apply)
  window.setTimeout(() => {
    if (applied) return
    transition.skipTransition()
    apply()
  }, MAX_WAIT_MS)
}
