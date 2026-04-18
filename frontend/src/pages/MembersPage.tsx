import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface Member {
  id: string; first_name: string; last_name: string; preferred_name: string
  email: string; phone: string; cell_phone: string; address: string
  city: string; state: string; zip: string; birthday: string | null
  join_date: string | null; joined_by: string; status: string; notes: string
  photo_url: string; family_id: string | null; role_tags: string[]; created_at: string
}

interface Family {
  id: string; family_name: string; address: string; phone: string
  email: string; notes: string; created_at: string; member_count?: number
}

const EMPTY = {
  first_name: '', last_name: '', preferred_name: '', email: '', phone: '', cell_phone: '',
  address: '', city: '', state: '', zip: '', birthday: '', join_date: '',
  joined_by: '', status: 'Active', notes: '', photo_url: '', family_id: null as string | null,
  role_tags: [] as string[],
}

const EMPTY_FAMILY = { family_name: '', address: '', phone: '', email: '', notes: '' }

const STATUS_OPTIONS = ['Active', 'Inactive', 'Visitor', 'Deceased', 'Transferred']
const JOINED_BY_OPTIONS = ['', 'Baptism', 'Transfer', 'Profession of Faith', 'Restoration', 'Other']
const ROLE_TAG_OPTIONS = [
  'Bible Study Leader', 'Volunteer', 'Staff', 'Deacon', 'Elder',
  'Worship Team', 'Youth Leader', 'Small Group Leader', 'Greeter', 'Usher',
]

const memberInitials = (m: { first_name: string; last_name: string; preferred_name?: string }) => {
  const f = (m.preferred_name || m.first_name || '').trim()
  const l = (m.last_name || '').trim()
  return `${f[0] || ''}${l[0] || ''}`.toUpperCase() || '?'
}

