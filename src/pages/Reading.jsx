import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'
import { SpeakButton } from '../components/SpeakButton.jsx'

// ── sessionStorage keys ────────────────────────────────────────────
const SS_READING = 'linguist_reading_session'

function readSS(key, fallback) {
  try { const v = sessionStorage.getItem(key); return v !== null ? JSON.parse(v) : fallback }
  catch { return fallback }
}
function writeSS(key, val) {
  try { sessionStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// Highlight study words in passage text (mark-recall style)
function HighlightedPassage({ text, vocabWords }) {
  if (!text) return null
  if (!vocabWords?.length) {
    return (
      <p style={{ lineHeight: 1.9, fontSize: 'var(--font-size-base)', color: 'var(--clr-text-primary)', whiteSpace: 'pre-wrap' }}>
        {text}
      </p>
    )
  }
  // Build regex from all vocab words (longest first to avoid partial matches)
  const sorted = [...vocabWords].sort((a, b) => b.length - a.length)
  const pattern = sorted.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const regex = new RegExp(`(${pattern})`, 'gi')
  const parts = text.split(regex)

  return (
    <p style={{ lineHeight: 1.9, fontSize: 'var(--font-size-base)', color: 'var(--clr-text-primary)', whiteSpace: 'pre-wrap' }}>
      {parts.map((part, i) => {
        const isMatch = sorted.some(w => w.toLowerCase() === part.toLowerCase())
        return isMatch
          ? <span key={i} className="mark-recall" style={{ borderRadius: 3, padding: '0 3px' }}>{part}</span>
          : <span key={i}>{part}</span>
      })}
    </p>
  )
}

// Single comprehension question card
function QuestionCard({ q, qIndex, selectedAnswer, onSelect, submitted }) {
  const isCorrect = submitted && selectedAnswer === q.correct_index
  const isWrong = submitted && selectedAnswer !== undefined && selectedAnswer !== q.correct_index

  return (
    <div className="card" style={{
      borderColor: submitted
        ? (isCorrect ? 'rgba(34,197,94,0.4)' : isWrong ? 'rgba(239,68,68,0.3)' : 'var(--clr-border)')
        : 'var(--clr-border)',
      background: submitted && isCorrect ? 'rgba(34,197,94,0.05)' : 'var(--clr-bg-surface)',
    }}>
      <div style={{ fontWeight: 600, color: 'var(--clr-text-primary)', marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-sm)' }}>
        <span style={{ color: 'var(--clr-accent-light)', marginRight: 8 }}>Q{qIndex + 1}.</span>
        {q.question}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {q.options.map((opt, i) => {
          const isSelected = selectedAnswer === i
          const isCorrectOpt = submitted && i === q.correct_index
          const isWrongOpt = submitted && isSelected && i !== q.correct_index

          let bg = 'var(--clr-bg-elevated)'
          let border = '1px solid var(--clr-border)'
          let color = 'var(--clr-text-secondary)'
          if (isSelected && !submitted) { bg = 'rgba(99,102,241,0.15)'; border = '1px solid var(--clr-accent)'; color = 'var(--clr-text-primary)' }
          if (isCorrectOpt) { bg = 'rgba(34,197,94,0.15)'; border = '1px solid rgba(34,197,94,0.5)'; color = 'var(--clr-success)' }
          if (isWrongOpt) { bg = 'rgba(239,68,68,0.1)'; border = '1px solid rgba(239,68,68,0.4)'; color = 'var(--clr-danger)' }

          return (
            <button
              key={i}
              onClick={() => !submitted && onSelect(qIndex, i)}
              disabled={submitted}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)', border, background: bg, color,
                cursor: submitted ? 'default' : 'pointer',
                fontSize: 'var(--font-size-sm)', textAlign: 'left',
                transition: 'all 0.15s ease', fontWeight: isSelected || isCorrectOpt ? 600 : 400,
              }}
            >
              <span style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                background: isCorrectOpt ? 'var(--clr-success)' : isWrongOpt ? 'var(--clr-danger)' : isSelected ? 'var(--clr-accent)' : 'var(--clr-bg-base)',
                color: (isSelected || isCorrectOpt || isWrongOpt) ? '#fff' : 'var(--clr-text-muted)',
              }}>
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
            </button>
          )
        })}
      </div>
      {submitted && q.explanation && (
        <div style={{
          marginTop: 'var(--space-3)', padding: 'var(--space-3)',
          background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)',
          fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-secondary)', lineHeight: 1.6,
        }}>
          💡 <strong>Explanation:</strong> {q.explanation}
        </div>
      )}
    </div>
  )
}

