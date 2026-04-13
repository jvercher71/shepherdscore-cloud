import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface GivingRecord {
  id: string
  member_id: string | null
  member_name?: string
  amount: number
  category: string
  date: string
  notes: string
  created_at: string
}

interface Member { id: string; first_name: string; last_name: string }

const CATEGORIES = ['Tithe', 'General Offering', 'Missions', 'Building Fund', 'Youth Ministry', 'Food Pantry', 'Special Event', 'Other']

const EMPTY = { member_id: '', amount: '', category: 'Tithe', date: new Date().toISOString().slice(0, 10), notes: '' }

export default function GivingPage() {
  const [records, setRecords] = useState<GivingRecord[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const [g, m] = await Promise.all([api.get<GivingRecord[]>('/giving'), api.get<Member[]>('/members')])
    setRecords(g)
    setMembers(m)
  }
  useEffect(() => { load().catch(e => setError(e.message)) }, [])

  const totalMonth = records
    .filter(r => r.date.slice(0, 7) === new Date().toISOString().slice(0, 7))
    .reduce((s, r) => s + r.amount, 0)

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.post('/giving', { ...form, amount: parseFloat(form.amount) || 0, member_id: form.member_id || null })
      setShowModal(false)
      setForm(EMPTY)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const memberName = (id: string | null) => {
    if (!id) return 'Anonymous'
    const m = members.find(m => m.id === id)
    return m ? `${m.first_name} ${m.last_name}` : '—'
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Giving</h1>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#22C55E' }}>${totalMonth.toLocaleString()}</div>
          <div className={styles.statLabel}>Giving This Month</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#0066CC' }}>{records.length}</div>
          <div className={styles.statLabel}>Total Transactions</div>
        </div>
      </div>
      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>All Records</span>
          <button className={styles.addBtn} onClick={() => setShowModal(true)}>+ Record Giving</button>
        </div>
        <table>
          <thead>
            <tr><th>Date</th><th>Member</th><th>Category</th><th>Amount</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr><td colSpan={5} className={styles.emptyState}>No giving records yet</td></tr>
            ) : records.map(r => (
              <tr key={r.id}>
                <td>{new Date(r.date).toLocaleDateString()}</td>
                <td>{memberName(r.member_id)}</td>
                <td><span className={`${styles.badge} ${styles.badgeBlue}`}>{r.category}</span></td>
                <td style={{ fontWeight: 600, color: '#22C55E' }}>${r.amount.toFixed(2)}</td>
                <td>{r.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Record Giving</h2>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Member (optional)</label>
                <select value={form.member_id} onChange={e => setForm(p => ({ ...p, member_id: e.target.value }))}>
                  <option value="">Anonymous</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Amount ($)</label>
                <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Category</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
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
