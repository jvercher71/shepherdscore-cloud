import { useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface Attention { name: string; reason: string; suggestion: string }
interface NewMember { name: string; joined: string; status: string; suggestion: string }
interface Insights {
  needs_attention: Attention[]
  new_member_followup: NewMember[]
  positive_highlights: string[]
  recommendations: string[]
  summary: string
}
interface InsightsResponse { insights: Insights | null; raw: string | null }

export default function AIInsightsPage() {
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  const insights = data?.insights

  return (
    <div>
      <h1 className={styles.pageTitle}>AI Pastoral Insights</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24, maxWidth: 640 }}>
        AI analyzes your member engagement data — attendance patterns, giving trends, and group connections — to surface
        actionable pastoral care insights.
      </p>

      <button className={styles.addBtn} onClick={runInsights} disabled={loading} style={{ marginBottom: 28 }}>
        {loading ? 'Analyzing your church data…' : 'Generate Pastoral Insights'}
      </button>

      {error && <p className={styles.error}>{error}</p>}

      {data && !insights && data.raw && (
        <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.7 }}>
          {data.raw}
        </div>
      )}

      {insights && (
        <>
          {/* Executive Summary */}
          <div style={{ background: 'linear-gradient(135deg, #0066CC 0%, #0052a3 100%)', borderRadius: 12, padding: '24px 28px', marginBottom: 24, color: '#fff' }}>
            <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 10, opacity: 0.85 }}>Executive Summary</h3>
            <p style={{ fontSize: 15, lineHeight: 1.7 }}>{insights.summary}</p>
          </div>

          {/* Needs Attention */}
          {insights.needs_attention.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#DC2626' }}>
                Needs Attention ({insights.needs_attention.length})
              </h2>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr><th>Member</th><th>Reason</th><th>Suggested Action</th></tr>
                  </thead>
                  <tbody>
                    {insights.needs_attention.map((item, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td style={{ color: '#DC2626' }}>{item.reason}</td>
                        <td>{item.suggestion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* New Member Follow-up */}
          {insights.new_member_followup.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#0066CC' }}>
                New Member Follow-up ({insights.new_member_followup.length})
              </h2>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr><th>Member</th><th>Joined</th><th>Status</th><th>Suggestion</th></tr>
                  </thead>
                  <tbody>
                    {insights.new_member_followup.map((item, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{item.name}</td>
                        <td>{item.joined}</td>
                        <td>
                          <span className={`${styles.badge} ${styles.badgeBlue}`}>{item.status}</span>
                        </td>
                        <td>{item.suggestion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Positive Highlights */}
          {insights.positive_highlights.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: '#16a34a' }}>
                Positive Highlights
              </h2>
              <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {insights.positive_highlights.map((h, i) => (
                    <li key={i} style={{ fontSize: 14, lineHeight: 1.6 }}>{h}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Recommendations */}
          {insights.recommendations.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Recommendations</h2>
              <div style={{ display: 'grid', gap: 12 }}>
                {insights.recommendations.map((rec, i) => (
                  <div key={i} style={{
                    background: 'var(--color-white)', borderRadius: 12, padding: '16px 20px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', fontSize: 14, lineHeight: 1.6,
                    borderLeft: '4px solid var(--color-accent)',
                  }}>
                    {rec}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
