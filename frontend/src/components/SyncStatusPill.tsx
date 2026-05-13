import { useSyncStatus } from '../lib/syncStatus'
import styles from './SyncStatusPill.module.css'

export default function SyncStatusPill() {
  const { online, pending, syncing } = useSyncStatus()

  if (online && pending === 0 && !syncing) return null

  let label = ''
  let tone: 'offline' | 'pending' | 'syncing' = 'offline'

  if (syncing) {
    label = `Syncing ${pending} pending…`
    tone = 'syncing'
  } else if (!online && pending > 0) {
    label = `Offline — ${pending} pending`
    tone = 'offline'
  } else if (!online) {
    label = 'Offline'
    tone = 'offline'
  } else {
    label = `${pending} pending sync`
    tone = 'pending'
  }

  return (
    <div className={`${styles.pill} ${styles[tone]}`} role="status" aria-live="polite">
      <span className={styles.dot} />
      <span>{label}</span>
    </div>
  )
}
