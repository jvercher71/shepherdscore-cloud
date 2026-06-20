import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './PageShared.module.css'

interface Member {
  id: string
  first_name: string
  last_name: string
  preferred_name?: string
  email: string
  phone?: string
  cell_phone?: string
  address?: string
  photo_url?: string
}

interface FamilyMember {
  id: string
  first_name: string
  last_name: string
  preferred_name?: string
  photo_url?: string
}

export default function PortalDashboardPage() {
  const navigate = useNavigate()
  const [member, setMember] = useState<Member | null>(null)
  const [family, setFamily] = useState<FamilyMember[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('shepherdscore_portal_token')
    if (!token) {
      navigate('/portal/login')
      return
    }

    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    fetch(`${API_BASE}/portal/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load profile')
        return res.json()
      })
      .then(data => {
        setMember(data.member)
        // Filter out the logged-in member from the family list for display purposes
        setFamily(data.family.filter((f: FamilyMember) => f.id !== data.member.id))
      })
      .catch(err => {
        setError(err.message)
      })
  }, [navigate])

  const firstName = member ? member.preferred_name || member.first_name : 'there'

  return (
    <div>
      <h1 className={styles.pageTitle}>Welcome back, {firstName}!</h1>
      {error && <p className={styles.error}>{error}</p>}

      {/* Quick Navigation Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div 
          onClick={() => navigate('/portal/precheck')}
          style={{ background: 'var(--color-white)', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderTop: '4px solid var(--color-accent)', cursor: 'pointer', transition: 'transform 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Family Pre-Check</h3>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Select family members and generate your barcode for Sunday check-in.</p>
        </div>

        <div 
          onClick={() => navigate('/portal/directory')}
          style={{ background: 'var(--color-white)', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderTop: '4px solid #8B5CF6', cursor: 'pointer', transition: 'transform 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>👥</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Church Directory</h3>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Look up contact info for other families who opted into the directory.</p>
        </div>

        <div 
          onClick={() => navigate('/portal/profile')}
          style={{ background: 'var(--color-white)', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderTop: '4px solid #22C55E', cursor: 'pointer', transition: 'transform 0.2s' }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
        >
          <div style={{ fontSize: 24, marginBottom: 8 }}>⚙</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Manage Profile</h3>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Edit address, phone, and upload profile pictures.</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* Profile Card */}
        <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>My Contact Details</h2>
          {member && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 8 }}>
                {member.photo_url ? (
                  <img src={member.photo_url} alt="Profile" style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 24 }}>
                    {member.first_name[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <h4 style={{ fontSize: 15, fontWeight: 700 }}>{member.first_name} {member.last_name}</h4>
                  <p style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Member Profile</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div><strong style={{ color: 'var(--color-text-secondary)' }}>Email:</strong> {member.email}</div>
                <div><strong style={{ color: 'var(--color-text-secondary)' }}>Mobile:</strong> {member.cell_phone || '—'}</div>
                <div><strong style={{ color: 'var(--color-text-secondary)' }}>Home Phone:</strong> {member.phone || '—'}</div>
                <div><strong style={{ color: 'var(--color-text-secondary)' }}>Address:</strong> {member.address || '—'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Family Card */}
        <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>My Family</h2>
          {family.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>No other family members linked to your profile yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {family.map(f => (
                <div key={f.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
                  {f.photo_url ? (
                    <img src={f.photo_url} alt="Profile" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-border)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14 }}>
                      {f.first_name[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 600 }}>{f.preferred_name || f.first_name} {f.last_name}</h4>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
