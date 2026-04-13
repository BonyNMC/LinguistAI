import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'
import GrammarCard from './GrammarCard.jsx'

/**
 * GrammarMode: Grammar practice orchestrator.
 * Fetches grammar exercises based on user's error history.
 */
export default function GrammarMode({ session, autoLoad }) {
  const [grammarData, setGrammarData] = useState(null)
  const [grammarLoading, setGrammarLoading] = useState(false)
  const [grammarAnswers, setGrammarAnswers] = useState({})
  const [grammarSubmitted, setGrammarSubmitted] = useState(false)
  const [grammarScore, setGrammarScore] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (autoLoad && !grammarData && !grammarLoading) {
      handleGenerateGrammar()
    }
  }, [autoLoad])

  async function handleGenerateGrammar() {
    setGrammarLoading(true)
    setGrammarData(null)
    setGrammarAnswers({})
    setGrammarSubmitted(false)
    setGrammarScore(null)
    setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-grammar-exercise', {})
      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)
      setGrammarData(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setGrammarLoading(false)
    }
  }

  function handleSubmitGrammar() {
    if (!grammarData) return
    const results = grammarData.exercises.map((ex, i) => ({
      selected: grammarAnswers[i] ?? -1,
      correct: ex.correct_index,
      passed: grammarAnswers[i] === ex.correct_index,
    }))
    const score = Math.round((results.filter(r => r.passed).length / results.length) * 100)
    setGrammarScore(score)
    setGrammarSubmitted(true)

    // Log review session for leaderboard activity
    supabase.from('review_sessions').insert({
      user_id: session.user.id,
      review_mode: 'grammar',
      words_reviewed: results.length,
      score,
    }).then(({ error: re }) => { if (re) console.warn('[GrammarMode] review log:', re.message) })
  }

  const allGrammarAnswered = grammarData && grammarData.exercises.every((_, i) => grammarAnswers[i] !== undefined)

  return (
    <div className="animate-fade-in">
      {error && <div className="alert alert-danger">⚠️ {error}</div>}

      {grammarLoading && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-12)' }}>
          <div className="spinner" style={{ width: 36, height: 36, margin: '0 auto var(--space-4)' }} />
          <p style={{ color: 'var(--clr-text-secondary)' }}>Analyzing your error patterns and generating exercises…</p>
        </div>
      )}

      {!grammarLoading && !grammarData && (
        <div className="card" style={{ textAlign: 'center', padding: 'var(--space-10)' }}>
          <div style={{ fontSize: 48, marginBottom: 'var(--space-4)' }}>📏</div>
          <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 800, marginBottom: 'var(--space-2)' }}>Grammar Practice</div>
          <p style={{ color: 'var(--clr-text-secondary)', marginBottom: 'var(--space-6)', maxWidth: 400, margin: '0 auto var(--space-6)' }}>
            AI will analyze your past errors and create targeted grammar exercises to fix your specific weaknesses.
          </p>
          <button className="btn btn-primary btn-lg" onClick={handleGenerateGrammar} id="start-grammar-btn">
            📏 Generate Grammar Drills
          </button>
        </div>
      )}

      {!grammarLoading && grammarData && (
        <div>
          <div className="card" style={{ marginBottom: 'var(--space-4)', borderLeft: '3px solid var(--clr-accent)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)', fontWeight: 700, marginBottom: 2 }}>GRAMMAR FOCUS</div>
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 800, color: 'var(--clr-text-primary)' }}>{grammarData.grammar_topic}</div>
                {grammarData.topic_explanation && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-secondary)', marginTop: 4 }}>{grammarData.topic_explanation}</div>
                )}
              </div>
              {grammarScore !== null && (
                <div style={{ marginLeft: 'auto', textAlign: 'center' }}>
                  <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 800, color: grammarScore >= 80 ? 'var(--clr-success)' : grammarScore >= 60 ? 'var(--clr-warning)' : 'var(--clr-danger)' }}>
                    {grammarScore}%
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-muted)' }}>
                    {grammarScore >= 80 ? '🎉 Excellent!' : grammarScore >= 60 ? '👍 Good job!' : '💪 Keep practicing!'}
                  </div>
                </div>
              )}
            </div>
          </div>

          {grammarData.exercises.map((ex, i) => (
            <GrammarCard
              key={i}
              exercise={ex}
              idx={i}
              selected={grammarAnswers[i]}
              onSelect={oi => setGrammarAnswers(prev => ({ ...prev, [i]: oi }))}
              submitted={grammarSubmitted}
            />
          ))}

          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
            {!grammarSubmitted ? (
              <button
                className="btn btn-primary btn-lg"
                onClick={handleSubmitGrammar}
                disabled={!allGrammarAnswered}
                id="submit-grammar-btn"
              >
                ✅ Submit All
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={handleGenerateGrammar} id="new-grammar-btn">
                🔄 New Set of Drills
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
