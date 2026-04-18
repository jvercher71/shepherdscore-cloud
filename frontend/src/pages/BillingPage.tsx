import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface BillingStatus {
  status: string
  trial_days_left: number
  has_customer: boolean
}

const STATUS_LABELS: Record<string, string> = {
  trial: 'Free Trial',
  active: 'Active Subscription',
  past_due: 'Past Due',
  canceled: 'Canceled',
}

const STATUS_COLORS: Record<string, string> = {
  trial: '#F59E0B',
  active: '#22C55E',
  past_due: '#EF4444',
  canceled: '#6B7280',
}

export default function BillingPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<BillingStatus>('/billing/status')
      .then(setBilling)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load billing'))
      .finally(() => setLoading(false))
  }, [])

  const handleSubscribe = () => {
    window.open('https://buy.stripe.com/28EaEZ4I87SugkZb2z3Ru00', '_blank')
  }

  const handleManage = async () => {
    setActionLoading(true); setError('')
    try {
      const res = await api.post<{ portal_url: string }>('/billing/portal', {})
      if (res.portal_url) window.location.href = res.portal_url
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to open billing portal') }
    finally { setActionLoading(false) }
  }

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#888' }}>Loading billing info…</div>

  const status = billing?.status || 'trial'

  return (
    <div>
      <h1 className={styles.pageTitle}>Billing & Subscription</h1>
      {error && <p className={styles.error}>{error}</p>}

      {/* Current Plan Card */}
      <div style={{
        background: 'var(--color-white)', borderRadius: 16, padding: '32px 36px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', maxWidth: 560, marginBottom: 24,
        borderTop: `4px solid ${STATUS_COLORS[status] || '#888'}`,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Your Plan</h2>
            <span style={{
              display: 'inline-block', padding: '4px 14px', borderRadius: 20,
              fontSize: 13, fontWeight: 700,
              background: `${STATUS_COLORS[status]}18`, color: STATUS_COLORS[status],
            }}>
              {STATUS_LABELS[status] || status}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--color-text)' }}>$30</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>/month</div>
          </div>
        </div>

        {status === 'trial' && (
          <div style={{
            background: 'rgba(245,158,11,0.08)', borderRadius: 10, padding: '14px 18px',
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#F59E0B', marginBottom: 4 }}>
              {billing?.trial_days_left && billing.trial_days_left > 0
                ? `${billing.trial_days_left} days left in your free trial`
                : 'Your free trial has expired'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              Subscribe now to keep using all features. Early adopter pricing: $30/month.
            </div>
          </div>
        )}

        {status === 'past_due' && (
          <div style={{ background: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#EF4444' }}>
              Your payment is past due. Please update your payment method to avoid interruption.
            </div>
          </div>
        )}

        {status === 'canceled' && (
          <div style={{ background: 'rgba(107,114,128,0.08)', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280' }}>
              Your subscription has been canceled. Subscribe again to restore access.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          {(status === 'trial' || status === 'canceled') && (
            <button className={styles.saveBtn} onClick={handleSubscribe}
              style={{ padding: '12px 28px', fontSize: 15 }}>
              Subscribe — $30/month
            </button>
          )}
          {billing?.has_customer && (
            <button className={styles.secondaryBtn} onClick={handleManage} disabled={actionLoading}
              style={{ padding: '12px 20px' }}>
              {actionLoading ? 'Loading…' : 'Manage Billing'}
            </button>
          )}
        </div>
      </div>

      {/* What's Included */}
      <div style={{ background: 'var(--color-white)', borderRadius: 16, padding: '28px 36px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', maxWidth: 560 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>What's Included</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            'Unlimited members & families',
            'Giving records with split donations',
            'Events, attendance & calendar',
            'Bible study groups with rosters',
            'AI pastoral insights',
            'Email your members individually or by group',
            'PDF reports & tax letters',
            'Member directory with photos',
            'Staff management with roles',
            'Smart search across all data',
            'CSV import & export',
            'Mobile responsive design',
          ].map(feature => (
            <div key={feature} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
              <span style={{ color: '#22C55E', fontWeight: 700, fontSize: 16 }}>+</span>
              {feature}
            </div>
          ))}
        </div>
        <p style={{ marginTop: 20, fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Early adopter pricing. Locked in for the life of your subscription.
        </p>
      </div>
    </div>
  )
}
