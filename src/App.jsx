import { useState, useEffect, createContext, useContext } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase.js'
import NavBar from './components/NavBar.jsx'
import AuthForm from './components/AuthForm.jsx'
import WritingSpace from './pages/WritingSpace.jsx'
import StudyList from './pages/StudyList.jsx'
import Review from './pages/Review.jsx'
import Settings from './pages/Settings.jsx'
import WaitingRoom from './pages/WaitingRoom.jsx'
import AdminDashboard from './pages/AdminDashboard.jsx'
import ConversationMode from './pages/ConversationMode.jsx'
import Leaderboard from './pages/Leaderboard.jsx'
import Stats from './pages/Stats.jsx'
import History from './pages/History.jsx'

export const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

// Guard 1: Must be logged in
function AuthGuard({ children }) {
  const { session, loading } = useAuth()
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  )
  if (!session) return <Navigate to="/auth" replace />
  return children
}

// Guard 2: Must have 'active' account_status
// Only blocks if status is EXPLICITLY pending or suspended — not on fetch failure (null)
function AccessGuard({ children }) {
  const { profile, profileLoading } = useAuth()
  if (profileLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  )
  const status = profile?.account_status
  if (status === 'pending' || status === 'suspended') {
    return <Navigate to="/waiting-room" replace />
  }
  return children
}

// Guard 3: Must have 'admin' role
function AdminGuard({ children }) {
  const { profile, profileLoading } = useAuth()
  if (profileLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div className="spinner" style={{ width: 40, height: 40 }} />
    </div>
  )
  if (!profile || profile.role !== 'admin') {
    return <Navigate to="/conversation" replace />
  }
  return children
}

function AppLayout() {
  return (
    <div className="app-layout">
      <NavBar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/conversation" replace />} />
          <Route path="/writing" element={<WritingSpace />} />
          <Route path="/conversation" element={<ConversationMode />} />
          <Route path="/study-list" element={<StudyList />} />
          <Route path="/review" element={<Review />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  async function fetchProfile(userId) {
    setProfileLoading(true)
    const { data, error } = await supabase
      .from('user_profiles')
      .select('role, account_status')
      .eq('id', userId)
      .maybeSingle()
    if (error) {
      console.error('[fetchProfile] error:', error.message)
    }
    setProfile(data ?? null)
    setProfileLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfileLoading(false)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
        setProfileLoading(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading, profile, profileLoading, refetchProfile: () => session?.user && fetchProfile(session.user.id) }}>
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={session ? <Navigate to="/conversation" replace /> : <AuthForm />} />

          {/* Standalone waiting room — authenticated but not active */}
          <Route path="/waiting-room" element={
            <AuthGuard>
              <WaitingRoom />
            </AuthGuard>
          } />

          {/* Admin dashboard — authenticated + admin role */}
          <Route path="/admin" element={
            <AuthGuard>
              <AdminGuard>
                <AdminDashboard />
              </AdminGuard>
            </AuthGuard>
          } />

          {/* Main app — authenticated + active status */}
          <Route path="/*" element={
            <AuthGuard>
              <AccessGuard>
                <AppLayout />
              </AccessGuard>
            </AuthGuard>
          } />
        </Routes>
      </BrowserRouter>
    </AuthContext.Provider>
  )
}
