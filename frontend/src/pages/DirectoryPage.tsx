import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface DirectoryMember {
  id: string; first_name: string; last_name: string; preferred_name: string
  phone: string; cell_phone: string; email: string; address: string
  city: string; state: string; zip: string; status: string; photo_url: string
  role_tags: string[]
}

interface ChurchInfo { name?: string; logo_url?: string }

const ROLE_TAG_OPTIONS = [
  'Bible Study Leader', 'Volunteer', 'Staff', 'Deacon', 'Elder',
  'Worship Team', 'Youth Leader', 'Small Group Leader', 'Greeter', 'Usher',
]

export default function DirectoryPage() {
  const [members, setMembers] = useState<DirectoryMember[]>([])
  const [church, setChurch] = useState<ChurchInfo>({})
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [showPhotos, setShowPhotos] = useState(true)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api.get<DirectoryMember[]>('/directory')
      .then(setMembers)
      .catch(e => setError(e instanceof Error ? e.message : 'Load failed'))
      .finally(() => setIsLoading(false))
    api.get<ChurchInfo>('/settings').then(setChurch).catch(() => {})
  }, [])

  const filtered = members.filter(m => {
    const matchSearch = `${m.first_name} ${m.last_name} ${m.preferred_name} ${m.email} ${m.phone}`.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'All' || (m.role_tags || []).includes(roleFilter)
    return matchSearch && matchRole
  })

  const formatAddress = (m: DirectoryMember) => {
    const parts = [m.address, m.city && m.state ? `${m.city}, ${m.state}` : m.city || m.state, m.zip].filter(Boolean)
    return parts.join(' ') || ''
  }

  const handlePrint = () => {
    document.body.classList.add('printing-directory')
    window.print()
    document.body.classList.remove('printing-directory')
  }

  return (
    <div>
      {/* Screen-only controls */}
      <div className="no-print">
        {error && <p className={styles.error}>{error}</p>}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className={styles.searchInput} placeholder="Search directory…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} style={{ border: '1.5px solid var(--color-border)', borderRadius: 8, padding: '8px 12px', fontSize: 14 }}>
            <option value="All">All Roles</option>
            {ROLE_TAG_OPTIONS.map(r => <option key={r}>{r}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={showPhotos} onChange={e => setShowPhotos(e.target.checked)} />
            Include Photos
          </label>
          <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>{filtered.length} members</span>
          <button className={styles.addBtn} onClick={handlePrint}>Print Directory</button>
        </div>
      </div>

      {/* Directory header — shown on screen AND print. Church logo replaces ShepherdsCore branding. */}
      <div className="directory-header" style={{ textAlign: 'center', marginBottom: 24 }}>
        {church.logo_url ? (
          <img src={church.logo_url} alt={church.name || 'Church'} style={{ maxWidth: 140, maxHeight: 140, objectFit: 'contain', marginBottom: 10 }} />
        ) : (
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }} className="no-print">
            Tip: upload your church logo in <strong>Settings</strong> to brand this directory.
          </p>
        )}
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>
          {church.name ? `${church.name} — Member Directory` : 'Church Member Directory'}
        </h1>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>Printed {new Date().toLocaleDateString()}</p>
      </div>

      {/* Directory content — prints clean */}
      <div className={styles.tableWrap} id="directory-content">
        <table>
          <thead>
            <tr>
              {showPhotos && <th style={{ width: 50 }}></th>}
              <th>Name</th><th>Phone</th><th>Email</th><th>Address</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={showPhotos ? 5 : 4} className={styles.emptyState}>{isLoading ? 'Loading…' : 'No members found'}</td></tr>
            ) : filtered.map(m => (
              <tr key={m.id}>
                {showPhotos && (
                  <td>
                    {m.photo_url ? (
                      <img src={m.photo_url} alt="" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>
                        {(m.first_name[0] || '').toUpperCase()}
                      </div>
                    )}
                  </td>
                )}
                <td style={{ fontWeight: 600 }}>{m.last_name}, {m.preferred_name || m.first_name}</td>
                <td>{m.phone || m.cell_phone || '—'}</td>
                <td>{m.email || '—'}</td>
                <td style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{formatAddress(m) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Print-specific CSS */}
      <style>{`
        @media print {
          .no-print, nav, aside, .sidebar, header, footer,
          button, [class*="sidebar"], [class*="nav"], [class*="userFooter"],
          [class*="signOutBtn"], [class*="shell"] > aside {
            display: none !important;
          }
          .print-only { display: block !important; }
          body, html { background: #fff !important; }
          [class*="shell"] { display: block !important; }
          [class*="content"] { padding: 0 !important; margin: 0 !important; overflow: visible !important; }
          main { padding: 0 !important; }
          table { font-size: 11px !important; }
          td, th { padding: 6px 10px !important; }
          td img { width: 28px !important; height: 28px !important; }
          .directory-header img { max-width: 120px !important; max-height: 120px !important; width: auto !important; height: auto !important; }
          @page { margin: 0.5in; }
        }
      `}</style>
    </div>
  )
}
