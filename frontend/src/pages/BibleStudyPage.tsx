import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface BibleStudyGroup {
  id: string; name: string; description: string; meeting_day: string
  meeting_time: string; location: string; teacher_id: string | null
  teacher_name: string; member_count: number
}
interface Member { id: string; first_name: string; last_name: string; preferred_name: string }

const DAYS = ['', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const EMPTY = { name: '', description: '', meeting_day: '', meeting_time: '', location: '', teacher_id: null as string | null }

export default function BibleStudyPage() {
  const [groups, setGroups] = useState<BibleStudyGroup[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [rosterGroup, setRosterGroup] = useState<BibleStudyGroup | null>(null)
  const [rosterIds, setRosterIds] = useState<Set<string>>(new Set())

  const load = async () => {
    try {
      const [g, m] = await Promise.all([
        api.get<BibleStudyGroup[]>('/bible-study'),
        api.get<Member[]>('/members'),
      ])
      setGroups(g); setMembers(m)
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed') }
    finally { setIsLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const openAdd = () => { setEditId(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (g: BibleStudyGroup) => {
    setEditId(g.id)
    setForm({ name: g.name, description: g.description, meeting_day: g.meeting_day, meeting_time: g.meeting_time, location: g.location, teacher_id: g.teacher_id })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const payload = { ...form, teacher_id: form.teacher_id || null }
      if (editId) { await api.put(`/bible-study/${editId}`, payload) }
      else { await api.post('/bible-study', payload) }
      setShowModal(false); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this Bible study group?')) return
    await api.delete(`/bible-study/${id}`).catch(e => setError(e.message)); await load()
  }

  const openRoster = async (g: BibleStudyGroup) => {
    setRosterGroup(g)
    try {
      const ids = await api.get<string[]>(`/bible-study/${g.id}/members`)
      setRosterIds(new Set(ids))
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed') }
  }

  const toggleRoster = async (memberId: string) => {
    if (!rosterGroup) return
    try {
      if (rosterIds.has(memberId)) {
        await api.delete(`/bible-study/${rosterGroup.id}/members/${memberId}`)
        setRosterIds(prev => { const s = new Set(prev); s.delete(memberId); return s })
      } else {
        await api.post(`/bible-study/${rosterGroup.id}/members`, { member_id: memberId })
        setRosterIds(prev => new Set([...prev, memberId]))
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
  }

  const memberName = (m: Member) => `${m.preferred_name || m.first_name} ${m.last_name}`

  return (
    <div>
      <h1 className={styles.pageTitle}>Bible Study Groups</h1>
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>All Groups</span>
          <button className={styles.addBtn} onClick={openAdd}>+ Add Group</button>
        </div>
        <table>
          <thead><tr><th>Name</th><th>Teacher</th><th>Day / Time</th><th>Location</th><th>Members</th><th></th></tr></thead>
          <tbody>
            {groups.length === 0 ? (
              <tr><td colSpan={6} className={styles.emptyState}>{isLoading ? 'Loading…' : 'No Bible study groups yet'}</td></tr>
            ) : groups.map(g => (
              <tr key={g.id}>
                <td style={{ fontWeight: 600 }}>{g.name}</td>
                <td>{g.teacher_name || '—'}</td>
                <td>{[g.meeting_day, g.meeting_time].filter(Boolean).join(' at ') || '—'}</td>
                <td>{g.location || '—'}</td>
                <td>
                  <button className={styles.editBtn} onClick={() => openRoster(g)}>{g.member_count} enrolled</button>
                </td>
                <td>
                  <button className={styles.editBtn} onClick={() => openEdit(g)}>Edit</button>
                  <button className={styles.deleteBtn} onClick={() => handleDelete(g.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 580 }}>
            <h2 className={styles.modalTitle}>{editId ? 'Edit Group' : 'Add Bible Study Group'}</h2>
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Group Name</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Meeting Day</label>
                <select value={form.meeting_day} onChange={e => setForm(p => ({ ...p, meeting_day: e.target.value }))}>
                  {DAYS.map(d => <option key={d} value={d}>{d || '— Select —'}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Meeting Time</label>
                <input type="time" value={form.meeting_time} onChange={e => setForm(p => ({ ...p, meeting_time: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Location</label>
                <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Room, building, etc." />
              </div>
              <div className={styles.field}>
                <label>Teacher</label>
                <select value={form.teacher_id ?? ''} onChange={e => setForm(p => ({ ...p, teacher_id: e.target.value || null }))}>
                  <option value="">— None —</option>
                  {members.map(m => <option key={m.id} value={m.id}>{memberName(m)}</option>)}
                </select>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Description</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={2} style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {rosterGroup && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 600 }}>
            <h2 className={styles.modalTitle}>Roster — {rosterGroup.name}</h2>
            <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{rosterIds.size} members enrolled</p>
            <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[...members].sort((a, b) => a.last_name.localeCompare(b.last_name)).map(m => (
                <label key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                  background: rosterIds.has(m.id) ? 'rgba(34,197,94,0.08)' : 'transparent',
                }}>
                  <input type="checkbox" checked={rosterIds.has(m.id)} onChange={() => toggleRoster(m.id)} style={{ width: 16, height: 16 }} />
                  <span style={{ fontWeight: 500 }}>{m.last_name}, {m.preferred_name || m.first_name}</span>
                  {rosterIds.has(m.id) && <span className={`${styles.badge} ${styles.badgeGreen}`} style={{ marginLeft: 'auto' }}>Enrolled</span>}
                </label>
              ))}
            </div>
            <div className={styles.modalActions}>
              <button className={styles.saveBtn} onClick={() => { setRosterGroup(null); load() }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
