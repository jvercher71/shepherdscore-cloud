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

  // Sleek SVG Chart interactive hover states
  const [activeGiving, setActiveGiving] = useState<number | null>(null)
  const [activeAttendance, setActiveAttendance] = useState<number | null>(null)
  const [activeStatus, setActiveStatus] = useState<number | null>(null)

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
  const minAttendance = Math.min(...sundayAttendance.map(a => a.headcount))



  /** Period-over-period % change between two values. */
  const delta = (curr: number, prev: number): number | null => {
    if (!prev) return null
    return ((curr - prev) / prev) * 100
  }

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

  const slices = statusOrder
    .map((s, idx) => {
      const count = statusCounts[s] || 0
      const pct = count / (membersTotal || 1)
      return { label: s, count, pct, color: statusColors[s], idx }
    })
    .filter(s => s.count > 0)

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
            <div style={{ position: 'relative', height: 230 }}>
              {activeGiving !== null && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(15, 25, 35, 0.95)',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  pointerEvents: 'none',
                  zIndex: 10,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>{givingByMonth[activeGiving].label}</span>
                  <span style={{ fontSize: 13 }}>${Math.round(givingByMonth[activeGiving].total).toLocaleString()}</span>
                  {activeGiving > 0 && (() => {
                    const d = delta(givingByMonth[activeGiving].total, givingByMonth[activeGiving - 1].total)
                    if (d === null) return null
                    return (
                      <span style={{ color: d >= 0 ? '#4ADE80' : '#F87171', fontSize: 10, fontWeight: 700 }}>
                        {d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(0)}% vs last month
                      </span>
                    )
                  })()}
                </div>
              )}
              <svg width="100%" height="200" viewBox="0 0 400 200" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                <defs>
                  <linearGradient id="givingGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22C55E" />
                    <stop offset="100%" stopColor="#16a34a" stopOpacity="0.8" />
                  </linearGradient>
                </defs>
                {/* Horizontal grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
                  const y = 20 + p * 130
                  return (
                    <line key={idx} x1="40" y1={y} x2="385" y2={y} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="4 4" />
                  )
                })}
                {/* Y-Axis values */}
                {[1, 0.5, 0].map((p, idx) => {
                  const y = 20 + (1 - p) * 130 + 4
                  const val = p * maxGiving
                  return (
                    <text key={idx} x="32" y={y} fontSize="10" fontWeight="600" fill="var(--color-text-secondary)" textAnchor="end">
                      {val > 0 ? `$${Math.round(val/1000)}k` : '$0'}
                    </text>
                  )
                })}
                {givingByMonth.map((r, i) => {
                  const gridWidth = 345
                  const x = 40 + (i + 0.1) * (gridWidth / 6)
                  const w = 0.8 * (gridWidth / 6)
                  const barHeight = (r.total / maxGiving) * 130
                  const y = 150 - barHeight
                  const isHovered = activeGiving === i

                  return (
                    <g key={r.key} onMouseEnter={() => setActiveGiving(i)} onMouseLeave={() => setActiveGiving(null)} style={{ cursor: 'pointer' }}>
                      {/* Interactive background area to make hover easier */}
                      <rect x={x} y="20" width={w} height="130" fill="transparent" />
                      {/* Visual Bar */}
                      <rect
                        x={x}
                        y={y}
                        width={w}
                        height={Math.max(4, barHeight)}
                        fill="url(#givingGrad)"
                        rx="4"
                        ry="4"
                        style={{
                          transition: 'all 0.2s ease',
                          filter: isHovered ? 'brightness(1.15) drop-shadow(0 4px 8px rgba(34, 197, 94, 0.3))' : 'none'
                        }}
                      />
                      {/* Label */}
                      <text x={x + w / 2} y="170" fontSize="10" fontWeight="600" fill={isHovered ? 'var(--color-accent)' : 'var(--color-text-secondary)'} textAnchor="middle">
                        {r.label}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          )}
        </Panel>

        <Panel title="Sunday Attendance — Last 8 Services" accent="#0066CC">
          {sundayAttendance.length === 0 ? (
            <EmptyNote>No Sunday Service attendance recorded yet.</EmptyNote>
          ) : (
            <div style={{ position: 'relative', height: 230 }}>
              {activeAttendance !== null && (
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(15, 25, 35, 0.95)',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  pointerEvents: 'none',
                  zIndex: 10,
                  boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10 }}>
                    {new Date(sundayAttendance[activeAttendance].date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </span>
                  <span style={{ fontSize: 13 }}>{sundayAttendance[activeAttendance].headcount} Attendees</span>
                  {activeAttendance > 0 && (() => {
                    const d = delta(sundayAttendance[activeAttendance].headcount, sundayAttendance[activeAttendance - 1].headcount)
                    if (d === null) return null
                    return (
                      <span style={{ color: d >= 0 ? '#4ADE80' : '#F87171', fontSize: 10, fontWeight: 700 }}>
                        {d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(0)}% vs last week
                      </span>
                    )
                  })()}
                </div>
              )}
              <svg width="100%" height="200" viewBox="0 0 400 200" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                <defs>
                  <linearGradient id="attendanceAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#0066CC" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id="attendanceLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#3B82F6" />
                    <stop offset="100%" stopColor="#0066CC" />
                  </linearGradient>
                </defs>
                {/* Horizontal grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((p, idx) => {
                  const y = 20 + p * 130
                  return (
                    <line key={idx} x1="40" y1={y} x2="385" y2={y} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="4 4" />
                  )
                })}
                {/* Y-Axis values */}
                {[1, 0.5, 0].map((p, idx) => {
                  const y = 20 + (1 - p) * 130 + 4
                  const valRange = maxAttendance - minAttendance || 1
                  const val = minAttendance + p * valRange
                  return (
                    <text key={idx} x="32" y={y} fontSize="10" fontWeight="600" fill="var(--color-text-secondary)" textAnchor="end">
                      {Math.round(val)}
                    </text>
                  )
                })}
                {(() => {
                  const pts = sundayAttendance.map((a, i) => {
                    const gridWidth = 345
                    const x = 40 + i * (gridWidth / (sundayAttendance.length - 1 || 1))
                    const valRange = maxAttendance - minAttendance || 1
                    const y = 150 - ((a.headcount - minAttendance) / valRange) * 130
                    return { x, y }
                  })

                  // Build smooth curve path
                  let lineD = ''
                  if (pts.length > 0) {
                    lineD = `M ${pts[0].x} ${pts[0].y}`
                    for (let i = 0; i < pts.length - 1; i++) {
                      const p0 = pts[i]
                      const p1 = pts[i + 1]
                      const cpX1 = p0.x + (p1.x - p0.x) / 2
                      const cpY1 = p0.y
                      const cpX2 = p0.x + (p1.x - p0.x) / 2
                      const cpY2 = p1.y
                      lineD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`
                    }
                  }

                  const areaD = lineD ? `${lineD} L ${pts[pts.length - 1].x} 150 L ${pts[0].x} 150 Z` : ''

                  return (
                    <>
                      {/* Area Fill */}
                      {areaD && <path d={areaD} fill="url(#attendanceAreaGrad)" />}
                      {/* Spline Line */}
                      {lineD && <path d={lineD} fill="none" stroke="url(#attendanceLineGrad)" strokeWidth="3" strokeLinecap="round" />}
                      {/* Interactive Nodes */}
                      {pts.map((p, i) => {
                        const dateLabel = new Date(sundayAttendance[i].date + 'T12:00:00').toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
                        const isHovered = activeAttendance === i
                        return (
                          <g key={sundayAttendance[i].id} onMouseEnter={() => setActiveAttendance(i)} onMouseLeave={() => setActiveAttendance(null)} style={{ cursor: 'pointer' }}>
                            {/* Larger invisible trigger circle */}
                            <circle cx={p.x} cy={p.y} r="14" fill="transparent" />
                            {/* Inner point */}
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={isHovered ? 6 : 4}
                              fill={isHovered ? '#0066CC' : '#fff'}
                              stroke="#0066CC"
                              strokeWidth={isHovered ? 3 : 2}
                              style={{ transition: 'all 0.15s ease' }}
                            />
                            {/* X-axis Label */}
                            <text x={p.x} y="170" fontSize="10" fontWeight="600" fill={isHovered ? 'var(--color-accent)' : 'var(--color-text-secondary)'} textAnchor="middle">
                              {dateLabel}
                            </text>
                          </g>
                        )
                      })}
                    </>
                  )
                })()}
              </svg>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, minHeight: 180, flexWrap: 'wrap' }}>
              {/* Donut Chart */}
              <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0, margin: '0 auto' }}>
                {activeStatus !== null && (() => {
                  const slice = slices.find(s => s.idx === activeStatus)
                  if (!slice) return null
                  return (
                    <div style={{
                      position: 'absolute',
                      bottom: -32,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: 'rgba(15, 25, 35, 0.95)',
                      color: '#fff',
                      padding: '4px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      fontWeight: 600,
                      pointerEvents: 'none',
                      whiteSpace: 'nowrap',
                      zIndex: 10,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                    }}>
                      {slice.label}: {slice.count} ({Math.round(slice.pct * 100)}%)
                    </div>
                  )
                })()}
                <svg width="140" height="140" viewBox="0 0 150 150">
                  {/* Base track circle */}
                  <circle cx="75" cy="75" r="36" fill="transparent" stroke="var(--color-bg)" strokeWidth="8" />
                  {(() => {
                    let accumulatedOffset = 0
                    return slices.map(slice => {
                      const offset = accumulatedOffset
                      accumulatedOffset += slice.pct * 226.195
                      const isHovered = activeStatus === slice.idx
                      return (
                        <circle
                          key={slice.label}
                          cx="75"
                          cy="75"
                          r="36"
                          fill="transparent"
                          stroke={slice.color}
                          strokeWidth={isHovered ? 12 : 8}
                          strokeDasharray={`${slice.pct * 226.195} 226.195`}
                          strokeDashoffset={-offset}
                          transform="rotate(-90 75 75)"
                          onMouseEnter={() => setActiveStatus(slice.idx)}
                          onMouseLeave={() => setActiveStatus(null)}
                          style={{
                            transition: 'all 0.2s ease',
                            cursor: 'pointer'
                          }}
                        />
                      )
                    })
                  })()}
                  {/* Center Text */}
                  <text x="75" y="72" fontSize="16" fontWeight="800" fill="var(--color-text)" textAnchor="middle">
                    {membersTotal}
                  </text>
                  <text x="75" y="86" fontSize="10" fontWeight="600" fill="var(--color-text-secondary)" textAnchor="middle" style={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Members
                  </text>
                </svg>
              </div>

              {/* Status List Legend */}
              <div style={{ flex: 1, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {slices.map(slice => {
                  const isHovered = activeStatus === slice.idx
                  return (
                    <div 
                      key={slice.label} 
                      onMouseEnter={() => setActiveStatus(slice.idx)}
                      onMouseLeave={() => setActiveStatus(null)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: 6,
                        background: isHovered ? 'rgba(0,102,204,0.04)' : 'transparent',
                        transition: 'background 0.2s',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                        <span style={{ fontWeight: 700, color: slice.color }}>{slice.label}</span>
                        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{slice.count} · {Math.round(slice.pct * 100)}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--color-bg)', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${slice.pct * 100}%`, 
                          height: '100%', 
                          background: slice.color,
                          transition: 'width 0.3s ease'
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
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
