import { useEffect, useState } from 'react'
import {
  pushIsSupported,
  getCurrentPushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
  sendTestPush,
} from '../lib/push'

type Status = 'loading' | 'unsupported' | 'denied' | 'enabled' | 'disabled'

export default function PushNotificationsSection() {
  const [status, setStatus] = useState<Status>('loading')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!pushIsSupported()) {
        if (!cancelled) setStatus('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        if (!cancelled) setStatus('denied')
        return
      }
      const sub = await getCurrentPushSubscription().catch(() => null)
      if (!cancelled) setStatus(sub ? 'enabled' : 'disabled')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const clearMessages = () => {
    setMessage('')
    setError('')
  }

  const handleEnable = async () => {
    clearMessages()
    setBusy(true)
    try {
      await subscribeToPush()
      setStatus('enabled')
      setMessage('Push notifications enabled on this device.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable notifications.')
      if (Notification.permission === 'denied') setStatus('denied')
    } finally {
      setBusy(false)
    }
  }

  const handleDisable = async () => {
    clearMessages()
    setBusy(true)
    try {
      await unsubscribeFromPush()
      setStatus('disabled')
      setMessage('Push notifications disabled on this device.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable notifications.')
    } finally {
      setBusy(false)
    }
  }

  const handleTest = async () => {
    clearMessages()
    setBusy(true)
    try {
      const result = await sendTestPush()
      setMessage(
        result.sent > 0
          ? `Sent test push to ${result.sent} device${result.sent === 1 ? '' : 's'}.`
          : 'No active subscriptions to send to.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Test push failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      style={{
        background: 'var(--color-white)',
        borderRadius: 12,
        padding: 32,
        maxWidth: 600,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        marginBottom: 24,
      }}
    >
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Push Notifications</h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 20 }}>
        Get alerts on this device when announcements or events are posted. You can enable this on
        each phone or computer separately.
      </p>

      {status === 'loading' && <p style={{ fontSize: 14 }}>Checking…</p>}

      {status === 'unsupported' && (
        <p style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
          This browser doesn't support push notifications. Try Chrome, Edge, or Firefox.
        </p>
      )}

      {status === 'denied' && (
        <p style={{ fontSize: 14, color: '#B45309' }}>
          Notifications are blocked for this site. Update your browser's site permissions to allow
          them, then come back to enable.
        </p>
      )}

      {(status === 'disabled' || status === 'enabled') && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {status === 'disabled' ? (
            <button
              type="button"
              onClick={handleEnable}
              disabled={busy}
              style={{
                background: 'var(--color-accent)',
                color: '#fff',
                border: 0,
                borderRadius: 6,
                padding: '8px 16px',
                fontWeight: 600,
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? 'Enabling…' : 'Enable notifications'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleDisable}
                disabled={busy}
                style={{
                  background: '#fff',
                  color: 'var(--color-sidebar)',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontWeight: 600,
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                {busy ? 'Working…' : 'Disable on this device'}
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={busy}
                style={{
                  background: 'var(--color-accent)',
                  color: '#fff',
                  border: 0,
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontWeight: 600,
                  cursor: busy ? 'wait' : 'pointer',
                }}
              >
                {busy ? 'Sending…' : 'Send test'}
              </button>
            </>
          )}
        </div>
      )}

      {message && (
        <p style={{ marginTop: 16, fontSize: 13, color: '#16A34A', fontWeight: 600 }}>{message}</p>
      )}
      {error && (
        <p style={{ marginTop: 16, fontSize: 13, color: '#DC2626', fontWeight: 600 }}>{error}</p>
      )}
    </div>
  )
}
