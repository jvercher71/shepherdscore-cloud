import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import StatCard from '../components/StatCard'
import styles from './PageShared.module.css'

interface Stats {
  total_members: number
  total_giving_this_month: number
  upcoming_events: number
  total_groups: number
}

interface GivingRecord { id: string; amount: number; date: string; member_id: string | null; category: string }
interface AttendanceRecord { id: string; service_type: string; date: string; headcount: number }
interface EventRecord { id: string; name: string; date: string; event_time: string; location: string; event_type: string }
interface MemberLite { id: string; first_name: string; last_name: string; preferred_name: string; status: string; created_at: string }

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [giving, setGiving] = useState<GivingRecord[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [events, setEvents] = useState<EventRecord[]>([])
  const [members, setMembers] = useState<MemberLite[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get<Stats>('/dashboard/stats'),
      api.get<GivingRecord[]>('/giving'),
      api.get<AttendanceRecord[]>('/attendance'),
      api.get<EventRecord[]>('/events'),
      api.get<MemberLite[]>('/members'),
    ]).then(([s, g, a, e, m]) => {
      setStats(s); setGiving(g); setAttendance(a); setEvents(e); setMembers(m)
    }).catch(e => setError(e instanceof Error ? e.message : 'Failed to load dashboard'))
  }, [])

  // --- Derived data ------------------------------------------------------

  // Giving by month, last 6 months (including current)
  const givingByMonth = (() => {
    const out: { label: string; key: string; total: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = d.toISOString().slice(0, 7)
      out.push({ key, label: d.toLocaleString('default', { month: 'short' }), total: 0 })
    }
    for (const g of giving) {
      const k = g.date.slice(0, 7)
      const row = out.find(r => r.key === k)
      if (row) row.total += g.amount
    }
    return out
  })()
  const maxGiving = Math.max(1, ...givingByMonth.map(r => r.total))

  // Sunday attendance, last 8 records
  const sundayAttendance = [...attendance]
    .filter(a => a.service_type === 'Sunday Service')
    .sort((x, y) => x.date.localeCompare(y.date))
    .slice(-8)
  const maxAttendance = Math.max(1, ...sundayAttendance.map(a => a.headcount))

  // Upcoming events (next 5)
  const upcoming = [...events]
    .filter(e => e.date >= new Date().toISOString().slice(0, 10))
    .sort((x, y) => x.date.localeCompare(y.date))
    .slice(0, 5)

  // Recent giving (last 5)
  const recentGiving = [...giving]
    .sort((x, y) => y.date.localeCompare(x.date))
    .slice(0, 5)
  const memberName = (id: string | null) => {
    if (!id) return 'Anonymous'
    const m = members.find(m => m.id === id)
    return m ? `${m.preferred_name || m.first_name} ${m.last_name}` : '—'
  }

  // Member status breakdown
  const statusCounts = members.reduce<Record<string, number>>((acc, m) => {
    acc[m.status || 'Active'] = (acc[m.status || 'Active'] || 0) + 1
    return acc
  }, {})
  const statusOrder = ['Active', 'Visitor', 'Inactive', 'Transferred', 'Deceased']
  const statusColors: Record<string, string> = {
    Active: '#22C55E', Visitor: '#0066CC', Inactive: '#6B7280', Transferred: '#8B5CF6', Deceased: '#9CA3AF',
  }
  const membersTotal = members.length

  // New members last 30 days
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const newMembers30 = members.filter(m => new Date(m.created_at) >= thirtyDaysAgo).length

  // Giving — this week vs last week
  const startOfThisWeek = (() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0, 0, 0, 0); return d
  })()
  const startOfLastWeek = new Date(startOfThisWeek); startOfLastWeek.setDate(startOfLastWeek.getDate() - 7)
  const thisWeekGiving = giving.filter(g => new Date(g.date + 'T12:00:00') >= startOfThisWeek).reduce((s, g) => s + g.amount, 0)
  const lastWeekGiving = giving.filter(g => {
    const d = new Date(g.date + 'T12:00:00')
    return d >= startOfLastWeek && d < startOfThisWeek
  }).reduce((s, g) => s + g.amount, 0)
  const weekDelta = thisWeekGiving - lastWeekGiving
  const weekDeltaPct = lastWeekGiving > 0 ? (weekDelta / lastWeekGiving) * 100 : null

  // --- Render ------------------------------------------------------------

  return (
    <div>
      <h1 className={styles.pageTitle}>Dashboard</h1>
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.statsGrid}>
        <StatCard
          label="Total Members"
          value={stats?.total_members ?? '—'}
          icon="people"
          color="#0066CC"
          subLabel={newMembers30 > 0 ? `+${newMembers30} this month` : undefined}
        />
        <StatCard
          label="Giving This Month"
          value={stats ? `$${stats.total_giving_this_month.toLocaleString()}` : '—'}
          icon="heart"
          color="#EF4444"
          subLabel={
            weekDeltaPct === null
              ? undefined
              : `${weekDelta >= 0 ? '▲' : '▼'} ${Math.abs(weekDeltaPct).toFixed(0)}% vs last week`
          }
          subColor={weekDeltaPct === null ? undefined : (weekDelta >= 0 ? '#22C55E' : '#DC2626')}
        />
        <StatCard
          label="Upcoming Events"
          value={stats?.upcoming_events ?? '—'}
          icon="calendar"
          color="#8B5CF6"
          subLabel={upcoming[0] ? `Next: ${upcoming[0].name}` : undefined}
        />
        <StatCard
          label="Active Groups"
          value={stats?.total_groups ?? '—'}
          icon="group"
          color="#22C55E"
        />
      </div>

      {/* Two-column: giving chart + attendance chart */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 24 }}>
        <Panel title="Giving — Last 6 Months" accent="#22C55E">
          {giving.length === 0 ? (
            <EmptyNote>No giving recorded yet.</EmptyNote>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 180, padding: '8px 0' }}>
              {givingByMonth.map(r => {
                const pct = Math.max(4, (r.total / maxGiving) * 100)
                return (
                  <div key={r.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                      {r.total > 0 ? `$${Math.round(r.total).toLocaleString()}` : ''}
                    </div>
                    <div style={{
                      width: '100%', height: `${pct}%`, minHeight: 4,
                      background: 'linear-gradient(180deg, #22C55E 0%, #16a34a 100%)',
                      borderRadius: '6px 6px 0 0',
                    }} />
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 600 }}>{r.label}</div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel title="Sunday Attendance — Last 8 Services" accent="#0066CC">
          {sundayAttendance.length === 0 ? (
            <EmptyNote>No Sunday Service attendance recorded yet.</EmptyNote>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 180, padding: '8px 0' }}>
              {sundayAttendance.map(a => {
                const pct = Math.max(4, (a.headcount / maxAttendance) * 100)
                return (
                  <div key={a.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text)' }}>{a.headcount}</div>
                    <div style={{
                      width: '100%', height: `${pct}%`, minHeight: 4,
                      background: 'linear-gradient(180deg, #3B82F6 0%, #0066CC 100%)',
                      borderRadius: '6px 6px 0 0',
                    }} />
                    <div style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                      {new Date(a.date + 'T12:00:00').toLocaleDateString('default', { month: 'numeric', day: 'numeric' })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Three-column: upcoming events + member breakdown + recent giving */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginTop: 16 }}>
        <Panel title="Upcoming Events" accent="#F59E0B">
          {upcoming.length === 0 ? (
            <EmptyNote>No upcoming events.</EmptyNote>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {upcoming.map(e => (
                <li key={e.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{e.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {new Date(e.date + 'T12:00:00').toLocaleDateString()}{e.event_time ? ` · ${e.event_time}` : ''}{e.location ? ` · ${e.location}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Member Breakdown" accent="#8B5CF6">
          {membersTotal === 0 ? (
            <EmptyNote>No members yet.</EmptyNote>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {statusOrder.filter(s => (statusCounts[s] ?? 0) > 0).map(s => {
                const count = statusCounts[s] || 0
                const pct = (count / membersTotal) * 100
                return (
                  <div key={s}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: statusColors[s] || '#888' }}>{s}</span>
                      <span style={{ color: 'var(--color-text-secondary)' }}>{count} · {pct.toFixed(0)}%</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: statusColors[s] || '#888' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>

        <Panel title="Recent Giving" accent="#22C55E">
          {recentGiving.length === 0 ? (
            <EmptyNote>No giving records yet.</EmptyNote>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentGiving.map(g => (
                <li key={g.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{memberName(g.member_id)}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {new Date(g.date + 'T12:00:00').toLocaleDateString()} · {g.category}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#22C55E', fontSize: 14 }}>${g.amount.toFixed(2)}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Panel({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--color-white)', borderRadius: 12, padding: '18px 20px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderTop: `3px solid ${accent}`,
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 12, margin: '0 0 12px' }}>
        {title}
      </h3>
      {children}
    </div>
  )
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: '16px 0', margin: 0 }}>{children}</p>
  )
}
