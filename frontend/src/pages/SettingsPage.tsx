import { useEffect, useState, FormEvent } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface ChurchSettings {
  name: string; address: string; phone: string; email: string
  website: string; pastor_name: string; logo_url: string
}

const EMPTY: ChurchSettings = { name: '', address: '', phone: '', email: '', website: '', pastor_name: '', logo_url: '' }

export default function SettingsPage() {
  const [settings, setSettings] = useState<ChurchSettings>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    api.get<ChurchSettings>('/settings').then(setSettings).catch(e => setError(e.message))
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setSaved(false); setError('')
    try {
      await api.put('/settings', settings)
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (err) { setError(err instanceof Error ? err.message : 'Save failed') }
    finally { setSaving(false) }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setError('Image must be less than 5MB'); return }
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const res = await api.post<{ logo_url: string }>('/settings/logo', {
          logo_base64: reader.result as string, filename: file.name,
        })
        setSettings(p => ({ ...p, logo_url: res.logo_url }))
      } catch (err) { setError(err instanceof Error ? err.message : 'Upload failed') }
      finally { setUploading(false) }
    }
    reader.readAsDataURL(file)
  }

  const field = (key: keyof ChurchSettings, label: string, type = 'text') => (
    <div className={styles.field} key={key}>
      <label>{label}</label>
      <input type={type} value={settings[key]} onChange={e => setSettings(p => ({ ...p, [key]: e.target.value }))} />
    </div>
  )

  return (
    <div>
      <h1 className={styles.pageTitle}>Settings</h1>
      {error && <p className={styles.error}>{error}</p>}

      {/* Logo Section */}
      <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: 32, maxWidth: 600, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Church Logo</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {settings.logo_url ? (
            <img src={settings.logo_url} alt="Church logo" style={{ width: 80, height: 80, borderRadius: 12, objectFit: 'contain', background: '#f8f9fa', padding: 4 }} />
          ) : (
            <div style={{ width: 80, height: 80, borderRadius: 12, background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800 }}>
              {(settings.name?.[0] || 'S').toUpperCase()}
            </div>
          )}
          <div>
            <label className={styles.addBtn} style={{ cursor: 'pointer', display: 'inline-block' }}>
              {uploading ? 'Uploading…' : 'Upload Logo'}
              <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} disabled={uploading} />
            </label>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8 }}>
              PNG or JPG, recommended 200x200px
            </p>
          </div>
        </div>
      </div>

      {/* Church Info */}
      <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: 32, maxWidth: 600, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Church Information</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            {field('name', 'Church Name')}
            {field('pastor_name', 'Pastor Name')}
            {field('address', 'Address')}
            {field('phone', 'Phone')}
            {field('email', 'Email', 'email')}
            {field('website', 'Website', 'url')}
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
