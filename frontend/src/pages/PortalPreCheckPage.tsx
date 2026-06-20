import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './PageShared.module.css'

interface FamilyMember {
  id: string
  first_name: string
  last_name: string
  preferred_name?: string
  photo_url?: string
}

interface EventRecord {
  id: string
  name: string
  date: string
  event_time?: string
}

export default function PortalPreCheckPage() {
  const navigate = useNavigate()
  const [family, setFamily] = useState<FamilyMember[]>([])
  const [events, setEvents] = useState<EventRecord[]>([])
  
  // Selection states
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [selectedEventId, setSelectedEventId] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [qrCodeUrl, setQrCodeUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('shepherdscore_portal_token')
    if (!token) {
      navigate('/portal/login')
      return
    }

    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    Promise.all([
      fetch(`${API_BASE}/portal/me`, { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json()),
      fetch(`${API_BASE}/portal/events`, { headers: { 'Authorization': `Bearer ${token}` } }).then(res => res.json())
    ])
      .then(([profileData, eventsData]) => {
        setFamily(profileData.family)
        setEvents(eventsData)
        
        // Auto-select the logged-in member by default
        if (profileData.member?.id) {
          setSelectedMembers([profileData.member.id])
        }
        // Auto-select first event if exists
        if (eventsData && eventsData.length > 0) {
          setSelectedEventId(eventsData[0].id)
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [navigate])

  const handleToggleMember = (id: string) => {
    setSelectedMembers(prev => 
      prev.includes(id) 
        ? prev.filter(x => x !== id) 
        : [...prev, id]
    )
  }

  const handleGenerate = async () => {
    if (selectedMembers.length === 0) {
      setError('Please select at least one family member to check in.')
      return
    }
    if (!selectedEventId) {
      setError('Please select an event for check-in.')
      return
    }

    setGenerating(true)
    setError('')
    setQrCodeUrl('')

    const token = localStorage.getItem('shepherdscore_portal_token')
    try {
      const API_BASE = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${API_BASE}/portal/precheck`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          event_id: selectedEventId,
          member_ids: selectedMembers
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error('Failed to generate precheck code')

      const scanCode = data.scan_code
      // Use free public QR code generator API
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(scanCode)}`
      setQrCodeUrl(qrUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate code')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>Loading pre-check details…</div>

  const activeEvent = events.find(e => e.id === selectedEventId)

  return (
    <div>
      <h1 className={styles.pageTitle}>Sunday Pre-Check</h1>
      {error && <p className={styles.error}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
        {/* Step Form Card */}
        <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>1. Select Family Members</h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {family.map(f => {
              const isChecked = selectedMembers.includes(f.id)
              return (
                <div 
                  key={f.id} 
                  onClick={() => handleToggleMember(f.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: `1.5px solid ${isChecked ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: isChecked ? 'rgba(0, 102, 204, 0.02)' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <input 
                    type="checkbox" 
                    checked={isChecked}
                    onChange={() => {}} // Controlled by div click
                    style={{ width: 18, height: 18, cursor: 'pointer' }}
                  />
                  {f.photo_url ? (
                    <img src={f.photo_url} alt="Profile" style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-bg)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 13 }}>
                      {f.first_name[0].toUpperCase()}
                    </div>
                  )}
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{f.preferred_name || f.first_name} {f.last_name}</span>
                </div>
              )
            })}
          </div>

          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>2. Select Event</h2>
          <div className={styles.field} style={{ marginBottom: 24 }}>
            <label htmlFor="event-select">Upcoming Services / Events</label>
            <select 
              id="event-select"
              value={selectedEventId}
              onChange={(e) => {
                setSelectedEventId(e.target.value)
                setQrCodeUrl('')
              }}
              style={{ width: '100%', height: 44 }}
            >
              {events.length === 0 ? (
                <option value="">No upcoming services scheduled</option>
              ) : (
                events.map(e => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {new Date(e.date + 'T12:00:00').toLocaleDateString()} {e.event_time ? `(${e.event_time})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          <button 
            type="button"
            className={styles.addBtn}
            onClick={handleGenerate}
            disabled={generating || selectedMembers.length === 0 || !selectedEventId}
            style={{ width: '100%', padding: '12px 16px', height: 48, display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: 15 }}
          >
            {generating ? 'Generating QR Code…' : 'Generate Pre-Check Barcode'}
          </button>
        </div>

        {/* QR Code Output Card */}
        <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
          {qrCodeUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--color-success)' }}>Ready for Scan!</h2>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 20 }}>Show this barcode to the check-in volunteer at the church office or lobby.</p>
              
              <div style={{ background: '#fff', padding: 12, borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', marginBottom: 20, border: '1px solid var(--color-border)' }}>
                <img src={qrCodeUrl} alt="Check-In QR Code" style={{ display: 'block', width: 180, height: 180 }} />
              </div>

              <div style={{ background: 'var(--color-bg)', padding: '12px 16px', borderRadius: 8, width: '100%', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><strong style={{ color: 'var(--color-text-secondary)' }}>Service:</strong> {activeEvent?.name}</div>
                <div>
                  <strong style={{ color: 'var(--color-text-secondary)' }}>Checking In:</strong>{' '}
                  {selectedMembers.map(mid => {
                    const fam = family.find(f => f.id === mid)
                    return fam ? fam.preferred_name || fam.first_name : ''
                  }).filter(Boolean).join(', ')}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: 'var(--color-text-secondary)', padding: '40px 20px' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>Your QR Code Will Appear Here</h3>
              <p style={{ fontSize: 12, marginTop: 4 }}>Select family members and click generate to create a scan code.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
