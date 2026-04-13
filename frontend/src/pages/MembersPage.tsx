import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface Member {
  id: string
  first_name: string
  last_name: string
  email: string
  phone: string
  address: string
  created_at: string
}

const EMPTY: Omit<Member, 'id' | 'created_at'> = {
  first_name: '', last_name: '', email: '', phone: '', address: '',
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<Member[]>('/members').then(setMembers).catch(e => setError(e.message))
  useEffect(() => { void load() }, [])

  const filtered = members.filter(m =>
    `${m.first_name} ${m.last_name} ${m.email}`.toLowerCase().includes(search.toLowerCase())
  )

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (m: Member) => { setEditing(m); setForm({ first_name: m.first_name, last_name: m.last_name, email: m.email, phone: m.phone, address: m.address }); setShowModal(true) }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/members/${editing.id}`, form)
      } else {
        await api.post('/members', form)
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
    if (!confirm('Delete this member?')) return
    await api.delete(`/members/${id}`).catch(e => setError(e.message))
    await load()
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Members</h1>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <input
            className={styles.searchInput}
            placeholder="Search members…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className={styles.addBtn} onClick={openAdd}>+ Add Member</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Added</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className={styles.emptyState}>No members found</td></tr>
            ) : filtered.map(m => (
              <tr key={m.id}>
                <td>{m.first_name} {m.last_name}</td>
                <td>{m.email || '—'}</td>
                <td>{m.phone || '—'}</td>
                <td>{new Date(m.created_at).toLocaleDateString()}</td>
                <td>
                  <button className={styles.actionBtn} onClick={() => openEdit(m)}>Edit</button>{' '}
                  <button className={styles.actionBtn} onClick={() => handleDelete(m.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>{editing ? 'Edit Member' : 'Add Member'}</h2>
            <div className={styles.formGrid}>
              {(['first_name', 'last_name'] as const).map(f => (
                <div className={styles.field} key={f}>
                  <label>{f === 'first_name' ? 'First Name' : 'Last Name'}</label>
                  <input value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} />
                </div>
              ))}
              <div className={styles.field}>
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Phone</label>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Address</label>
                <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
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
