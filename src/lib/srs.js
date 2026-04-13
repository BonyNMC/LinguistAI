// ── SRS (Spaced Repetition System) Business Logic ─────────────────────────────
// Pure functions — no React, no side effects.
// Shared by ChallengeMode, ClozeMode, TranslationMode.

export const MAINTENANCE_INTERVAL_DAYS = 90

/**
 * SM-2 algorithm: calculate next review parameters.
 * @returns {{ ef, reps, next_review_due_at, mastery, status }}
 */
export function calcNextReview(mastery, quality, ef, reps) {
  let newEf = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)))
  let newReps = quality >= 3 ? reps + 1 : 0
  let interval = 1
  if (newReps === 1) interval = 1
  else if (newReps === 2) interval = 6
  else interval = Math.round((reps > 0 ? 6 * Math.pow(ef, reps - 1) : 1) * newEf)
  const nextDate = new Date()
  nextDate.setDate(nextDate.getDate() + interval)
  const newMastery = Math.min(100, Math.max(0, mastery + (quality >= 3 ? 8 : -15)))
  let newStatus
  if (newMastery >= 100) newStatus = 'mastered'
  else if (newMastery >= 80) newStatus = 'reviewing'
  else if (newMastery < 10) newStatus = 'learning'
  return { ef: newEf, reps: newReps, next_review_due_at: nextDate.toISOString(), mastery: newMastery, status: newStatus }
}

/**
 * Maintenance review for mastered words.
 * Pass → stay mastered, schedule next check in 90 days.
 * Fail → mastery drops to 70, status → reviewing, next review in 3 days.
 */
export function calcMaintenanceResult(passed) {
  const nextDate = new Date()
  if (passed) {
    nextDate.setDate(nextDate.getDate() + MAINTENANCE_INTERVAL_DAYS)
    return { mastery: 100, status: 'mastered', next_review_due_at: nextDate.toISOString() }
  } else {
    nextDate.setDate(nextDate.getDate() + 3)
    return { mastery: 70, status: 'reviewing', next_review_due_at: nextDate.toISOString() }
  }
}

/**
 * Levenshtein edit distance between two strings.
 */
export function editDist(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] = a[i-1] === b[j-1] ? m[i-1][j-1] : 1 + Math.min(m[i-1][j], m[i][j-1], m[i-1][j-1])
  return m[a.length][b.length]
}

/**
 * Shared SRS updater — updates user_vocab_progress after a review action.
 * Used by ChallengeMode, ClozeMode, and TranslationMode.
 *
 * @param {object} supabase - Supabase client
 * @param {string} progressId - user_vocab_progress.id
 * @param {object} progressRow - { mastery_level, ef_factor, repetitions, status }
 * @param {number} quality - SM-2 quality (0-5). Typically 4=pass, 1=fail.
 * @returns {object} The update object that was applied.
 */
export async function updateSrsAfterReview(supabase, progressId, progressRow, quality) {
  let update = { last_reviewed_at: new Date().toISOString() }
  if (progressRow.status === 'mastered') {
    const passed = quality >= 3
    const { mastery, status, next_review_due_at } = calcMaintenanceResult(passed)
    update = { ...update, mastery_level: mastery, status, next_review_due_at }
  } else {
    const { ef, reps, next_review_due_at, mastery, status } = calcNextReview(
      progressRow.mastery_level, quality, progressRow.ef_factor, progressRow.repetitions
    )
    update = { ...update, mastery_level: mastery, ef_factor: ef, repetitions: reps, next_review_due_at }
    if (status) update.status = status
  }
  await supabase.from('user_vocab_progress').update(update).eq('id', progressId)
  return update
}
