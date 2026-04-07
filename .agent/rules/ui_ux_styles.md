# LinguistAI – UI, UX & Styling Rules

## 🎨 Frontend Stack & Design
- **Framework**: React + Vite
- **Routing**: React Router v6
- **Styling**: Vanilla CSS only (NO Tailwind unless user explicitly requests)
- **Font**: Inter from Google Fonts
- **Design**: Premium, modern, dark mode, glassmorphism/micro-animations.
- **Theme**: Dark/Light mode toggle via localStorage `linguistai-theme` and `body.light-mode` CSS class. Theme applied on module load before first render to avoid flash.

## 💾 Frontend Performance & Persistence
- **Writing Space State Persistence**: Use `sessionStorage` to preserve raw text, analysis results, and error states across internal tab navigation (React Router unmounting).
- **Session Cleanup**: Persistence is only cleared on explicit user "Clear" clicks or full tab/window closure.
- **HTML Safety**: Plain text fields (e.g. `recall_report`, `native_spoken_rewrite`) MUST NOT contain HTML spans. Only `analysed_text_marked_up` may contain HTML. Frontend enforces `stripHtml()` sanitizer in `WritingSpace.jsx` as a safety net.

## 🗣️ Text-to-Speech (TTS)
- Web Speech API is used natively (zero cost/dependency).
- `src/components/SpeakButton.jsx` exports `useSpeech()` hook and component.
- Always cancel previous utterance (`window.speechSynthesis.cancel()`).
- Default: `lang="en-US"`, `rate=0.9`.
- Locations: Writing Space (Native Rewrite section & each suggested vocab card), Review (Word phrase card, challenge prompt, AI feedback), Study List (Each word phrase row).

## 📱 Mobile Responsive
- **<= 640px**: Sidebar hides behind hamburger button in a fixed top bar. Overlay closes sidebar on tap. `.mobile-topbar` shown, `.sidebar` slides from left. Admin `.admin-main` page gets `margin-left: 0`.
- **<= 900px**: Narrow sidebar (200px), single-column grids.
- Tables scroll horizontally via `.data-table-wrapper` and `.admin-table-wrapper`.
- All nav items call `closeMenu()` on click to close sidebar after navigation.

## 📄 Phase 15 — New Pages & Routes
- `/conversation` → `ConversationMode.jsx` — AI chat + post-session analysis.
- `/leaderboard` → `Leaderboard.jsx` — 3-tab ranking board.
- Both are protected by `AuthGuard` + `AccessGuard` (active account required).

## 🗺️ Phase 16 — Default Route Change
- **Root `/` now navigates to `/conversation`** (was `/writing`). Change reflected in `App.jsx` and the brand logo `href` in `NavBar.jsx`.
- **NavBar order**: Conversation is first, Writing Space is second.
- After login (`/auth`), users are also redirected to `/conversation`.

## 💾 Phase 15 — sessionStorage Extensions
- `ConversationMode.jsx` uses 4 sessionStorage keys: `linguist_conv_session_id`, `linguist_conv_messages`, `linguist_conv_analysis`, `linguist_conv_phase`.
- Same pattern as WritingSpace: persist across React Router unmounts, cleared on "New Conversation" button.

## 🗣️ Phase 15 — TTS / Speech Updates
- **Shadowing panel** (Review, result phase): TTS reads AI feedback via `SpeechSynthesisUtterance` (rate=0.85). `SpeechRecognition` captures learner speech and computes word-overlap score.
- SpeechRecognition is only available in Chrome/Edge. Show `alert alert-info` banner for unsupported browsers. Do NOT throw errors — gracefully degrade.
- **ConversationMode**: AI chat bubbles include a `SpeakButton` (existing component) for listen-on-demand.

## 🏆 Phase 15 — Leaderboard Design Rules
- Top 3 rows: 🥇🥈🥉 icon in rank column.
- Current user row: accent background highlight + "You" badge.
- CEFR badge: colored circle per level (A1=mint, A2=green, B1=blue, B2=indigo, C1=purple, C2=pink).
- Privacy: opt-out toggle + custom display name in Settings → Leaderboard Identity card.
- The `leaderboard` DB view handles privacy filtering server-side (`show_on_leaderboard = true` only).

## 🎯 Phase 16 — DailyVocabMissions Component
- `src/components/DailyVocabMissions.jsx` — Shared by `ConversationMode.jsx` (top of chat phase) and `WritingSpace.jsx` (above textarea).
- Invokes `generate-daily-mission` Edge Function on mount. Result cached under `sessionStorage` key `linguist_daily_mission` for the entire browser session — switching tabs does NOT trigger a second API call.
- Displays: AI topic, mission briefing, target word chips (color-coded by mastery level: red=New → blue=Mastered). Hover chip = definition tooltip.
- No-words fallback: generic mission shown when `user_vocab_progress` is empty, encouraging user to add words.
- Has Refresh (↺) button (clears cache + re-fetches) and collapse toggle.

## 🕘 Phase 17 — History Page
- `src/pages/History.jsx` — Route `/history`, NavBar icon 🕘.
- Data: merged `user_writings` (always analyzed — inserted only after `analyze-writing`) + `conversation_sessions` (filter `analysis IS NOT NULL`).
- Sorted by `created_at` DESC. Grouped by calendar day with a date label header.
- **Search**: client-side `ilike` across `title`, `writing_raw`, conversation `messages[].content`. Resets to page 1 on query change.
- **Pagination**: 20 items per page, Prev/Next buttons.
- **SessionCard**: expandable (click header). Writing cards show raw text + recall report + native rewrite. Conversation cards show message bubbles (user right, AI left) + strengths summary.
- Badge types: `✍️ Writing` (blue tint) / `💬 Conversation` (indigo tint).

## 📊 Phase 17 — Stats Page
- `src/pages/Stats.jsx` — Route `/stats`, NavBar icon 📊.
- Data fetched: `user_profiles` (streak), `user_vocab_progress` (mastery stats), `user_writings`, `conversation_sessions`, `user_vocab_progress.last_reviewed_at` (for chart).
- **ActivityHeatmap**: CSS grid of 13×13px day cells spanning ~181 days. Color levels: 0=dim, 1=35% accent, 2=60% accent, 3+=90% accent. Month labels auto-generated. Today cell has accent border.
- **LineChart**: Pure inline SVG, `viewBox="0 0 600 140"`. Uses `<polyline>` for line, `<path>` with `linearGradient` for fill, `<text>` for axis labels. X = last 30 days, Y = activity count.
- Zero external chart/calendar libraries.
