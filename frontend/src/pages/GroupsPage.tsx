import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import StatCard from '../components/StatCard'
import styles from './PageShared.module.css'

interface Group {
  id: string
  name: string
  description: string
  location: string
  member_count?: number
  created_at: string
}

interface Member { id: string; first_name: string; last_name: string }

const EMPTY = { name: '', description: '', location: '' }

export default function GroupsPage() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<Group[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [membersGroup, setMembersGroup] = useState<Group | null>(null)
  const [groupMemberIds, setGroupMemberIds] = useState<Set<string>>(new Set())
  const [membersLoading, setMembersLoading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const load = async () => {
    try {
      const [grps, mems] = await Promise.all([
        api.get<Group[]>('/groups'),
        api.get<Member[]>('/members'),
      ])
      setGroups(grps)
      setMembers(mems)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (g: Group) => {
    setEditing(g)
    setForm({ name: g.name, description: g.description, location: g.location || '' })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
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

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/groups/${id}`)
      setDeleteConfirm(null)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const openMembers = async (g: Group) => {
    setMembersGroup(g)
    setMembersLoading(true)
    try {
      const ids = await api.get<string[]>(`/groups/${g.id}/members`)
      setGroupMemberIds(new Set(ids))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load group members')
      setMembersGroup(null)
    } finally {
      setMembersLoading(false)
    }
  }

  const toggleMember = async (memberId: string) => {
    if (!membersGroup) return
    const inGroup = groupMemberIds.has(memberId)
    try {
      if (inGroup) {
        await api.delete(`/groups/${membersGroup.id}/members/${memberId}`)
        setGroupMemberIds(prev => { const s = new Set(prev); s.delete(memberId); return s })
      } else {
        await api.post(`/groups/${membersGroup.id}/members`, { member_id: memberId })
        setGroupMemberIds(prev => new Set([...prev, memberId]))
      }
      // update local count
      setGroups(prev => prev.map(g =>
        g.id === membersGroup.id
          ? { ...g, member_count: inGroup ? (g.member_count ?? 1) - 1 : (g.member_count ?? 0) + 1 }
          : g
      ))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update member')
    }
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Groups</h1>
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.statsGrid}>
        <StatCard label="Total Groups" value={groups.length} icon="group" color="#8B5CF6" />
      </div>
      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>{groups.length} Group{groups.length !== 1 ? 's' : ''}</span>
          <button className={styles.addBtn} onClick={openAdd}>+ Add Group</button>
        </div>
        <table>
          <thead>
            <tr><th>Group Name</th><th>Description</th><th>Location</th><th>Members</th><th></th></tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr><td colSpan={5} className={styles.emptyState}>{isLoading ? 'Loading…' : 'No groups yet'}</td></tr>
            ) : groups.map(g => (
              <tr key={g.id}>
                <td style={{ fontWeight: 600 }}>{g.name}</td>
                <td>{g.description || '—'}</td>
                <td>{g.location || '—'}</td>
                <td>
                  <button className={styles.editBtn} onClick={() => openMembers(g)}>
                    {g.member_count ?? 0} member{(g.member_count ?? 0) !== 1 ? 's' : ''} — Manage
                  </button>
                </td>
                <td>
                  <button className={styles.editBtn} onClick={() => navigate(`/email?group=${g.id}`)}>Email</button>
                  <button className={styles.editBtn} onClick={() => openEdit(g)}>Edit</button>
                  <button className={styles.deleteBtn} onClick={() => setDeleteConfirm(g.id)}>Delete</button>
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
            <h2 className={styles.modalTitle}>{editing ? 'Edit Group' : 'Add Group'}</h2>
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Group Name</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Location</label>
                <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Where the group meets" />
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
            <h2 className={styles.modalTitle}>Delete Group?</h2>
            <p style={{ marginBottom: 24, color: '#555' }}>
              This group and all its memberships will be permanently deleted.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className={styles.deleteBtn} onClick={() => handleDelete(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Members Modal */}
      {membersGroup && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 600 }}>
            <h2 className={styles.modalTitle}>Members — {membersGroup.name}</h2>
            {membersLoading ? (
              <p style={{ color: '#888', textAlign: 'center', padding: 32 }}>Loading…</p>
            ) : (
              <>
                <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
                  {groupMemberIds.size} member{groupMemberIds.size !== 1 ? 's' : ''} in this group
                </p>
                <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {[...members].sort((a, b) => a.last_name.localeCompare(b.last_name)).map(m => (
                    <label key={m.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderRadius: 8, cursor: 'pointer',
                      background: groupMemberIds.has(m.id) ? 'rgba(139,92,246,0.08)' : 'transparent',
                    }}>
                      <input
                        type="checkbox"
                        checked={groupMemberIds.has(m.id)}
                        onChange={() => toggleMember(m.id)}
                        style={{ width: 16, height: 16 }}
                      />
                      <span style={{ fontWeight: 500 }}>{m.last_name}, {m.first_name}</span>
                      {groupMemberIds.has(m.id) && (
                        <span className={`${styles.badge} ${styles.badgeBlue}`} style={{ marginLeft: 'auto' }}>Member</span>
                      )}
                    </label>
                  ))}
                </div>
              </>
            )}
            <div className={styles.modalActions}>
              <button className={styles.saveBtn} onClick={() => setMembersGroup(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
