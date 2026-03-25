import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../App.jsx'

// ── Helpers ──────────────────────────────────────────────────────────

function formatDateShort(date) {
  if (!date) return ''
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function isoDate(date) {
  return date.toISOString().slice(0, 10)
}

function getTodayStr() {
  return isoDate(new Date())
}

function getMondayStr() {
  const now = new Date()
  const day = now.getDay() === 0 ? 6 : now.getDay() - 1
  const mon = new Date(now)
  mon.setDate(now.getDate() - day)
  return isoDate(mon)
}

function estimateTokens(text) {
  return Math.round(text.length / 4)
}

function formatTokenWarning(tokens) {
  if (tokens < 50000)  return { level: 'ok',     msg: `~${tokens.toLocaleString()} tokens — fits most AI context windows ✓` }
  if (tokens < 100000) return { level: 'warn',   msg: `~${tokens.toLocaleString()} tokens — large, may approach GPT-4 limits` }
  return                      { level: 'danger', msg: `~${tokens.toLocaleString()} tokens — likely exceeds most AI context windows ⚠️` }
}

function buildMarkdown({ writings, includeAnalysis, periodLabel }) {
  const header = [
    `# LinguistAI – Writing Export`,
    `**Period:** ${periodLabel}`,
    `**Entries:** ${writings.length}`,
    `**Exported:** ${new Date().toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}`,
    includeAnalysis ? `**Content:** Raw writing + AI analysis` : `**Content:** Raw writing only`,
    '',
    '---',
    '',
    '> 💡 **Tip for AI analysis:** Paste this into ChatGPT or Gemini and ask:',
    '> *"Analyse the progression in my writing across these entries. What has improved? What patterns do you see?"*',
    '',
    '---',
    '',
  ].join('\n')

  const entries = writings.map((w, i) => {
    const date = new Date(w.created_at)
    const dateStr = date.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })
    const wordCount = w.writing_raw?.trim().split(/\s+/).length ?? 0
    const lines = [
      `## Entry ${String(i + 1).padStart(2, '0')} · ${dateStr} · ${wordCount} words`,
      '',
      w.writing_raw ?? '',
    ]
    if (includeAnalysis && w.writing_analysed) {
      const a = w.writing_analysed
      if (a.native_spoken_rewrite) {
        lines.push('', '**💬 Native Rewrite:**', '', a.native_spoken_rewrite)
      }
      if (a.recall_report) {
        lines.push('', '**🎯 AI Recall Report:**', '', a.recall_report)
      }
    }
    lines.push('', '---', '')
    return lines.join('\n')
  }).join('\n')

  return header + entries
}

