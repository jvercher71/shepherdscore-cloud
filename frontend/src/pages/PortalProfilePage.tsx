import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './PageShared.module.css'

interface MemberProfile {
  first_name: string
  last_name: string
  preferred_name: string
  email: string
  phone: string
  cell_phone: string
  address: string
  city: string
  state: string
  zip: string
  photo_url: string
  directory_opt_in: boolean
}

const EMPTY_PROFILE: MemberProfile = {
  first_name: '', last_name: '', preferred_name: '', email: '',
  phone: '', cell_phone: '', address: '', city: '', state: '', zip: '',
  photo_url: '', directory_opt_in: false
}

export default function PortalProfilePage() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState<MemberProfile>(EMPTY_PROFILE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
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
        setProfile({
          first_name: data.member.first_name || '',
          last_name: data.member.last_name || '',
          preferred_name: data.member.preferred_name || '',
          email: data.member.email || '',
          phone: data.member.phone || '',
          cell_phone: data.member.cell_phone || '',
          address: data.member.address || '',
          city: data.member.city || '',
          state: data.member.state || '',
          zip: data.member.zip || '',
          photo_url: data.member.photo_url || '',
          directory_opt_in: !!data.member.directory_opt_in
        })
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')

    const token = localStorage.getItem('shepherdscore_portal_token')
    try {
      const API_BASE = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${API_BASE}/portal/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profile)
      })
      if (!res.ok) throw new Error('Failed to save profile changes')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB')
      return
    }

    setUploading(true)
    setError('')
    const reader = new FileReader()
    reader.onload = async () => {
      const token = localStorage.getItem('shepherdscore_portal_token')
      try {
        const API_BASE = import.meta.env.VITE_API_URL || '/api'
        const res = await fetch(`${API_BASE}/portal/photo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            logo_base64: reader.result as string,
            filename: file.name
          })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail || 'Upload failed')
        
        setProfile(p => ({ ...p, photo_url: data.photo_url }))
        window.location.reload() // Reload to refresh sidebar photo
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const field = (key: keyof MemberProfile, label: string, type = 'text', disabled = false) => (
    <div className={styles.field} key={key}>
      <label>{label}</label>
      <input
        type={type}
        value={profile[key] as string}
        onChange={e => setProfile(p => ({ ...p, [key]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }))}
        disabled={disabled}
      />
    </div>
  )

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>Loading profile…</div>

  return (
    <div>
      <h1 className={styles.pageTitle}>My Profile Settings</h1>
      {error && <p className={styles.error}>{error}</p>}

      {/* Photo Uploader */}
      <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: 32, maxWidth: 600, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Profile Photo</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {profile.photo_url ? (
            <img src={profile.photo_url} alt="Profile" style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--color-border)' }} />
          ) : (
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800 }}>
              {(profile.first_name?.[0] || 'M').toUpperCase()}
            </div>
          )}
          <div>
            <label className={styles.addBtn} style={{ cursor: 'pointer', display: 'inline-block' }}>
              {uploading ? 'Uploading…' : 'Upload Photo'}
              <input type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} disabled={uploading} />
            </label>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              PNG or JPG, recommended 200x200px
            </p>
          </div>
        </div>
      </div>

      {/* Profile Details Form */}
      <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: 32, maxWidth: 600, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>My Information</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            {field('first_name', 'First Name')}
            {field('last_name', 'Last Name')}
            {field('preferred_name', 'Preferred Name')}
            {field('email', 'Email Address (Log In ID)', 'email', true)}
            {field('phone', 'Home Phone')}
            {field('cell_phone', 'Mobile Number')}
            <div className={styles.field} style={{ gridColumn: '1 / -1' }}>
              <label>Address</label>
              <input type="text" value={profile.address} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} />
            </div>
            {field('city', 'City')}
            {field('state', 'State')}
            {field('zip', 'Zip / Postal Code')}
            
            {/* Directory Opt In */}
            <div className={styles.field} style={{ gridColumn: '1 / -1', flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
              <input 
                id="directory_opt_in" 
                type="checkbox" 
                checked={profile.directory_opt_in}
                onChange={e => setProfile(p => ({ ...p, directory_opt_in: e.target.checked }))}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <label htmlFor="directory_opt_in" style={{ cursor: 'pointer', textTransform: 'none', fontSize: 14, fontWeight: 500, color: 'var(--color-text)' }}>
                Opt into Church Directory (allow other church families to see my contact details)
              </label>
            </div>
          </div>
          <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="submit" className={styles.saveBtn} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
            {saved && <span style={{ color: '#22C55E', fontSize: 14, fontWeight: 600 }}>Saved!</span>}
          </div>
        </form>
      </div>
    </div>
  )
}
