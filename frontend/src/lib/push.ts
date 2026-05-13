import { api } from './api'

export const pushIsSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.ready
  if (!reg) throw new Error('Service worker is not registered yet.')
  return reg
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!pushIsSupported()) return null
  const reg = await getRegistration()
  return reg.pushManager.getSubscription()
}

export async function subscribeToPush(): Promise<PushSubscription> {
  if (!pushIsSupported()) {
    throw new Error('Push notifications are not supported in this browser.')
  }
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }
  const { public_key } = await api.get<{ public_key: string }>('/push/vapid-key')
  const reg = await getRegistration()
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(public_key) as BufferSource,
    })
  }
  const json = sub.toJSON()
  await api.post('/push/subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
    user_agent: navigator.userAgent || '',
  })
  return sub
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getCurrentPushSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => undefined)
  await api.post('/push/unsubscribe', { endpoint }).catch(() => undefined)
}

export async function sendTestPush(): Promise<{ sent: number; pruned: number; total: number }> {
  return api.post('/push/test', {})
}
