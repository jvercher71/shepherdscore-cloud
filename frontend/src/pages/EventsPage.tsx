import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface Event {
  id: string
  name: string
  date: string
  description: string
  created_at: string
}

interface Member { id: string; first_name: string; last_name: string }

const EMPTY = { name: '', date: new Date().toISOString().slice(0, 10), description: '' }

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
    setForm({ name: ev.name, date: ev.date.slice(0, 10), description: ev.description })
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
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#F59E0B' }}>{upcoming.length}</div>
          <div className={styles.statLabel}>Upcoming Events</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#6B7280' }}>{past.length}</div>
          <div className={styles.statLabel}>Past Events</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{members.length}</div>
          <div className={styles.statLabel}>Total Members</div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>All Events</span>
          <button className={styles.addBtn} onClick={openAdd}>+ Add Event</button>
        </div>
        <table>
          <thead>
            <tr><th>Event</th><th>Date</th><th>Description</th><th>Attendance</th><th></th></tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr><td colSpan={5} className={styles.emptyState}>{isLoading ? 'Loading…' : 'No events yet'}</td></tr>
            ) : events.map(ev => (
              <tr key={ev.id}>
                <td style={{ fontWeight: 600 }}>{ev.name}</td>
                <td>
                  <span className={`${styles.badge} ${new Date(ev.date + 'T12:00:00') >= new Date() ? styles.badgeGreen : styles.badgeBlue}`}>
                    {new Date(ev.date + 'T12:00:00').toLocaleDateString()}
                  </span>
                </td>
                <td>{ev.description || '—'}</td>
                <td>
                  <button className={styles.editBtn} onClick={() => openAttendance(ev)}>
                    Take Attendance
                  </button>
                </td>
                <td>
                  <button className={styles.editBtn} onClick={() => openEdit(ev)}>Edit</button>
                  <button className={styles.deleteBtn} onClick={() => setDeleteConfirm(ev.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
