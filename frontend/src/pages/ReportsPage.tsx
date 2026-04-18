import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import styles from './PageShared.module.css'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface GivingReport { category: string; total: number; count: number }
interface MemberReport { total: number; added_this_month: number }
interface DonorTotal { member_id: string | null; first_name: string; last_name: string; total: number; transactions: number }
interface ChurchSettings { name: string; address: string; pastor_name: string; email: string; phone: string; website: string }
interface GivingDetail { member_name: string; amount: number; category: string; method: string; date: string; notes: string }
interface DetailReport { records: GivingDetail[]; by_category: GivingReport[]; grand_total: number; record_count: number }
interface AttendanceRecord { id: string; service_type: string; date: string; headcount: number; notes: string }
interface AttendanceByService { service_type: string; total_headcount: number; service_count: number; average: number }
interface AttendanceReport { records: AttendanceRecord[]; by_service: AttendanceByService[]; grand_total: number; record_count: number; overall_average: number }
interface AICustomReport { title: string; summary: string; data_source: string; group_by: string; columns: string[]; rows: (string | number)[][]; record_count: number }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1]

export default function ReportsPage() {
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [day, setDay] = useState('')
  const [reportMode, setReportMode] = useState<'month' | 'day' | 'year'>('month')
  const [givingData, setGivingData] = useState<GivingReport[]>([])
  const [memberData, setMemberData] = useState<MemberReport | null>(null)
  const [detailData, setDetailData] = useState<DetailReport | null>(null)
  const [annualDonors, setAnnualDonors] = useState<DonorTotal[]>([])
  const [loading, setLoading] = useState(false)
  const [annualLoading, setAnnualLoading] = useState(false)
  const [error, setError] = useState('')
  const [church, setChurch] = useState<ChurchSettings | null>(null)
  const [aiSummary, setAiSummary] = useState('')
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false)

  // Attendance report state (independent controls so users can run it without affecting Giving)
  const [attYear, setAttYear] = useState(CURRENT_YEAR)
  const [attMonth, setAttMonth] = useState(new Date().getMonth() + 1)
  const [attDay, setAttDay] = useState('')
  const [attMode, setAttMode] = useState<'month' | 'day' | 'year'>('month')
  const [attService, setAttService] = useState('All')
  const [attServiceOptions, setAttServiceOptions] = useState<string[]>([])
  const [attData, setAttData] = useState<AttendanceReport | null>(null)
  const [attLoading, setAttLoading] = useState(false)

  // AI report builder state
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiReport, setAiReport] = useState<AICustomReport | null>(null)
  const [aiReportLoading, setAiReportLoading] = useState(false)

  const runReport = async () => {
    setLoading(true); setError(''); setAiSummary('')
    try {
      let url = `/reports/giving-detail?year=${year}`
      if (reportMode === 'month' || reportMode === 'day') url += `&month=${month}`
      if (reportMode === 'day' && day) url += `&day=${day}`

      const [detail, members] = await Promise.all([
        api.get<DetailReport>(url),
        reportMode !== 'year' ? api.get<MemberReport>(`/reports/members?year=${year}&month=${month}`) : Promise.resolve(null),
      ])
      setDetailData(detail)
      setGivingData(detail.by_category)
      setMemberData(members)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load report') }
    finally { setLoading(false) }
  }

  const runAnnualReport = async () => {
    setAnnualLoading(true); setError('')
    try {
      const [donors, ch] = await Promise.all([
        api.get<DonorTotal[]>(`/reports/annual-giving?year=${year}`),
        api.get<ChurchSettings>('/settings'),
      ])
      setAnnualDonors(donors); setChurch(ch)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load annual report') }
    finally { setAnnualLoading(false) }
  }

  const generateAiSummary = async () => {
    setAiSummaryLoading(true)
    try {
      const res = await api.post<{ summary: string }>('/ai/report-summary', { report_type: 'monthly_giving', year, month })
      setAiSummary(res.summary)
    } catch (e) { setAiSummary(e instanceof Error ? `Error: ${e.message}` : 'Failed') }
    finally { setAiSummaryLoading(false) }
  }

  // Pull existing service types once so the dropdown is populated even before running a report
  useEffect(() => {
    api.get<AttendanceRecord[]>('/attendance')
      .then(rows => {
        const types = Array.from(new Set(rows.map(r => r.service_type).filter(Boolean))).sort()
        setAttServiceOptions(types)
      })
      .catch(() => { /* non-fatal — dropdown just shows All */ })
  }, [])

  const runAttendanceReport = async () => {
    setAttLoading(true); setError('')
    try {
      let url = `/reports/attendance?year=${attYear}`
      if (attMode === 'month' || attMode === 'day') url += `&month=${attMonth}`
      if (attMode === 'day' && attDay) url += `&day=${attDay}`
      if (attService && attService !== 'All') url += `&service_type=${encodeURIComponent(attService)}`
      const [data, ch] = await Promise.all([
        api.get<AttendanceReport>(url),
        church ? Promise.resolve(church) : api.get<ChurchSettings>('/settings').catch(() => null),
      ])
      setAttData(data)
      if (ch && !church) setChurch(ch)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load attendance report') }
    finally { setAttLoading(false) }
  }

  const attTitle = attMode === 'day' && attDay
    ? `${MONTHS[attMonth - 1]} ${attDay}, ${attYear}`
    : attMode === 'year' ? `${attYear}` : `${MONTHS[attMonth - 1]} ${attYear}`

  const generateAttendancePDF = () => {
    if (!attData) return
    const doc = new jsPDF()
    const churchName = church?.name || 'Church'

    doc.setFontSize(18); doc.setFont('helvetica', 'bold')
    doc.text(churchName, 105, 20, { align: 'center' })
    doc.setFontSize(13); doc.setFont('helvetica', 'normal')
    const subtitle = `Attendance Report — ${attTitle}${attService !== 'All' ? ` · ${attService}` : ''}`
    doc.text(subtitle, 105, 28, { align: 'center' })
    doc.setFontSize(9); doc.setTextColor(128)
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 105, 34, { align: 'center' })
    doc.setTextColor(0)

    doc.setFontSize(12); doc.setFont('helvetica', 'bold')
    doc.text('Summary by Service Type', 14, 46)
    autoTable(doc, {
      startY: 50,
      head: [['Service Type', 'Services', 'Total Headcount', 'Average']],
      body: [
        ...attData.by_service.map(s => [s.service_type, String(s.service_count), String(s.total_headcount), s.average.toFixed(1)]),
        [
          { content: 'Grand Total', styles: { fontStyle: 'bold' } },
          { content: String(attData.record_count), styles: { fontStyle: 'bold' } },
          { content: String(attData.grand_total), styles: { fontStyle: 'bold' } },
          { content: attData.overall_average.toFixed(1), styles: { fontStyle: 'bold' } },
        ],
      ],
      theme: 'striped',
      headStyles: { fillColor: [0, 102, 204], fontSize: 10 },
      styles: { fontSize: 10 },
    })

    if (attData.records.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = ((doc as any).lastAutoTable?.finalY as number) || 90
      doc.setFontSize(12); doc.setFont('helvetica', 'bold')
      doc.text('Detail Records', 14, finalY + 14)
      autoTable(doc, {
        startY: finalY + 18,
        head: [['Date', 'Service Type', 'Headcount', 'Notes']],
        body: attData.records.map(r => [r.date, r.service_type, String(r.headcount), r.notes || '']),
        theme: 'striped',
        headStyles: { fillColor: [0, 102, 204], fontSize: 9 },
        styles: { fontSize: 9 },
      })
    }

    addPdfFooter(doc)
    doc.save(`attendance-report-${attTitle.replace(/[, ]+/g, '-')}.pdf`)
  }

  const generateAttendanceExcel = () => {
    if (!attData) return
    // CSV (UTF-8 with BOM) — opens natively in Excel and Google Sheets.
    const esc = (v: string | number) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines: string[] = []
    lines.push(`${church?.name || 'Church'} — Attendance Report`)
    lines.push(`Period,${attTitle}`)
    lines.push(`Service Filter,${attService}`)
    lines.push(`Generated,${new Date().toLocaleDateString()}`)
    lines.push('')
    lines.push('Summary by Service Type')
    lines.push(['Service Type', 'Services', 'Total Headcount', 'Average'].join(','))
    for (const s of attData.by_service) {
      lines.push([esc(s.service_type), s.service_count, s.total_headcount, s.average.toFixed(1)].join(','))
    }
    lines.push(['Grand Total', attData.record_count, attData.grand_total, attData.overall_average.toFixed(1)].join(','))
    lines.push('')
    lines.push('Detail Records')
    lines.push(['Date', 'Service Type', 'Headcount', 'Notes'].join(','))
    for (const r of attData.records) {
      lines.push([r.date, esc(r.service_type), r.headcount, esc(r.notes || '')].join(','))
    }
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-report-${attTitle.replace(/[, ]+/g, '-')}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const runAiReport = async () => {
    if (!aiPrompt.trim()) return
    setAiReportLoading(true); setError('')
    try {
      const [data, ch] = await Promise.all([
        api.post<AICustomReport>('/ai/custom-report', { prompt: aiPrompt }),
        church ? Promise.resolve(church) : api.get<ChurchSettings>('/settings').catch(() => null),
      ])
      setAiReport(data)
      if (ch && !church) setChurch(ch)
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to build AI report') }
    finally { setAiReportLoading(false) }
  }

  const aiReportFilename = (ext: string) => {
    const slug = (aiReport?.title || 'ai-report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    return `${slug}.${ext}`
  }

  const generateAiReportPDF = () => {
    if (!aiReport) return
    const doc = new jsPDF()
    const churchName = church?.name || 'Church'
    doc.setFontSize(18); doc.setFont('helvetica', 'bold')
    doc.text(churchName, 105, 20, { align: 'center' })
    doc.setFontSize(13); doc.setFont('helvetica', 'normal')
    doc.text(aiReport.title, 105, 28, { align: 'center' })
    doc.setFontSize(9); doc.setTextColor(128)
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 105, 34, { align: 'center' })
    doc.setTextColor(0)

    let startY = 44
    if (aiReport.summary) {
      doc.setFontSize(10); doc.setFont('helvetica', 'italic')
      const lines = doc.splitTextToSize(aiReport.summary, 180)
      doc.text(lines, 14, startY)
      startY += lines.length * 5 + 4
      doc.setFont('helvetica', 'normal')
    }

    autoTable(doc, {
      startY,
      head: [aiReport.columns],
      body: aiReport.rows.map(row => row.map(cell => String(cell ?? ''))),
      theme: 'striped',
      headStyles: { fillColor: [0, 102, 204], fontSize: 10 },
      styles: { fontSize: 9 },
    })

    addPdfFooter(doc)
    doc.save(aiReportFilename('pdf'))
  }

  const generateAiReportCSV = () => {
    if (!aiReport) return
    const esc = (v: string | number) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines: string[] = []
    lines.push(`${church?.name || 'Church'} — ${aiReport.title}`)
    if (aiReport.summary) lines.push(esc(aiReport.summary))
    lines.push(`Generated,${new Date().toLocaleDateString()}`)
    lines.push('')
    lines.push(aiReport.columns.map(esc).join(','))
    for (const row of aiReport.rows) lines.push(row.map(esc).join(','))
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = aiReportFilename('csv')
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const addPdfFooter = (doc: jsPDF) => {
    const pageCount = doc.getNumberOfPages()
    const pageHeight = doc.internal.pageSize.getHeight()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(150)
      doc.setFont('helvetica', 'normal')
      doc.text('ShepherdsCore  ·  Brought to you by VercherTechnologies.one', 105, pageHeight - 8, { align: 'center' })
    }
    doc.setTextColor(0)
  }

  const grandTotal = givingData.reduce((s, r) => s + r.total, 0)
  const annualTotal = annualDonors.reduce((s, d) => s + d.total, 0)

  const reportTitle = reportMode === 'day' && day
    ? `${MONTHS[month - 1]} ${day}, ${year}`
    : reportMode === 'year' ? `${year}` : `${MONTHS[month - 1]} ${year}`

  // ── PDF Generation ──────────────────────────────────────────────────
  const generateGivingPDF = () => {
    const doc = new jsPDF()
    const churchName = church?.name || 'Church'

    // Header
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(churchName, 105, 20, { align: 'center' })
    doc.setFontSize(13)
    doc.setFont('helvetica', 'normal')
    doc.text(`Giving Report — ${reportTitle}`, 105, 28, { align: 'center' })
    doc.setFontSize(9)
    doc.setTextColor(128)
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 105, 34, { align: 'center' })
    doc.setTextColor(0)

    // Summary by category
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Summary by Category', 14, 46)

    autoTable(doc, {
      startY: 50,
      head: [['Category', 'Transactions', 'Total']],
      body: [
        ...givingData.map(r => [r.category, String(r.count), `$${r.total.toFixed(2)}`]),
        [{ content: 'Grand Total', styles: { fontStyle: 'bold' } }, '', { content: `$${grandTotal.toFixed(2)}`, styles: { fontStyle: 'bold' } }],
      ],
      theme: 'striped',
      headStyles: { fillColor: [0, 102, 204], fontSize: 10 },
      styles: { fontSize: 10 },
    })

    // Detail records
    if (detailData && detailData.records.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const finalY = ((doc as any).lastAutoTable?.finalY as number) || 90
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Detail Records', 14, finalY + 14)

      autoTable(doc, {
        startY: finalY + 18,
        head: [['Date', 'Member', 'Category', 'Method', 'Amount']],
        body: detailData.records.map(r => [
          r.date, r.member_name, r.category, r.method || '—', `$${r.amount.toFixed(2)}`
        ]),
        theme: 'striped',
        headStyles: { fillColor: [0, 102, 204], fontSize: 9 },
        styles: { fontSize: 9 },
      })
    }

    addPdfFooter(doc)
    doc.save(`giving-report-${reportTitle.replace(/[, ]+/g, '-')}.pdf`)
  }

  const generateAnnualPDF = () => {
    const doc = new jsPDF()
    const churchName = church?.name || 'Church'

    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text(churchName, 105, 20, { align: 'center' })
    doc.setFontSize(13)
    doc.setFont('helvetica', 'normal')
    doc.text(`Annual Giving Summary — ${year}`, 105, 28, { align: 'center' })
    doc.setFontSize(9)
    doc.setTextColor(128)
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 105, 34, { align: 'center' })
    doc.setTextColor(0)

    autoTable(doc, {
      startY: 44,
      head: [['Name', 'Transactions', 'Total Given']],
      body: [
        ...annualDonors.map(d => [
          d.last_name ? `${d.last_name}, ${d.first_name}` : d.first_name,
          String(d.transactions),
          `$${d.total.toFixed(2)}`,
        ]),
        [{ content: 'Grand Total', styles: { fontStyle: 'bold' } }, '', { content: `$${annualTotal.toFixed(2)}`, styles: { fontStyle: 'bold' } }],
      ],
      theme: 'striped',
      headStyles: { fillColor: [0, 102, 204], fontSize: 10 },
      styles: { fontSize: 10 },
    })

    addPdfFooter(doc)
    doc.save(`annual-giving-${year}.pdf`)
  }

  const generateTaxLetterPDF = (donor: DonorTotal) => {
    const doc = new jsPDF()
    const ch = church

    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(ch?.name || 'Church', 14, 22)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    if (ch?.address) doc.text(ch.address, 14, 28)
    if (ch?.phone) doc.text(ch.phone, 14, 33)

    doc.setFontSize(10)
    doc.text(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), 14, 48)

    doc.setFont('helvetica', 'bold')
    doc.text(`${donor.first_name} ${donor.last_name}`, 14, 60)
    doc.setFont('helvetica', 'normal')
    doc.text('[Member Address]', 14, 66)

    const body = [
      `Dear ${donor.first_name},`,
      '',
      `Thank you for your generous contributions to ${ch?.name || 'our church'} during ${year}. This letter serves as your official tax receipt for contributions made during the calendar year.`,
      '',
      `Your total contributions for ${year}:`,
    ]
    let y = 80
    doc.setFontSize(11)
    for (const line of body) {
      if (line) doc.text(line, 14, y, { maxWidth: 180 })
      y += line ? 7 : 4
    }

    // Amount box
    doc.setFillColor(248, 249, 250)
    doc.rect(14, y, 180, 16, 'F')
    doc.setFont('helvetica', 'normal')
    doc.text(`Total Contributions (${donor.transactions} transaction${donor.transactions !== 1 ? 's' : ''})`, 18, y + 10)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(`$${donor.total.toFixed(2)}`, 190, y + 10, { align: 'right' })
    y += 24

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100)
    doc.text('No goods or services were provided in exchange for these contributions. Please retain this letter for your tax records.', 14, y, { maxWidth: 180 })
    y += 14

    doc.setTextColor(0)
    doc.setFontSize(11)
    doc.text('Sincerely,', 14, y)
    y += 8
    doc.setFont('helvetica', 'bold')
    doc.text(ch?.pastor_name || 'Church Leadership', 14, y)
    y += 6
    doc.setFont('helvetica', 'normal')
    doc.text(ch?.name || '', 14, y)

    addPdfFooter(doc)
    doc.save(`tax-letter-${donor.first_name}-${donor.last_name}-${year}.pdf`)
  }

  // --- Quick-build card actions ----------------------------------------
  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const quickMonthlyFinancial = () => {
    setReportMode('month')
    setYear(CURRENT_YEAR)
    setMonth(new Date().getMonth() + 1)
    scrollTo('giving-report-section')
    setTimeout(() => void runReport(), 50)
  }
  const quickQuarterlyAttendance = () => {
    setAttMode('month')
    setAttYear(CURRENT_YEAR)
    setAttMonth(new Date().getMonth() + 1)
    setAttService('All')
    scrollTo('attendance-report-section')
    setTimeout(() => void runAttendance(), 50)
  }
  const quickGrowthTrends = () => {
    setAiPrompt(`Members who joined by month in ${CURRENT_YEAR}`)
    scrollTo('ai-builder-section')
  }
  const quickAnnualGiving = () => {
    scrollTo('annual-report-section')
    setTimeout(() => void runAnnualReport(), 50)
  }

  return (
    <div>
      <h1 className={styles.pageTitle}>Reports</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24 }}>
        Generate and view actionable insights.
      </p>
      {error && <p className={styles.error}>{error}</p>}

      {/* Quick-build cards — per UI mockup */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: 16, marginBottom: 28,
      }}>
        <QuickReportCard
          category="FINANCIAL" title="Monthly Financial Summary"
          sub={`Giving for ${MONTHS[new Date().getMonth()]} ${CURRENT_YEAR}`}
          color="#EF4444" icon="heart"
          onGenerate={quickMonthlyFinancial}
        />
        <QuickReportCard
          category="ATTENDANCE" title="Attendance Analytics"
          sub={`${MONTHS[new Date().getMonth()]} ${CURRENT_YEAR} · all services`}
          color="#0066CC" icon="people"
          onGenerate={quickQuarterlyAttendance}
        />
        <QuickReportCard
          category="GROWTH" title="Membership Growth Trends"
          sub={`New members joined by month (${CURRENT_YEAR})`}
          color="#22C55E" icon="trending-up"
          onGenerate={quickGrowthTrends}
        />
        <QuickReportCard
          category="FINANCIAL" title="Annual Giving Statements"
          sub={`Donor totals and tax letters for ${year}`}
          color="#8B5CF6" icon="document"
          onGenerate={quickAnnualGiving}
        />
      </div>

      {/* AI Report Builder */}
      <div id="ai-builder-section" style={{ background: 'linear-gradient(135deg, #f0f7ff 0%, #ffffff 100%)', border: '1px solid #d6e4f5', borderRadius: 12, padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)', letterSpacing: 0.5 }}>AI REPORT BUILDER</span>
        </div>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Ask for a report in plain English</h3>
        <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
          Examples: "Attendance by month for Wednesday services this year" · "Giving by category for March {CURRENT_YEAR}" · "Members who joined in {CURRENT_YEAR}"
        </p>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <textarea
            value={aiPrompt}
            onChange={e => setAiPrompt(e.target.value)}
            placeholder="Describe the report you want…"
            rows={2}
            style={{ flex: 1, minWidth: 280, padding: '10px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical' }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runAiReport() }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className={styles.addBtn} onClick={runAiReport} disabled={aiReportLoading || !aiPrompt.trim()}>
              {aiReportLoading ? 'Building…' : 'Build Report'}
            </button>
            {aiReport && aiReport.record_count > 0 && (
              <>
                <button className={styles.secondaryBtn} onClick={generateAiReportPDF}>Download PDF</button>
                <button className={styles.secondaryBtn} onClick={generateAiReportCSV}>Download CSV</button>
              </>
            )}
          </div>
        </div>
      </div>

      {aiReport && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{aiReport.title}</h2>
          {aiReport.summary && (
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>{aiReport.summary}</p>
          )}
          {aiReport.record_count === 0 ? (
            <div className={styles.tableWrap} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              No records matched this request. Try rephrasing or widening the date range.
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <div className={styles.toolbar}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{aiReport.record_count} {aiReport.record_count === 1 ? 'row' : 'rows'}</span>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {aiReport.data_source}{aiReport.group_by && aiReport.group_by !== 'none' ? ` · grouped by ${aiReport.group_by}` : ''}
                </span>
              </div>
              <table>
                <thead>
                  <tr>{aiReport.columns.map((c, i) => (
                    <th key={i} style={{ textAlign: i === 0 ? 'left' : typeof aiReport.rows[0]?.[i] === 'number' ? 'right' : 'left' }}>{c}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {aiReport.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ textAlign: typeof cell === 'number' ? 'right' : 'left', fontWeight: typeof cell === 'number' ? 500 : 400 }}>
                          {typeof cell === 'number' ? cell.toLocaleString() : String(cell ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Giving Report Controls */}
      <div id="giving-report-section" style={{ background: 'var(--color-white)', borderRadius: 12, padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Giving Report</h3>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className={styles.field} style={{ minWidth: 120 }}>
            <label>Report By</label>
            <select value={reportMode} onChange={e => setReportMode(e.target.value as 'month' | 'day' | 'year')}>
              <option value="month">Month</option>
              <option value="day">Specific Day</option>
              <option value="year">Full Year</option>
            </select>
          </div>
          <div className={styles.field} style={{ minWidth: 100 }}>
            <label>Year</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))}>
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          {reportMode !== 'year' && (
            <div className={styles.field} style={{ minWidth: 120 }}>
              <label>Month</label>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
          {reportMode === 'day' && (
            <div className={styles.field} style={{ minWidth: 80 }}>
              <label>Day</label>
              <input type="number" min="1" max="31" value={day} onChange={e => setDay(e.target.value)} placeholder="1-31" />
            </div>
          )}
          <button className={styles.addBtn} onClick={runReport} disabled={loading}>
            {loading ? 'Loading…' : 'Run Report'}
          </button>
          {givingData.length > 0 && (
            <button className={styles.secondaryBtn} onClick={generateGivingPDF}>Download PDF</button>
          )}
        </div>
      </div>

      {/* Giving Results */}
      {givingData.length > 0 && (
        <>
          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Giving — {reportTitle}</h2>
          <div className={styles.tableWrap} style={{ marginBottom: 24 }}>
            <table>
              <thead><tr><th>Category</th><th>Transactions</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
              <tbody>
                {givingData.map(r => (
                  <tr key={r.category}>
                    <td>{r.category}</td><td>{r.count}</td>
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

      {/* Detail records */}
      {detailData && detailData.records.length > 0 && (
        <div className={styles.tableWrap} style={{ marginBottom: 24 }}>
          <div className={styles.toolbar}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Detail Records ({detailData.record_count})</span>
          </div>
          <table>
            <thead><tr><th>Date</th><th>Member</th><th>Category</th><th>Method</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
            <tbody>
              {detailData.records.map((r, i) => (
                <tr key={i}>
                  <td>{r.date}</td><td>{r.member_name}</td>
                  <td><span className={`${styles.badge} ${styles.badgeBlue}`}>{r.category}</span></td>
                  <td>{r.method || '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#22C55E' }}>${r.amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {memberData && (
        <div className={styles.statsGrid} style={{ marginBottom: 24 }}>
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

      {/* AI Summary */}
      {givingData.length > 0 && reportMode === 'month' && (
        <div style={{ marginBottom: 32 }}>
          {!aiSummary && (
            <button className={styles.secondaryBtn} onClick={generateAiSummary} disabled={aiSummaryLoading}>
              {aiSummaryLoading ? 'AI is analyzing…' : 'Summarize with AI'}
            </button>
          )}
          {aiSummary && (
            <div style={{ background: 'linear-gradient(135deg, #f0f7ff 0%, #f8f9fa 100%)', borderRadius: 12, padding: '20px 24px', borderLeft: '4px solid var(--color-accent)', fontSize: 14, lineHeight: 1.7 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>AI Summary</div>
              {aiSummary}
            </div>
          )}
        </div>
      )}

      {/* Attendance Report Controls */}
      <div id="attendance-report-section" style={{ background: 'var(--color-white)', borderRadius: 12, padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 14 }}>Attendance Report</h3>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className={styles.field} style={{ minWidth: 120 }}>
            <label>Report By</label>
            <select value={attMode} onChange={e => setAttMode(e.target.value as 'month' | 'day' | 'year')}>
              <option value="month">Month</option>
              <option value="day">Specific Day</option>
              <option value="year">Full Year</option>
            </select>
          </div>
          <div className={styles.field} style={{ minWidth: 100 }}>
            <label>Year</label>
            <select value={attYear} onChange={e => setAttYear(Number(e.target.value))}>
              {YEARS.map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          {attMode !== 'year' && (
            <div className={styles.field} style={{ minWidth: 120 }}>
              <label>Month</label>
              <select value={attMonth} onChange={e => setAttMonth(Number(e.target.value))}>
                {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
          {attMode === 'day' && (
            <div className={styles.field} style={{ minWidth: 80 }}>
              <label>Day</label>
              <input type="number" min="1" max="31" value={attDay} onChange={e => setAttDay(e.target.value)} placeholder="1-31" />
            </div>
          )}
          <div className={styles.field} style={{ minWidth: 160 }}>
            <label>Service</label>
            <select value={attService} onChange={e => setAttService(e.target.value)}>
              <option value="All">All Services</option>
              {attServiceOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button className={styles.addBtn} onClick={runAttendanceReport} disabled={attLoading}>
            {attLoading ? 'Loading…' : 'Run Report'}
          </button>
          {attData && attData.record_count > 0 && (
            <>
              <button className={styles.secondaryBtn} onClick={generateAttendancePDF}>Download PDF</button>
              <button className={styles.secondaryBtn} onClick={generateAttendanceExcel}>Download Excel</button>
            </>
          )}
        </div>
      </div>

      {/* Attendance Results */}
      {attData && (
        <>
          {attData.record_count === 0 ? (
            <div className={styles.tableWrap} style={{ marginBottom: 24, padding: 24, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              No attendance records for {attTitle}{attService !== 'All' ? ` · ${attService}` : ''}.
            </div>
          ) : (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>
                Attendance — {attTitle}{attService !== 'All' ? ` · ${attService}` : ''}
              </h2>

              <div className={styles.statsGrid} style={{ marginBottom: 16 }}>
                <div className={styles.statCard}>
                  <div className={styles.statValue} style={{ color: '#0066CC' }}>{attData.record_count}</div>
                  <div className={styles.statLabel}>Services Recorded</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statValue} style={{ color: '#22C55E' }}>{attData.grand_total}</div>
                  <div className={styles.statLabel}>Total Headcount</div>
                </div>
                <div className={styles.statCard}>
                  <div className={styles.statValue} style={{ color: '#F59E0B' }}>{attData.overall_average.toFixed(1)}</div>
                  <div className={styles.statLabel}>Average per Service</div>
                </div>
              </div>

              <div className={styles.tableWrap} style={{ marginBottom: 16 }}>
                <div className={styles.toolbar}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Summary by Service Type</span>
                </div>
                <table>
                  <thead><tr><th>Service Type</th><th>Services</th><th style={{ textAlign: 'right' }}>Total Headcount</th><th style={{ textAlign: 'right' }}>Average</th></tr></thead>
                  <tbody>
                    {attData.by_service.map(s => (
                      <tr key={s.service_type}>
                        <td>{s.service_type}</td>
                        <td>{s.service_count}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{s.total_headcount}</td>
                        <td style={{ textAlign: 'right' }}>{s.average.toFixed(1)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ fontWeight: 700 }}>Grand Total</td>
                      <td style={{ fontWeight: 700 }}>{attData.record_count}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, fontSize: 16, color: '#22C55E' }}>{attData.grand_total}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{attData.overall_average.toFixed(1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className={styles.tableWrap} style={{ marginBottom: 24 }}>
                <div className={styles.toolbar}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>Detail Records ({attData.record_count})</span>
                </div>
                <table>
                  <thead><tr><th>Date</th><th>Service Type</th><th style={{ textAlign: 'right' }}>Headcount</th><th>Notes</th></tr></thead>
                  <tbody>
                    {attData.records.map(r => (
                      <tr key={r.id}>
                        <td>{r.date}</td>
                        <td><span className={`${styles.badge} ${styles.badgeBlue}`}>{r.service_type}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>{r.headcount}</td>
                        <td>{r.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* Annual Report */}
      <div id="annual-report-section" style={{ background: 'var(--color-white)', borderRadius: 12, padding: '20px 24px', marginBottom: 24, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
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
          {annualDonors.length > 0 && (
            <button className={styles.secondaryBtn} onClick={generateAnnualPDF}>Download PDF</button>
          )}
        </div>
      </div>

      {annualDonors.length > 0 && (
        <div className={styles.tableWrap} style={{ marginBottom: 24 }}>
          <div className={styles.toolbar}>
            <span style={{ fontWeight: 600 }}>Donor Totals — {year}</span>
            <span style={{ fontSize: 13, color: '#888' }}>{annualDonors.length} donors &middot; ${annualTotal.toFixed(2)} total</span>
          </div>
          <table>
            <thead><tr><th>Name</th><th>Transactions</th><th style={{ textAlign: 'right' }}>Total Given</th><th>Tax Letter</th></tr></thead>
            <tbody>
              {annualDonors.map((d, i) => (
                <tr key={d.member_id ?? 'anon-' + i}>
                  <td style={{ fontWeight: 500 }}>{d.last_name ? `${d.last_name}, ${d.first_name}` : d.first_name}</td>
                  <td>{d.transactions}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#22C55E' }}>${d.total.toFixed(2)}</td>
                  <td>
                    {d.member_id && <button className={styles.editBtn} onClick={() => generateTaxLetterPDF(d)}>Download PDF</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// --- Quick report card --------------------------------------------------

type QRIcon = 'heart' | 'people' | 'trending-up' | 'document'

function QuickReportCard({
  category, title, sub, color, icon, onGenerate,
}: {
  category: string; title: string; sub: string; color: string; icon: QRIcon; onGenerate: () => void
}) {
  return (
    <div style={{
      background: 'var(--color-white)', borderRadius: 16, padding: '20px 22px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: hexToRgba(color, 0.10),
        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
      }}>
        <QuickIcon kind={icon} size={22} />
      </div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>
          {category}
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.3 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>
          {sub}
        </div>
      </div>
      <button
        onClick={onGenerate}
        style={{
          marginTop: 'auto', background: 'var(--color-bg)', color: 'var(--color-text)',
          border: '1px solid var(--color-border)', borderRadius: 10, padding: '10px 14px',
          fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}
      >
        Generate
      </button>
    </div>
  )
}

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function QuickIcon({ kind, size = 22 }: { kind: QRIcon; size?: number }) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  }
  switch (kind) {
    case 'heart':
      return (
        <svg {...p} fill="currentColor" stroke="none">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      )
    case 'people':
      return (
        <svg {...p}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    case 'trending-up':
      return (
        <svg {...p}>
          <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
          <polyline points="17 6 23 6 23 12" />
        </svg>
      )
    case 'document':
      return (
        <svg {...p}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      )
  }
}
