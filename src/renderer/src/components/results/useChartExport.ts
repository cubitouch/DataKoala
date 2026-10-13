import { useLayoutEffect, useRef, useState } from 'react'
import { api } from '@lib/api'
import {
  captureChartPng,
  chartCapturePixelRatio,
  copyChartPng,
  exportChartPng,
  type ChartImageInstance,
} from '@lib/chartImage'
import { notifyChartCopyResult } from '@lib/chartCopyNotification'
import type { ChartLegendEntry } from '@lib/chartLegend'
import type {
  ChartRevision,
  ChartReadinessController,
} from '@lib/chartReadiness'

interface ChartExportInput {
  /** Committed display candidate, including result and workspace identity. */
  context: object
  ready: boolean
  revision: ChartRevision | null
  readiness: ChartReadinessController
  getInstance: () => ChartImageInstance | null
  legend: readonly ChartLegendEntry[]
  visibility: Record<string, boolean>
}

/** Transient copy/export ownership; rendering and platform image work stay separate. */
export function useChartExport(input: ChartExportInput) {
  const [capturing, setCapturing] = useState<'copy' | 'export' | null>(null)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const activeContext = useRef<object | null>(null)
  const pending = useRef<object | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useLayoutEffect(() => {
    activeContext.current = input.context
    setCapturing(null)
    setCopyFeedback(null)
    return () => {
      activeContext.current = null
      pending.current = null
      if (timer.current) clearTimeout(timer.current)
    }
  }, [input.context])

  const run = async (action: 'copy' | 'export') => {
    if (
      !input.ready ||
      !input.revision ||
      pending.current ||
      activeContext.current !== input.context
    )
      return
    const request = {}
    const revision = input.revision
    pending.current = request
    setCapturing(action)
    const current = () =>
      pending.current === request &&
      activeContext.current === input.context &&
      input.readiness.isCurrentRevision(revision)
    const feedback = (message: string) => {
      if (timer.current) clearTimeout(timer.current)
      setCopyFeedback(message)
      timer.current = setTimeout(() => {
        if (activeContext.current === input.context) setCopyFeedback(null)
      }, 1800)
    }
    const image = async () => {
      if (!current()) throw new Error('Chart changed while capturing')
      const instance = input.getInstance()
      if (!instance) throw new Error('Chart is not available')
      const png = await captureChartPng(
        instance,
        chartCapturePixelRatio(window.devicePixelRatio),
        input.legend,
        input.visibility,
      )
      if (!current()) throw new Error('Chart changed while capturing')
      return png
    }
    try {
      if (action === 'copy') {
        const ok = await copyChartPng(await image(), api.clipboardImage)
        if (!current()) return
        notifyChartCopyResult(ok)
        if (!ok) console.error('[chart] Clipboard image write was rejected')
      } else {
        const outcome = await exportChartPng(image, api.export.saveBinary)
        if (current() && outcome === 'saved') feedback('Chart exported')
      }
    } catch (error) {
      if (!current()) return
      console.error(
        action === 'copy'
          ? '[chart] Could not copy chart'
          : '[chart] Could not export chart',
        error,
      )
      if (action === 'copy') notifyChartCopyResult(false)
      else feedback('Could not export chart')
    } finally {
      // Stale completion cannot clear a replacement chart's pending action.
      if (
        pending.current === request &&
        activeContext.current === input.context
      ) {
        pending.current = null
        setCapturing(null)
      }
    }
  }
  return {
    capturing,
    copyFeedback,
    copyChart: () => run('copy'),
    exportPng: () => run('export'),
  }
}
