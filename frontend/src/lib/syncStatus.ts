import { useEffect, useState } from 'react'

export type SyncState = {
  online: boolean
  pending: number
  syncing: boolean
}

type SwMessage = { type: 'SYNC_STATE_UPDATED'; pending: number; syncing: boolean }

function requestSyncState() {
  navigator.serviceWorker?.controller?.postMessage({ type: 'SYNC_STATE_REQUEST' })
}

export function useSyncStatus(): SyncState {
  const [state, setState] = useState<SyncState>({
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    pending: 0,
    syncing: false,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const onOnline = () => {
      setState((s) => ({ ...s, online: true }))
      requestSyncState()
    }
    const onOffline = () => setState((s) => ({ ...s, online: false }))
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    const onMessage = (event: MessageEvent<SwMessage>) => {
      const data = event.data
      if (data?.type === 'SYNC_STATE_UPDATED') {
        setState((s) => ({ ...s, pending: data.pending, syncing: data.syncing }))
      }
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)

    // Ask the SW for current state once it's controlling the page.
    if (navigator.serviceWorker?.controller) {
      requestSyncState()
    } else {
      navigator.serviceWorker?.ready.then(requestSyncState).catch(() => undefined)
    }

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      navigator.serviceWorker?.removeEventListener('message', onMessage)
    }
  }, [])

  return state
}
