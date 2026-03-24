import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'
import { SpeakButton } from '../components/SpeakButton.jsx'

// SM-2 Algorithm
function calcNextReview(mastery, quality, ef, reps) {
  // quality: 0-5 (0=fail, 5=perfect)
  let newEf = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
  let newReps = quality >= 3 ? reps + 1 : 0
  let interval = 1
  if (newReps === 1) interval = 1
  else if (newReps === 2) interval = 6
  else interval = Math.round((reps > 0 ? 6 * Math.pow(ef, reps - 1) : 1) * newEf)

  const nextDate = new Date()
  nextDate.setDate(nextDate.getDate() + interval)
  const newMastery = Math.min(100, Math.max(0, mastery + (quality >= 3 ? 8 : -15)))
  const newStatus = newMastery >= 80 ? 'mastered' : newMastery < 10 ? 'learning' : undefined
  return { ef: newEf, reps: newReps, next_review_due_at: nextDate.toISOString(), mastery: newMastery, status: newStatus }
}

export default function Review() {
  const { session } = useAuth()
  const [dueWords, setDueWords] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentIdx, setCurrentIdx] = useState(0)
  const [phase, setPhase] = useState('idle') // idle | generating | challenge | evaluating | result
  const [challenge, setChallenge] = useState(null) // { challenge_prompt, target_word }
  const [userSentence, setUserSentence] = useState('')
  const [evalResult, setEvalResult] = useState(null) // { passed, score, feedback }
  const [error, setError] = useState('')

  useEffect(() => { fetchDue() }, [session])

  async function fetchDue() {
    setLoading(true)
    const { data } = await supabase
      .from('user_vocab_progress')
      .select('id, mastery_level, status, ef_factor, repetitions, vocab_master(id, word_phrase, type, domain, definition)')
      .eq('user_id', session.user.id)
      .eq('status', 'learning')
      .lte('next_review_due_at', new Date().toISOString())
      .order('next_review_due_at', { ascending: true })
      .limit(20)
    setDueWords(data || [])
    setLoading(false)
  }

  const current = dueWords[currentIdx]

  async function handleGenerateChallenge() {
    setPhase('generating')
    setError('')
    setChallenge(null)
    setEvalResult(null)
    setUserSentence('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-challenge', {
        body: { vocab_id: current.vocab_master.id, user_id: session.user.id }
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setChallenge(data)
      setPhase('challenge')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  async function handleSubmitSentence() {
    if (!userSentence.trim()) return
    setPhase('evaluating')
    setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('evaluate-challenge', {
        body: {
          vocab_id: current.vocab_master.id,
          user_id: session.user.id,
          user_sentence: userSentence,
          target_word: challenge.target_word
        }
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setEvalResult(data)
      setPhase('result')

      // Update mastery + SM-2
      const quality = data.passed ? Math.min(5, Math.round(3 + data.score / 33)) : 1
      const { ef, reps, next_review_due_at, mastery, status } = calcNextReview(
        current.mastery_level, quality, current.ef_factor, current.repetitions
      )
      const update = {
        mastery_level: mastery,
        ef_factor: ef,
        repetitions: reps,
        next_review_due_at,
        last_reviewed_at: new Date().toISOString(),
        times_used_in_writing: (current.times_used_in_writing || 0) + 1,
      }
      if (status) update.status = status
      await supabase.from('user_vocab_progress').update(update).eq('id', current.id)
    } catch (e) {
      setError(e.message)
      setPhase('challenge')
    }
  }

  function handleNext() {
    if (currentIdx + 1 >= dueWords.length) {
      fetchDue()
      setCurrentIdx(0)
    } else {
      setCurrentIdx(i => i + 1)
    }
    setPhase('idle')
    setChallenge(null)
    setEvalResult(null)
    setUserSentence('')
    setError('')
  }

  if (loading) return (
    <div className="page-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <div className="spinner" style={{ width: 36, height: 36 }} />
    </div>
  )

  return (
    <div className="page-content animate-fade-in">
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-title">Review</h1>
          <p className="page-subtitle">Active recall through writing challenges. Spaced repetition keeps you sharp.</p>
        </div>
      </div>

      {dueWords.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-16)' }}>
          <div style={{ fontSize: 64, marginBottom: 'var(--space-4)' }}>🎉</div>
          <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>All caught up!</div>
          <p style={{ color: 'var(--clr-text-secondary)' }}>No words due for review right now. Come back later or add more to your Study List.</p>
        </div>
      ) : (
        <>
          {/* Progress */}
          <div className="flex items-center gap-4" style={{ marginBottom: 'var(--space-6)' }}>
            <div style={{ flex: 1, height: 6, background: 'var(--clr-bg-elevated)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
              <div style={{ width: `${((currentIdx) / dueWords.length) * 100}%`, height: '100%', background: 'var(--clr-accent-gradient)', borderRadius: 'var(--radius-full)', transition: 'width 0.4s ease' }} />
            </div>
            <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-muted)', whiteSpace: 'nowrap' }}>
              {currentIdx + 1} / {dueWords.length}
            </span>
          </div>

          {current && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Word card */}
              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
                    <span style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: 'var(--clr-text-primary)' }}>{current.vocab_master.word_phrase}</span>
                    <SpeakButton text={current.vocab_master.word_phrase} size="md" title="Listen to pronunciation" />
                    <span className="badge badge-accent">{current.vocab_master.type?.replace('_', ' ')}</span>
                    {current.vocab_master.domain && <span className="badge badge-muted">{current.vocab_master.domain}</span>}
                  </div>
                  {current.vocab_master.definition && (
                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)' }}>{current.vocab_master.definition}</p>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginBottom: 4 }}>Mastery</div>
                  <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, background: 'var(--clr-accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{current.mastery_level}</div>
                </div>
              </div>

              {error && <div className="alert alert-danger">⚠️ {error}</div>}

              {/* Phase: idle */}
              {phase === 'idle' && (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
                  <div style={{ fontSize: 40, marginBottom: 'var(--space-4)' }}>✍️</div>
                  <p style={{ color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-6)' }}>
                    Your AI coach will create a real-world scenario for you to write a sentence using <strong style={{ color: 'var(--clr-text-primary)' }}>{current.vocab_master.word_phrase}</strong>.
                  </p>
                  <button className="btn btn-primary btn-lg" onClick={handleGenerateChallenge} id="start-challenge-btn">
                    🎯 Start Challenge
                  </button>
                </div>
              )}

              {/* Phase: generating */}
              {phase === 'generating' && (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                  <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto var(--space-4)' }} />
                  <p style={{ color: 'var(--clr-text-secondary)' }}>Creating your challenge scenario…</p>
                </div>
              )}

              {/* Phase: challenge */}
              {phase === 'challenge' && challenge && (
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
                    <div className="section-title" style={{ color: 'var(--clr-accent-light)', margin: 0 }}>📋 Your Challenge Scenario</div>
                    <SpeakButton text={challenge.challenge_prompt} size="md" title="Listen to scenario" />
                  </div>
                  <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)', lineHeight: 1.8, color: 'var(--clr-text-primary)' }}>
                    {challenge.challenge_prompt}
                  </div>
                  <div className="form-group">
                    <label className="form-label" htmlFor="challenge-sentence">
                      Write 1–2 sentences using <span style={{ color: 'var(--clr-accent-light)', fontWeight: 700 }}>"{challenge.target_word}"</span>:
                    </label>
                    <textarea
                      id="challenge-sentence"
                      className="form-textarea"
                      style={{ minHeight: 100 }}
                      placeholder="Type your sentence here…"
                      value={userSentence}
                      onChange={e => setUserSentence(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
                    <button className="btn btn-secondary" onClick={() => { setPhase('idle'); setChallenge(null) }}>Skip</button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSubmitSentence}
                      disabled={!userSentence.trim()}
                      id="submit-challenge-btn"
                    >
                      Submit Answer
                    </button>
                  </div>
                </div>
              )}

              {/* Phase: evaluating */}
              {phase === 'evaluating' && (
                <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
                  <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto var(--space-4)' }} />
                  <p style={{ color: 'var(--clr-text-secondary)' }}>Your AI coach is grading your answer…</p>
                </div>
              )}

              {/* Phase: result */}
              {phase === 'result' && evalResult && (
                <div className="card animate-fade-in" style={{ borderColor: evalResult.passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                    <div style={{ fontSize: 48 }}>{evalResult.passed ? '🎉' : '💪'}</div>
                    <div>
                      <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: evalResult.passed ? 'var(--clr-success)' : 'var(--clr-danger)' }}>
                        {evalResult.passed ? 'Great job!' : 'Keep practicing!'}
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)' }}>
                        Score: <strong>{evalResult.score}/100</strong>
                      </div>
                    </div>
                  </div>
                  {evalResult.feedback && (
                    <div style={{ position: 'relative' }}>
                      <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-5)', fontSize: 'var(--font-size-sm)', lineHeight: 1.8, color: 'var(--clr-text-secondary)' }}>
                        {evalResult.feedback}
                      </div>
                      <div style={{ position: 'absolute', top: 'var(--space-3)', right: 'var(--space-3)' }}>
                        <SpeakButton text={evalResult.feedback} title="Listen to feedback" />
                      </div>
                    </div>
                  )}
                  <button className="btn btn-primary" onClick={handleNext} id="next-word-btn">
                    {currentIdx + 1 >= dueWords.length ? '✅ Finish Session' : 'Next Word →'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
