import { useEffect, useState, FormEvent } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface ChurchSettings {
  name: string
  address: string
  phone: string
  email: string
  website: string
  pastor_name: string
}

const EMPTY: ChurchSettings = { name: '', address: '', phone: '', email: '', website: '', pastor_name: '' }

export default function SettingsPage() {
  const [settings, setSettings] = useState<ChurchSettings>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<ChurchSettings>('/settings').then(setSettings).catch(e => setError(e.message))
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      await api.put('/settings', settings)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const field = (key: keyof ChurchSettings, label: string, type = 'text') => (
    <div className={styles.field} key={key}>
      <label>{label}</label>
      <input
        type={type}
        value={settings[key]}
        onChange={e => setSettings(p => ({ ...p, [key]: e.target.value }))}
      />
    </div>
  )

  return (
    <div>
      <h1 className={styles.pageTitle}>Settings</h1>
      {error && <p className={styles.error}>{error}</p>}
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
