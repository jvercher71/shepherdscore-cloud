import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface Family { id: string; family_name: string; address: string; phone: string; email: string; notes: string }
interface Member { id: string; first_name: string; last_name: string; email: string; phone: string; family_id: string | null }

export default function FamilyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [allMembers, setAllMembers] = useState<Member[]>([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ family_name: '', address: '', phone: '', email: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    const [fam, all] = await Promise.all([
      api.get<Family>(`/families/${id}`),
      api.get<Member[]>('/members'),
    ])
    setFamily(fam)
    setForm({ family_name: fam.family_name, address: fam.address || '', phone: fam.phone || '', email: fam.email || '', notes: fam.notes || '' })
    setAllMembers(all)
    setMembers(all.filter(m => m.family_id === id))
  }

  useEffect(() => {
    load().catch(e => setError(e instanceof Error ? e.message : 'Failed to load family'))
  }, [id])

  const handleSave = async () => {
    setSaving(true)
    try { await api.put(`/families/${id}`, form); setEditing(false); await load() }
    catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!confirm('Delete this family? Members will be unlinked.')) return
    try {
      await api.delete(`/families/${id}`)
      navigate('/families')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const assignMember = async (memberId: string) => {
    try {
      await api.put(`/members/${memberId}`, { family_id: id })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign member')
    }
  }

  const removeMember = async (memberId: string) => {
    try {
      await api.put(`/members/${memberId}`, { family_id: null })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove member')
    }
  }

  if (!family) return <div style={{ padding: '2rem' }}>Loading…</div>

  const unassigned = allMembers.filter(m => !m.family_id)

  return (
    <div>
      <div className={styles.toolbar} style={{ marginBottom: '1rem' }}>
        <button className={styles.cancelBtn} onClick={() => navigate('/families')}>← Families</button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {editing
            ? <><button className={styles.cancelBtn} onClick={() => setEditing(false)}>Cancel</button>
                <button className={styles.saveBtn} onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></>
            : <><button className={styles.addBtn} onClick={() => setEditing(true)}>Edit</button>
                <button className={styles.actionBtn} style={{ color: 'red' }} onClick={handleDelete}>Delete</button></>}
        </div>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      <h1 className={styles.pageTitle}>{family.family_name}</h1>

      <div className={styles.tableWrap} style={{ marginBottom: '1.5rem' }}>
        <div className={styles.formGrid}>
          {(['family_name', 'phone', 'email', 'address'] as const).map(f => (
            <div className={styles.field} key={f}>
              <label style={{ textTransform: 'capitalize' }}>{f.replace('_', ' ')}</label>
              {editing
                ? <input value={form[f]} onChange={e => setForm(p => ({ ...p, [f]: e.target.value }))} />
                : <span>{(family as unknown as Record<string, string>)[f] || '—'}</span>}
            </div>
          ))}
          <div className={`${styles.field} ${styles.fieldFull}`}>
            <label>Notes</label>
            {editing ? <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              : <span>{family.notes || '—'}</span>}
          </div>
        </div>
      </div>

      <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Members ({members.length})</h2>
      <div className={styles.tableWrap} style={{ marginBottom: '1rem' }}>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th></th></tr></thead>
          <tbody>
            {members.length === 0
              ? <tr><td colSpan={4} className={styles.emptyState}>No members in this family</td></tr>
              : members.map(m => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 500 }}>{m.first_name} {m.last_name}</td>
                  <td>{m.email || '—'}</td>
                  <td>{m.phone || '—'}</td>
                  <td><button className={styles.actionBtn} onClick={() => removeMember(m.id)}>Remove</button></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {unassigned.length > 0 && (
        <details style={{ marginTop: '0.5rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.875rem', color: '#6b7280' }}>
            Add unassigned member ({unassigned.length} available)
          </summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
            {unassigned.map(m => (
              <button key={m.id} className={styles.actionBtn} onClick={() => assignMember(m.id)}>
                + {m.first_name} {m.last_name}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
