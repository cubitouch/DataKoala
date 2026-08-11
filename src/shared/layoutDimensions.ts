export const MIN_WINDOW_WIDTH = 1000
export const MIN_WINDOW_HEIGHT = 640
export const TITLEBAR_HEIGHT = 40
export const SIDEBAR_MIN = 180
export const SIDEBAR_MAX = 520
export const MAIN_MIN_WIDTH = 320
export const EDITOR_MIN = 180
export const RESULTS_MIN = 160
export const SPLITTER_SIZE = 8

export interface DimensionBounds { min: number; max: number }

export const parseStoredDimension = (raw: string | null, fallback: number): number => {
  if (raw === null || raw.trim() === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

export const clampDimension = (value: number, { min, max }: DimensionBounds): number =>
  Math.min(Math.max(value, min), Math.max(min, max))

export const sidebarBounds = (workspaceWidth: number): DimensionBounds => ({
  min: SIDEBAR_MIN,
  max: Math.min(SIDEBAR_MAX, workspaceWidth - MAIN_MIN_WIDTH - SPLITTER_SIZE)
})

export const editorBounds = (mainHeight: number): DimensionBounds => ({
  min: EDITOR_MIN,
  max: mainHeight - RESULTS_MIN - SPLITTER_SIZE
})

export const keyboardDimension = (
  value: number,
  key: string,
  axis: 'sidebar' | 'editor',
  bounds: DimensionBounds,
  step = 16
): number | null => {
  const decrement = axis === 'sidebar' ? 'ArrowLeft' : 'ArrowUp'
  const increment = axis === 'sidebar' ? 'ArrowRight' : 'ArrowDown'
  if (key !== decrement && key !== increment) return null
  return clampDimension(value + (key === decrement ? -step : step), bounds)
}
