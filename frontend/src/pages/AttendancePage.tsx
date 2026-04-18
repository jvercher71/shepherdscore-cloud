import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface AttendanceRecord {
  id: string; service_type: string; date: string
  headcount: number; notes: string; event_id: string | null
}

const SERVICE_TYPES = ['Sunday Service', 'Wednesday Service', 'Bible Study', 'Youth Event', 'Special Event', 'Other']
const EMPTY = { service_type: 'Sunday Service', date: new Date().toISOString().slice(0, 10), headcount: '', notes: '', event_id: null as string | null }

const TYPE_COLORS: Record<string, string> = {
  'Sunday Service': '#0066CC',
  'Wednesday Service': '#8B5CF6',
  'Bible Study': '#EC4899',
  'Youth Event': '#F59E0B',
  'Special Event': '#14B8A6',
  'Other': '#6B7280',
}

export default function AttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [filterType, setFilterType] = useState('All')
  const [viewing, setViewing] = useState<AttendanceRecord | null>(null)

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

  // Current month
  const currentMonth = new Date().toISOString().slice(0, 7)
  const thisMonthRecords = records.filter(r => r.date.startsWith(currentMonth))

  // Per service type stats
  const serviceTypes = [...new Set(records.map(r => r.service_type))].sort()

  const typeStats = serviceTypes.map(type => {
    const all = records.filter(r => r.service_type === type)
    const month = thisMonthRecords.filter(r => r.service_type === type)
    const monthTotal = month.reduce((s, r) => s + r.headcount, 0)
    const avg = all.length > 0 ? Math.round(all.reduce((s, r) => s + r.headcount, 0) / all.length) : 0
    return { type, count: all.length, monthTotal, monthCount: month.length, avg }
  })

  // Filtered records
  const filtered = filterType === 'All' ? records : records.filter(r => r.service_type === filterType)

  // Overall stats
  const overallMonthTotal = thisMonthRecords.reduce((s, r) => s + r.headcount, 0)
  const overallAvg = records.length > 0 ? Math.round(records.reduce((s, r) => s + r.headcount, 0) / records.length) : 0

  return (
    <div>
      <h1 className={styles.pageTitle}>Attendance</h1>
      {error && <p className={styles.error}>{error}</p>}

      {/* Overall Stats */}
      <div className={styles.statsGrid} style={{ marginBottom: 12 }}>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#0066CC' }}>{records.length}</div>
          <div className={styles.statLabel}>Total Records</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#22C55E' }}>{overallMonthTotal}</div>
          <div className={styles.statLabel}>This Month (All Services)</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#F59E0B' }}>{overallAvg}</div>
          <div className={styles.statLabel}>Overall Avg Headcount</div>
        </div>
      </div>

      {/* Per Service Type Breakdown */}
      {typeStats.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            By Service Type — This Month
          </h2>
          <div className={styles.statsGrid}>
            {typeStats.map(s => (
              <div key={s.type} className={styles.statCard} style={{ borderLeft: `4px solid ${TYPE_COLORS[s.type] || '#888'}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: TYPE_COLORS[s.type] || '#888', marginBottom: 8 }}>
                  {s.type}
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)' }}>{s.monthTotal}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>This Month ({s.monthCount})</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-text)' }}>{s.avg}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>Avg Headcount</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Records Table */}
      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Attendance Records</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              style={{ border: '1.5px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}>
              <option value="All">All Service Types</option>
              {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
            </select>
            <button className={styles.addBtn} onClick={openAdd}>+ Record Attendance</button>
          </div>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Service Type</th><th>Headcount</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className={styles.emptyState}>{isLoading ? 'Loading…' : 'No attendance records yet'}</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id} onClick={() => setViewing(r)} style={{ cursor: 'pointer' }}>
                <td>{new Date(r.date + 'T12:00:00').toLocaleDateString()}</td>
                <td>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                    fontSize: 11, fontWeight: 700,
                    background: `${TYPE_COLORS[r.service_type] || '#888'}15`,
                    color: TYPE_COLORS[r.service_type] || '#888',
                  }}>
                    {r.service_type}
                  </span>
                </td>
                <td style={{ fontWeight: 700, fontSize: 16 }}>{r.headcount}</td>
                <td>{r.notes || '—'}</td>
                <td onClick={e => e.stopPropagation()}>
                  <button className={styles.editBtn} onClick={() => openEdit(r)}>Edit</button>
                  <button className={styles.deleteBtn} onClick={() => handleDelete(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Detail View Modal */}
      {viewing && (
        <div className={styles.modalOverlay} onClick={() => setViewing(null)}>
          <div className={styles.modal} style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Attendance Record</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Date</span>
                <span style={{ fontSize: 14 }}>{new Date(viewing.date + 'T12:00:00').toLocaleDateString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Service</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: TYPE_COLORS[viewing.service_type] || '#888' }}>{viewing.service_type}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Headcount</span>
                <span style={{ fontSize: 20, fontWeight: 800 }}>{viewing.headcount}</span>
              </div>
              {viewing.notes && (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Notes</div>
                  <div style={{ fontSize: 14, lineHeight: 1.6 }}>{viewing.notes}</div>
                </div>
              )}
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setViewing(null)}>Close</button>
              <button className={styles.editBtn} onClick={() => { openEdit(viewing); setViewing(null) }}>Edit</button>
              <button className={styles.deleteBtn} onClick={() => { setViewing(null); handleDelete(viewing.id) }}>Delete</button>
            </div>
          </div>
        </div>
      )}

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
