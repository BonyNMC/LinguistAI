import { editDist } from '../../lib/srs.js'

/**
 * ClozePassage: Renders a passage with inline <input> fields at numbered blanks.
 * Pure presentational component — no state.
 */
export default function ClozePassage({ passage, blanks, answers, onAnswerChange, submitted }) {
  // Split by [1], [2], … placeholders
  const parts = passage.split(/(\[\d+\])/g)
  return (
    <div style={{ lineHeight: 2.4, fontSize: 'var(--font-size-base)', color: 'var(--clr-text-primary)' }}>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/)
        if (!match) return <span key={i}>{part}</span>
        const idx = parseInt(match[1])
        const blankDef = blanks.find(b => b.index === idx)
        const userVal = answers[idx] || ''
        let isCorrect = false, isWrong = false
        if (submitted && blankDef) {
          const ans = userVal.trim().toLowerCase()
          const target = blankDef.target.toLowerCase()
          isCorrect = ans === target || editDist(ans, target) <= 1
          isWrong = !isCorrect
        }
        const inputWidth = Math.max(90, ((blankDef?.target?.length || 6) + 2) * 10)
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, margin: '0 3px' }}>
            <span style={{ fontSize: 10, color: 'var(--clr-text-muted)', fontWeight: 700 }}>[{idx}]</span>
            <input
              type="text"
              value={userVal}
              onChange={e => !submitted && onAnswerChange(idx, e.target.value)}
              disabled={submitted}
              autoComplete="off"
              style={{
                width: inputWidth,
                padding: '2px 8px',
                borderRadius: 6,
                border: `2px solid ${isCorrect ? 'var(--clr-success)' : isWrong ? 'var(--clr-danger)' : 'var(--clr-accent)'}`,
                background: isCorrect ? 'rgba(34,197,94,0.1)' : isWrong ? 'rgba(239,68,68,0.07)' : 'var(--clr-bg-elevated)',
                color: 'var(--clr-text-primary)',
                fontSize: 'var(--font-size-sm)',
                textAlign: 'center',
                outline: 'none',
                transition: 'border-color 0.2s ease',
              }}
              placeholder={`   …   `}
            />
            {submitted && isWrong && blankDef && (
              <span style={{ color: 'var(--clr-success)', fontSize: 'var(--font-size-xs)', fontWeight: 700 }}>
                → {blankDef.target}
              </span>
            )}
            {submitted && isCorrect && (
              <span style={{ color: 'var(--clr-success)', fontSize: 12 }}>✓</span>
            )}
          </span>
        )
      })}
    </div>
  )
}
