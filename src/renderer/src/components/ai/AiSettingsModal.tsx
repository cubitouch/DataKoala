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
      dialogClassName={styles.dialog}
    >
      <h2 id={titleId}>AI settings</h2>
      <div>Provider: OpenRouter</div>
      <TextInput
        label="API key"
        type="password"
        value={key}
        onValueChange={setKey}
        disabled={busy || !ready}
        autoComplete="off"
        hint={
          hasKey
            ? 'API key saved. Leave blank to keep it, or enter a replacement.'
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
      {error && <div role="alert">{error}</div>}
      {message && <div role="status">{message}</div>}
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
        <button
          className="btn"
          disabled={busy || !ready || !model}
          onClick={() => void run('save')}
        >
          Save
        </button>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  )
}
