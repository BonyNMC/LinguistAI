import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'
import ChallengeMode from '../components/review/ChallengeMode.jsx'
import ClozeMode from '../components/review/ClozeMode.jsx'
import GrammarMode from '../components/review/GrammarMode.jsx'
import TranslationMode from '../components/review/TranslationMode.jsx'

// ── Mode tabs config ──────────────────────────────────────────────
const MODES = [
  { id: 'challenge', label: '✍️ Challenge' },
  { id: 'story', label: '📖 Story' },
  { id: 'cloze', label: '✏️ Cloze' },
  { id: 'translation', label: '🔄 Translation' },
  { id: 'grammar', label: '📏 Grammar' },
]

export default function Review() {
  const { session } = useAuth()
  const [searchParams] = useSearchParams()

  const [dueWords, setDueWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [mode, setMode] = useState(() => searchParams.get('grammar') ? 'grammar' : 'challenge')
  const [storyContext, setStoryContext] = useState(null)

  useEffect(() => { fetchDue() }, [session])

  async function fetchDue() {
    setLoading(true)
    const now = new Date().toISOString()
    const { data: regularWords } = await supabase
      .from('user_vocab_progress')
      .select('id, mastery_level, status, ef_factor, repetitions, next_review_due_at, vocab_master(id, word_phrase, type, domain, definition)')
      .eq('user_id', session.user.id)
      .in('status', ['learning', 'reviewing'])
      .lte('next_review_due_at', now)
      .order('next_review_due_at', { ascending: true })
      .limit(20)
    const { data: maintenanceWords } = await supabase
      .from('user_vocab_progress')
      .select('id, mastery_level, status, ef_factor, repetitions, next_review_due_at, vocab_master(id, word_phrase, type, domain, definition)')
      .eq('user_id', session.user.id)
      .eq('status', 'mastered')
      .lte('next_review_due_at', now)
      .order('next_review_due_at', { ascending: true })
      .limit(3)
    setDueWords([...(regularWords || []), ...(maintenanceWords || [])])
    setLoading(false)
  }

  const current = dueWords[currentIdx]

  function handleNext() {
    if (currentIdx + 1 >= dueWords.length) {
      fetchDue()
      setCurrentIdx(0)
    } else {
      setCurrentIdx(i => i + 1)
    }
  }

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div className="spinner" style={{ width: 36, height: 36 }} />
    </div>
  )

  // Modes that need the word queue (challenge, story)
  const needsQueue = mode === 'challenge' || mode === 'story'

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Review</h1>
          <p className="page-subtitle">Active recall through challenges. Spaced repetition keeps you sharp.</p>
        </div>
        {/* Mode toggle */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {MODES.map(m => (
            <button
              key={m.id}
              id={`mode-${m.id}-btn`}
              onClick={() => {
                setMode(m.id)
                if (m.id !== 'story') setStoryContext(null)
              }}
              style={{
                padding: '4px 12px', borderRadius: 'var(--radius-full)', border: 'none',
                fontSize: 'var(--font-size-xs)', fontWeight: 600, cursor: 'pointer',
                background: mode === m.id ? 'var(--clr-accent)' : 'var(--clr-bg-elevated)',
                color: mode === m.id ? '#fff' : 'var(--clr-text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── GRAMMAR MODE — Independent of word queue ── */}
      {mode === 'grammar' && (
        <GrammarMode session={session} autoLoad={!!searchParams.get('grammar')} />
      )}

      {/* ── CLOZE MODE — Independent of word queue ── */}
      {mode === 'cloze' && (
        <ClozeMode dueWords={dueWords} session={session} />
      )}

      {/* ── TRANSLATION MODE — Independent of word queue ── */}
      {mode === 'translation' && (
        <TranslationMode session={session} />
      )}

      {/* ── CHALLENGE / STORY MODES — Need word queue ── */}
      {needsQueue && (
        <>
          {dueWords.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
              <div style={{ fontSize: 64, marginBottom: 'var(--space-4)' }}>🎉</div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>All caught up!</div>
              <p style={{ color: 'var(--clr-text-secondary)' }}>No words due for review right now. Come back later or add more to your Study List.</p>
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div className="flex items-center gap-4" style={{ marginBottom: 'var(--space-6)' }}>
                <div style={{ flex: 1, height: 6, background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                  <div style={{ width: `${((currentIdx) / dueWords.length) * 100}%`, height: '100%', background: 'var(--clr-accent-gradient)', borderRadius: 'var(--radius-full)', transition: 'width 0.4s ease' }} />
                </div>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>
                  {currentIdx}/{dueWords.length} done
                </span>
              </div>

              <ChallengeMode
                current={current}
                dueWords={dueWords}
                currentIdx={currentIdx}
                storyContext={storyContext}
                setStoryContext={setStoryContext}
                mode={mode}
                onNext={handleNext}
                session={session}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}
