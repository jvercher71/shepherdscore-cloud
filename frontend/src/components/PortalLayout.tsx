import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import styles from './Layout.module.css' // Reuse the premium layout styling

const PORTAL_NAV_ITEMS = [
  { to: '/portal', label: 'Home', icon: '🏠' },
  { to: '/portal/precheck', label: 'Family Pre-Check', icon: '📋' },
  { to: '/portal/directory', label: 'Member Directory', icon: '👥' },
  { to: '/portal/profile', label: 'My Profile', icon: '⚙' },
]

interface MemberProfile {
  first_name: string
  last_name: string
  preferred_name?: string
  email: string
  photo_url?: string
}

export default function PortalLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [member, setMember] = useState<MemberProfile | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('shepherdscore_portal_token')
    if (!token) {
      navigate('/portal/login')
      return
    }

    // Fetch the member details
    const API_BASE = import.meta.env.VITE_API_URL || '/api'
    fetch(`${API_BASE}/portal/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then(data => {
        setMember(data.member)
      })
      .catch(() => {
        // Token expired or invalid
        localStorage.removeItem('shepherdscore_portal_token')
        localStorage.removeItem('shepherdscore_portal_member_id')
        navigate('/portal/login')
      })
  }, [navigate])

  // Close menu on navigation
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  const handleSignOut = () => {
    localStorage.removeItem('shepherdscore_portal_token')
    localStorage.removeItem('shepherdscore_portal_member_id')
    navigate('/portal/login')
  }

  const displayName = member 
    ? (member.preferred_name || member.first_name) + ' ' + member.last_name
    : 'Congregation Member'

  return (
    <div className={styles.shell}>
      {/* Mobile top bar */}
      <header className={styles.topbar}>
        <button className={styles.hamburger} onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">
          <span /><span /><span />
        </button>
        <span className={styles.topbarTitle}>Member Portal</span>
      </header>

      {/* Overlay for mobile */}
      {menuOpen && <div className={styles.overlay} onClick={() => setMenuOpen(false)} />}

      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.logo}>
          {member?.photo_url ? (
            <img src={member.photo_url} alt="Profile" className={styles.brandLogo} style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--color-accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 18 }}>
              {member ? member.first_name[0].toUpperCase() : 'M'}
            </div>
          )}
          <span className={styles.logoText} style={{ marginTop: 8, fontSize: 13, textAlign: 'center' }}>{displayName}</span>
          <span className={styles.logoTag} style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#22C55E' }}>Portal</span>
        </div>
        <nav className={styles.nav}>
          {PORTAL_NAV_ITEMS.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/portal'}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <span className={styles.navIcon}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className={styles.userFooter}>
          <span className={styles.userEmail} style={{ fontSize: 11 }}>{member?.email}</span>
          <button onClick={handleSignOut} className={styles.signOutBtn}>Exit Portal</button>
          <a href="https://VercherTechnologies.one" target="_blank" rel="noopener noreferrer" className={styles.credit}>
            Brought to you by<br /><strong>VercherTechnologies.one</strong>
          </a>
        </div>
      </aside>
      <main className={styles.content}>
        <Outlet />
      </main>
    </div>
  )
}
