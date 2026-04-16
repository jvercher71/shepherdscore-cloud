import styles from './PageShared.module.css'

const TOPICS = [
  { title: 'How to Add a Member', body: 'Go to Members and click "+ Add Member". Fill in the required fields (first name, last name) and any optional details like phone, email, address, birthday, and status. Click Save.' },
  { title: 'How to Record Giving', body: 'Go to Giving and click "+ Record Giving". Select the member (or leave as Anonymous), enter the amount, choose a category and payment method, set the date, and click Save.' },
  { title: 'How to Split a Donation', body: 'When recording giving, check the "Split across categories" checkbox. Add splits with different categories and amounts. Each split becomes its own giving record.' },
  { title: 'How to Manage Giving Categories', body: 'On the Giving page, click "Manage Categories". You can add new fund categories or remove existing ones. Categories are church-specific.' },
  { title: 'How to Record Attendance', body: 'Go to Attendance and click "+ Record Attendance". Select the service type, date, enter the headcount, and any notes. This tracks overall service attendance.' },
  { title: 'How to Create a Family', body: 'Go to Families and click "+ Add Family". Enter the family name and details. Then open the family to add members to it.' },
  { title: 'How to Upload Member Photos', body: 'Edit a member and click "Upload Photo" at the top of the form. Select an image file and it will be uploaded automatically.' },
  { title: 'How to Upload Church Logo', body: 'Go to Settings and use the "Upload Logo" button under Church Logo. The logo appears in the sidebar and on reports.' },
  { title: 'How to Generate Reports', body: 'Go to Reports and choose your time period (day, month, or year). Click "Run Report" to see giving data. Use "Download PDF" for a professional printable report.' },
  { title: 'How to Print Tax Letters', body: 'On the Reports page, run the Annual Giving Summary. Each donor has a "Download PDF" button that generates an individual tax letter.' },
  { title: 'How to Print the Directory', body: 'Go to Directory, optionally toggle "Include Photos" on or off, then click "Print Directory". The sidebar and buttons are automatically hidden when printing.' },
  { title: 'How to Create Bible Study Groups', body: 'Go to Bible Study and click "+ Add Group". Set the name, meeting day/time, location, and assign a teacher. Then click the enrollment count to add members to the group.' },
  { title: 'How to Use AI Insights', body: 'Go to AI Insights and click "Generate Pastoral Insights". The AI analyzes attendance, giving, and group data to identify members who may need outreach.' },
  { title: 'How to Generate AI Drafts', body: 'Go to AI Drafts, select a type (announcement, email, etc.), set the tone, describe the context, and click Generate. Copy the draft to use in your communications.' },
  { title: 'How to Use Sermon Prep', body: 'Go to Sermon Prep, enter a scripture passage and/or topic, choose a preaching style, and click Generate Outline. The AI creates a complete sermon outline with points and discussion questions.' },
  { title: 'How to Use Smart Search', body: 'Go to Smart Search and type anything — member names, giving info, events, or questions. The AI searches across all your church data and returns relevant results.' },
  { title: 'How to Reset Your Password', body: 'On the login page, click "Forgot password?" and enter your email. You\'ll receive a link to reset your password.' },
  { title: 'How to Manage Events', body: 'Go to Events and click "+ Add Event". Set the name, date, time, and event type. You can also take per-member attendance for each event.' },
]

export default function HelpPage() {
  return (
    <div>
      <h1 className={styles.pageTitle}>Help & Tutorials</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 24, maxWidth: 640 }}>
        Quick guides for every feature in ShepherdsCore Cloud. Click any topic to expand.
      </p>

      <div style={{ display: 'grid', gap: 12, maxWidth: 720 }}>
        {TOPICS.map((t, i) => (
          <details key={i} style={{
            background: 'var(--color-white)', borderRadius: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}>
            <summary style={{
              padding: '16px 20px', cursor: 'pointer', fontWeight: 600, fontSize: 14,
              color: 'var(--color-text)', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ color: 'var(--color-accent)', fontSize: 16 }}>?</span>
              {t.title}
            </summary>
            <div style={{
              padding: '0 20px 16px 46px', fontSize: 14, lineHeight: 1.7,
              color: 'var(--color-text-secondary)',
            }}>
              {t.body}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}
