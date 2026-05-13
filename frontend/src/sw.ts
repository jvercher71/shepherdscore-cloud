/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute, NavigationRoute } from 'workbox-routing'
import { NetworkFirst, NetworkOnly } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { Queue } from 'workbox-background-sync'

declare const self: ServiceWorkerGlobalScope

// Workbox precache manifest — vite-plugin-pwa replaces this at build time.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA navigation fallback: serve index.html for app routes, but never for /api.
registerRoute(
  new NavigationRoute(
    async () => {
      const cache = await caches.open('workbox-precache-v2')
      const match = await cache.match('/index.html')
      return match ?? fetch('/index.html')
    },
    { denylist: [/^\/api\//] },
  ),
)

// Runtime cache for API GETs so already-fetched data is available offline.
registerRoute(
  ({ url, request }) =>
    request.method === 'GET' && url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  }),
)

// ----- Offline write queue -----
// Queue API POSTs that fail with a network error and replay them when the
// browser comes back online. Updates (PUT/PATCH) and deletes are intentionally
// left online-only to avoid last-write-wins / surprise-delete hazards.
// /api/push/* is excluded — those are transient and shouldn't replay.

const writeQueue = new Queue('shepherd-write-queue', {
  maxRetentionTime: 24 * 60, // minutes (1 day)
  onSync: async ({ queue }) => {
    await broadcastSyncState(true)
    try {
      await queue.replayRequests()
    } finally {
      await broadcastSyncState(false)
    }
  },
})

async function getPendingCount(): Promise<number> {
  return (await writeQueue.getAll()).length
}

async function broadcastSyncState(syncing: boolean): Promise<void> {
  const pending = await getPendingCount()
  const allClients = await self.clients.matchAll({ includeUncontrolled: true })
  for (const client of allClients) {
    client.postMessage({ type: 'SYNC_STATE_UPDATED', pending, syncing })
  }
}

const writeQueuePlugin = {
  fetchDidFail: async ({ request }: { request: Request }) => {
    // Network error — pushRequest clones the request (body included).
    await writeQueue.pushRequest({ request })
    await broadcastSyncState(false)
  },
}

registerRoute(
  ({ url, request }) =>
    request.method === 'POST' &&
    url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/api/push/'),
  new NetworkOnly({ plugins: [writeQueuePlugin] }),
  'POST',
)

// ----- Push notifications -----

type PushPayload = {
  title?: string
  body?: string
  url?: string
  tag?: string
  icon?: string
  badge?: string
}

self.addEventListener('push', (event: PushEvent) => {
  let payload: PushPayload = {}
  try {
    payload = event.data ? (event.data.json() as PushPayload) : {}
  } catch {
    payload = { body: event.data?.text() ?? '' }
  }
  const title = payload.title || 'ShepherdsCore'
  const options: NotificationOptions = {
    body: payload.body || '',
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-64x64.png',
    tag: payload.tag,
    data: { url: payload.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const targetUrl = (event.notification.data as { url?: string } | null)?.url || '/'
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      for (const client of allClients) {
        const clientUrl = new URL(client.url)
        if (clientUrl.origin === self.location.origin && 'focus' in client) {
          await client.focus()
          if ('navigate' in client) {
            await client.navigate(targetUrl)
          }
          return
        }
      }
      await self.clients.openWindow(targetUrl)
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
  if (event.data?.type === 'SYNC_STATE_REQUEST') {
    event.waitUntil(
      (async () => {
        const pending = await getPendingCount()
        const target = event.source as Client | null
        target?.postMessage({ type: 'SYNC_STATE_UPDATED', pending, syncing: false })
      })(),
    )
  }
})
