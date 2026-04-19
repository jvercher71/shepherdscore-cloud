import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface InsightsResponse { insights: null; raw: string | null }

interface SavedInsight {
  id: string
  title: string
  payload: Record<string, unknown> | null
  raw: string
  created_at: string
}

/** Render narrative text with **bold** markdown converted to <strong>, and
 * paragraphs separated by blank lines. No full markdown parser needed. */
function NarrativeReport({ text }: { text: string }) {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
  return (
    <div style={{
      background: 'var(--color-white)', borderRadius: 12, padding: '24px 28px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', fontSize: 14, lineHeight: 1.75,
      color: 'var(--color-text)',
    }}>
      {paragraphs.map((p, i) => <Paragraph key={i} text={p} />)}
    </div>
  )
}

function Paragraph({ text }: { text: string }) {
  // Split on **bold** runs, rendering them as <strong>. A heading-only paragraph
  // (the whole paragraph is a bold run) gets bumped up to a section heading.
  const boldOnly = /^\*\*(.+)\*\*$/s.exec(text.trim())
  if (boldOnly) {
    return (
      <h3 style={{
        fontSize: 14, fontWeight: 800, margin: '22px 0 8px',
        color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: 0.4,
      }}>
        {boldOnly[1]}
      </h3>
    )
  }
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <p style={{ margin: '0 0 12px', whiteSpace: 'pre-wrap' }}>
      {parts.map((seg, i) => {
        const m = /^\*\*([^*]+)\*\*$/.exec(seg)
        return m ? <strong key={i}>{m[1]}</strong> : <span key={i}>{seg}</span>
      })}
    </p>
  )
}

export default function AIInsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<SavedInsight[]>([])
  const [saving, setSaving] = useState(false)
  const [savedOpen, setSavedOpen] = useState(false)

  const loadSaved = async () => {
    try {
      const rows = await api.get<SavedInsight[]>('/ai/pastoral-insights/saved')
      setSaved(rows)
    } catch { /* ignore */ }
  }

  useEffect(() => { void loadSaved() }, [])

  const runInsights = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get<InsightsResponse>('/ai/pastoral-insights')
      setData(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate insights')
    } finally {
      setLoading(false)
    }
  }

  const saveCurrent = async () => {
    if (!data?.raw) return
    setSaving(true)
    try {
      await api.post('/ai/pastoral-insights/saved', {
        title: '',
        payload: null,
        raw: data.raw,
      })
      await loadSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save insight')
    } finally {
      setSaving(false)
    }
  }

  const viewSaved = (row: SavedInsight) => {
    setData({ insights: null, raw: row.raw || null })
    setSavedOpen(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const deleteSaved = async (id: string) => {
    if (!confirm('Delete this saved insight?')) return
    try {
      await api.delete(`/ai/pastoral-insights/saved/${id}`)
      setSaved(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const copyToClipboard = () => {
    if (data?.raw) navigator.clipboard.writeText(data.raw)
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>AI Pastoral Insights</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24, maxWidth: 640 }}>
        AI analyzes your member engagement data — attendance patterns, giving trends, and group connections —
        and writes a pastoral care report your team can read and act on.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
        <button className={styles.addBtn} onClick={runInsights} disabled={loading}>
          {loading ? 'Analyzing your church data…' : 'Generate Pastoral Insights'}
        </button>
        {data?.raw && (
          <>
            <button className={styles.editBtn} onClick={saveCurrent} disabled={saving}>
              {saving ? 'Saving…' : 'Save Insight'}
            </button>
            <button className={styles.secondaryBtn} onClick={copyToClipboard}>Copy</button>
          </>
        )}
        <button className={styles.editBtn} onClick={() => setSavedOpen(o => !o)}>
          {savedOpen ? 'Hide' : 'View'} Saved ({saved.length})
        </button>
      </div>

      {savedOpen && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Saved Insights</h2>
          {saved.length === 0 ? (
            <p style={{ fontSize: 13, color: '#888' }}>No saved insights yet. Generate one and hit Save to keep it for later.</p>
          ) : (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr><th>Title</th><th>Saved</th><th></th></tr>
                </thead>
                <tbody>
                  {saved.map(row => (
                    <tr key={row.id}>
                      <td style={{ fontWeight: 600 }}>{row.title || 'Untitled'}</td>
                      <td>{new Date(row.created_at).toLocaleString()}</td>
                      <td>
                        <button className={styles.editBtn} onClick={() => viewSaved(row)}>View</button>
                        <button className={styles.deleteBtn} onClick={() => deleteSaved(row.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}

      {data?.raw && <NarrativeReport text={data.raw} />}
    </div>
  )
}
