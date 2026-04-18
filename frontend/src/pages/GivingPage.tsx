import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import StatCard from '../components/StatCard'
import styles from './PageShared.module.css'

interface GivingRecord {
  id: string; member_id: string | null; amount: number
  category: string; date: string; method: string; notes: string; created_at: string
}
interface Member { id: string; first_name: string; last_name: string; preferred_name: string }

const DEFAULT_CATEGORIES = ['Tithe', 'General Offering', 'Missions', 'Building Fund', 'Youth Ministry', 'Food Pantry', 'Special Event', 'Other']
const METHODS = ['', 'Cash', 'Check', 'Online/EFT', 'Credit Card', 'Other']

interface Split { category: string; amount: string }

export default function GivingPage() {
  const [records, setRecords] = useState<GivingRecord[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ member_id: '', amount: '', category: 'Tithe', method: '', date: new Date().toISOString().slice(0, 10), notes: '' })
  const [splits, setSplits] = useState<Split[]>([])
  const [useSplit, setUseSplit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [viewing, setViewing] = useState<GivingRecord | null>(null)
  const [filterMonth, setFilterMonth] = useState(new Date().toISOString().slice(0, 7))
  const [rangePreset, setRangePreset] = useState<'today' | 'week' | 'month' | 'year' | 'all' | 'custom'>('month')
  const [showCatModal, setShowCatModal] = useState(false)
  const [newCat, setNewCat] = useState('')

  const load = async () => {
    const [g, m] = await Promise.all([
      api.get<GivingRecord[]>('/giving'),
      api.get<Member[]>('/members'),
    ])
    setRecords(g); setMembers(m)
    // Load custom categories
    try {
      const cats = await api.get<string[]>('/categories')
      if (cats.length > 0) setCategories(cats)
    } catch { /* use defaults */ }
  }
  useEffect(() => { load().catch(e => setError(e.message)) }, [])

  // Preset date ranges (inclusive). null bound => open-ended.
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const weekStart = (() => {
    const d = new Date(now)
    d.setDate(d.getDate() - d.getDay()) // Sunday as start of week
    return d.toISOString().slice(0, 10)
  })()
  const yearStart = `${now.getFullYear()}-01-01`
  let rangeStart: string | null = null
  let rangeEnd: string | null = todayStr
  let rangeLabel = ''
  if (rangePreset === 'today') { rangeStart = todayStr; rangeLabel = 'Today' }
  else if (rangePreset === 'week') { rangeStart = weekStart; rangeLabel = 'This Week' }
  else if (rangePreset === 'month' && filterMonth) {
    rangeStart = `${filterMonth}-01`
    // last day of the month
    const [y, m] = filterMonth.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    rangeEnd = `${filterMonth}-${String(last).padStart(2, '0')}`
    rangeLabel = new Date(filterMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })
  } else if (rangePreset === 'year') { rangeStart = yearStart; rangeLabel = String(now.getFullYear()) }
  else if (rangePreset === 'all') { rangeStart = null; rangeEnd = null; rangeLabel = 'All Time' }
  else if (rangePreset === 'custom' && filterMonth) {
    rangeStart = `${filterMonth}-01`
    const [y, m] = filterMonth.split('-').map(Number)
    const last = new Date(y, m, 0).getDate()
    rangeEnd = `${filterMonth}-${String(last).padStart(2, '0')}`
    rangeLabel = new Date(filterMonth + '-02').toLocaleString('default', { month: 'long', year: 'numeric' })
  }

  const inRange = (date: string) => {
    if (rangeStart && date < rangeStart) return false
    if (rangeEnd && date > rangeEnd) return false
    return true
  }

  const filtered = records.filter(r => inRange(r.date))
  const totalFiltered = filtered.reduce((s, r) => s + r.amount, 0)
  const totalAll = records.reduce((s, r) => s + r.amount, 0)

  // Daily totals for the treasurer
  const today = new Date().toISOString().slice(0, 10)
  const todayRecords = records.filter(r => r.date === today)
  const todayTotal = todayRecords.reduce((s, r) => s + r.amount, 0)

  // Group filtered records by date for daily subtotals
  const dailyTotals: Record<string, number> = {}
  for (const r of filtered) {
    dailyTotals[r.date] = (dailyTotals[r.date] || 0) + r.amount
  }

  const memberName = (id: string | null) => {
    if (!id) return 'Anonymous'
    const m = members.find(m => m.id === id)
    return m ? `${m.preferred_name || m.first_name} ${m.last_name}` : '—'
  }

  const openAdd = () => {
    setEditId(null); setUseSplit(false); setSplits([])
    setForm({ member_id: '', amount: '', category: 'Tithe', method: '', date: new Date().toISOString().slice(0, 10), notes: '' })
    setShowModal(true)
  }
  const openEdit = (r: GivingRecord) => {
    setEditId(r.id); setUseSplit(false); setSplits([])
    setForm({ member_id: r.member_id ?? '', amount: String(r.amount), category: r.category, method: r.method ?? '', date: r.date.slice(0, 10), notes: r.notes ?? '' })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      if (useSplit && splits.length > 0 && !editId) {
        // Create separate giving records for each split
        for (const s of splits) {
          const amt = parseFloat(s.amount) || 0
          if (amt <= 0) continue
          await api.post('/giving', {
            member_id: form.member_id || null, amount: amt, category: s.category,
            method: form.method, date: form.date, notes: form.notes,
          })
        }
      } else {
        const payload = { ...form, amount: parseFloat(form.amount) || 0, member_id: form.member_id || null }
        if (editId) { await api.put(`/giving/${editId}`, payload) }
        else { await api.post('/giving', payload) }
      }
      setShowModal(false); setEditId(null); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    await api.delete(`/giving/${id}`).catch(e => setError(e.message))
    setDeleteConfirm(null); await load()
  }

  const addSplit = () => setSplits(p => [...p, { category: categories[0] || 'Tithe', amount: '' }])
  const removeSplit = (i: number) => setSplits(p => p.filter((_, idx) => idx !== i))
  const updateSplit = (i: number, field: keyof Split, val: string) =>
    setSplits(p => p.map((s, idx) => idx === i ? { ...s, [field]: val } : s))
  const splitTotal = splits.reduce((s, sp) => s + (parseFloat(sp.amount) || 0), 0)

  const addCategory = async () => {
    if (!newCat.trim()) return
    try {
      await api.post('/categories', { name: newCat.trim() })
      setCategories(p => [...p, newCat.trim()].sort())
      setNewCat('')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
  }
  const removeCategory = async (name: string) => {
    await api.delete(`/categories/${encodeURIComponent(name)}`).catch(e => setError(e.message))
    setCategories(p => p.filter(c => c !== name))
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Giving</h1>
      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.statsGrid}>
        <StatCard
          label={`Today's Total (${todayRecords.length} records)`}
          value={`$${todayTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          icon="dollar" color="#F59E0B"
        />
        <StatCard
          label={rangeLabel || 'Total Giving'}
          value={`$${totalFiltered.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          icon="heart" color="#22C55E"
        />
        <StatCard label="Transactions" value={filtered.length} icon="clipboard" color="#0066CC" />
        <StatCard
          label="All-Time Total"
          value={`$${totalAll.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          icon="trending-up" color="#8B5CF6"
        />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {([
          ['today', 'Today'],
          ['week', 'This Week'],
          ['month', 'This Month'],
          ['year', 'This Year'],
          ['all', 'All Time'],
        ] as const).map(([key, label]) => {
          const active = rangePreset === key
          return (
            <button
              key={key}
              onClick={() => {
                setRangePreset(key)
                if (key === 'month') setFilterMonth(new Date().toISOString().slice(0, 7))
              }}
              style={{
                border: `1.5px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: active ? 'var(--color-accent)' : 'transparent',
                color: active ? '#fff' : 'var(--color-text)',
                borderRadius: 999, padding: '6px 14px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
        <input
          type="month"
          value={filterMonth}
          onChange={e => { setFilterMonth(e.target.value); setRangePreset('custom') }}
          style={{ padding: '6px 10px', borderRadius: 999, border: '1.5px solid var(--color-border)', fontSize: 13 }}
        />
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Giving Records</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className={styles.secondaryBtn} onClick={() => setShowCatModal(true)}>Manage Categories</button>
            <button className={styles.addBtn} onClick={openAdd}>+ Record Giving</button>
          </div>
        </div>
        <table>
          <thead><tr><th>Date</th><th>Member</th><th>Category</th><th>Method</th><th style={{ textAlign: 'right' }}>Amount</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className={styles.emptyState}>No giving records found</td></tr>
            ) : (() => {
              const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date))
              const rows: React.ReactNode[] = []
              let lastDate = ''
              for (const r of sorted) {
                if (r.date !== lastDate) {
                  if (lastDate && dailyTotals[lastDate]) {
                    rows.push(
                      <tr key={`total-${lastDate}`} style={{ background: 'rgba(245,158,11,0.06)' }}>
                        <td colSpan={4} style={{ fontWeight: 700, fontSize: 12, color: '#F59E0B', textAlign: 'right' }}>
                          Day Total:
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#F59E0B' }}>${dailyTotals[lastDate].toFixed(2)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    )
                  }
                  lastDate = r.date
                }
                rows.push(
                  <tr key={r.id} onClick={() => setViewing(r)} style={{ cursor: 'pointer' }}>
                    <td>{new Date(r.date + 'T12:00:00').toLocaleDateString()}</td>
                    <td>{memberName(r.member_id)}</td>
                    <td><span className={`${styles.badge} ${styles.badgeBlue}`}>{r.category}</span></td>
                    <td>{r.method || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#22C55E' }}>${r.amount.toFixed(2)}</td>
                    <td>{r.notes || '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className={styles.editBtn} onClick={() => openEdit(r)}>Edit</button>
                      <button className={styles.deleteBtn} onClick={() => setDeleteConfirm(r.id)}>Delete</button>
                    </td>
                  </tr>
                )
              }
              // Final day total
              if (lastDate && dailyTotals[lastDate]) {
                rows.push(
                  <tr key={`total-${lastDate}`} style={{ background: 'rgba(245,158,11,0.06)' }}>
                    <td colSpan={4} style={{ fontWeight: 700, fontSize: 12, color: '#F59E0B', textAlign: 'right' }}>
                      Day Total:
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: '#F59E0B' }}>${dailyTotals[lastDate].toFixed(2)}</td>
                    <td colSpan={2}></td>
                  </tr>
                )
              }
              return rows
            })()}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 580 }}>
            <h2 className={styles.modalTitle}>{editId ? 'Edit Giving Record' : 'Record Giving'}</h2>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Member (optional)</label>
                <select value={form.member_id} onChange={e => setForm(p => ({ ...p, member_id: e.target.value }))}>
                  <option value="">Anonymous</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.preferred_name || m.first_name} {m.last_name}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Method</label>
                <select value={form.method} onChange={e => setForm(p => ({ ...p, method: e.target.value }))}>
                  {METHODS.map(m => <option key={m} value={m}>{m || '— Select —'}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              {!editId && (
                <div className={styles.field}>
                  <label>&nbsp;</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, textTransform: 'none', letterSpacing: 0, color: 'var(--color-accent)' }}>
                    <input type="checkbox" checked={useSplit} onChange={e => { setUseSplit(e.target.checked); if (e.target.checked && splits.length === 0) addSplit() }} />
                    Split across categories
                  </label>
                </div>
              )}
            </div>

            {!useSplit && (
              <div className={styles.formGrid} style={{ marginTop: 14 }}>
                <div className={styles.field}>
                  <label>Amount ($)</label>
                  <input type="number" min="0" step="0.01" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className={styles.field}>
                  <label>Category</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                    {categories.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}

            {useSplit && (
              <div style={{ marginTop: 14, padding: '16px', background: 'var(--color-bg)', borderRadius: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Split Breakdown</label>
                  <button className={styles.secondaryBtn} onClick={addSplit} style={{ fontSize: 12, padding: '4px 10px' }}>+ Add Split</button>
                </div>
                {splits.map((s, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                    <select value={s.category} onChange={e => updateSplit(i, 'category', e.target.value)} style={{ flex: 1, padding: '8px 10px', borderRadius: 6, border: '1.5px solid var(--color-border)', fontSize: 13 }}>
                      {categories.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <input type="number" min="0" step="0.01" value={s.amount} onChange={e => updateSplit(i, 'amount', e.target.value)} placeholder="$0.00" style={{ width: 100, padding: '8px 10px', borderRadius: 6, border: '1.5px solid var(--color-border)', fontSize: 13 }} />
                    <button onClick={() => removeSplit(i)} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 16, fontWeight: 700 }}>x</button>
                  </div>
                ))}
                <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: '#22C55E', marginTop: 8 }}>Total: ${splitTotal.toFixed(2)}</div>
              </div>
            )}

            <div className={`${styles.field} ${styles.fieldFull}`} style={{ marginTop: 14 }}>
              <label>Notes</label>
              <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => { setShowModal(false); setEditId(null) }}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {showCatModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 420 }}>
            <h2 className={styles.modalTitle}>Manage Giving Categories</h2>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="New category name" onKeyDown={e => e.key === 'Enter' && addCategory()} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--color-border)', fontSize: 14 }} />
              <button className={styles.addBtn} onClick={addCategory}>Add</button>
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {categories.map(c => (
                <div key={c} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: 14 }}>{c}</span>
                  <button className={styles.deleteBtn} onClick={() => removeCategory(c)} style={{ fontSize: 11 }}>Remove</button>
                </div>
              ))}
            </div>
            <div className={styles.modalActions}>
              <button className={styles.saveBtn} onClick={() => setShowCatModal(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail View Modal (opens on row click) */}
      {viewing && (
        <div className={styles.modalOverlay} onClick={() => setViewing(null)}>
          <div className={styles.modal} style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Giving Record</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Date</span>
                <span style={{ fontSize: 14 }}>{new Date(viewing.date + 'T12:00:00').toLocaleDateString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Member</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{memberName(viewing.member_id)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Amount</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: '#22C55E' }}>${viewing.amount.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Category</span>
                <span className={`${styles.badge} ${styles.badgeBlue}`}>{viewing.category}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Method</span>
                <span style={{ fontSize: 14 }}>{viewing.method || '—'}</span>
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
              <button className={styles.deleteBtn} onClick={() => { setDeleteConfirm(viewing.id); setViewing(null) }}>Delete</button>
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
