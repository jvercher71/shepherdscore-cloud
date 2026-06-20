import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import styles from './OnboardingPage.module.css'

export default function OnboardingPage() {
  const { refreshSession } = useAuth()
  const navigate = useNavigate()
  
  // Steps: 1 = Profile, 2 = Contact, 3 = Branding, 4 = Complete
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  
  // Fields State
  const [churchName, setChurchName] = useState('')
  const [pastorName, setPastorName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  
  // Loading & Error States
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // Handle step progression
  const handleNext = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    
    try {
      if (step === 1) {
        if (!churchName.trim()) {
          setError('Church Name is required')
          setLoading(false)
          return
        }
        
        // Step 1: Create the church
        await api.post('/churches', { 
          church_name: churchName.trim(), 
          pastor_name: pastorName.trim() 
        })
        
        // Refresh session to populate the church_id in user's JWT
        await refreshSession()
        setStep(2)
      } else if (step === 2) {
        // Step 2: Save contact details
        await api.put('/settings', {
          name: churchName.trim(),
          pastor_name: pastorName.trim(),
          address: address.trim(),
          phone: phone.trim(),
          email: email.trim(),
          website: website.trim(),
          logo_url: logoUrl
        })
        setStep(3)
      } else if (step === 3) {
        // Step 3: Branding is complete (either uploaded or skipped)
        setStep(4)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Handle Back navigation
  const handleBack = () => {
    setError('')
    if (step > 1) {
      setStep((prev) => (prev - 1) as 1 | 2 | 3 | 4)
    }
  }

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    if (file.size > 5 * 1024 * 1024) { 
      setError('Logo image must be less than 5MB')
      return 
    }
    
    setUploading(true)
    setError('')
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const res = await api.post<{ logo_url: string }>('/settings/logo', {
          logo_base64: reader.result as string,
          filename: file.name,
        })
        setLogoUrl(res.logo_url)
      } catch (err) { 
        setError(err instanceof Error ? err.message : 'Upload failed') 
      } finally { 
        setUploading(false) 
      }
    }
    reader.readAsDataURL(file)
  }

  // Final Step redirection
  const handleComplete = () => {
    navigate('/')
  }

  // Generate simple steps tracker helper
  const renderStepper = () => {
    const stepsList = [
      { id: 1, label: 'Profile' },
      { id: 2, label: 'Contact' },
      { id: 3, label: 'Branding' },
      { id: 4, label: 'Finish' },
    ]
    
    // Calculate percentage width for line progress
    const progressWidth = `${((step - 1) / 3) * 100}%`

    return (
      <div className={styles.stepper}>
        <div className={styles.stepLine}>
          <div className={styles.stepLineProgress} style={{ width: progressWidth }} />
        </div>
        {stepsList.map((s) => {
          let stepClass = styles.step
          if (step === s.id) {
            stepClass += ` ${styles.stepActive}`
          } else if (step > s.id) {
            stepClass += ` ${styles.stepCompleted}`
          }
          
          return (
            <div key={s.id} className={stepClass}>
              <div className={styles.stepCircle}>
                {step > s.id ? '✓' : s.id}
              </div>
              <span className={styles.stepLabel}>{s.label}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <img src="/shepherdscore-logo.png" alt="ShepherdsCore" className={styles.brandLogo} />
        </div>
        
        {renderStepper()}

        {step === 1 && (
          <form onSubmit={handleNext}>
            <h2 className={styles.formTitle}>Set up your church profile</h2>
            <p className={styles.formSubtitle}>Let's start with some basic information about your church.</p>
            
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="churchName">Church Name *</label>
                <input
                  id="churchName"
                  type="text"
                  value={churchName}
                  onChange={(e) => setChurchName(e.target.value)}
                  placeholder="e.g. Grace Community Church"
                  required
                  autoFocus
                />
              </div>
              
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="pastorName">Pastor Name</label>
                <input
                  id="pastorName"
                  type="text"
                  value={pastorName}
                  onChange={(e) => setPastorName(e.target.value)}
                  placeholder="e.g. Pastor John Smith"
                />
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <button 
                type="submit" 
                className={styles.nextBtn} 
                disabled={loading || !churchName.trim()}
              >
                {loading ? 'Creating workspace…' : 'Next Step →'}
              </button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleNext}>
            <h2 className={styles.formTitle}>Add contact information</h2>
            <p className={styles.formSubtitle}>Provide ways for members to reach the church office.</p>
            
            <div className={styles.formGrid}>
              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="address">Address</label>
                <input
                  id="address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. 123 Church St, City, ST 12345"
                />
              </div>
              
              <div className={styles.field}>
                <label htmlFor="phone">Phone Number</label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. (555) 019-2834"
                />
              </div>

              <div className={styles.field}>
                <label htmlFor="email">Email Address</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. office@yourchurch.org"
                />
              </div>

              <div className={`${styles.field} ${styles.fieldFull}`}>
                <label htmlFor="website">Website Link</label>
                <input
                  id="website"
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="e.g. https://yourchurch.org"
                />
              </div>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <button 
                type="button" 
                onClick={handleBack} 
                className={styles.backBtn}
                disabled={loading}
              >
                Back
              </button>
              <button 
                type="submit" 
                className={styles.nextBtn} 
                disabled={loading}
              >
                {loading ? 'Saving…' : 'Next Step →'}
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleNext}>
            <h2 className={styles.formTitle}>Upload your logo</h2>
            <p className={styles.formSubtitle}>Brand the workspace with your church's logo.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '24px 0' }}>
              <div style={{ marginBottom: 24 }}>
                {logoUrl ? (
                  <img src={logoUrl} alt="Church logo preview" className={styles.logoPreview} />
                ) : (
                  <div className={styles.logoPlaceholder}>
                    {(churchName[0] || 'S').toUpperCase()}
                  </div>
                )}
              </div>

              <label className={styles.uploadArea} style={{ width: '100%' }}>
                <span className={styles.uploadIcon}>☁️</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>
                  {uploading ? 'Uploading your logo…' : 'Click to select image'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  Supports PNG, JPG or WEBP (Max 5MB)
                </span>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleLogoUpload} 
                  style={{ display: 'none' }} 
                  disabled={uploading} 
                />
              </label>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.actions}>
              <button 
                type="button" 
                onClick={handleBack} 
                className={styles.backBtn}
                disabled={uploading || loading}
              >
                Back
              </button>
              <button 
                type="submit" 
                className={styles.nextBtn} 
                disabled={uploading || loading}
              >
                {logoUrl ? 'Continue →' : 'Skip branding →'}
              </button>
            </div>
          </form>
        )}

        {step === 4 && (
          <div className={styles.successContainer}>
            <div className={styles.successIcon}>✓</div>
            <h2 className={styles.formTitle}>Workspace Setup Complete!</h2>
            <p className={styles.formSubtitle}>Your church workspace is ready. Here is a summary of your setup:</p>
            
            <div className={styles.successSummary}>
              <div className={styles.summaryRow}>
                <span className={styles.summaryLabel}>Church Name</span>
                <span className={styles.summaryValue}>{churchName}</span>
              </div>
              {pastorName && (
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Pastor Name</span>
                  <span className={styles.summaryValue}>{pastorName}</span>
                </div>
              )}
              {email && (
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Contact Email</span>
                  <span className={styles.summaryValue}>{email}</span>
                </div>
              )}
              {phone && (
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Phone Number</span>
                  <span className={styles.summaryValue}>{phone}</span>
                </div>
              )}
              {website && (
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Website</span>
                  <span className={styles.summaryValue}>{website}</span>
                </div>
              )}
            </div>

            <button 
              type="button" 
              onClick={handleComplete} 
              className={styles.nextBtn}
              style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