function triggerDownload(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── PERIOD OPTIONS ────────────────────────────────────────────────────
const PERIOD_OPTIONS = [
  { value: 'week',    label: 'This week' },
  { value: '7days',  label: 'Last 7 days' },
  { value: '30days', label: 'Last 30 days' },
  { value: 'month',  label: 'This month' },
  { value: '3months',label: 'Last 3 months' },
  { value: 'all',    label: 'All time' },
  { value: 'custom', label: '📅 Custom date range…' },
  { value: 'last_n', label: '🔢 Last N entries…' },
]

// ── Main Export Panel ─────────────────────────────────────────────────
export default function ExportPanel({ currentText }) {
  const { session } = useAuth()
  const [period, setPeriod]               = useState('week')
  const [includeAnalysis, setIncAnalysis] = useState(false)
  const [loading, setLoading]             = useState(false)
  const [preview, setPreview]             = useState(null)
  const [open, setOpen]                   = useState(false)

  // Custom date range state
  const [customFrom, setCustomFrom] = useState(getMondayStr())
  const [customTo,   setCustomTo]   = useState(getTodayStr())

  // Last-N entries state
  const [lastN, setLastN] = useState(5)

  async function fetchAndPreview() {
    setLoading(true)
    setPreview(null)

    let query = supabase
      .from('user_writings')
      .select('id, writing_raw, writing_analysed, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })

    let periodLabel = ''

    if (period === 'last_n') {
      // Fetch last N — order desc, limit, then reverse for chronological md
      const { data: raw, error } = await supabase
        .from('user_writings')
        .select('id, writing_raw, writing_analysed, created_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(Math.max(1, Number(lastN) || 5))
      setLoading(false)
      if (error) { alert('Error fetching writings: ' + error.message); return }
      const writings = (raw ?? []).reverse()
      periodLabel = `Last ${lastN} entr${lastN === 1 ? 'y' : 'ies'}`
      finishPreview(writings, periodLabel, null, null)
      return
    }

    if (period === 'custom') {
      const start = new Date(customFrom + 'T00:00:00')
      const end   = new Date(customTo   + 'T23:59:59')
      query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString())
      periodLabel = `${formatDateShort(start)} → ${formatDateShort(end)}`
    } else {
      const now = new Date()
      let start = null, end = null
      end = new Date(now); end.setHours(23, 59, 59, 999)
      start = new Date(now)
      if (period === 'week') {
        const day = now.getDay() === 0 ? 6 : now.getDay() - 1
        start.setDate(now.getDate() - day); start.setHours(0, 0, 0, 0)
      } else if (period === '7days') {
        start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0)
      } else if (period === '30days') {
        start.setDate(now.getDate() - 29); start.setHours(0, 0, 0, 0)
      } else if (period === 'month') {
        start.setDate(1); start.setHours(0, 0, 0, 0)
      } else if (period === '3months') {
        start.setMonth(now.getMonth() - 2); start.setDate(1); start.setHours(0, 0, 0, 0)
      } else if (period === 'all') {
        start = null; end = null
        periodLabel = 'All time'
      }
      if (start) { query = query.gte('created_at', start.toISOString()); periodLabel = `${formatDateShort(start)} → ${formatDateShort(end)}` }
      if (end)   { query = query.lte('created_at', end.toISOString()) }
      if (period === 'all') periodLabel = 'All time'
    }

    const { data, error } = await query
    setLoading(false)
    if (error) { alert('Error fetching writings: ' + error.message); return }
    finishPreview(data ?? [], periodLabel)
  }

  function finishPreview(writings, periodLabel) {
    const md = buildMarkdown({ writings, includeAnalysis, periodLabel })
    const tokens = estimateTokens(md)
    const warning = formatTokenWarning(tokens)

    // Derive filename date bounds from entries themselves if present
    const first = writings[0]?.created_at
    const last  = writings[writings.length - 1]?.created_at
    const fromStr = first ? isoDate(new Date(first)) : 'start'
    const toStr   = last  ? isoDate(new Date(last))  : getTodayStr()

    setPreview({ writings, count: writings.length, tokens, warning, md, periodLabel, fromStr, toStr })
  }

  function handleDownload() {
    if (!preview) return
    const suffix = includeAnalysis ? '_with-analysis' : ''
    const nSuffix = period === 'last_n' ? `_last${lastN}` : `_${preview.fromStr}_to_${preview.toStr}`
    const filename = `LinguistAI${nSuffix}_${preview.count}entries${suffix}.md`
    triggerDownload(preview.md, filename)
  }

  // Save current textarea text locally (no API needed)
  function handleSaveDraft() {
    if (!currentText?.trim()) return
    const now = new Date()
    const wordCount = currentText.trim().split(/\s+/).length
    const content = [
      `# LinguistAI – Writing Draft`,
      `**Saved:** ${now.toLocaleString('en-GB', { dateStyle: 'long', timeStyle: 'short' })}`,
      `**Words:** ${wordCount}`,
      '', '---', '',
      currentText,
    ].join('\n')
    triggerDownload(content, `LinguistAI_draft_${isoDate(now)}_${now.toTimeString().slice(0,5).replace(':','-')}.md`)
  }

  return (
    <div className="export-panel card">
      {/* Header toggle */}
      <button
        className="export-panel-toggle"
        onClick={() => { setOpen(o => !o); setPreview(null) }}
        id="export-toggle-btn"
      >
        <span>📥</span>
        <span>Export My Writings</span>
        <span className="export-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="export-panel-body animate-fade-in">
          {/* Save current draft locally */}
          {currentText?.trim() && (
            <div className="export-save-draft">
              <span className="export-draft-label">💾 Download current draft (no AI needed)</span>
              <button className="btn btn-sm btn-secondary" onClick={handleSaveDraft} id="save-draft-btn">
                Download Draft (.md)
              </button>
            </div>
          )}

          <hr className="export-divider" />

          {/* Period filter */}
          <div className="export-row">
            <label className="form-label" htmlFor="export-period" style={{ whiteSpace: 'nowrap' }}>Export period</label>
            <select
              id="export-period"
              className="form-select export-select"
              value={period}
              onChange={e => { setPeriod(e.target.value); setPreview(null) }}
            >
              {PERIOD_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Custom date range inputs */}
          {period === 'custom' && (
            <div className="export-custom-range">
              <div className="export-date-row">
                <div className="export-date-field">
                  <label className="form-label" htmlFor="export-from">From</label>
                  <input
                    id="export-from"
                    type="date"
                    className="form-input export-date-input"
                    value={customFrom}
                    max={customTo}
                    onChange={e => { setCustomFrom(e.target.value); setPreview(null) }}
                  />
                </div>
                <span className="export-date-sep">→</span>
                <div className="export-date-field">
                  <label className="form-label" htmlFor="export-to">To</label>
                  <input
                    id="export-to"
                    type="date"
                    className="form-input export-date-input"
                    value={customTo}
                    min={customFrom}
                    max={getTodayStr()}
                    onChange={e => { setCustomTo(e.target.value); setPreview(null) }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Last N entries input */}
          {period === 'last_n' && (
            <div className="export-row">
              <label className="form-label" htmlFor="export-last-n" style={{ whiteSpace: 'nowrap' }}>Number of entries</label>
              <input
                id="export-last-n"
                type="number"
                min={1}
                max={200}
                className="form-input export-n-input"
                value={lastN}
                onChange={e => { setLastN(Math.max(1, Number(e.target.value) || 1)); setPreview(null) }}
              />
              <span className="export-hint">most recent entries</span>
            </div>
          )}

          {/* Include analysis toggle */}
          <div className="export-checkbox-row">
            <label className="export-checkbox-label" htmlFor="export-analysis">
              <input
                id="export-analysis"
                type="checkbox"
                checked={includeAnalysis}
                onChange={e => { setIncAnalysis(e.target.checked); setPreview(null) }}
              />
              Include AI analysis (native rewrite + recall report)
            </label>
            <span className="export-hint">Default: raw writing only</span>
          </div>

          {/* Preview / Download */}
          {!preview ? (
            <button
              className="btn btn-secondary btn-sm"
              onClick={fetchAndPreview}
              disabled={loading}
              id="export-preview-btn"
            >
              {loading
                ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Fetching…</>
                : '🔍 Preview & Check Size'}
            </button>
          ) : (
            <div className="export-preview">
              <div className={`export-token-badge token-${preview.warning.level}`}>
                {preview.warning.msg}
              </div>
              <div className="export-meta">
                <span>📄 {preview.count} entr{preview.count !== 1 ? 'ies' : 'y'}</span>
                <span>·</span>
                <span>{preview.periodLabel}</span>
              </div>
              {preview.count === 0 ? (
                <p className="export-empty">No writings found for this period.</p>
              ) : (
                <div className="export-actions">
                  <button className="btn btn-primary btn-sm" onClick={handleDownload} id="export-download-btn">
                    ⬇️ Download .md
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>
                    Change filter
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
