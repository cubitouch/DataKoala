import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { Modal } from '@components/ui/Modal'
import { TextInput } from '@components/ui/TextInput'
import { Combobox } from '@components/ui/combobox'
import { api } from '@lib/api'
import { AI_PRIVACY_NOTICE, type AiModel } from '@shared/ai'
import styles from './Ai.module.css'
export function AiSettingsModal({
  onClose,
  returnFocusRef,
}: {
  onClose: () => void
  returnFocusRef: RefObject<HTMLElement | null>
}) {
  const titleId = useId()
  const [editingKey, setEditingKey] = useState(false)
  const [model, setModel] = useState(''),
    [key, setKey] = useState('')
  const [hasKey, setHasKey] = useState(false),
    [models, setModels] = useState<AiModel[]>([])
  const [loading, setLoading] = useState(true),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(''),
    [error, setError] = useState('')
  const requests = useRef(new Set<string>())
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    const id = crypto.randomUUID()
    const active = requests.current
    active.add(id)
    void api.ai.settings
      .get()
      .then((result) => {
        if (!mounted.current) return
        if (result.ok) {
          setModel(result.value.model)
          setHasKey(result.value.hasApiKey)
          setReady(true)
        } else setError(result.message)
      })
      .catch(() => {
        if (mounted.current) setError('Could not load AI settings.')
      })
    void api.ai
      .listModels(id)
      .then((result) => {
        if (!mounted.current) return
        if (result.ok) setModels(result.value)
        else if (result.code !== 'cancelled') setError(result.message)
      })
      .catch(() => {
        if (mounted.current) setError('Could not load OpenRouter models.')
      })
      .finally(() => {
        active.delete(id)
        if (mounted.current) setLoading(false)
      })
    return () => {
      mounted.current = false
      for (const request of active) void api.ai.cancel(request)
      active.clear()
    }
  }, [])
  const run = async (action: 'save' | 'test' | 'remove') => {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    const id = crypto.randomUUID()
    requests.current.add(id)
    try {
      if (action === 'test') {
        const result = await api.ai.test(id, { model, apiKey: key })
        if (!mounted.current) return
        if (!result.ok) {
          if (result.code !== 'cancelled') setError(result.message)
        } else
          setMessage(
            'Connection successful. The selected model returned valid structured output.',
          )
      } else {
        const result =
          action === 'save'
            ? await api.ai.settings.save({ model, apiKey: key })
            : await api.ai.settings.removeApiKey()
        if (!mounted.current) return
        if (!result.ok) setError(result.message)
        else {
          window.dispatchEvent(new Event('datakoala:ai-settings-changed'))
          setHasKey(result.value.hasApiKey)
          setKey('')
          if (action === 'save') onClose()
          else setMessage('API key removed.')
        }
      }
    } catch {
      if (mounted.current)
        setError('Could not complete the AI settings operation.')
    } finally {
      requests.current.delete(id)
      if (mounted.current) setBusy(false)
    }
  }
  const options = models.map((m) => ({
    value: m.id,
    label: m.name,
    subtitle: m.id,
  }))
  if (model && !options.some((m) => m.value === model))
    options.unshift({
      value: model,
      label: model,
      subtitle: 'Currently configured',
    })
  return (
    <Modal
      open
      onClose={onClose}
      labelledBy={titleId}
      returnFocusRef={returnFocusRef}
      initialFocus="dialog"
      dialogClassName={`${styles.dialog} ${styles.settingsDialog}`}
    >
      <header className={styles.settingsHeader}>
        <span className={styles.providerIcon} aria-hidden="true">
          <OpenRouterIcon />
        </span>
        <div>
          <h2 id={titleId}>Settings</h2>
          <h3>AI settings</h3>
        </div>
      </header>
      <div className={styles.notice}>Provider: OpenRouter</div>
      <TextInput
        label="API key"
        type="password"
        value={key || (hasKey && !editingKey ? '••••••••••••••••' : '')}
        onFocus={(event) => {
          if (!key && hasKey) event.currentTarget.select()
        }}
        onBlur={() => setEditingKey(false)}
        onValueChange={(value) => {
          setEditingKey(true)
          setKey(value.replace(/•/g, ''))
        }}
        disabled={busy || !ready}
        autoComplete="off"
        hint={
          hasKey
            ? 'API key saved. The dots are a placeholder. Enter a replacement, or leave blank to keep the saved key.'
            : 'Your key is encrypted using operating system credential storage.'
        }
      />
      <Combobox
        label="Model"
        value={model}
        onChange={setModel}
        options={options}
        searchable
        loading={loading}
        disabled={busy || !ready}
        placeholder="Choose an OpenRouter model"
      />
      <p className={styles.notice}>{AI_PRIVACY_NOTICE}</p>
      <p className={styles.notice}>
        Test connection sends a tiny structured completion using these settings.
        It may use OpenRouter credits and does not save changes.
      </p>
      {error && (
        <div role="alert" className="inline-error">
          {error}
        </div>
      )}
      {message && (
        <div
          role="status"
          aria-label="Success"
          data-tone="success"
          className={styles.success}
        >
          {message}
        </div>
      )}
      <div className={styles.actions}>
        {hasKey && (
          <button
            className="btn ghost"
            disabled={busy}
            onClick={() => void run('remove')}
          >
            Remove API key
          </button>
        )}
        <button
          className="btn ghost"
          disabled={busy || !ready || !model || (!key && !hasKey)}
          onClick={() => void run('test')}
        >
          {busy ? 'Working…' : 'Test connection'}
        </button>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn primary"
          disabled={busy || !ready || !model}
          onClick={() => void run('save')}
        >
          Save
        </button>
      </div>
    </Modal>
  )
}

// Glyph source: https://openrouter.ai/brand/logos/transparent/glyph/svg/glyph-ink.svg
function OpenRouterIcon() {
  return (
    <svg viewBox="0 0 1024 730" fill="currentColor" aria-hidden="true">
      <path d="M795.893 0C915.776 0 1012.95 97.9963 1012.95 218.88C1012.95 339.764 915.776 437.76 795.893 437.76L1011.2 654.869C1038.55 682.447 1019.18 729.6 980.504 729.6H361.77C161.97 729.6 0 566.273 0 364.8C0 163.327 161.97 0 361.77 0L795.893 0ZM361.77 145.92C241.89 145.92 144.708 243.916 144.708 364.8C144.708 485.684 241.89 583.68 361.77 583.68C481.649 583.68 578.831 485.684 578.831 364.8C578.831 243.916 481.649 145.92 361.77 145.92Z" />
    </svg>
  )
}
