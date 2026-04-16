import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface Member {
  id: string; first_name: string; last_name: string; preferred_name: string
  email: string; phone: string; cell_phone: string; address: string
  city: string; state: string; zip: string; birthday: string | null
  join_date: string | null; joined_by: string; status: string; notes: string
  photo_url: string; family_id: string | null; created_at: string
}

const EMPTY = {
  first_name: '', last_name: '', preferred_name: '', email: '', phone: '', cell_phone: '',
  address: '', city: '', state: '', zip: '', birthday: '', join_date: '',
  joined_by: '', status: 'Active', notes: '', photo_url: '', family_id: null as string | null,
}

const STATUS_OPTIONS = ['Active', 'Inactive', 'Visitor', 'Deceased', 'Transferred']
const JOINED_BY_OPTIONS = ['', 'Baptism', 'Transfer', 'Profession of Faith', 'Restoration', 'Other']

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Active')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [viewing, setViewing] = useState<Member | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    try {
      const data = await api.get<Member[]>('/members')
      setMembers(data)
      // Refresh viewing member if open
      if (viewing) {
        const updated = data.find(m => m.id === viewing.id)
        if (updated) setViewing(updated)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed') }
    finally { setIsLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const filtered = members.filter(m => {
    const matchSearch = `${m.first_name} ${m.last_name} ${m.preferred_name} ${m.email} ${m.phone}`.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' || m.status === statusFilter
    return matchSearch && matchStatus
  })

  const openAdd = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (m: Member) => {
    setEditing(m)
    setForm({
      first_name: m.first_name, last_name: m.last_name, preferred_name: m.preferred_name || '',
      email: m.email || '', phone: m.phone || '', cell_phone: m.cell_phone || '',
      address: m.address || '', city: m.city || '', state: m.state || '', zip: m.zip || '',
      birthday: m.birthday || '', join_date: m.join_date || '', joined_by: m.joined_by || '',
      status: m.status || 'Active', notes: m.notes || '', photo_url: m.photo_url || '',
      family_id: m.family_id,
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = { ...form, birthday: form.birthday || null, join_date: form.join_date || null }
      if (editing) { await api.put(`/members/${editing.id}`, data) }
      else { await api.post('/members', data) }
      setShowModal(false); await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this member?')) return
    await api.delete(`/members/${id}`).catch(e => setError(e.message))
    if (viewing?.id === id) setViewing(null)
    await load()
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, memberId: string) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const res = await api.post<{ photo_url: string }>(`/members/${memberId}/photo`, {
          member_id: memberId, photo_base64: reader.result as string, filename: file.name,
        })
        // Update viewing and form
        if (viewing?.id === memberId) setViewing(v => v ? { ...v, photo_url: res.photo_url } : v)
        setForm(p => ({ ...p, photo_url: res.photo_url }))
        await load()
      } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed') }
      finally { setUploading(false) }
    }
    reader.readAsDataURL(file)
  }

  const formatAddress = (m: Member) => {
    const parts = [m.address, m.city && m.state ? `${m.city}, ${m.state}` : m.city || m.state, m.zip].filter(Boolean)
    return parts.join(' ') || ''
  }

  const InfoRow = ({ label, value }: { label: string; value: string }) => (
    value ? (
      <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--color-border)' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4, minWidth: 100, flexShrink: 0 }}>{label}</span>
        <span style={{ fontSize: 14, color: 'var(--color-text)' }}>{value}</span>
      </div>
    ) : null
  )

  return (
    <div>
      <h1 className={styles.pageTitle}>Members</h1>
      {error && <p className={styles.error}>{error}</p>}

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Member List */}
        <div style={{ flex: viewing ? '0 0 55%' : '1' }}>
          <div className={styles.tableWrap}>
            <div className={styles.toolbar}>
              <input className={styles.searchInput} placeholder="Search members…" value={search} onChange={e => setSearch(e.target.value)} />
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ border: '1.5px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}>
                <option value="All">All Statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
              <button className={styles.addBtn} onClick={openAdd}>+ Add Member</button>
            </div>
            <table>
              <thead>
                <tr><th>Name</th><th>Phone</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={4} className={styles.emptyState}>{isLoading ? 'Loading…' : 'No members found'}</td></tr>
                ) : filtered.map(m => (
                  <tr key={m.id} style={{ background: viewing?.id === m.id ? 'rgba(0,102,204,0.05)' : undefined, cursor: 'pointer' }}
                    onClick={() => setViewing(m)}>
                    <td style={{ fontWeight: 500 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {m.photo_url ? (
                          <img src={m.photo_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                            {(m.first_name[0] || '').toUpperCase()}
                          </div>
                        )}
                        {m.preferred_name || m.first_name} {m.last_name}
                      </div>
                    </td>
                    <td>{m.phone || m.cell_phone || '—'}</td>
                    <td>
                      <span className={`${styles.badge} ${m.status === 'Active' ? styles.badgeGreen : styles.badgeBlue}`}>{m.status}</span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className={styles.editBtn} onClick={() => openEdit(m)}>Edit</button>
                      <button className={styles.deleteBtn} onClick={() => handleDelete(m.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Member Profile Panel */}
        {viewing && (
          <div style={{ flex: '0 0 42%', background: 'var(--color-white)', borderRadius: 12, padding: '28px 24px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', alignSelf: 'flex-start', position: 'sticky', top: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {viewing.photo_url ? (
                  <img src={viewing.photo_url} alt="" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700 }}>
                    {(viewing.first_name[0] || '').toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                    {viewing.preferred_name || viewing.first_name} {viewing.last_name}
                  </h2>
                  {viewing.preferred_name && (
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      Legal: {viewing.first_name} {viewing.last_name}
                    </div>
                  )}
                  <span className={`${styles.badge} ${viewing.status === 'Active' ? styles.badgeGreen : styles.badgeBlue}`} style={{ marginTop: 4 }}>
                    {viewing.status}
                  </span>
                </div>
              </div>
              <button onClick={() => setViewing(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999', padding: '0 4px' }}>x</button>
            </div>

            {/* Photo upload */}
            <label className={styles.secondaryBtn} style={{ cursor: 'pointer', display: 'inline-block', marginBottom: 16, fontSize: 12 }}>
              {uploading ? 'Uploading…' : 'Upload Photo'}
              <input type="file" accept="image/*" onChange={e => handlePhotoUpload(e, viewing.id)} style={{ display: 'none' }} disabled={uploading} />
            </label>

            {/* Contact Info */}
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Contact</h3>
              <InfoRow label="Email" value={viewing.email} />
              <InfoRow label="Phone" value={viewing.phone} />
              <InfoRow label="Cell" value={viewing.cell_phone} />
              <InfoRow label="Address" value={formatAddress(viewing)} />
            </div>

            {/* Personal Info */}
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Personal</h3>
              <InfoRow label="Birthday" value={viewing.birthday || ''} />
              <InfoRow label="Join Date" value={viewing.join_date || ''} />
              <InfoRow label="Joined By" value={viewing.joined_by} />
            </div>

            {/* Notes */}
            {viewing.notes && (
              <div>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Notes</h3>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--color-text-secondary)', background: 'var(--color-bg)', borderRadius: 8, padding: '10px 14px' }}>{viewing.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
              <button className={styles.editBtn} onClick={() => openEdit(viewing)}>Edit Member</button>
              <button className={styles.deleteBtn} onClick={() => handleDelete(viewing.id)}>Delete</button>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 640 }}>
            <h2 className={styles.modalTitle}>{editing ? 'Edit Member' : 'Add Member'}</h2>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label>First Name *</label>
                <input value={form.first_name} onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Last Name *</label>
                <input value={form.last_name} onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Preferred Name</label>
                <input value={form.preferred_name} onChange={e => setForm(p => ({ ...p, preferred_name: e.target.value }))} placeholder="Nickname or goes-by name" />
              </div>
              <div className={styles.field}>
                <label>Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label>Email</label>
                <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Phone</label>
                <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Cell Phone</label>
                <input value={form.cell_phone} onChange={e => setForm(p => ({ ...p, cell_phone: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Birthday</label>
                <input type="date" value={form.birthday} onChange={e => setForm(p => ({ ...p, birthday: e.target.value }))} />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Address</label>
                <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>City</label>
                <input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>State</label>
                <input value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Zip</label>
                <input value={form.zip} onChange={e => setForm(p => ({ ...p, zip: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Join Date</label>
                <input type="date" value={form.join_date} onChange={e => setForm(p => ({ ...p, join_date: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Joined By</label>
                <select value={form.joined_by} onChange={e => setForm(p => ({ ...p, joined_by: e.target.value }))}>
                  {JOINED_BY_OPTIONS.map(j => <option key={j} value={j}>{j || '— Select —'}</option>)}
                </select>
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} style={{ resize: 'vertical' }} />
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
