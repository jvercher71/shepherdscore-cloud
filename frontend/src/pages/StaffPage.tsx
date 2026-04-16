import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface StaffMember {
  id: string; email: string; display_name: string; role: string
  active: boolean; created_at: string; last_login: string | null
}

const ROLES = ['Admin', 'Staff', 'View-Only']
const ROLE_COLORS: Record<string, string> = {
  'Admin': '#F59E0B',
  'Staff': '#0066CC',
  'View-Only': '#6B7280',
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [myRole, setMyRole] = useState('')
  const [showInvite, setShowInvite] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', display_name: '', role: 'Staff' })
  const [editStaff, setEditStaff] = useState<StaffMember | null>(null)
  const [editForm, setEditForm] = useState({ display_name: '', role: '', active: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const load = async () => {
    try {
      // Ensure owner record exists
      await api.post('/staff/setup-owner', {})
      const [staffList, me] = await Promise.all([
        api.get<StaffMember[]>('/staff'),
        api.get<{ role: string }>('/staff/me'),
      ])
      setStaff(staffList)
      setMyRole(me.role)
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed') }
    finally { setIsLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const isAdmin = myRole === 'Admin'

  const handleInvite = async () => {
    if (!inviteForm.email.trim() || !inviteForm.display_name.trim()) {
      setError('Email and name are required'); return
    }
    setSaving(true); setError(''); setSuccess('')
    try {
      await api.post('/staff/invite', inviteForm)
      setShowInvite(false)
      setInviteForm({ email: '', display_name: '', role: 'Staff' })
      setSuccess(`${inviteForm.display_name} has been added as ${inviteForm.role}`)
      setTimeout(() => setSuccess(''), 4000)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Invite failed') }
    finally { setSaving(false) }
  }

  const openEdit = (s: StaffMember) => {
    setEditStaff(s)
    setEditForm({ display_name: s.display_name, role: s.role, active: s.active })
  }

  const handleUpdate = async () => {
    if (!editStaff) return
    setSaving(true); setError('')
    try {
      await api.put(`/staff/${editStaff.id}`, editForm)
      setEditStaff(null)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Update failed') }
    finally { setSaving(false) }
  }

  const handleRemove = async (id: string, name: string) => {
    if (!confirm(`Remove ${name} from staff?`)) return
    try {
      await api.delete(`/staff/${id}`)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Remove failed') }
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Staff & Users</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24, maxWidth: 640 }}>
        Manage who has access to your church's ShepherdsCore account. Admins can do everything,
        Staff can add/edit data, and View-Only users can only view.
      </p>

      {error && <p className={styles.error}>{error}</p>}
      {success && <p style={{ background: 'rgba(34,197,94,0.08)', color: '#16a34a', borderRadius: 8, padding: '12px 16px', fontSize: 14, marginBottom: 16 }}>{success}</p>}

      {/* Role Legend */}
      <div className={styles.statsGrid} style={{ marginBottom: 24 }}>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: ROLE_COLORS['Admin'], fontSize: 24 }}>
            {staff.filter(s => s.role === 'Admin' && s.active).length}
          </div>
          <div className={styles.statLabel}>Admins</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: ROLE_COLORS['Staff'], fontSize: 24 }}>
            {staff.filter(s => s.role === 'Staff' && s.active).length}
          </div>
          <div className={styles.statLabel}>Staff</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: ROLE_COLORS['View-Only'], fontSize: 24 }}>
            {staff.filter(s => s.role === 'View-Only' && s.active).length}
          </div>
          <div className={styles.statLabel}>View-Only</div>
        </div>
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <span style={{ fontWeight: 600, fontSize: 15 }}>Team Members</span>
          {isAdmin && <button className={styles.addBtn} onClick={() => setShowInvite(true)}>+ Add Staff</button>}
        </div>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Added</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {staff.length === 0 ? (
              <tr><td colSpan={isAdmin ? 6 : 5} className={styles.emptyState}>{isLoading ? 'Loading…' : 'No staff members'}</td></tr>
            ) : staff.map(s => (
              <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                <td style={{ fontWeight: 600 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: ROLE_COLORS[s.role] || '#888', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, flexShrink: 0,
                    }}>
                      {(s.display_name?.[0] || s.email[0]).toUpperCase()}
                    </div>
                    {s.display_name || s.email.split('@')[0]}
                  </div>
                </td>
                <td>{s.email}</td>
                <td>
                  <span style={{
                    display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                    fontSize: 11, fontWeight: 700,
                    background: `${ROLE_COLORS[s.role]}18`, color: ROLE_COLORS[s.role],
                  }}>
                    {s.role}
                  </span>
                </td>
                <td>
                  <span className={`${styles.badge} ${s.active ? styles.badgeGreen : ''}`}
                    style={!s.active ? { background: 'rgba(239,68,68,0.12)', color: '#DC2626' } : {}}>
                    {s.active ? 'Active' : 'Deactivated'}
                  </span>
                </td>
                <td>{new Date(s.created_at).toLocaleDateString()}</td>
                {isAdmin && (
                  <td>
                    <button className={styles.editBtn} onClick={() => openEdit(s)}>Edit</button>
                    <button className={styles.deleteBtn} onClick={() => handleRemove(s.id, s.display_name)}>Remove</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Permissions Reference */}
      <div style={{ marginTop: 32, background: 'var(--color-white)', borderRadius: 12, padding: '24px 28px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', maxWidth: 640 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 16 }}>Role Permissions</h3>
        <table style={{ fontSize: 13 }}>
          <thead><tr><th>Permission</th><th>Admin</th><th>Staff</th><th>View-Only</th></tr></thead>
          <tbody>
            {[
              ['View all data', true, true, true],
              ['Add/edit members, giving, events', true, true, false],
              ['Run reports & use AI features', true, true, true],
              ['Manage staff & invitations', true, false, false],
              ['Church settings & logo', true, false, false],
              ['Delete records', true, true, false],
            ].map(([perm, admin, staff, view], i) => (
              <tr key={i}>
                <td>{perm as string}</td>
                <td style={{ textAlign: 'center', color: admin ? '#22C55E' : '#DC2626' }}>{admin ? 'Yes' : '—'}</td>
                <td style={{ textAlign: 'center', color: staff ? '#22C55E' : '#DC2626' }}>{staff ? 'Yes' : '—'}</td>
                <td style={{ textAlign: 'center', color: view ? '#22C55E' : '#DC2626' }}>{view ? 'Yes' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Add Staff Member</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 16 }}>
              Add a team member by email. They'll need to create an account (if they haven't already) using this same email address.
            </p>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Display Name</label>
                <input value={inviteForm.display_name} onChange={e => setInviteForm(p => ({ ...p, display_name: e.target.value }))} placeholder="e.g., Pastor John" />
              </div>
              <div className={styles.field}>
                <label>Role</label>
                <select value={inviteForm.role} onChange={e => setInviteForm(p => ({ ...p, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Email Address</label>
                <input type="email" value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))} placeholder="staff@church.org" />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowInvite(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleInvite} disabled={saving}>{saving ? 'Adding…' : 'Add to Team'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editStaff && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Edit Staff — {editStaff.display_name}</h2>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>Display Name</label>
                <input value={editForm.display_name} onChange={e => setEditForm(p => ({ ...p, display_name: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Role</label>
                <select value={editForm.role} onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Status</label>
                <select value={editForm.active ? 'active' : 'deactivated'} onChange={e => setEditForm(p => ({ ...p, active: e.target.value === 'active' }))}>
                  <option value="active">Active</option>
                  <option value="deactivated">Deactivated</option>
                </select>
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setEditStaff(null)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleUpdate} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
