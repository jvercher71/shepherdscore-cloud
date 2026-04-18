import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import StatCard from '../components/StatCard'
import styles from './PageShared.module.css'

interface Event {
  id: string; name: string; date: string; event_time: string
  event_type: string; location: string; description: string; created_at: string
}

interface Member { id: string; first_name: string; last_name: string }

const EVENT_TYPES = ['Sunday Service', 'Wednesday Service', 'Bible Study', 'Youth Event', 'Special Event', 'Meeting', 'Outreach', 'Other']
const EMPTY = { name: '', date: new Date().toISOString().slice(0, 10), event_time: '', event_type: 'Sunday Service', location: '', description: '' }

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Event | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [attendanceEvent, setAttendanceEvent] = useState<Event | null>(null)
  const [attendedIds, setAttendedIds] = useState<Set<string>>(new Set())
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [viewing, setViewing] = useState<Event | null>(null)

  const load = async () => {
    try {
      const [evts, mems] = await Promise.all([
        api.get<Event[]>('/events'),
        api.get<Member[]>('/members'),
      ])
      setEvents(evts)
      setMembers(mems)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (ev: Event) => {
    setEditing(ev)
    setForm({ name: ev.name, date: ev.date.slice(0, 10), event_time: ev.event_time || '', event_type: ev.event_type || 'Sunday Service', location: ev.location || '', description: ev.description })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      if (editing) {
        await api.put(`/events/${editing.id}`, form)
      } else {
        await api.post('/events', form)
      }
      setShowModal(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/events/${id}`)
      setDeleteConfirm(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const openAttendance = async (ev: Event) => {
    setAttendanceEvent(ev)
    setAttendanceLoading(true)
    try {
      const ids = await api.get<string[]>(`/events/${ev.id}/attendance`)
      setAttendedIds(new Set(ids))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load attendance')
      setAttendanceEvent(null)
    } finally {
      setAttendanceLoading(false)
    }
  }

  const toggleAttendance = async (memberId: string) => {
    if (!attendanceEvent) return
    const checked = attendedIds.has(memberId)
    try {
      if (checked) {
        await api.delete(`/events/${attendanceEvent.id}/attendance/${memberId}`)
        setAttendedIds(prev => { const s = new Set(prev); s.delete(memberId); return s })
      } else {
        await api.post(`/events/${attendanceEvent.id}/attendance`, { member_id: memberId })
        setAttendedIds(prev => new Set([...prev, memberId]))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update attendance')
    }
  }

  const upcoming = events.filter(e => new Date(e.date + 'T12:00:00') >= new Date())
  const past = events.filter(e => new Date(e.date + 'T12:00:00') < new Date())

  return (
    <div>
      <h1 className={styles.pageTitle}>Events</h1>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.statsGrid}>
        <StatCard label="Upcoming Events" value={upcoming.length} icon="calendar" color="#F59E0B" />
        <StatCard label="Past Events" value={past.length} icon="clipboard" color="#6B7280" />
        <StatCard label="Total Members" value={members.length} icon="people" color="#0066CC" />
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>All Events</span>
          <button className={styles.addBtn} onClick={openAdd}>+ Add Event</button>
        </div>
        <table>
          <thead>
            <tr><th>Event</th><th>Type</th><th>Date</th><th>Time</th><th>Location</th><th>Attendance</th><th></th></tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr><td colSpan={7} className={styles.emptyState}>{isLoading ? 'Loading…' : 'No events yet'}</td></tr>
            ) : events.map(ev => (
              <tr key={ev.id} onClick={() => setViewing(ev)} style={{ cursor: 'pointer' }}>
                <td style={{ fontWeight: 600 }}>{ev.name}</td>
                <td><span className={styles.badge} style={{ background: 'rgba(0,102,204,0.1)', color: '#0052a3' }}>{ev.event_type || '—'}</span></td>
                <td>
                  <span className={`${styles.badge} ${new Date(ev.date + 'T12:00:00') >= new Date() ? styles.badgeGreen : styles.badgeBlue}`}>
                    {new Date(ev.date + 'T12:00:00').toLocaleDateString()}
                  </span>
                </td>
                <td>{ev.event_time || '—'}</td>
                <td>{ev.location || '—'}</td>
                <td onClick={e => e.stopPropagation()}>
                  <button className={styles.editBtn} onClick={() => openAttendance(ev)}>
                    Take Attendance
                  </button>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <button className={styles.editBtn} onClick={() => openEdit(ev)}>Edit</button>
                  <button className={styles.deleteBtn} onClick={() => setDeleteConfirm(ev.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail View Modal */}
      {viewing && (
        <div className={styles.modalOverlay} onClick={() => setViewing(null)}>
          <div className={styles.modal} style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{viewing.name}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Type</span>
                <span className={styles.badge} style={{ background: 'rgba(0,102,204,0.1)', color: '#0052a3' }}>{viewing.event_type || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Date</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{new Date(viewing.date + 'T12:00:00').toLocaleDateString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Time</span>
                <span style={{ fontSize: 14 }}>{viewing.event_time || '—'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Location</span>
                <span style={{ fontSize: 14 }}>{viewing.location || '—'}</span>
              </div>
              {viewing.description && (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Description</div>
                  <div style={{ fontSize: 14, lineHeight: 1.6 }}>{viewing.description}</div>
                </div>
              )}
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setViewing(null)}>Close</button>
              <button className={styles.editBtn} onClick={() => { openAttendance(viewing); setViewing(null) }}>Take Attendance</button>
              <button className={styles.editBtn} onClick={() => { openEdit(viewing); setViewing(null) }}>Edit</button>
              <button className={styles.deleteBtn} onClick={() => { setDeleteConfirm(viewing.id); setViewing(null) }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>{editing ? 'Edit Event' : 'Add Event'}</h2>
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Event Name</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Time</label>
                <input type="time" value={form.event_time} onChange={e => setForm(p => ({ ...p, event_time: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Event Type</label>
                <select value={form.event_type} onChange={e => setForm(p => ({ ...p, event_type: e.target.value }))}>
                  {EVENT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Location</label>
                <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Sanctuary, Fellowship Hall, 123 Main St, etc." />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Description</label>
                <textarea rows={3} value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 400 }}>
            <h2 className={styles.modalTitle}>Delete Event?</h2>
            <p style={{ marginBottom: 24, color: '#555' }}>
              This event and all attendance records will be permanently deleted.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className={styles.deleteBtn} onClick={() => handleDelete(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Attendance Modal */}
      {attendanceEvent && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 600 }}>
            <h2 className={styles.modalTitle}>
              Attendance — {attendanceEvent.name}
              <span style={{ fontSize: 13, fontWeight: 400, color: '#888', marginLeft: 8 }}>
                {new Date(attendanceEvent.date + 'T12:00:00').toLocaleDateString()}
              </span>
            </h2>
            {attendanceLoading ? (
              <p style={{ color: '#888', textAlign: 'center', padding: 32 }}>Loading…</p>
            ) : (
              <>
                <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
                  {attendedIds.size} of {members.length} members checked in
                </p>
                <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[...members].sort((a, b) => a.last_name.localeCompare(b.last_name)).map(m => (
                    <label key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderRadius: 8, cursor: 'pointer',
                      background: attendedIds.has(m.id) ? 'rgba(34,197,94,0.08)' : 'transparent',
                    }}>
                      <input
                        type="checkbox"
                        checked={attendedIds.has(m.id)}
                        onChange={() => toggleAttendance(m.id)}
                        style={{ width: 16, height: 16 }}
                      />
                      <span style={{ fontWeight: 500 }}>{m.last_name}, {m.first_name}</span>
                      {attendedIds.has(m.id) && (
                        <span className={`${styles.badge} ${styles.badgeGreen}`} style={{ marginLeft: 'auto' }}>✓</span>
                      )}
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className={styles.modalActions}>
              <button className={styles.saveBtn} onClick={() => setAttendanceEvent(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
