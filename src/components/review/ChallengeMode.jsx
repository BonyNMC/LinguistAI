import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { calcNextReview, calcMaintenanceResult } from '../../lib/srs.js'
import { SpeakButton } from '../SpeakButton.jsx'
import ShadowingPanel from './ShadowingPanel.jsx'

/**
 * ChallengeMode: Challenge + Story mode orchestrator.
 * Manages its own phase state (idle → generating → challenge → evaluating → result).
 */
export default function ChallengeMode({ current, dueWords, currentIdx, storyContext, setStoryContext, mode, onNext, session }) {
  const [phase, setPhase] = useState('idle')
  const [challenge, setChallenge] = useState(null)
  const [userSentence, setUserSentence] = useState('')
  const [evalResult, setEvalResult] = useState(null)
  const [error, setError] = useState('')

  function reset() {
    setChallenge(null)
    setEvalResult(null)
    setUserSentence('')
    setPhase('idle')
    setError('')
  }

  async function handleGenerateChallenge() {
    setPhase('generating')
    setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-challenge', {
        body: {
          vocab_id: current.vocab_master.id,
          user_id: session.user.id,
          story_mode: mode === 'story',
          story_context: storyContext,
        }
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      if (mode === 'story' && data.story_context) setStoryContext(data.story_context)
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
      let update = { last_reviewed_at: new Date().toISOString() }
      if (current.status === 'mastered') {
        const { mastery, status, next_review_due_at } = calcMaintenanceResult(data.passed)
        update = { ...update, mastery_level: mastery, status, next_review_due_at }
      } else {
        const quality = data.passed ? Math.min(5, Math.round(3 + data.score / 33)) : 1
        const { ef, reps, next_review_due_at, mastery, status } = calcNextReview(
          current.mastery_level, quality, current.ef_factor, current.repetitions
        )
        update = { ...update, mastery_level: mastery, ef_factor: ef, repetitions: reps, next_review_due_at, times_used_in_writing: (current.times_used_in_writing || 0) + 1 }
        if (status) update.status = status
      }
      await supabase.from('user_vocab_progress').update(update).eq('id', current.id)
    } catch (e) {
      setError(e.message)
      setPhase('challenge')
    }
  }

  function handleNext() {
    reset()
    onNext()
  }

  if (!current) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Maintenance banner */}
      {current?.status === 'mastered' && (
        <div style={{ borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', background: 'rgba(251,191,36,0.08)', borderLeft: '3px solid #f59e0b', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>🔧</span>
          <div>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: '#f59e0b' }}>Maintenance Check</div>
            <div style={{ fontSize: 10, color: 'var(--clr-text-muted)', marginTop: 1 }}>This word is fully mastered. Periodic check — pass to confirm it's truly acquired. Fail → back to Reviewing.</div>
          </div>
        </div>
      )}

      {/* Word Card */}
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
          {mode === 'story' && storyContext && (
            <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginBottom: 'var(--space-4)', textAlign: 'left', fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', lineHeight: 1.7 }}>
              <div style={{ fontWeight: 700, color: 'var(--clr-accent-light)', marginBottom: 4 }}>📖 Story so far…</div>
              {storyContext.slice(0, 280)}{storyContext.length > 280 ? '…' : ''}
            </div>
          )}
          <p style={{ color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-6)' }}>
            {current?.status === 'mastered'
              ? <>This is a <strong style={{ color: '#f59e0b' }}>Maintenance Review</strong>. Prove you still remember <strong style={{ color: 'var(--clr-text-primary)' }}>{current.vocab_master.word_phrase}</strong> — use it correctly in context.</>
              : mode === 'story'
                ? storyContext
                  ? <>The story continues… use <strong style={{ color: 'var(--clr-text-primary)' }}>{current?.vocab_master.word_phrase}</strong> in the next scene.</>
                  : <>Start an epic story using <strong style={{ color: 'var(--clr-text-primary)' }}>{current?.vocab_master.word_phrase}</strong>.</>
                : <>Your AI coach will create a real-world scenario for you to write a sentence using <strong style={{ color: 'var(--clr-text-primary)' }}>{current?.vocab_master.word_phrase}</strong>.</>
            }
          </p>
          <button className="btn btn-primary btn-lg" onClick={handleGenerateChallenge} id="start-challenge-btn">
            {mode === 'story' ? '📖 Continue Story' : '🎯 Start Challenge'}
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
            <button className="btn btn-primary" onClick={handleSubmitSentence} disabled={!userSentence.trim()} id="submit-challenge-btn">
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
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={handleNext} id="next-word-btn">
              {currentIdx + 1 >= dueWords.length ? '✅ Finish Session' : 'Next Word →'}
            </button>
            {evalResult.feedback && (
              <ShadowingPanel feedbackText={evalResult.feedback} currentWord={current?.vocab_master?.word_phrase} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
