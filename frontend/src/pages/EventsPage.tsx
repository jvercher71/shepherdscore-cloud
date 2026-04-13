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

const EMPTY = { name: '', date: new Date().toISOString().slice(0, 10), description: '' }

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Event | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<Event[]>('/events').then(setEvents).catch(e => setError(e.message))
  useEffect(() => { void load() }, [])

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (ev: Event) => { setEditing(ev); setForm({ name: ev.name, date: ev.date, description: ev.description }); setShowModal(true) }

  const handleSave = async () => {
    setSaving(true)
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

  const upcoming = events.filter(e => new Date(e.date) >= new Date())
  const past = events.filter(e => new Date(e.date) < new Date())

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
      </div>
      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>All Events</span>
          <button className={styles.addBtn} onClick={openAdd}>+ Add Event</button>
        </div>
        <table>
          <thead>
            <tr><th>Event</th><th>Date</th><th>Description</th><th></th></tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr><td colSpan={4} className={styles.emptyState}>No events yet</td></tr>
            ) : events.map(ev => (
              <tr key={ev.id}>
                <td style={{ fontWeight: 600 }}>{ev.name}</td>
                <td>
                  <span className={`${styles.badge} ${new Date(ev.date) >= new Date() ? styles.badgeGreen : styles.badgeBlue}`}>
                    {new Date(ev.date).toLocaleDateString()}
                  </span>
                </td>
                <td>{ev.description || '—'}</td>
                <td>
                  <button className={styles.actionBtn} onClick={() => openEdit(ev)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
                <textarea rows={3} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
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
    </div>
  )
}