// ── Main Reading Page ──────────────────────────────────────────────
export default function Reading() {
  const { session } = useAuth()
  const [session_data, setSessionData] = useState(() => readSS(SS_READING, null))
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [score, setScore] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => { fetchHistory() }, [])
  useEffect(() => { writeSS(SS_READING, session_data) }, [session_data])

  async function fetchHistory() {
    setHistoryLoading(true)
    try {
      const { data } = await supabase
        .from('reading_sessions')
        .select('id, topic, cefr_level, score, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(6)
      setHistory(data || [])
    } catch (e) {
      console.warn('[Reading] history fetch warn:', e.message)
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleGenerate() {
    setLoading(true)
    setError('')
    setAnswers({})
    setSubmitted(false)
    setScore(null)
    setSessionData(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-reading')
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setSessionData(data)
    } catch (e) {
      setError(e.message || 'Failed to generate reading. Check your API key in Settings.')
    } finally {
      setLoading(false)
    }
  }

  function handleSelect(qIndex, optIndex) {
    setAnswers(prev => ({ ...prev, [qIndex]: optIndex }))
  }

  async function handleSubmit() {
    if (!session_data?.questions?.length) return
    const qs = session_data.questions
    const totalCorrect = qs.reduce((acc, q, i) => acc + (answers[i] === q.correct_index ? 1 : 0), 0)
    const pct = Math.round((totalCorrect / qs.length) * 100)
    setScore(pct)
    setSubmitted(true)

    // Save score to DB
    if (session_data.id) {
      await supabase.from('reading_sessions').update({
        user_answers: answers,
        score: pct,
      }).eq('id', session_data.id)
    }

    fetchHistory()
  }

  function handleNewSession() {
    sessionStorage.removeItem(SS_READING)
    setSessionData(null)
    setAnswers({})
    setSubmitted(false)
    setScore(null)
    setError('')
  }

  const allAnswered = session_data?.questions?.length > 0
    && Object.keys(answers).length === session_data.questions.length

  const cefrColor = {
    A1: '#34d399', A2: '#10b981', B1: '#60a5fa', B2: '#818cf8', C1: '#a78bfa', C2: '#ec4899'
  }

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Graded Reading</h1>
          <p className="page-subtitle">AI-generated passages at your i+1 level, with your study words embedded naturally.</p>
        </div>
        {session_data && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleNewSession}
            style={{ marginLeft: 'auto' }}
            id="new-reading-btn"
          >
            ✕ New Session
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger">⚠️ {error}</div>}

      {/* No session — generate panel */}
      {!session_data && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <div style={{ fontSize: 64, marginBottom: 'var(--space-5)' }}>📖</div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-3)', color: 'var(--clr-text-primary)' }}>
            Ready to read?
          </div>
          <p style={{ color: 'var(--clr-text-secondary)', maxWidth: 460, margin: '0 auto var(--space-6)' }}>
            Your AI coach will create a personalized passage at your i+1 CEFR level, with your current study words naturally embedded. Answer 3 comprehension questions to earn mastery credit.
          </p>
          <button className="btn btn-primary btn-lg" onClick={handleGenerate} id="generate-reading-btn">
            📖 Generate Reading
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <div className="spinner" style={{ width: 40, height: 40, margin: '0 auto var(--space-5)' }} />
          <p style={{ color: 'var(--clr-text-secondary)' }}>Crafting your personalized passage…</p>
        </div>
      )}

      {/* Session content */}
      {session_data && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

          {/* Score banner (after submit) */}
          {submitted && score !== null && (
            <div className="animate-fade-in" style={{
              borderRadius: 'var(--radius-md)', padding: 'var(--space-5)',
              background: score >= 67 ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
              borderLeft: `3px solid ${score >= 67 ? 'var(--clr-success)' : 'var(--clr-warning)'}`,
              display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 36 }}>{score === 100 ? '🎯' : score >= 67 ? '🎉' : '💪'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 'var(--font-size-lg)', color: score >= 67 ? 'var(--clr-success)' : 'var(--clr-warning)' }}>
                  {score}% — {score === 100 ? 'Perfect!' : score >= 67 ? 'Well done!' : 'Keep reading!'}
                </div>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)', marginTop: 4 }}>
                  {Object.values(answers).filter((a, i) => a === session_data.questions[i]?.correct_index).length} / {session_data.questions.length} correct
                </div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleGenerate} id="read-again-btn">
                📖 Read Another
              </button>
            </div>
          )}

          {/* Passage card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
              <div className="section-title" style={{ margin: 0, flex: 1 }}>📄 {session_data.topic}</div>
              <span style={{
                fontSize: 'var(--font-size-xs)', fontWeight: 700, padding: '3px 10px',
                background: cefrColor[session_data.cefr_level] ? `${cefrColor[session_data.cefr_level]}22` : 'var(--clr-bg-elevated)',
                color: cefrColor[session_data.cefr_level] || 'var(--clr-text-muted)',
                borderRadius: 'var(--radius-full)', border: `1px solid ${cefrColor[session_data.cefr_level] || 'var(--clr-border)'}`,
              }}>
                {session_data.cefr_level}
              </span>
              <SpeakButton text={session_data.passage} title="Listen to passage" size="md" />
            </div>

            <HighlightedPassage text={session_data.passage} vocabWords={session_data.vocab_words} />

            {session_data.vocab_words?.length > 0 && (
              <div style={{ marginTop: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>Study words in passage:</span>
                {session_data.vocab_words.map((w, i) => (
                  <span key={i} className="mark-recall" style={{ fontSize: 'var(--font-size-xs)', padding: '2px 8px', borderRadius: 'var(--radius-full)' }}>
                    {w}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Questions */}
          {session_data.questions?.length > 0 && (
            <div>
              <div className="section-title">🧠 Comprehension Questions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {session_data.questions.map((q, i) => (
                  <QuestionCard
                    key={i} q={q} qIndex={i}
                    selectedAnswer={answers[i]}
                    onSelect={handleSelect}
                    submitted={submitted}
                  />
                ))}
              </div>

              {!submitted && (
                <div style={{ marginTop: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleSubmit}
                    disabled={!allAnswered}
                    id="submit-answers-btn"
                  >
                    ✓ Submit Answers
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Reading History */}
      {!historyLoading && history.length > 0 && (
        <div style={{ marginTop: 'var(--space-8)' }}>
          <div className="section-title">🕘 Recent Reading Sessions</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
            {history.map(h => (
              <div key={h.id} className="card" style={{ padding: 'var(--space-4)' }}>
                <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-primary)', marginBottom: 4 }}>
                  📄 {h.topic || 'Untitled'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>
                    {h.cefr_level}
                  </span>
                  {h.score !== null && (
                    <span style={{
                      fontSize: 'var(--font-size-xs)', fontWeight: 700,
                      color: h.score >= 67 ? 'var(--clr-success)' : 'var(--clr-warning)',
                    }}>
                      {h.score}%
                    </span>
                  )}
                  {h.score === null && (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>Not attempted</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: 'var(--clr-text-muted)' }}>
                  {new Date(h.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
