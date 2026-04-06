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
