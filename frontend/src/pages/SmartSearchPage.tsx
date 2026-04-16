import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface SearchResult {
  category: string; title: string; subtitle: string; detail: string
}

const CATEGORY_COLORS: Record<string, string> = {
  Member: '#0066CC', Giving: '#22C55E', Event: '#F59E0B',
  Group: '#8B5CF6', Help: '#6B7280', 'Bible Study': '#EC4899',
  Pledge: '#14B8A6', Search: '#6B7280',
}

const CATEGORY_ROUTES: Record<string, string> = {
  Member: '/members', Giving: '/giving', Event: '/events',
  Group: '/groups', Help: '/help', 'Bible Study': '/bible-study',
  Pledge: '/giving', Attendance: '/attendance',
}

export default function SmartSearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  const search = async () => {
    if (!query.trim()) return
    setLoading(true); setError(''); setSearched(true)
    try {
      const res = await api.post<{ results: SearchResult[] }>('/ai/smart-search', { query: query.trim() })
      setResults(res.results || [])
    } catch (e) { setError(e instanceof Error ? e.message : 'Search failed') }
    finally { setLoading(false) }
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Smart Search</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24, maxWidth: 640 }}>
        Search across all your church data — members, giving, events, groups, and more.
        Ask questions naturally, like "Who gave the most this month?" or "Show me new members".
      </p>

      {error && <p className={styles.error}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 28, maxWidth: 640 }}>
        <input
          className={styles.searchInput}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search anything… members, giving, events, or ask a question"
          style={{ flex: 1, fontSize: 15, padding: '12px 16px' }}
        />
        <button className={styles.addBtn} onClick={search} disabled={loading} style={{ padding: '12px 24px' }}>
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-secondary)' }}>
          AI is searching your church data…
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className={styles.emptyState}>No results found. Try a different search term.</div>
      )}

      {results.length > 0 && (
        <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
          {results.map((r, i) => (
            <div key={i} onClick={() => { const route = CATEGORY_ROUTES[r.category]; if (route) navigate(route) }}
              style={{
              background: 'var(--color-white)', borderRadius: 12, padding: '16px 20px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: CATEGORY_ROUTES[r.category] ? 'pointer' : 'default',
              borderLeft: `4px solid ${CATEGORY_COLORS[r.category] || '#888'}`, transition: 'box-shadow 0.15s',
            }}
              onMouseEnter={e => { if (CATEGORY_ROUTES[r.category]) e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.12)' }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                  color: CATEGORY_COLORS[r.category] || '#888',
                  background: `${CATEGORY_COLORS[r.category] || '#888'}15`,
                  padding: '2px 8px', borderRadius: 20,
                }}>
                  {r.category}
                </span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{r.title}</span>
              </div>
              {r.subtitle && <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>{r.subtitle}</div>}
              {r.detail && <div style={{ fontSize: 12, color: '#999' }}>{r.detail}</div>}
            </div>
          ))}
        </div>
      )}

      {!searched && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
          {['Show all active members', 'Who gave the most this year?', 'Upcoming events', 'How to add a member?', 'Members not in any group'].map(suggestion => (
            <button key={suggestion} onClick={() => { setQuery(suggestion); }} style={{
              background: 'var(--color-white)', border: '1.5px solid var(--color-border)',
              borderRadius: 10, padding: '14px 16px', textAlign: 'left', cursor: 'pointer',
              fontSize: 13, color: 'var(--color-text)', transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
