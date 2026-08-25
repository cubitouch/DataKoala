import { useEffect, useMemo, useRef, useState } from 'react'
import { TextInput } from './ui/TextInput'
import { useStore } from '../store/useStore'
import styles from './QueryTabs.module.css'

type QueryTabsProps = { className?: string }

export function QueryTabs({ className }: QueryTabsProps) {
  const tabs = useStore((state) => state.tabs)
  const activeTabId = useStore((state) => state.activeTabId)
  const profiles = useStore((state) => state.profiles)
  const createTab = useStore((state) => state.createTab)
  const closeTab = useStore((state) => state.closeTab)
  const renameTab = useStore((state) => state.renameTab)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const profileNames = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile.name])), [profiles])

  useEffect(() => {
    if (renamingId) inputRef.current?.select()
  }, [renamingId])

  const switchTo = (id: string) => {
    if (id === activeTabId || !tabs.some((tab) => tab.id === id)) return
    useStore.setState({ activeTabId: id })
  }

  const close = (id: string) => {
    const closing = tabs.find((tab) => tab.id === id)
    if (closing?.running && !window.confirm('This query is still running. Close the tab and stop waiting for its result?')) return
    closeTab(id)
  }

  const beginRename = (id: string, title: string) => {
    setRenamingId(id)
    setDraftTitle(title)
  }
  const finishRename = () => {
    if (renamingId) renameTab(renamingId, draftTitle)
    setRenamingId(null)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      if (event.key.toLowerCase() === 't') {
        event.preventDefault()
        createTab()
      } else if (event.key.toLowerCase() === 'w') {
        event.preventDefault()
        close(useStore.getState().activeTabId)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tabs, activeTabId])

  return <div className={`${styles.root}${className ? ` ${className}` : ''}`} role="tablist" aria-label="Query tabs">
      {tabs.map((tab) => {
        const selected = tab.id === activeTabId
        const connectionName = tab.connectionProfileId ? profileNames.get(tab.connectionProfileId) : null
        return <div key={tab.id} className={`${styles.tab} ${selected ? styles.active : ''}`} role="tab" aria-selected={selected}>
          <button className={styles.main} onClick={() => switchTo(tab.id)} onDoubleClick={() => beginRename(tab.id, tab.title)} title={`${tab.title}${connectionName ? ` — ${connectionName}` : ''}`}>
            {tab.running && <span className={styles.running} aria-label="Query running" />}
            {renamingId === tab.id ? <TextInput mode="inline" ref={inputRef} className={styles.renameInput} value={draftTitle}
              onClick={(event) => event.stopPropagation()} onValueChange={setDraftTitle}
              onBlur={finishRename} onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); finishRename() }
                if (event.key === 'Escape') { event.preventDefault(); setRenamingId(null) }
              }} /> : <span className={styles.title}>{tab.title}</span>}
            {connectionName && <span className={styles.connection}>{connectionName}</span>}
          </button>
          <button className={styles.close} aria-label={`Close ${tab.title}`} title="Close tab (⌘/Ctrl+W)" onClick={(event) => { event.stopPropagation(); close(tab.id) }}>×</button>
        </div>
      })}
      <button className={styles.add} aria-label="New query tab" title="New query tab (⌘/Ctrl+T)" onClick={() => createTab()}>+</button>
  </div>
}
