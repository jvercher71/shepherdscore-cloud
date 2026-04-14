import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface Family {
  id: string
  family_name: string
  address: string
  phone: string
  email: string
  notes: string
  created_at: string
  member_count?: number
}

const EMPTY = { family_name: '', address: '', phone: '', email: '', notes: '' }

export default function FamiliesPage() {
  const [families, setFamilies] = useState<Family[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const data = await api.get<Family[]>('/families')
      setFamilies(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setIsLoading(false)
    }
  }
  useEffect(() => { void load() }, [])

  const filtered = families.filter(f =>
    f.family_name.toLowerCase().includes(search.toLowerCase())
  )

  const handleAdd = async () => {
    setSaving(true)
    try {
      await api.post('/families', form)
      setShowModal(false)
      setForm(EMPTY)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Families</h1>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <input className={styles.searchInput} placeholder="Search families…"
            value={search} onChange={e => setSearch(e.target.value)} />
          <button className={styles.addBtn} onClick={() => { setForm(EMPTY); setShowModal(true) }}>+ Add Family</button>
        </div>
        <table>
          <thead><tr><th>Family Name</th><th>Phone</th><th>Email</th><th>Members</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {filtered.length === 0
              ? <tr><td colSpan={6} className={styles.emptyState}>{isLoading ? 'Loading…' : 'No families found'}</td></tr>
              : filtered.map(f => (
                <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/families/${f.id}`)}>
                  <td><strong>{f.family_name}</strong></td>
                  <td>{f.phone || '—'}</td>
                  <td>{f.email || '—'}</td>
                  <td>{f.member_count ?? 0}</td>
                  <td>{new Date(f.created_at).toLocaleDateString()}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className={styles.actionBtn} onClick={() => navigate(`/families/${f.id}`)}>View</button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Add Family</h2>
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Family Name</label>
                <input value={form.family_name} onChange={e => setForm(p => ({ ...p, family_name: e.target.value }))} />
              </div>
              <div className={styles.field}><label>Phone</label>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} /></div>
              <div className={styles.field}><label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              <div className={`${styles.field} ${styles.fieldFull}`}><label>Address</label>
                <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} /></div>
              <div className={`${styles.field} ${styles.fieldFull}`}><label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} /></div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleAdd} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
