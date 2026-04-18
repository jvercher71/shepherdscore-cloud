import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface Member {
  id: string; first_name: string; last_name: string; preferred_name: string
  email: string; status: string; role_tags: string[]
}
interface Group { id: string; name: string; member_count?: number }
interface BibleStudyGroup { id: string; name: string; member_count: number }

const STATUS_OPTIONS = ['Active', 'Inactive', 'Visitor']
const ROLE_TAG_OPTIONS = [
  'Bible Study Leader', 'Volunteer', 'Staff', 'Deacon', 'Elder',
  'Worship Team', 'Youth Leader', 'Small Group Leader', 'Greeter', 'Usher',
]

interface BroadcastResult {
  sent: number
  total_recipients: number
  skipped_no_email: string[]
  failed: string[]
  configured: boolean
}

export default function EmailPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [members, setMembers] = useState<Member[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [bibleGroups, setBibleGroups] = useState<BibleStudyGroup[]>([])
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<BroadcastResult | null>(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set())
  const [selectedBibleGroups, setSelectedBibleGroups] = useState<Set<string>>(new Set())
  const [selectedRoles, setSelectedRoles] = useState<Set<string>>(new Set())
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set())
  const [includeAllActive, setIncludeAllActive] = useState(false)

  const [groupMemberMap, setGroupMemberMap] = useState<Record<string, Set<string>>>({})
  const [bibleMemberMap, setBibleMemberMap] = useState<Record<string, Set<string>>>({})

  useEffect(() => {
    Promise.all([
      api.get<Member[]>('/members'),
      api.get<Group[]>('/groups'),
      api.get<BibleStudyGroup[]>('/bible-study'),
    ]).then(([m, g, b]) => {
      setMembers(m); setGroups(g); setBibleGroups(b)
    }).catch(e => setError(e instanceof Error ? e.message : 'Failed to load data'))
  }, [])

  // Support pre-selecting a group via query params: /email?group=<id> or /email?bible=<id>
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const g = params.get('group')
    const b = params.get('bible')
    if (g) setSelectedGroups(prev => new Set([...prev, g]))
    if (b) setSelectedBibleGroups(prev => new Set([...prev, b]))
  }, [location.search])

  // Lazy-load group -> members mapping once we need it to compute recipient count
  const loadGroupMembers = async (groupId: string) => {
    if (groupMemberMap[groupId]) return
    const ids = await api.get<string[]>(`/groups/${groupId}/members`).catch(() => [])
    setGroupMemberMap(prev => ({ ...prev, [groupId]: new Set(ids) }))
  }
  const loadBibleMembers = async (groupId: string) => {
    if (bibleMemberMap[groupId]) return
    const ids = await api.get<string[]>(`/bible-study/${groupId}/members`).catch(() => [])
    setBibleMemberMap(prev => ({ ...prev, [groupId]: new Set(ids) }))
  }

  useEffect(() => { selectedGroups.forEach(id => void loadGroupMembers(id)) }, [selectedGroups])
  useEffect(() => { selectedBibleGroups.forEach(id => void loadBibleMembers(id)) }, [selectedBibleGroups])

  // Compute resolved recipients client-side (for count preview)
  const resolvedIds = useMemo(() => {
    const ids = new Set<string>(selectedMembers)
    for (const gid of selectedGroups) (groupMemberMap[gid] || new Set()).forEach(id => ids.add(id))
    for (const bid of selectedBibleGroups) (bibleMemberMap[bid] || new Set()).forEach(id => ids.add(id))
    for (const m of members) {
      if (includeAllActive && (m.status || 'Active') === 'Active') ids.add(m.id)
      if (selectedStatuses.size > 0 && selectedStatuses.has(m.status || 'Active')) ids.add(m.id)
      if (selectedRoles.size > 0 && (m.role_tags || []).some(t => selectedRoles.has(t))) ids.add(m.id)
    }
    return ids
  }, [selectedMembers, selectedGroups, selectedBibleGroups, selectedRoles, selectedStatuses, includeAllActive, groupMemberMap, bibleMemberMap, members])

  const resolved = members.filter(m => resolvedIds.has(m.id))
  const resolvedWithEmail = resolved.filter(m => m.email)

  const filteredMembers = members.filter(m =>
    !search.trim() || `${m.first_name} ${m.last_name} ${m.preferred_name} ${m.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const toggleIn = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    setter(next)
  }

  const clearAll = () => {
    setSelectedMembers(new Set()); setSelectedGroups(new Set())
    setSelectedBibleGroups(new Set()); setSelectedRoles(new Set())
    setSelectedStatuses(new Set()); setIncludeAllActive(false)
  }

  const send = async () => {
    if (!subject.trim() || !body.trim()) { setError('Subject and body are required'); return }
    if (resolvedIds.size === 0) { setError('Pick at least one recipient, group, role, or status'); return }
    setSending(true); setError(''); setResult(null)
    try {
      const res = await api.post<BroadcastResult>('/email/broadcast', {
        subject: subject.trim(),
        body,
        member_ids: [...selectedMembers],
        group_ids: [...selectedGroups],
        bible_study_ids: [...selectedBibleGroups],
        role_tags: [...selectedRoles],
        statuses: [...selectedStatuses],
        include_all_active: includeAllActive,
      })
      setResult(res)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Email Members</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24, maxWidth: 640 }}>
        Pick recipients — individuals, whole groups, by role, or by status — write your message, and send. Use
        <code style={{ background: 'var(--color-bg)', padding: '2px 6px', borderRadius: 4, marginLeft: 4 }}>{'{{name}}'}</code>
        in the body to personalize each email with the recipient&apos;s preferred name.
      </p>
      {error && <p className={styles.error}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 24, alignItems: 'flex-start' }}>
        {/* Recipient picker */}
        <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 10 }}>Quick Pick</h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input type="checkbox" checked={includeAllActive} onChange={e => setIncludeAllActive(e.target.checked)} />
              All active members
            </label>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STATUS_OPTIONS.map(s => {
                const active = selectedStatuses.has(s)
                return (
                  <button key={s} onClick={() => toggleIn(selectedStatuses, s, setSelectedStatuses)} style={chipStyle(active)}>
                    {s}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 10 }}>By Role</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ROLE_TAG_OPTIONS.map(r => {
                const active = selectedRoles.has(r)
                return (
                  <button key={r} onClick={() => toggleIn(selectedRoles, r, setSelectedRoles)} style={chipStyle(active)}>
                    {r}
                  </button>
                )
              })}
            </div>
          </div>

          {groups.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 10 }}>Groups</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                {groups.map(g => (
                  <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '4px 0' }}>
                    <input type="checkbox" checked={selectedGroups.has(g.id)} onChange={() => toggleIn(selectedGroups, g.id, setSelectedGroups)} />
                    <span style={{ flex: 1 }}>{g.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{g.member_count ?? 0}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {bibleGroups.length > 0 && (
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 10 }}>Bible Study</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 160, overflowY: 'auto' }}>
                {bibleGroups.map(g => (
                  <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, padding: '4px 0' }}>
                    <input type="checkbox" checked={selectedBibleGroups.has(g.id)} onChange={() => toggleIn(selectedBibleGroups, g.id, setSelectedBibleGroups)} />
                    <span style={{ flex: 1 }}>{g.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{g.member_count ?? 0}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 10 }}>Specific Members</h3>
            <input
              type="text" placeholder="Search members…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--color-border)', borderRadius: 8, fontSize: 13, marginBottom: 8 }}
            />
            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {filteredMembers.map(m => (
                <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 14 }}>
                  <input type="checkbox" checked={selectedMembers.has(m.id)} onChange={() => toggleIn(selectedMembers, m.id, setSelectedMembers)} />
                  <span style={{ flex: 1 }}>{m.preferred_name || m.first_name} {m.last_name}</span>
                  {!m.email && <span style={{ fontSize: 10, color: '#EF4444' }}>no email</span>}
                </label>
              ))}
            </div>
          </div>

          {(selectedMembers.size || selectedGroups.size || selectedBibleGroups.size || selectedRoles.size || selectedStatuses.size || includeAllActive) ? (
            <button onClick={clearAll} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}>
              Clear all recipients
            </button>
          ) : null}
        </div>

        {/* Composer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: '16px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>RECIPIENTS</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: resolvedWithEmail.length > 0 ? '#22C55E' : 'var(--color-text-secondary)' }}>
              {resolvedWithEmail.length} will be emailed
              {resolved.length > resolvedWithEmail.length && (
                <span style={{ fontSize: 12, fontWeight: 600, color: '#EF4444', marginLeft: 10 }}>
                  · {resolved.length - resolvedWithEmail.length} have no email on file
                </span>
              )}
            </div>
          </div>

          <div className={styles.field}>
            <label>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Sunday Service Reminder" />
          </div>

          <div className={styles.field}>
            <label>Message</label>
            <textarea
              value={body} onChange={e => setBody(e.target.value)}
              rows={12}
              placeholder={'Hi {{name}},\n\nJust a reminder that…'}
              style={{ resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
            />
          </div>

          {result && (
            <div style={{
              background: result.sent > 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              borderRadius: 10, padding: '14px 18px', fontSize: 14,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {result.configured
                  ? `Sent ${result.sent} of ${result.total_recipients}`
                  : 'Email not configured on the backend (missing RESEND_API_KEY).'}
              </div>
              {result.skipped_no_email.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  Skipped (no email): {result.skipped_no_email.join(', ')}
                </div>
              )}
              {result.failed.length > 0 && (
                <div style={{ fontSize: 12, color: '#EF4444' }}>
                  Failed: {result.failed.join(', ')}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className={styles.addBtn}
              disabled={sending || resolvedWithEmail.length === 0}
              onClick={send}
            >
              {sending ? 'Sending…' : `Send to ${resolvedWithEmail.length} member${resolvedWithEmail.length === 1 ? '' : 's'}`}
            </button>
            <button className={styles.cancelBtn} onClick={() => navigate(-1)}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function chipStyle(active: boolean): CSSProperties {
  return {
    border: `1.5px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
    background: active ? 'var(--color-accent)' : 'transparent',
    color: active ? '#fff' : 'var(--color-text)',
    borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  }
}
