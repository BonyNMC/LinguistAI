import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import NavBar from '../components/NavBar.jsx'

const STATUS_OPTIONS = ['pending', 'active', 'suspended']

const STATUS_BADGE = {
  pending:   { label: 'Pending',   cls: 'badge-pending' },
  active:    { label: 'Active',    cls: 'badge-active' },
  suspended: { label: 'Suspended', cls: 'badge-suspended' },
}

export default function AdminDashboard() {
  const [users, setUsers]             = useState([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)
  const [updating, setUpdating]       = useState({})
  // Invite
  const [inviteEmails, setInviteEmails] = useState('')
  const [inviting, setInviting]         = useState(false)
  const [inviteResults, setInviteResults] = useState([]) // [{ email, ok, msg }]

  async function loadUsers() {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('user_profiles')
      .select('id, role, account_status, created_at')
      .order('created_at', { ascending: false })

    if (err) {
      setError(err.message)
    } else {
      const enriched = await enrichWithEmails(data ?? [])
      setUsers(enriched)
    }
    setLoading(false)
  }

  async function enrichWithEmails(profiles) {
    try {
      const { data, error } = await supabase.rpc('admin_get_user_emails')
      if (error || !data) return profiles
      const emailMap = {}
      data.forEach(row => { emailMap[row.id] = row.email })
      return profiles.map(p => ({ ...p, email: emailMap[p.id] ?? null }))
    } catch {
      return profiles
    }
  }

  async function handleStatusChange(userId, newStatus) {
    setUpdating(prev => ({ ...prev, [userId]: true }))
    const { error: err } = await supabase
      .from('user_profiles')
      .update({ account_status: newStatus })
      .eq('id', userId)

    if (err) {
      alert('Error updating status: ' + err.message)
    } else {
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, account_status: newStatus } : u
      ))
    }
    setUpdating(prev => ({ ...prev, [userId]: false }))
  }

  // ── Bulk Invite ──────────────────────────────────────────
  async function handleInviteUsers(e) {
    e.preventDefault()
    const raw = inviteEmails.trim()
    if (!raw) return

    // Parse emails: split by comma, semicolon, newline, or space
    const emailList = raw
      .split(/[,;\n\s]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s && s.includes('@'))

    if (emailList.length === 0) {
      setInviteResults([{ email: raw, ok: false, msg: 'No valid emails found' }])
      return
    }

    setInviting(true)
    setInviteResults([])

    const { data: { session } } = await supabase.auth.getSession()
    const results = []

    for (const email of emailList) {
      try {
        const { data, error: fnErr } = await supabase.functions.invoke('admin-invite-user', {
          body: { email },
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        if (fnErr) throw fnErr
        if (data?.error) throw new Error(data.error)
        results.push({ email, ok: true, msg: 'Invited & activated ✓' })
      } catch (err) {
        results.push({ email, ok: false, msg: err.message })
      }
    }

    setInviteResults(results)
    setInviteEmails('')
    setInviting(false)
    loadUsers()
  }

  useEffect(() => {
    loadUsers()

    const channel = supabase
      .channel('admin-user-profiles')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_profiles' },
        () => { loadUsers() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  function formatDate(ts) {
    if (!ts) return '—'
    return new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  function shortId(id) {
    return id ? id.slice(0, 8) + '…' : '—'
  }

  const totalUsers   = users.length
  const activeUsers  = users.filter(u => u.account_status === 'active').length
  const pendingUsers = users.filter(u => u.account_status === 'pending').length

  return (
    <div className="admin-wrapper">
      <NavBar />
      <main className="admin-main">
        <div className="admin-header">
          <div>
            <h1 className="admin-title">Admin Dashboard</h1>
            <p className="admin-subtitle">Manage user access and account status</p>
          </div>
          <button className="btn-refresh" onClick={loadUsers} disabled={loading}>
            {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '↻ Refresh'}
          </button>
        </div>

        {/* Pending notification banner */}
        {pendingUsers > 0 && (
          <div className="admin-pending-banner">
            <span>🔔</span>
            <span>
              <strong>{pendingUsers} user{pendingUsers !== 1 ? 's' : ''}</strong> awaiting
              activation — scroll down to change their status to <em>Active</em>.
            </span>
          </div>
        )}

        {/* Stats */}
        <div className="admin-stats">
          <div className="admin-stat-card">
            <div className="admin-stat-value">{totalUsers}</div>
            <div className="admin-stat-label">Total Users</div>
          </div>
          <div className="admin-stat-card">
            <div className="admin-stat-value">{activeUsers}</div>
            <div className="admin-stat-label">Active</div>
          </div>
          <div className={`admin-stat-card${pendingUsers > 0 ? ' stat-pending' : ''}`}>
            <div className={`admin-stat-value${pendingUsers > 0 ? ' stat-warning' : ''}`}>{pendingUsers}</div>
            <div className="admin-stat-label">⏳ Pending Activation</div>
          </div>
        </div>

        {/* ── Invite Users ─────────────────────────────────────── */}
        <div style={{
          background: 'rgba(99,102,241,0.06)', border: '1px solid var(--clr-border)',
          borderRadius: 'var(--radius-md)', padding: 'var(--space-4)',
          marginBottom: 'var(--space-5)',
        }}>
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <span style={{ fontWeight: 700, fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-primary)' }}>✉️ Invite Users to LinguistAI</span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginLeft: 8 }}>
              Enter one or multiple emails (comma, newline, or space separated). Invited users will be <strong style={{ color: '#34d399' }}>Active</strong> immediately.
            </span>
          </div>
          <form onSubmit={handleInviteUsers} style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <textarea
              id="invite-email-input"
              className="form-input"
              placeholder={"student1@example.com, student2@example.com\nor paste a list of emails..."}
              value={inviteEmails}
              onChange={e => { setInviteEmails(e.target.value); setInviteResults([]) }}
              style={{ flex: 1, minWidth: 280, height: 60, resize: 'vertical', fontFamily: 'inherit', fontSize: 'var(--font-size-sm)' }}
              disabled={inviting}
            />
            <button
              id="invite-send-btn"
              type="submit"
              className="btn btn-primary"
              style={{ height: 40, whiteSpace: 'nowrap', marginTop: 2 }}
              disabled={inviting || !inviteEmails.trim()}
            >
              {inviting ? <span className="spinner" style={{ width: 16, height: 16 }} /> : '📨 Send Invites'}
            </button>
          </form>
          {inviteResults.length > 0 && (
            <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {inviteResults.map((r, i) => (
                <div key={i} style={{
                  fontSize: 'var(--font-size-xs)', padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  background: r.ok ? 'rgba(52,211,153,0.08)' : 'rgba(239,68,68,0.08)',
                  color: r.ok ? '#34d399' : '#f87171',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span>{r.ok ? '✅' : '⚠️'}</span>
                  <strong>{r.email}</strong>
                  <span style={{ color: 'var(--clr-text-muted)' }}>—</span>
                  <span>{r.msg}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="admin-error">
            <strong>Error:</strong> {error}
          </div>
        )}

        {loading && !users.length ? (
          <div className="admin-skeleton-wrapper">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="skeleton-row" />
            ))}
          </div>
        ) : (
          <div className="admin-table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email / ID</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th>Change Status</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', opacity: 0.5 }}>
                      No users found.
                    </td>
                  </tr>
                )}
                {users.map(user => {
                  const badge = STATUS_BADGE[user.account_status] ?? STATUS_BADGE.pending
                  return (
                    <tr key={user.id}>
                      <td className="admin-td-email">
                        {user.email
                          ? <><span className="user-email">{user.email}</span><span className="user-id">{shortId(user.id)}</span></>
                          : <span className="user-id-only" title={user.id}>{shortId(user.id)}</span>
                        }
                      </td>
                      <td>
                        <span className={`role-badge ${user.role === 'admin' ? 'role-admin' : 'role-student'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="admin-td-date">{formatDate(user.created_at)}</td>
                      <td>
                        <span className={`status-badge ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td>
                        {user.role !== 'admin' ? (
                          <select
                            className="status-select"
                            value={user.account_status}
                            disabled={!!updating[user.id]}
                            onChange={e => handleStatusChange(user.id, e.target.value)}
                          >
                            {STATUS_OPTIONS.map(s => (
                              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ opacity: 0.4, fontSize: '0.8rem' }}>Protected</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <p className="admin-count">{users.length} user{users.length !== 1 ? 's' : ''} total</p>
          </div>
        )}
      </main>
    </div>
  )
}
