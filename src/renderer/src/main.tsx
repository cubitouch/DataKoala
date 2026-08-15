import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { useStore } from './store/useStore'
import { buildEChartsOption } from './lib/chartOption'
import { restoreWorkspaceDraft, startWorkspacePersistence } from './lib/workspacePersistence'
import './styles.css'
import './prometheus-metadata.css'

// Hydrate editable query sessions before React mounts. Persistence stores saved
// profile IDs but never credentials, results or runtime execution state, so restore
// does not reconnect or replay any query.
if (!window.datakoala?.smokeMode) {
  restoreWorkspaceDraft((patch) => useStore.setState(patch))
  startWorkspacePersistence(
    () => useStore.getState(),
    (listener) => useStore.subscribe((state) => listener(state))
  )
}

// Test seam: the smoke harness needs to push a result into the store and inspect the
// chart option the component builds. Only exposed when launched by that harness.
if (window.datakoala?.smokeMode) {
  const w = window as unknown as Record<string, unknown>
  w.__datakoalaStore = useStore
  w.__datakoalaBuildOption = buildEChartsOption
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
