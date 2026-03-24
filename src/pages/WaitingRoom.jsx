import { useAuth } from '../App.jsx'
import { supabase } from '../lib/supabase.js'
import { Navigate } from 'react-router-dom'

export default function WaitingRoom() {
  const { profile, profileLoading, session } = useAuth()

  // Escape hatch: if profile loads and user is active, send them to the app
  if (!profileLoading && profile?.account_status === 'active') {
    return <Navigate to="/writing" replace />
  }

  const isPending = !profile || profile.account_status === 'pending'
  const isSuspended = profile?.account_status === 'suspended'

  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  return (
    <div className="waiting-room-wrapper">
      <div className="waiting-room-card">
        {/* Logo / Brand */}
        <div className="waiting-room-logo">
          <span className="logo-icon">✦</span>
          <span className="logo-text">LinguistAI</span>
        </div>

        {/* Status Icon */}
        <div className={`waiting-room-status-icon ${isSuspended ? 'suspended' : 'pending'}`}>
          {isSuspended ? '⛔' : '⏳'}
        </div>

        {/* Heading */}
        <h1 className="waiting-room-title">
          {isSuspended ? 'Account Suspended' : 'Pending Activation'}
        </h1>

        {/* Message */}
        <div className="waiting-room-body">
          {isSuspended ? (
            <>
              <p>Your account has been suspended. Please contact the course administrator to resolve this.</p>
            </>
          ) : (
            <>
              <p>
                Welcome! Your account has been created and is awaiting manual activation
                by the course administrator.
              </p>
              <p>
                To gain access, please ensure you have completed your course enrollment.
              </p>
            </>
          )}

          <div className="waiting-room-notice">
            <span className="notice-icon">ℹ️</span>
            <p>
              If you have already purchased the course, please allow up to{' '}
              <strong>24 hours</strong> for account activation. If it has been longer,
              please reach out directly to the administrator.
            </p>
          </div>
        </div>

        {/* User info */}
        {session?.user?.email && (
          <p className="waiting-room-email">
            Signed in as: <strong>{session.user.email}</strong>
          </p>
        )}

        {/* Sign out */}
        <button className="btn-sign-out" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>
    </div>
  )
}
