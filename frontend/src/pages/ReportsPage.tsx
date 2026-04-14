import { useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'

interface GivingReport { category: string; total: number; count: number }
interface MemberReport { total: number; added_this_month: number }
interface DonorTotal { member_id: string | null; first_name: string; last_name: string; total: number; transactions: number }
interface ChurchSettings { name: string; address: string; pastor_name: string; email: string; phone: string; website: string }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

export default function ReportsPage() {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [givingData, setGivingData] = useState<GivingReport[]>([])
  const [memberData, setMemberData] = useState<MemberReport | null>(null)
  const [annualDonors, setAnnualDonors] = useState<DonorTotal[]>([])
  const [loading, setLoading] = useState(false)
  const [annualLoading, setAnnualLoading] = useState(false)
  const [error, setError] = useState('')
  const [taxLetter, setTaxLetter] = useState<DonorTotal | null>(null)
  const [church, setChurch] = useState<ChurchSettings | null>(null)

  const runMonthlyReport = async () => {
    setLoading(true)
    setError('')
    try {
      const [giving, members] = await Promise.all([
        api.get<GivingReport[]>(`/reports/giving?year=${year}&month=${month}`),
        api.get<MemberReport>(`/reports/members?year=${year}&month=${month}`),
      ])
      setGivingData(giving)
      setMemberData(members)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  const runAnnualReport = async () => {
    setAnnualLoading(true)
    setError('')
    try {
      const [donors, ch] = await Promise.all([
        api.get<DonorTotal[]>(`/reports/annual-giving?year=${year}`),
        api.get<ChurchSettings>('/settings'),
      ])
      setAnnualDonors(donors)
      setChurch(ch)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load annual report')
    } finally {
      setAnnualLoading(false)
    }
  }

  const grandTotal = givingData.reduce((s, r) => s + r.total, 0)
  const annualTotal = annualDonors.reduce((s, d) => s + d.total, 0)

  const printTaxLetter = (donor: DonorTotal) => {
    setTaxLetter(donor)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Reports</h1>
      {error && <p className={styles.error}>{error}</p>}

      {/* Monthly Report Controls */}
      <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Monthly Giving Report</h3>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className={styles.field} style={{ minWidth: 120 }}>
            <label>Year</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}>
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <div className={styles.field} style={{ minWidth: 140 }}>
            <label>Month</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <button className={styles.addBtn} onClick={runMonthlyReport} disabled={loading}>
            {loading ? 'Loading…' : 'Run Report'}
          </button>
        </div>
      </div>

      {givingData.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
            Giving — {MONTHS[month - 1]} {year}
          </h2>
          <div className={styles.tableWrap} style={{ marginBottom: 24 }}>
            <table>
              <thead><tr><th>Category</th><th>Transactions</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>
                {givingData.map(r => (
                  <tr key={r.category}>
                    <td>{r.category}</td>
                    <td>{r.count}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#22C55E' }}>${r.total.toFixed(2)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2} style={{ fontWeight: 700 }}>Grand Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: '#22C55E' }}>${grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {memberData && (
        <div className={styles.statsGrid} style={{ marginBottom: 32 }}>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: '#0066CC' }}>{memberData.total}</div>
            <div className={styles.statLabel}>Total Members</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: '#22C55E' }}>{memberData.added_this_month}</div>
            <div className={styles.statLabel}>Added in {MONTHS[month - 1]}</div>
          </div>
        </div>
      )}

      {/* Annual Donor Report / Tax Letters */}
      <div style={{ background: 'var(--color-white)', borderRadius: 12, padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Annual Giving Summary & Tax Letters</h3>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className={styles.field} style={{ minWidth: 120 }}>
            <label>Year</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}>
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          <button className={styles.addBtn} onClick={runAnnualReport} disabled={annualLoading}>
            {annualLoading ? 'Loading…' : 'Generate Annual Report'}
          </button>
        </div>
      </div>

      {annualDonors.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
            Donor Totals — {year}
            <span style={{ fontSize: 13, fontWeight: 500, color: '#888', marginLeft: 12 }}>
              {annualDonors.length} donors · ${annualTotal.toFixed(2)} total
            </span>
          </h2>
          <div className={styles.tableWrap} style={{ marginBottom: 24 }}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Transactions</th>
                  <th style={{ textAlign: 'right' }}>Total Given</th>
                  <th>Tax Letter</th>
                </tr>
              </thead>
              <tbody>
                {annualDonors.map((d, i) => (
                  <tr key={d.member_id ?? 'anon-' + i}>
                    <td style={{ fontWeight: 500 }}>
                      {d.last_name ? `${d.last_name}, ${d.first_name}` : d.first_name}
                    </td>
                    <td>{d.transactions}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#22C55E' }}>${d.total.toFixed(2)}</td>
                    <td>
                      {d.member_id && (
                        <button className={styles.editBtn} onClick={() => printTaxLetter(d)}>
                          Generate Letter
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Tax Letter Modal */}
      {taxLetter && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 680 }}>
            <div id="tax-letter-content" style={{ fontFamily: 'Georgia, serif', lineHeight: 1.7 }}>
              <p style={{ marginBottom: 32 }}>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              <p style={{ marginBottom: 4, fontWeight: 700 }}>
                {taxLetter.first_name} {taxLetter.last_name}
              </p>
              <p style={{ marginBottom: 32, color: '#555' }}>[Member Address]</p>
              <p style={{ marginBottom: 16 }}>Dear {taxLetter.first_name},</p>
              <p style={{ marginBottom: 16 }}>
                Thank you for your generous contributions to{' '}
                <strong>{church?.name || 'our church'}</strong> during {year}.
                This letter serves as your official tax receipt for contributions made during the calendar year.
              </p>
              <p style={{ marginBottom: 8 }}>Your total contributions for {year}:</p>
              <div style={{
                background: '#f8f9fa', borderRadius: 8, padding: '16px 20px',
                marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span>Total Contributions ({taxLetter.transactions} transaction{taxLetter.transactions !== 1 ? 's' : ''})</span>
                <span style={{ fontWeight: 700, fontSize: 18, color: '#22C55E' }}>${taxLetter.total.toFixed(2)}</span>
              </div>
              <p style={{ marginBottom: 16, fontSize: 13, color: '#555' }}>
                No goods or services were provided in exchange for these contributions.
                Please retain this letter for your tax records.
              </p>
              <p style={{ marginBottom: 8 }}>Sincerely,</p>
              <p style={{ fontWeight: 700 }}>{church?.pastor_name || 'Church Leadership'}</p>
              <p>{church?.name || ''}</p>
              {church?.address && <p style={{ color: '#555', fontSize: 13 }}>{church.address}</p>}
            </div>
            <div className={styles.modalActions} style={{ marginTop: 24 }}>
              <button className={styles.cancelBtn} onClick={() => setTaxLetter(null)}>Close</button>
              <button className={styles.saveBtn} onClick={handlePrint}>🖨 Print</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
