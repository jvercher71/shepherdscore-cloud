import { useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface GivingReport {
  category: string
  total: number
  count: number
}

interface MemberReport {
  total: number
  added_this_month: number
}

export default function ReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear())
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [givingData, setGivingData] = useState<GivingReport[]>([])
  const [memberData, setMemberData] = useState<MemberReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const runReport = async () => {
    setLoading(true)
    setError('')
    try {
      const [giving, members] = await Promise.all([
        api.get<GivingReport[]>(`/reports/giving?year=${year}&month=${month}`),
        api.get<MemberReport>(`/reports/members?year=${year}&month=${month}`),
      ])
      setGivingData(giving)
      setMemberData(members)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  const grandTotal = givingData.reduce((s, r) => s + r.total, 0)

  return (
    <div>
      <h1 className={styles.pageTitle}>Reports</h1>
      {error && <p className={styles.error}>{error}</p>}

      <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className={styles.field} style={{ minWidth: 120 }}>
          <label>Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}>
            {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <div className={styles.field} style={{ minWidth: 140 }}>
          <label>Month</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}>
            {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
        </div>
        <button className={styles.addBtn} onClick={runReport} disabled={loading}>
          {loading ? 'Loading…' : 'Run Report'}
        </button>
      </div>

      {givingData.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Giving by Category</h2>
          <div className={styles.tableWrap} style={{ marginBottom: 24 }}>
            <table>
              <thead>
                <tr><th>Category</th><th>Transactions</th><th>Total</th></tr>
              </thead>
              <tbody>
                {givingData.map(r => (
                  <tr key={r.category}>
                    <td>{r.category}</td>
                    <td>{r.count}</td>
                    <td style={{ fontWeight: 700, color: '#22C55E' }}>${r.total.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{ fontWeight: 700 }}>Grand Total</td>
                  <td style={{ fontWeight: 800, fontSize: 16, color: '#22C55E' }}>${grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {memberData && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Membership</h2>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statValue} style={{ color: '#0066CC' }}>{memberData.total}</div>
              <div className={styles.statLabel}>Total Members</div>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statValue} style={{ color: '#22C55E' }}>{memberData.added_this_month}</div>
              <div className={styles.statLabel}>Added This Month</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
