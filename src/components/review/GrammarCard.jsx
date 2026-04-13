/**
 * GrammarCard: Single MCQ exercise card for Grammar mode.
 * Pure presentational component — no state.
 */
export default function GrammarCard({ exercise, idx, selected, onSelect, submitted }) {
  const sentence = [exercise.sentence_before, '_____', exercise.sentence_after].filter(Boolean).join(' ')
  return (
    <div className="card" style={{ marginBottom: 'var(--space-4)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <span style={{ fontWeight: 800, fontSize: 'var(--font-size-xs)', color: 'var(--clr-accent-light)', background: 'rgba(99,102,241,0.12)', padding: '2px 8px', borderRadius: 'var(--radius-full)', flexShrink: 0, marginTop: 2 }}>Q{idx + 1}</span>
        <div style={{ fontSize: 'var(--font-size-base)', color: 'var(--clr-text-primary)', lineHeight: 1.7, fontStyle: 'italic' }}>
          "{sentence}"
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {exercise.options?.map((opt, oi) => {
          const isSelected = selected === oi
          const isCorrect = oi === exercise.correct_index
          let bg = 'var(--clr-bg-elevated)', border = 'var(--clr-border)', color = 'var(--clr-text-secondary)'
          if (submitted) {
            if (isCorrect) { bg = 'rgba(34,197,94,0.12)'; border = 'var(--clr-success)'; color = 'var(--clr-success)' }
            else if (isSelected && !isCorrect) { bg = 'rgba(239,68,68,0.07)'; border = 'var(--clr-danger)'; color = 'var(--clr-danger)' }
          } else if (isSelected) {
            bg = 'rgba(99,102,241,0.12)'; border = 'var(--clr-accent)'; color = 'var(--clr-text-primary)'
          }
          return (
            <button
              key={oi}
              onClick={() => !submitted && onSelect(oi)}
              disabled={submitted}
              style={{
                textAlign: 'left', padding: 'var(--space-3) var(--space-4)',
                borderRadius: 'var(--radius-md)', border: `1.5px solid ${border}`,
                background: bg, color, fontSize: 'var(--font-size-sm)',
                cursor: submitted ? 'default' : 'pointer', transition: 'all 0.15s ease',
                display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 10, opacity: 0.6 }}>{String.fromCharCode(65 + oi)}.</span>
              {opt}
              {submitted && isCorrect && <span style={{ marginLeft: 'auto' }}>✓</span>}
              {submitted && isSelected && !isCorrect && <span style={{ marginLeft: 'auto' }}>✗</span>}
            </button>
          )
        })}
      </div>
      {submitted && exercise.explanation && (
        <div className="animate-fade-in" style={{ marginTop: 'var(--space-3)', background: 'var(--clr-bg-base)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--font-size-xs)', color: 'var(--clr-text-secondary)', lineHeight: 1.7, borderLeft: '3px solid var(--clr-accent)' }}>
          💡 {exercise.explanation}
        </div>
      )}
    </div>
  )
}