export default function MembersPage() {
  const navigate = useNavigate()
  const [members, setMembers] = useState<Member[]>([])
  const [families, setFamilies] = useState<Family[]>([])
  const [view, setView] = useState<'list' | 'families' | 'directory'>('list')
  const [expandedFamilyId, setExpandedFamilyId] = useState<string | null>(null)
  const [showFamilyModal, setShowFamilyModal] = useState(false)
  const [familyForm, setFamilyForm] = useState(EMPTY_FAMILY)
  const [savingFamily, setSavingFamily] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('Active')
  const [roleFilter, setRoleFilter] = useState('All')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<Member | null>(null)
  const [viewing, setViewing] = useState<Member | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [importResult, setImportResult] = useState<{ message: string; errors: string[] } | null>(null)
  const [importing, setImporting] = useState(false)

  const load = async () => {
    try {
      const [mems, fams] = await Promise.all([
        api.get<Member[]>('/members'),
        api.get<Family[]>('/families').catch(() => [] as Family[]),
      ])
      setMembers(mems)
      setFamilies(fams)
      if (viewing) {
        const updated = mems.find(m => m.id === viewing.id)
        if (updated) setViewing(updated)
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Load failed') }
    finally { setIsLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const handleAddFamily = async () => {
    if (!familyForm.family_name.trim()) { setError('Family name is required'); return }
    setSavingFamily(true); setError('')
    try {
      await api.post('/families', familyForm)
      setShowFamilyModal(false)
      setFamilyForm(EMPTY_FAMILY)
      await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save family failed') }
    finally { setSavingFamily(false) }
  }

  const filtered = members.filter(m => {
    const matchSearch = `${m.first_name} ${m.last_name} ${m.preferred_name} ${m.email} ${m.phone}`.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'All' || m.status === statusFilter
    const matchRole = roleFilter === 'All' || (m.role_tags || []).includes(roleFilter)
    return matchSearch && matchStatus && matchRole
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
      family_id: m.family_id, role_tags: m.role_tags || [],
    })
    setShowModal(true)
  }

  const toggleFormTag = (tag: string) => {
    setForm(p => ({
      ...p,
      role_tags: p.role_tags.includes(tag)
        ? p.role_tags.filter(t => t !== tag)
        : [...p.role_tags, tag],
    }))
  }

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First name and last name are required'); return
    }
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
    if (file.size > 5 * 1024 * 1024) { setError('Image must be less than 5MB'); return }
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

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setCsvText(reader.result as string)
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (!csvText.trim()) { setError('No CSV data'); return }
    setImporting(true); setError(''); setImportResult(null)
    try {
      const res = await api.post<{ message: string; imported: number; skipped: number; errors: string[] }>('/members/import-csv', { csv_text: csvText })
      setImportResult({ message: res.message, errors: res.errors || [] })
      if (res.imported > 0) await load()
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed') }
    finally { setImporting(false) }
  }

  const handleExport = async () => {
    try {
      const res = await api.get<{ csv: string; count: number }>('/members/export-csv')
      if (!res.csv) { setError('No members to export'); return }
      const blob = new Blob([res.csv], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `members-export-${new Date().toISOString().slice(0, 10)}.csv`
      a.click(); URL.revokeObjectURL(url)
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed') }
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

  // Families view: group members by family_id using the current filters
  const filteredFamilies = families.filter(f =>
    !search.trim() || f.family_name.toLowerCase().includes(search.toLowerCase())
  )
  const membersByFamily = (fid: string) => filtered.filter(m => m.family_id === fid)
  const unfamilied = filtered.filter(m => !m.family_id)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
        <h1 className={styles.pageTitle} style={{ marginBottom: 0 }}>Members</h1>
        <div style={{ display: 'inline-flex', border: '1.5px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
          {(['list', 'families', 'directory'] as const).map(v => {
            const active = view === v
            const label = v === 'list' ? 'List' : v === 'families' ? 'Families' : 'Directory'
            return (
              <button
                key={v}
                onClick={() => { setView(v); setViewing(null) }}
                style={{
                  background: active ? 'var(--color-accent)' : 'transparent',
                  color: active ? '#fff' : 'var(--color-text)',
                  border: 'none', padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
      {error && <p className={styles.error}>{error}</p>}

      {/* Shared toolbar */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <input className={styles.searchInput} placeholder={view === 'families' ? 'Search families…' : 'Search members…'} value={search} onChange={e => setSearch(e.target.value)} style={{ minWidth: 220 }} />
        {view !== 'families' && (
          <>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ border: '1.5px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}>
              <option value="All">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ border: '1.5px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}>
              <option value="All">All Roles</option>
              {ROLE_TAG_OPTIONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </>
        )}
        <div style={{ flex: 1 }} />
        {view === 'families' && (
          <button className={styles.addBtn} onClick={() => { setFamilyForm(EMPTY_FAMILY); setShowFamilyModal(true) }}>+ Add Family</button>
        )}
        {view !== 'families' && (
          <>
            <button className={styles.secondaryBtn} onClick={() => setShowImport(true)}>Import CSV</button>
            <button className={styles.secondaryBtn} onClick={handleExport}>Export CSV</button>
            {view === 'directory' && (
              <button className={styles.secondaryBtn} onClick={() => window.print()}>Print Directory</button>
            )}
            <button className={styles.addBtn} onClick={openAdd}>+ Add Member</button>
          </>
        )}
      </div>

      {/* ==================== LIST VIEW ==================== */}
      {view === 'list' && (
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* Member List */}
        <div style={{ flex: viewing ? '0 0 55%' : '1' }}>
          <div className={styles.tableWrap}>
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

            {/* Roles & Ministries */}
            {viewing.role_tags && viewing.role_tags.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Roles &amp; Ministries</h3>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {viewing.role_tags.map(t => (
                    <span key={t} className={`${styles.badge} ${styles.badgeBlue}`}>{t}</span>
                  ))}
                </div>
              </div>
            )}

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
      )}

      {/* ==================== FAMILIES VIEW ==================== */}
      {view === 'families' && (
        <div className={styles.tableWrap}>
          {filteredFamilies.length === 0 && unfamilied.length === 0 ? (
            <div className={styles.emptyState} style={{ padding: 40 }}>
              {isLoading ? 'Loading…' : 'No families yet. Click "+ Add Family" to create one.'}
            </div>
          ) : (
            <div>
              {filteredFamilies.map(f => {
                const mems = membersByFamily(f.id)
                const expanded = expandedFamilyId === f.id
                return (
                  <div key={f.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <div
                      onClick={() => setExpandedFamilyId(expanded ? null : f.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer', background: expanded ? 'rgba(0,102,204,0.03)' : 'transparent' }}
                    >
                      <span style={{ fontSize: 14, color: 'var(--color-text-secondary)', width: 14 }}>{expanded ? '▾' : '▸'}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{f.family_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                          {[f.phone, f.email, f.address].filter(Boolean).join(' · ') || 'No contact info'}
                        </div>
                      </div>
                      <span className={`${styles.badge} ${styles.badgeBlue}`}>{mems.length} member{mems.length !== 1 ? 's' : ''}</span>
                      <button
                        className={styles.editBtn}
                        onClick={e => { e.stopPropagation(); navigate(`/families/${f.id}`) }}
                      >
                        Open
                      </button>
                    </div>
                    {expanded && (
                      <div style={{ background: 'var(--color-bg)', padding: '8px 18px 16px 46px' }}>
                        {mems.length === 0 ? (
                          <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', padding: '12px 0' }}>
                            No members linked to this family yet.
                          </p>
                        ) : (
                          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {mems.map(m => (
                              <li
                                key={m.id}
                                onClick={() => { setView('list'); setViewing(m) }}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--color-white)', borderRadius: 8, cursor: 'pointer' }}
                              >
                                {m.photo_url ? (
                                  <img src={m.photo_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                                ) : (
                                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                    {memberInitials(m)}
                                  </div>
                                )}
                                <span style={{ fontWeight: 500, flex: 1 }}>{m.preferred_name || m.first_name} {m.last_name}</span>
                                <span className={`${styles.badge} ${m.status === 'Active' ? styles.badgeGreen : styles.badgeBlue}`}>{m.status}</span>
                                {m.role_tags && m.role_tags.length > 0 && (
                                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{m.role_tags.slice(0, 2).join(', ')}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
              {unfamilied.length > 0 && (
                <div style={{ borderTop: '2px solid var(--color-border)' }}>
                  <div style={{ padding: '14px 18px', fontSize: 12, fontWeight: 700, letterSpacing: 0.6, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
                    Members Without a Family ({unfamilied.length})
                  </div>
                  <ul style={{ listStyle: 'none', padding: '0 18px 18px', margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {unfamilied.map(m => (
                      <li
                        key={m.id}
                        onClick={() => { setView('list'); setViewing(m) }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--color-bg)', borderRadius: 8, cursor: 'pointer' }}
                      >
                        {m.photo_url ? (
                          <img src={m.photo_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                            {memberInitials(m)}
                          </div>
                        )}
                        <span style={{ fontWeight: 500, flex: 1 }}>{m.preferred_name || m.first_name} {m.last_name}</span>
                        <span className={`${styles.badge} ${m.status === 'Active' ? styles.badgeGreen : styles.badgeBlue}`}>{m.status}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================== DIRECTORY VIEW ==================== */}
      {view === 'directory' && (
        <div>
          {filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 40 }}>
              {isLoading ? 'Loading…' : 'No members found'}
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {filtered.map(m => {
                const phone = m.cell_phone || m.phone
                const displayName = `${m.preferred_name || m.first_name} ${m.last_name}`.trim()
                return (
                  <div key={m.id} style={{
                    background: 'var(--color-white)', borderRadius: 16, padding: '20px 16px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  }}>
                    {m.photo_url ? (
                      <img src={m.photo_url} alt="" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: 96, height: 96, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #4FC3F7 0%, #29B6F6 50%, #0288D1 100%)',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 36, fontWeight: 700, letterSpacing: 0.5,
                        boxShadow: '0 2px 8px rgba(2,136,209,0.25)',
                      }}>
                        {memberInitials(m)}
                      </div>
                    )}
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{displayName}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                        {(m.status || 'ACTIVE').toUpperCase()}
                      </div>
                      {m.role_tags && m.role_tags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center', marginTop: 6 }}>
                          {m.role_tags.slice(0, 2).map(t => (
                            <span key={t} className={`${styles.badge} ${styles.badgeBlue}`} style={{ fontSize: 9 }}>{t}</span>
                          ))}
                          {m.role_tags.length > 2 && (
                            <span className={styles.badge} style={{ fontSize: 9 }}>+{m.role_tags.length - 2}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, width: '100%', marginTop: 4 }}>
                      {m.email
                        ? <a href={`mailto:${m.email}`} style={{ flex: 1, textAlign: 'center', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', textDecoration: 'none' }}>✉ Email</a>
                        : <button disabled style={{ flex: 1, padding: '8px 10px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: '#bbb' }}>✉ Email</button>}
                      {phone
                        ? <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`} style={{ flex: 1, textAlign: 'center', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, padding: '8px 10px', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', textDecoration: 'none' }}>☎ Call</a>
                        : <button disabled style={{ flex: 1, padding: '8px 10px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: '#bbb' }}>☎ Call</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Add Family Modal */}
      {showFamilyModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h2 className={styles.modalTitle}>Add Family</h2>
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Family Name</label>
                <input value={familyForm.family_name} onChange={e => setFamilyForm(p => ({ ...p, family_name: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Phone</label>
                <input value={familyForm.phone} onChange={e => setFamilyForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className={styles.field}>
                <label>Email</label>
                <input type="email" value={familyForm.email} onChange={e => setFamilyForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Address</label>
                <input value={familyForm.address} onChange={e => setFamilyForm(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label>Notes</label>
                <textarea value={familyForm.notes} onChange={e => setFamilyForm(p => ({ ...p, notes: e.target.value }))} rows={3} />
              </div>
            </div>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setShowFamilyModal(false)}>Cancel</button>
              <button className={styles.saveBtn} onClick={handleAddFamily} disabled={savingFamily}>{savingFamily ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

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
                <label>Roles &amp; Ministries</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {ROLE_TAG_OPTIONS.map(tag => {
                    const active = form.role_tags.includes(tag)
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => toggleFormTag(tag)}
                        style={{
                          border: `1.5px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                          background: active ? 'var(--color-accent)' : 'transparent',
                          color: active ? '#fff' : 'var(--color-text)',
                          borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {tag}
                      </button>
                    )
                  })}
                </div>
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

      {/* CSV Import Modal */}
      {showImport && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 580 }}>
            <h2 className={styles.modalTitle}>Import Members from CSV</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 16 }}>
              Upload a CSV file with a header row. Required columns: <strong>first_name</strong>, <strong>last_name</strong>.
              Optional: preferred_name, email, phone, cell_phone, address, city, state, zip, birthday, join_date, joined_by, status, notes.
            </p>
            <div className={styles.field} style={{ marginBottom: 16 }}>
              <label>CSV File</label>
              <input type="file" accept=".csv,text/csv" onChange={handleCsvUpload} />
            </div>
            {csvText && (
              <div style={{ background: 'var(--color-bg)', borderRadius: 8, padding: '10px 14px', fontSize: 12, maxHeight: 120, overflow: 'auto', marginBottom: 16, fontFamily: 'monospace', whiteSpace: 'pre', color: 'var(--color-text-secondary)' }}>
                {csvText.slice(0, 500)}{csvText.length > 500 ? '…' : ''}
              </div>
            )}
            {importResult && (
              <div style={{ background: importResult.errors.length ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)', borderRadius: 8, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
                <strong>{importResult.message}</strong>
                {importResult.errors.length > 0 && (
                  <ul style={{ margin: '8px 0 0 16px', fontSize: 12, color: '#999' }}>
                    {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => { setShowImport(false); setCsvText(''); setImportResult(null) }}>Close</button>
              <button className={styles.saveBtn} onClick={handleImport} disabled={importing || !csvText}>
                {importing ? 'Importing…' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
