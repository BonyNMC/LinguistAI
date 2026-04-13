import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { updateSrsAfterReview } from '../../lib/srs.js'
import { SpeakButton } from '../SpeakButton.jsx'
import ShadowingPanel from './ShadowingPanel.jsx'

/**
 * TranslationMode: VN→EN translation practice from past session data.
 * Sources: error_highlights[].corrected (priority) + native_spoken_rewrite.
 * Vocab hints hidden behind "Show Hint" button.
 */
export default function TranslationMode({ session }) {
  const [phase, setPhase] = useState('idle')  // idle | generating | active | evaluating | result
  const [exercises, setExercises] = useState(null)
  const [currentExIdx, setCurrentExIdx] = useState(0)
  const [userTranslation, setUserTranslation] = useState('')
  const [evalResult, setEvalResult] = useState(null)
  const [showHint, setShowHint] = useState(false)
  const [error, setError] = useState('')

  const currentExercise = exercises?.[currentExIdx]
  const isLastExercise = exercises && currentExIdx >= exercises.length - 1

  async function handleGenerate() {
    setPhase('generating')
    setError('')
    setExercises(null)
    setCurrentExIdx(0)
    setEvalResult(null)
    setShowHint(false)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-translation', {})
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      if (!data?.exercises?.length) throw new Error('No exercises generated. You may need more conversation/writing history.')
      setExercises(data.exercises)
      setPhase('active')
    } catch (e) {
      setError(e.message)
      setPhase('idle')
    }
  }

  async function handleSubmitTranslation() {
    if (!userTranslation.trim() || !currentExercise) return
    setPhase('evaluating')
    setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('evaluate-translation', {
        body: {
          user_translation: userTranslation,
          reference_english: currentExercise.english_reference,
          target_words: currentExercise.vocab_words || [],
        }
      })
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setEvalResult(data)
      setPhase('result')

      // SRS update for words used correctly
      if (currentExercise.progress_ids) {
        const wordsUsed = data.words_used || []
        const wordsMissed = data.words_missed || []
        for (const word of wordsUsed) {
          const vocabId = currentExercise.vocab_ids?.[currentExercise.vocab_words?.indexOf(word)]
          const progressId = vocabId && currentExercise.progress_ids?.[vocabId]
          if (!progressId) continue
          const { data: row } = await supabase.from('user_vocab_progress')
            .select('id,mastery_level,ef_factor,repetitions,status').eq('id', progressId).single()
          if (row) await updateSrsAfterReview(supabase, progressId, row, 4)
        }
        for (const word of wordsMissed) {
          const vocabId = currentExercise.vocab_ids?.[currentExercise.vocab_words?.indexOf(word)]
          const progressId = vocabId && currentExercise.progress_ids?.[vocabId]
          if (!progressId) continue
          const { data: row } = await supabase.from('user_vocab_progress')
            .select('id,mastery_level,ef_factor,repetitions,status').eq('id', progressId).single()
          if (row) await updateSrsAfterReview(supabase, progressId, row, 1)
        }
      }
    } catch (e) {
      setError(e.message)
      setPhase('active')
    }
  }

  function handleNextExercise() {
    if (isLastExercise) {
      // All done — go back to idle for a new set
      setPhase('idle')
      setExercises(null)
      setCurrentExIdx(0)
    } else {
      setCurrentExIdx(i => i + 1)
      setPhase('active')
    }
    setUserTranslation('')
    setEvalResult(null)
    setShowHint(false)
    setError('')
  }

  const sourceIcon = currentExercise?.source_type === 'conversation' ? '💬' : '✍️'
  const sourceLabel = currentExercise?.source_type === 'conversation' ? 'From Conversation' : 'From Writing'

  return (
    <div className="animate-fade-in">
      {error && <div className="alert alert-danger">⚠️ {error}</div>}

      {/* Idle state */}
      {phase === 'idle' && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
          <div style={{ fontSize: 48, marginBottom: 'var(--space-4)' }}>🔄</div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>Translation Practice</div>
          <p style={{ color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-6)', maxWidth: 440, margin: '0 auto var(--space-6)' }}>
            Sentences from your past conversations and writings are translated to Vietnamese. Translate them back to English to practice production!
          </p>
          <button className="btn btn-primary btn-lg" onClick={handleGenerate} id="start-translation-btn">
            🔄 Generate Translation Exercises
          </button>
        </div>
      )}

      {/* Generating */}
      {phase === 'generating' && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
          <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto var(--space-4)' }} />
          <p style={{ color: 'var(--clr-text-secondary)' }}>Analyzing your history and creating translation exercises…</p>
        </div>
      )}

      {/* Active — translate */}
      {phase === 'active' && currentExercise && (
        <div className="card animate-fade-in">
          {/* Progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div className="section-title" style={{ color: 'var(--clr-accent-light)', margin: 0 }}>🔄 Translate to English</div>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', marginLeft: 'auto' }}>
              {currentExIdx + 1}/{exercises.length}
            </span>
          </div>

          {/* Source badge */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <span style={{
              fontSize: 'var(--font-size-xs)', fontWeight: 600,
              padding: '2px 10px', borderRadius: 'var(--radius-full)',
              background: currentExercise.source_type === 'conversation' ? 'rgba(99,102,241,0.1)' : 'rgba(34,197,94,0.1)',
              color: currentExercise.source_type === 'conversation' ? 'var(--clr-accent-light)' : 'var(--clr-success)',
            }}>
              {sourceIcon} {sourceLabel}
            </span>
            {currentExercise.error_type && (
              <span style={{
                fontSize: 'var(--font-size-xs)', fontWeight: 600,
                padding: '2px 10px', borderRadius: 'var(--radius-full)',
                background: 'rgba(245,158,11,0.1)', color: 'var(--clr-warning)',
                marginLeft: 'var(--space-2)',
              }}>
                {currentExercise.error_type?.replace('_', ' ')}
              </span>
            )}
          </div>

          {/* Vietnamese sentence */}
          <div style={{
            background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)',
            padding: 'var(--space-5)', marginBottom: 'var(--space-4)',
            borderLeft: '3px solid var(--clr-accent)',
          }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
              🇻🇳 Vietnamese:
            </div>
            <div style={{ fontSize: 'var(--font-size-lg)', color: 'var(--clr-text-primary)', lineHeight: 1.8, fontWeight: 500 }}>
              {currentExercise.vietnamese}
            </div>
          </div>

          {/* Hint button */}
          {currentExercise.vocab_words?.length > 0 && (
            <div style={{ marginBottom: 'var(--space-4)' }}>
              {!showHint ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowHint(true)}
                  id="show-hint-btn"
                >
                  💡 Show Hint ({currentExercise.vocab_words.length} study {currentExercise.vocab_words.length === 1 ? 'word' : 'words'})
                </button>
              ) : (
                <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--clr-text-muted)' }}>💡 Try using:</span>
                  {currentExercise.vocab_words.map((w, i) => (
                    <span key={i} style={{
                      padding: '3px 10px', borderRadius: 'var(--radius-full)',
                      background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)',
                      fontSize: 'var(--font-size-sm)', color: 'var(--clr-accent-light)', fontWeight: 600,
                    }}>
                      {w}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Translation input */}
          <div className="form-group">
            <label className="form-label" htmlFor="translation-input" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              🇬🇧 Your English translation:
            </label>
            <textarea
              id="translation-input"
              className="form-textarea"
              style={{ minHeight: 100 }}
              placeholder="Type your English translation here…"
              value={userTranslation}
              onChange={e => setUserTranslation(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)' }}>
            <button className="btn btn-secondary" onClick={handleNextExercise}>Skip</button>
            <button
              className="btn btn-primary"
              onClick={handleSubmitTranslation}
              disabled={!userTranslation.trim()}
              id="submit-translation-btn"
            >
              Submit Translation
            </button>
          </div>
        </div>
      )}

      {/* Evaluating */}
      {phase === 'evaluating' && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
          <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto var(--space-4)' }} />
          <p style={{ color: 'var(--clr-text-secondary)' }}>Evaluating your translation…</p>
        </div>
      )}

      {/* Result */}
      {phase === 'result' && evalResult && currentExercise && (
        <div className="card animate-fade-in" style={{ borderColor: evalResult.passed ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)' }}>
          {/* Score header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
            <div style={{ fontSize: 48 }}>{evalResult.passed ? '🎉' : '💪'}</div>
            <div>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, color: evalResult.passed ? 'var(--clr-success)' : 'var(--clr-danger)' }}>
                {evalResult.passed ? 'Great translation!' : 'Keep practicing!'}
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-secondary)' }}>
                Score: <strong>{evalResult.score}/100</strong>
              </div>
            </div>
          </div>

          {/* Your translation vs Reference */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div style={{ background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', fontWeight: 700, marginBottom: 4 }}>Your Translation:</div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-text-primary)', lineHeight: 1.7, fontStyle: 'italic' }}>"{userTranslation}"</div>
            </div>
            <div style={{ background: 'rgba(99,102,241,0.04)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', borderLeft: '3px solid var(--clr-accent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', fontWeight: 700 }}>Reference:</span>
                <SpeakButton text={evalResult.reference || currentExercise.english_reference} title="Listen to reference" />
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--clr-accent-light)', lineHeight: 1.7, fontWeight: 500 }}>
                "{evalResult.reference || currentExercise.english_reference}"
              </div>
            </div>
          </div>

          {/* Word-level results */}
          {(evalResult.words_used?.length > 0 || evalResult.words_missed?.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
              {evalResult.words_used?.map((w, i) => (
                <div key={`used-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                  <span style={{ color: 'var(--clr-success)' }}>✓</span>
                  <span style={{ fontWeight: 700, color: 'var(--clr-success)' }}>{w}</span>
                  <span style={{ color: 'var(--clr-text-muted)' }}>— used correctly (+SRS)</span>
                </div>
              ))}
              {evalResult.words_missed?.map((w, i) => (
                <div key={`miss-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--font-size-xs)' }}>
                  <span style={{ color: 'var(--clr-danger)' }}>✗</span>
                  <span style={{ fontWeight: 700, color: 'var(--clr-danger)' }}>{w}</span>
                  <span style={{ color: 'var(--clr-text-muted)' }}>— missed</span>
                </div>
              ))}
            </div>
          )}

          {/* Feedback */}
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

          {/* Actions */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={handleNextExercise} id="next-translation-btn">
              {isLastExercise ? '🔄 New Set' : 'Next Exercise →'}
            </button>
            {evalResult.reference && (
              <ShadowingPanel feedbackText={evalResult.reference || currentExercise.english_reference} currentWord={currentExercise.vocab_words?.[0]} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
