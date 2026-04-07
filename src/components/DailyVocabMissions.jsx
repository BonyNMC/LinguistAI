import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

// sessionStorage key — shared between Writing & Conversation to avoid duplicate API calls
const SS_MISSION = 'linguist_daily_mission'

function readSS(key, fallback) {
  try { const v = sessionStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function writeSS(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)) } catch {}
}

const MASTERY_LABELS = ['New', 'Learning', 'Familiar', 'Confident', 'Mastered']
const MASTERY_COLORS = ['#f87171', '#fb923c', '#facc15', '#34d399', '#60a5fa']

export default function DailyVocabMissions() {
  const [mission, setMission] = useState(() => readSS(SS_MISSION, null))
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // Only fetch if no cached mission for this session
    if (!mission) {
      fetchMission()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function fetchMission() {
    setLoading(true)
    setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-daily-mission')
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setMission(data)
      writeSS(SS_MISSION, data)
    } catch (e) {
      setError(e.message || 'Failed to load today\'s mission.')
    } finally {
      setLoading(false)
    }
  }

  function handleRefresh() {
    sessionStorage.removeItem(SS_MISSION)
    setMission(null)
    fetchMission()
  }

  // Loading state
  if (loading) {
    return (
      <div className="card" style={{
        padding: 'var(--space-4)', marginBottom: 'var(--space-5)',
        borderColor: 'rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.04)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-3)'
      }}>
        <div className="spinner" style={{ width: 18, height: 18, flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)' }}>
          Preparing your Daily Mission…
        </span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="alert alert-danger" style={{ marginBottom: 'var(--space-5)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <span style={{ fontSize: 'var(--font-size-sm)' }}>⚠️ {error}</span>
        <button className="btn btn-ghost btn-sm" onClick={handleRefresh} id="mission-retry-btn">Retry</button>
      </div>
    )
  }

  if (!mission) return null

  return (
    <div className="card animate-fade-in" style={{
      marginBottom: 'var(--space-5)',
      borderColor: 'rgba(99,102,241,0.3)',
      background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(167,139,250,0.04) 100%)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 'var(--space-3)', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: 20 }}>🎯</span>
          <span style={{
            fontSize: 'var(--font-size-sm)', fontWeight: 700,
            color: 'var(--clr-accent-light)',
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            Today's Mission
          </span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleRefresh}
            id="mission-refresh-btn"
            title="Get a new mission"
            style={{ fontSize: 12, padding: '2px 8px' }}
          >
            ↺ Refresh
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setCollapsed(c => !c)}
            id="mission-collapse-btn"
            style={{ fontSize: 12, padding: '2px 8px' }}
          >
            {collapsed ? 'Show ▾' : 'Hide ▴'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          {/* Topic */}
          <div style={{
            fontSize: 'var(--font-size-base)', fontWeight: 700,
            color: 'var(--clr-text-primary)', marginBottom: 'var(--space-2)',
            lineHeight: 1.5,
          }}>
            💬 {mission.topic}
          </div>

          {/* Prompt / instructions */}
          <p style={{
            fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)',
            lineHeight: 1.7, margin: '0 0 var(--space-4)',
          }}>
            {mission.prompt}
          </p>

          {/* Word targets */}
          {mission.mission_words?.length > 0 && (
            <>
              <div style={{
                fontSize: 'var(--font-size-xs)', fontWeight: 700,
                color: 'var(--clr-text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 'var(--space-2)',
              }}>
                🔑 Target Words to Practice
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                {mission.mission_words.map((w, i) => {
                  const masteryIdx = Math.min(Math.floor(w.mastery / 20), 4)
                  const color = MASTERY_COLORS[masteryIdx]
                  const label = MASTERY_LABELS[masteryIdx]
                  return (
                    <div
                      key={i}
                      id={`mission-word-${w.word?.replace(/\s+/g, '-')}`}
                      title={w.definition}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        borderRadius: 99, padding: '4px 12px',
                        background: `${color}18`,
                        border: `1.5px solid ${color}44`,
                        cursor: 'help',
                      }}
                    >
                      <span style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: color, flexShrink: 0, display: 'inline-block',
                      }} />
                      <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--clr-text-primary)' }}>
                        {w.word}
                      </span>
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginTop: 'var(--space-2)', marginBottom: 0 }}>
                Hover any word to see its definition. These are your weakest words — try to use them naturally!
              </p>
            </>
          )}

          {mission.no_words && (
            <div className="alert" style={{
              background: 'rgba(99,102,241,0.08)', borderColor: 'rgba(99,102,241,0.25)',
              fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-secondary)', marginBottom: 0,
            }}>
              💡 Add words to your Study List via Writing Space or Review — your missions will become personalised!
            </div>
          )}
        </div>
      )}
    </div>
  )
}
