import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { editDist, calcNextReview, calcMaintenanceResult } from '../../lib/srs.js'
import ClozePassage from './ClozePassage.jsx'

/**
 * ClozeMode: Multi-blank cloze passage orchestrator.
 * Independent of the word queue — fetches its own 3-5 due words.
 */
export default function ClozeMode({ dueWords, session }) {
  const [phase, setPhase] = useState('idle')   // idle | generating | active | result
  const [clozeData, setClozeData] = useState(null)
  const [clozeAnswers, setClozeAnswers] = useState({})
  const [clozeResults, setClozeResults] = useState(null)
  const [clozeSubmitting, setClozeSubmitting] = useState(false)
  const [error, setError] = useState('')

  function resetCloze() {
    setClozeData(null)
    setClozeAnswers({})
    setClozeResults(null)
    setClozeSubmitting(false)
  }

  async function handleGenerateCloze() {
    setPhase('generating')
    setError('')
    resetCloze()
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-cloze', {})
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setClozeData(data)
      setClozeAnswers({})
      setPhase('active')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  async function handleSubmitCloze() {
    if (!clozeData || clozeSubmitting) return
    setClozeSubmitting(true)

    const results = clozeData.blanks.map(blank => {
      const userAnswer = (clozeAnswers[blank.index] || '').trim()
      const target = blank.target.toLowerCase()
      const ans = userAnswer.toLowerCase()
      const passed = ans === target || editDist(ans, target) <= 1
      return { index: blank.index, target: blank.target, vocab_id: blank.vocab_id, userAnswer, passed }
    })
    setClozeResults(results)
    setPhase('result')

    // Update SRS for each blank independently (with await for leaderboard accuracy)
    for (const r of results) {
      const progressId = clozeData.progress_ids?.[r.vocab_id]
      if (!progressId) continue
      // Find the progress row to get current mastery/ef/reps
      const progressRow = dueWords.find(w => w.id === progressId) ||
        (await supabase.from('user_vocab_progress').select('id,mastery_level,ef_factor,repetitions,status').eq('id', progressId).single()).data
      if (!progressRow) continue
      const quality = r.passed ? 4 : 1
      let update = { last_reviewed_at: new Date().toISOString() }
      if (progressRow.status === 'mastered') {
        const { mastery, status, next_review_due_at } = calcMaintenanceResult(r.passed)
        update = { ...update, mastery_level: mastery, status, next_review_due_at }
      } else {
        const { ef, reps, next_review_due_at, mastery, status } = calcNextReview(
          progressRow.mastery_level, quality, progressRow.ef_factor, progressRow.repetitions
        )
        update = { ...update, mastery_level: mastery, ef_factor: ef, repetitions: reps, next_review_due_at }
        if (status) update.status = status
      }
      await supabase.from('user_vocab_progress').update(update).eq('id', progressId)
    }

    // Log review session for leaderboard activity
    const correct = results.filter(r => r.passed).length
    await supabase.from('review_sessions').insert({
      user_id: session.user.id,
      review_mode: 'cloze',
      words_reviewed: results.length,
      score: Math.round((correct / results.length) * 100),
    }).then(({ error: re }) => { if (re) console.warn('[ClozeMode] review log:', re.message) })

    setClozeSubmitting(false)
  }

  const allClozeAnswered = clozeData && clozeData.blanks.every(b => (clozeAnswers[b.index] || '').trim())

  return (
    <>
      {error && <div className="alert alert-danger">⚠️ {error}</div>}

      {/* Idle / Result summary card */}
      {(phase === 'idle' || phase === 'result') && phase !== 'generating' && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-10)', marginBottom: 'var(--space-4)' }}>
          {phase === 'idle' ? (
            <>
              <div style={{ fontSize: 40, marginBottom: 'var(--space-4)' }}>✏️</div>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>Multi-Blank Cloze</div>
              <p style={{ color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-6)', maxWidth: 420, margin: '0 auto var(--space-6)' }}>
                AI creates a passage using your review words as blanks. Type each word from memory — no hints given!
              </p>
              <button className="btn btn-primary btn-lg" onClick={handleGenerateCloze} id="start-cloze-btn">
                ✏️ Generate Cloze Passage
              </button>
            </>
          ) : (
            // Cloze result summary
            clozeResults && (() => {
              const correct = clozeResults.filter(r => r.passed).length
              const total = clozeResults.length
              const pct = Math.round((correct / total) * 100)
              return (
                <div className="animate-fade-in">
                  <div style={{ fontSize: 48, marginBottom: 'var(--space-3)' }}>{pct === 100 ? '🎉' : pct >= 50 ? '👍' : '💪'}</div>
                  <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, marginBottom: 'var(--space-2)', color: pct === 100 ? 'var(--clr-success)' : pct >= 50 ? 'var(--clr-warning)' : 'var(--clr-danger)' }}>
                    {correct}/{total} Correct  ({pct}%)
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', textAlign: 'left', maxWidth: 360, margin: '0 auto var(--space-5)' }}>
                    {clozeResults.map((r, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                        <span style={{ color: r.passed ? 'var(--clr-success)' : 'var(--clr-danger)' }}>{r.passed ? '✓' : '✗'}</span>
                        <span style={{ color: 'var(--clr-text-secondary)' }}>Blank {r.index}:</span>
                        <span style={{ fontWeight: 700, color: r.passed ? 'var(--clr-success)' : 'var(--clr-danger)' }}>{r.userAnswer || '(empty)'}</span>
                        {!r.passed && <><span style={{ color: 'var(--clr-text-muted)' }}>→</span><span style={{ color: 'var(--clr-accent-light)', fontWeight: 700 }}>{r.target}</span></>}
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-primary" onClick={handleGenerateCloze} id="next-cloze-btn">
                    🔄 New Passage
                  </button>
                </div>
              )
            })()
          )}
        </div>
      )}

      {/* Generating */}
      {phase === 'generating' && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)', marginBottom: 'var(--space-4)' }}>
          <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto var(--space-4)' }} />
          <p style={{ color: 'var(--clr-text-secondary)' }}>Generating your passage with multiple blanks…</p>
        </div>
      )}

      {/* Active — fill in blanks */}
      {phase === 'active' && clozeData && (
        <div className="card animate-fade-in" style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div className="section-title" style={{ color: 'var(--clr-accent-light)', margin: 0 }}>✏️ Fill in All Blanks</div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginLeft: 'auto' }}>
              {Object.values(clozeAnswers).filter(v => v.trim()).length}/{clozeData.blanks.length} filled
            </span>
          </div>

          {/* Word bank — reference only */}
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--clr-text-muted)', marginBottom: 'var(--space-2)' }}>
              📋 WORD BANK — type these into the correct blanks:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              {clozeData.word_bank.map((w, i) => (
                <span key={i} style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', fontSize: 'var(--font-size-sm)', color: 'var(--clr-accent-light)', fontWeight: 600 }}>
                  {w}
                </span>
              ))}
            </div>
          </div>

          {/* Passage with inline inputs */}
          <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
            <ClozePassage
              passage={clozeData.passage}
              blanks={clozeData.blanks}
              answers={clozeAnswers}
              onAnswerChange={(idx, val) => setClozeAnswers(prev => ({ ...prev, [idx]: val }))}
              submitted={false}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <button className="btn btn-secondary" onClick={() => { setPhase('idle'); resetCloze() }}>Skip</button>
            <button
              className="btn btn-primary"
              onClick={handleSubmitCloze}
              disabled={!allClozeAnswered || clozeSubmitting}
              id="submit-cloze-btn"
            >
              {clozeSubmitting ? 'Checking…' : 'Check All Answers'}
            </button>
          </div>
        </div>
      )}

      {/* Result — show passage with graded blanks */}
      {phase === 'result' && clozeData && clozeResults && (
        <div className="card animate-fade-in" style={{ marginBottom: 'var(--space-4)' }}>
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <div className="section-title" style={{ color: 'var(--clr-accent-light)', margin: '0 0 var(--space-3)' }}>📋 Results</div>
            <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-5)' }}>
              <ClozePassage
                passage={clozeData.passage}
                blanks={clozeData.blanks}
                answers={clozeAnswers}
                onAnswerChange={() => {}}
                submitted={true}
              />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
