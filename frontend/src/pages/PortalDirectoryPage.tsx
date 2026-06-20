import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './PageShared.module.css'

interface OptedInMember {
  id: string
  first_name: string
  last_name: string
  preferred_name?: string
  phone?: string
  cell_phone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  zip?: string
  photo_url?: string
}

export default function PortalDirectoryPage() {
  const navigate = useNavigate()
  const [directory, setDirectory] = useState<OptedInMember[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('shepherdscore_portal_token')
    if (!token) {
      navigate('/portal/login')
      return
    }

    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    fetch(`${API_BASE}/portal/directory`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load directory')
        return res.json()
      })
      .then(data => {
        setDirectory(data)
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [navigate])

  const filteredDirectory = directory.filter(m => {
    const nameStr = `${m.first_name} ${m.last_name} ${m.preferred_name || ''}`.toLowerCase()
    return nameStr.includes(search.toLowerCase())
  })

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>Loading directory…</div>

  return (
    <div>
      <h1 className={styles.pageTitle}>Church Directory</h1>
      {error && <p className={styles.error}>{error}</p>}

      {/* Toolbar / Search */}
      <div className={styles.toolbar} style={{ background: 'var(--color-white)', borderRadius: 12, marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <input 
          type="text" 
          placeholder="Search directory by name..."
          className={styles.searchInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%' }}
        />
      </div>

      {filteredDirectory.length === 0 ? (
        <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: 48, textAlign: 'center', color: 'var(--color-text-secondary)', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {search ? 'No matching members found.' : 'No members have opted into the directory yet.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {filteredDirectory.map(m => {
            const displayName = m.preferred_name 
              ? `${m.preferred_name} ${m.last_name}`
              : `${m.first_name} ${m.last_name}`
              
            return (
              <div 
                key={m.id}
                style={{ 
                  background: 'var(--color-white)', 
                  borderRadius: 12, 
                  padding: 20, 
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  display: 'flex',
                  gap: 16,
                  alignItems: 'flex-start'
                }}
              >
                {m.photo_url ? (
                  <img 
                    src={m.photo_url} 
                    alt={displayName} 
                    style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--color-border)' }} 
                  />
                ) : (
                  <div 
                    style={{ 
                      width: 64, 
                      height: 64, 
                      borderRadius: '50%', 
                      background: 'var(--color-bg)', 
                      color: 'var(--color-text-secondary)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontWeight: 'bold', 
                      fontSize: 20,
                      flexShrink: 0
                    }}
                  >
                    {m.first_name[0].toUpperCase()}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {displayName}
                  </h3>
                  
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                    {m.email && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📧 {m.email}</div>}
                    {m.cell_phone && <div>📱 {m.cell_phone}</div>}
                    {m.phone && !m.cell_phone && <div>📞 {m.phone}</div>}
                    {m.address && (
                      <div style={{ marginTop: 4, fontSize: 11, lineHeight: 1.4 }}>
                        📍 {m.address}<br />
                        {m.city ? `${m.city}, ` : ''}{m.state} {m.zip}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
