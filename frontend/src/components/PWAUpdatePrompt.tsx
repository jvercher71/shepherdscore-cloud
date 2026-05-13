import { useRegisterSW } from 'virtual:pwa-register/react'
import styles from './PWAUpdatePrompt.module.css'

export default function PWAUpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl) {
      console.log('Service worker registered:', swUrl)
    },
    onRegisterError(err) {
      console.error('Service worker registration error:', err)
    },
  })

  if (!offlineReady && !needRefresh) return null

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <div className={styles.message}>
        {needRefresh
          ? 'A new version is available.'
          : 'App ready to work offline.'}
      </div>
      <div className={styles.actions}>
        {needRefresh && (
          <button
            type="button"
            className={styles.primary}
            onClick={() => updateServiceWorker(true)}
          >
            Reload
          </button>
        )}
        <button type="button" className={styles.secondary} onClick={close}>
          Dismiss
        </button>
      </div>
    </div>
  )
}
