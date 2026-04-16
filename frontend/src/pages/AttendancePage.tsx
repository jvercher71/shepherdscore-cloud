import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface AttendanceRecord {
  id: string; service_type: string; date: string
  headcount: number; notes: string; event_id: string | null
}

const SERVICE_TYPES = ['Sunday Service', 'Wednesday Service', 'Bible Study', 'Youth Event', 'Special Event', 'Other']
const EMPTY = { service_type: 'Sunday Service', date: new Date().toISOString().slice(0, 10), headcount: '', notes: '', event_id: null as string | null }

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const load = async () => {
    try { setRecords(await api.get<AttendanceRecord[]>('/attendance')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Load failed') }
    finally { setIsLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const openAdd = () => { setEditId(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (r: AttendanceRecord) => {
    setEditId(r.id)
    setForm({ service_type: r.service_type, date: r.date.slice(0, 10), headcount: String(r.headcount), notes: r.notes || '', event_id: r.event_id })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      const payload = { ...form, headcount: parseInt(form.headcount as string) || 0 }
      if (editId) { await api.put(`/attendance/${editId}`, payload) }
      else { await api.post('/attendance', payload) }
      setShowModal(false); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this attendance record?')) return
    await api.delete(`/attendance/${id}`).catch(e => setError(e.message)); await load()
  }

  const totalThisMonth = records.filter(r => r.date.startsWith(new Date().toISOString().slice(0, 7))).reduce((s, r) => s + r.headcount, 0)
  const avgHeadcount = records.length > 0 ? Math.round(records.reduce((s, r) => s + r.headcount, 0) / records.length) : 0

  return (
    <div>
      <h1 className={styles.pageTitle}>Attendance</h1>
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#0066CC' }}>{records.length}</div>
          <div className={styles.statLabel}>Total Records</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#22C55E' }}>{totalThisMonth}</div>
          <div className={styles.statLabel}>This Month (Total)</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#F59E0B' }}>{avgHeadcount}</div>
          <div className={styles.statLabel}>Avg Headcount</div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Attendance Records</span>
          <button className={styles.addBtn} onClick={openAdd}>+ Record Attendance</button>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Service Type</th><th>Headcount</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={5} className={styles.emptyState}>{isLoading ? 'Loading…' : 'No attendance records yet'}</td></tr>
            ) : records.map(r => (
              <tr key={r.id}>
                <td>{new Date(r.date + 'T12:00:00').toLocaleDateString()}</td>
                <td><span className={`${styles.badge} ${styles.badgeBlue}`}>{r.service_type}</span></td>
                <td style={{ fontWeight: 700, fontSize: 16 }}>{r.headcount}</td>
                <td>{r.notes || '—'}</td>
                <td>
                  <button className={styles.editBtn} onClick={() => openEdit(r)}>Edit</button>
                  <button className={styles.deleteBtn} onClick={() => handleDelete(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>{editId ? 'Edit Attendance' : 'Record Attendance'}</h2>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Service Type</label>
                <select value={form.service_type} onChange={e => setForm(p => ({ ...p, service_type: e.target.value }))}>
                  {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Headcount</label>
                <input type="number" min="0" value={form.headcount} onChange={e => setForm(p => ({ ...p, headcount: e.target.value }))} placeholder="0" />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
