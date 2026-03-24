import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'

const navItems = [
  { to: '/writing',    icon: '✍️',  label: 'Writing Space' },
  { to: '/study-list', icon: '📚',  label: 'Study List' },
  { to: '/review',     icon: '🔁',  label: 'Review' },
  { to: '/settings',   icon: '⚙️',  label: 'Settings' },
]

export default function NavBar() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)
  const email = session?.user?.email ?? ''
  const initial = email.charAt(0).toUpperCase()
  const isAdmin = profile?.role === 'admin'

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  function closeMenu() { setMobileOpen(false) }

  return (
    <>
      {/* Mobile top bar */}
      <header className="mobile-topbar">
        <a className="sidebar-brand" href="/writing" style={{ textDecoration: 'none' }}>
          <div className="sidebar-brand-icon">🧠</div>
          <span className="sidebar-brand-text">LinguistAI</span>
        </a>
        <button
          className="hamburger-btn"
          onClick={() => setMobileOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? '✕' : '☰'}
        </button>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="mobile-overlay" onClick={closeMenu} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        {/* Brand */}
        <a className="sidebar-brand" href="/writing">
          <div className="sidebar-brand-icon">🧠</div>
          <span className="sidebar-brand-text">LinguistAI</span>
        </a>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <div className="section-title">Navigation</div>
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={closeMenu}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-item-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {/* Admin link */}
          {isAdmin && (
            <>
              <div className="section-title" style={{ marginTop: '1rem' }}>Admin</div>
              <NavLink
                to="/admin"
                onClick={closeMenu}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <span className="nav-item-icon">🛡️</span>
                Dashboard
              </NavLink>
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="user-avatar">{initial}</div>
            <div style={{ overflow: 'hidden' }}>
              <div className="user-email">{email}</div>
              {isAdmin && <div style={{ fontSize: '0.65rem', color: 'var(--accent)', marginTop: 1 }}>Administrator</div>}
            </div>
          </div>
          <button className="nav-item btn-ghost" onClick={handleSignOut} style={{ marginTop: 4 }}>
            <span className="nav-item-icon">🚪</span>
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}
