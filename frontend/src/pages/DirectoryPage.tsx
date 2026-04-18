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

const initials = (m: DirectoryMember) => {
  const first = (m.preferred_name || m.first_name || '').trim()
  const last = (m.last_name || '').trim()
  return `${first[0] || ''}${last[0] || ''}`.toUpperCase() || '?'
}

export default function DirectoryPage() {
  const [members, setMembers] = useState<DirectoryMember[]>([])
  const [church, setChurch] = useState<ChurchInfo>({})
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('All')
  const [view, setView] = useState<'cards' | 'list'>('cards')
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

  const Avatar = ({ m, size }: { m: DirectoryMember; size: number }) => (
    m.photo_url ? (
      <img src={m.photo_url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
    ) : (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'linear-gradient(135deg, #4FC3F7 0%, #29B6F6 50%, #0288D1 100%)',
        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.38, fontWeight: 700, letterSpacing: 0.5,
        boxShadow: '0 2px 8px rgba(2,136,209,0.25)',
      }}>
        {initials(m)}
      </div>
    )
  )

  const ActionBtn = ({ href, icon, label }: { href: string; icon: string; label: string }) => (
    <a
      href={href}
      onClick={e => e.stopPropagation()}
      style={{
        flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        background: 'var(--color-bg)', color: 'var(--color-text)', border: '1px solid var(--color-border)',
        borderRadius: 8, padding: '8px 10px', fontSize: 13, fontWeight: 600, textDecoration: 'none',
      }}
    >
      <span aria-hidden>{icon}</span> {label}
    </a>
  )

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
          <div style={{ display: 'inline-flex', border: '1.5px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['cards', 'list'] as const).map(v => {
              const active = view === v
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    background: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? '#fff' : 'var(--color-text)',
                    border: 'none', padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    textTransform: 'capitalize',
                  }}
                >
                  {v}
                </button>
              )
            })}
          </div>
          {view === 'list' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              <input type="checkbox" checked={showPhotos} onChange={e => setShowPhotos(e.target.checked)} />
              Include Photos
            </label>
          )}
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
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {view === 'cards' ? 'Church-wide photo directory.' : `Printed ${new Date().toLocaleDateString()}`}
        </p>
      </div>

      {/* CARD VIEW — on-screen default, per UI mockup */}
      {view === 'cards' && (
        <div className="no-print" id="directory-cards">
          {filtered.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: 40 }}>
              {isLoading ? 'Loading…' : 'No members found'}
            </p>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 16,
            }}>
              {filtered.map(m => {
                const phone = m.cell_phone || m.phone
                const displayName = `${m.preferred_name || m.first_name} ${m.last_name}`.trim()
                return (
                  <div key={m.id} style={{
                    background: 'var(--color-white)', borderRadius: 16, padding: '20px 16px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                  }}>
                    <Avatar m={m} size={96} />
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>{displayName}</div>
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
                        ? <ActionBtn href={`mailto:${m.email}`} icon="✉" label="Email" />
                        : <button disabled style={{ flex: 1, padding: '8px 10px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: '#bbb' }}>✉ Email</button>}
                      {phone
                        ? <ActionBtn href={`tel:${phone.replace(/[^0-9+]/g, '')}`} icon="☎" label="Call" />
                        : <button disabled style={{ flex: 1, padding: '8px 10px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: '#bbb' }}>☎ Call</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* LIST VIEW — kept for compact/print layout */}
      {view === 'list' && (
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
                    <td><Avatar m={m} size={36} /></td>
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
      )}

      {/* Print-specific CSS — always prints the table layout regardless of view */}
      {view === 'cards' && (
        <div className="print-only" style={{ display: 'none' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #333' }}>
                <th style={{ textAlign: 'left', padding: '6px 10px' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '6px 10px' }}>Phone</th>
                <th style={{ textAlign: 'left', padding: '6px 10px' }}>Email</th>
                <th style={{ textAlign: 'left', padding: '6px 10px' }}>Address</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(m => (
                <tr key={m.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '6px 10px', fontWeight: 600 }}>{m.last_name}, {m.preferred_name || m.first_name}</td>
                  <td style={{ padding: '6px 10px' }}>{m.phone || m.cell_phone || '—'}</td>
                  <td style={{ padding: '6px 10px' }}>{m.email || '—'}</td>
                  <td style={{ padding: '6px 10px' }}>{formatAddress(m) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        @media print {
          .no-print, nav, aside, .sidebar, header, footer,
          button, [class*="sidebar"], [class*="nav"], [class*="userFooter"],
          [class*="signOutBtn"], [class*="shell"] > aside {
            display: none !important;
          }
          .print-only { display: block !important; }
          #directory-cards { display: none !important; }
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
