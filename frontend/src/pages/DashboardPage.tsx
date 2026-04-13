import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface Stats {
  total_members: number
  total_giving_this_month: number
  upcoming_events: number
  total_groups: number
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Stats>('/dashboard/stats')
      .then(setStats)
      .catch(e => setError(e.message))
  }, [])

  return (
    <div>
      <h1 className={styles.pageTitle}>Dashboard</h1>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.statsGrid}>
        <StatCard label="Total Members" value={stats?.total_members ?? '—'} color="#0066CC" />
        <StatCard label="Giving This Month" value={stats ? `$${stats.total_giving_this_month.toLocaleString()}` : '—'} color="#22C55E" />
        <StatCard label="Upcoming Events" value={stats?.upcoming_events ?? '—'} color="#F59E0B" />
        <StatCard label="Active Groups" value={stats?.total_groups ?? '—'} color="#8B5CF6" />
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statValue} style={{ color }}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}
