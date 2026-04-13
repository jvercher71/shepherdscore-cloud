import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface Group {
  id: string
  name: string
  description: string
  member_count?: number
  created_at: string
}

const EMPTY = { name: '', description: '' }

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = () => api.get<Group[]>('/groups').then(setGroups).catch(e => setError(e.message))
  useEffect(() => { void load() }, [])

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (g: Group) => { setEditing(g); setForm({ name: g.name, description: g.description }); setShowModal(true) }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (editing) {
        await api.put(`/groups/${editing.id}`, form)
      } else {
        await api.post('/groups', form)
      }
      setShowModal(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Groups</h1>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{groups.length} Groups</span>
          <button className={styles.addBtn} onClick={openAdd}>+ Add Group</button>
        </div>
        <table>
          <thead>
            <tr><th>Group Name</th><th>Description</th><th>Members</th><th></th></tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr><td colSpan={4} className={styles.emptyState}>No groups yet</td></tr>
            ) : groups.map(g => (
              <tr key={g.id}>
                <td style={{ fontWeight: 600 }}>{g.name}</td>
                <td>{g.description || '—'}</td>
                <td><span className={`${styles.badge} ${styles.badgeBlue}`}>{g.member_count ?? 0}</span></td>
                <td><button className={styles.actionBtn} onClick={() => openEdit(g)}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>{editing ? 'Edit Group' : 'Add Group'}</h2>
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Group Name</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
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
