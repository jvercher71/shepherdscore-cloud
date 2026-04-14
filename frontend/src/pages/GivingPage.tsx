import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface GivingRecord {
  id: string
  member_id: string | null
  amount: number
  category: string
  date: string
  notes: string
  created_at: string
}

interface Member { id: string; first_name: string; last_name: string }

const CATEGORIES = [
  'Tithe', 'General Offering', 'Missions', 'Building Fund',
  'Youth Ministry', 'Food Pantry', 'Special Event', 'Other'
]

const EMPTY_FORM = {
  member_id: '', amount: '', category: 'Tithe',
  date: new Date().toISOString().slice(0, 10), notes: ''
}

export default function GivingPage() {
  const [records, setRecords] = useState<GivingRecord[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))

  const load = async () => {
    const [g, m] = await Promise.all([
      api.get<GivingRecord[]>('/giving'),
      api.get<Member[]>('/members'),
    ])
    setRecords(g)
    setMembers(m)
  }

  useEffect(() => { load().catch(e => setError(e.message)) }, [])

  const filtered = filterMonth
    ? records.filter(r => r.date.slice(0, 7) === filterMonth)
    : records

  const totalFiltered = filtered.reduce((s, r) => s + r.amount, 0)
  const totalAll = records.reduce((s, r) => s + r.amount, 0)

  const memberName = (id: string | null) => {
    if (!id) return 'Anonymous'
    const m = members.find(m => m.id === id)
    return m ? `${m.first_name} ${m.last_name}` : '—'
  }

  const openAdd = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM })
    setShowModal(true)
  }

  const openEdit = (r: GivingRecord) => {
    setEditId(r.id)
    setForm({
      member_id: r.member_id ?? '',
      amount: String(r.amount),
      category: r.category,
      date: r.date.slice(0, 10),
      notes: r.notes ?? '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const payload = {
        ...form,
        amount: parseFloat(form.amount) || 0,
        member_id: form.member_id || null,
      }
      if (editId) {
        await api.put(`/giving/${editId}`, payload)
      } else {
        await api.post('/giving', payload)
      }
      setShowModal(false)
      setForm({ ...EMPTY_FORM })
      setEditId(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/giving/${id}`)
      setDeleteConfirm(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Giving</h1>
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#22C55E' }}>
            ${totalFiltered.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className={styles.statLabel}>
            {filterMonth ? `Giving — ${new Date(filterMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })}` : 'Total Giving'}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: '#0066CC' }}>{filtered.length}</div>
          <div className={styles.statLabel}>Transactions</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>${totalAll.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
          <div className={styles.statLabel}>All-Time Total</div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Giving Records</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input
              type="month"
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #ddd', fontSize: 14 }}
            />
            <button className={styles.secondaryBtn} onClick={() => setFilterMonth('')}>All Time</button>
            <button className={styles.addBtn} onClick={openAdd}>+ Record Giving</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Member</th><th>Category</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Notes</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className={styles.emptyState}>No giving records found</td></tr>
            ) : filtered.map(r => (
              <tr key={r.id}>
                <td>{new Date(r.date + 'T12:00:00').toLocaleDateString()}</td>
                <td>{memberName(r.member_id)}</td>
                <td><span className={`${styles.badge} ${styles.badgeBlue}`}>{r.category}</span></td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#22C55E' }}>
                  ${r.amount.toFixed(2)}
                </td>
                <td>{r.notes || '—'}</td>
                <td>
                  <button className={styles.editBtn} onClick={() => openEdit(r)}>Edit</button>
                  <button className={styles.deleteBtn} onClick={() => setDeleteConfirm(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>{editId ? 'Edit Giving Record' : 'Record Giving'}</h2>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Member (optional)</label>
                <select value={form.member_id} onChange={e => setForm(p => ({ ...p, member_id: e.target.value }))}>
                  <option value="">Anonymous</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.first_name} {m.last_name}</option>
                  ))}
                </select>
              </div>
              <div className={styles.field}>
                <label>Amount ($)</label>
                <input type="number" min="0" step="0.01" value={form.amount}
                  onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
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
              <button className={styles.cancelBtn} onClick={() => { setShowModal(false); setEditId(null) }}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 400 }}>
            <h2 className={styles.modalTitle}>Delete Record?</h2>
            <p style={{ marginBottom: 24, color: '#555' }}>This giving record will be permanently deleted.</p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className={styles.deleteBtn} onClick={() => handleDelete(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
