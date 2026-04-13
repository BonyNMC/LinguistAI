# LinguistAI – Architecture & Database Rules

## 🏗️ Technical Foundation
- **Supabase Project Name**: LinguistAI (SEPARATE from the "Portfolio" project).
- **Strict isolation**: All DB schema, Auth, Edge Functions, and storage are on the LinguistAI project only. Do NOT intermix with Portfolio.

## 🗄️ Database Schema (Canonical Reference)
### `user_profiles`
- `id` (uuid, PK, FK → auth.users.id)
- `target_level` (text, default 'B2') — CEFR scale: A1, A2, B1, B2, C1, C2
- `ai_persona` (text)
- `focus_topic` (text)
- `llm_provider` (text, default 'google') — e.g. google, groq, cerebras, openrouter, mistral, cloudflare
- `llm_model` (text, default 'gemini-2.0-flash')
- `api_key_encrypted` (text)
- `role` (text, default 'student') — CHECK: 'admin' | 'student'
- `account_status` (text, default 'pending') — CHECK: 'pending' | 'active' | 'suspended'

... [remaining tables: vocab_master, user_vocab_progress, user_writings unchanged]

### `vocab_master` — Type Constraint (CRITICAL)
- **`vocab_master_type_check`** constraint allows ONLY: `'vocab'`, `'phrasal_verb'`, `'idiom'`, `'linking_word'`
- ⚠️ `'linking_verb'` is **WRONG** and will cause a DB constraint violation. Always use `'linking_word'`.
- The DB migration was applied on 2026-04-10 to fix the old incorrect constraint. The constraint is now authoritative.

## ⚡ Edge Functions (10 total — KEEP SEPARATE)
### 1. `save-api-key`
- Input: `{ raw_api_key }`
- Encrypts and saves to `user_profiles.api_key_encrypted`.
- Critical: Disables gateway JWT check; validates internally.

### 2. `analyze-writing` (v20 current)
- Input: `{ writing_text, scenario_context, genre? }`
- Hybrid Prompt + Multi-Provider support via `callLLM()`.
- `genre` param (e.g. "Formal Email") is appended to prompt when provided, enabling genre-aware register evaluation.
- After analysis: calls `creditVocabUsage()` to award +10 mastery for each study word found in the writing text.
- Returns: `{ analysed_text_marked_up, recall_report, native_spoken_rewrite, new_vocabulary_suggestions, cefr_estimate, tone_evaluation, error_highlights, credited_words[] }`

### 3. `generate-challenge` (Review Step 1)
- Fetches word + profile → `callLLM()` → scenario.
- Returns: `{ challenge_prompt, target_word }`

### 4. `evaluate-challenge` (Review Step 2)
- Evaluates sentence → SM-2 progression.
- Returns: `{ passed: bool, score: int, feedback: string }`

## 🔐 Commercial Access Model (BYOK)
- **BYOK**: Users provide their own API key. No credit system.
- **Access Gate**: `account_status` controls access. Defaults to `pending` on sign-up.
- **Roles**: `admin` (platform owner) and `student`. Admin manually set via SQL.
- **WaitingRoom**: The only page available to `pending`/`suspended` users. Shows purchase/wait instructions including: *"If you have already purchased the course, please allow up to 24 hours for account activation."*
- **Edge Function Gate**: Every Edge Function validates `account_status = 'active'` after internal JWT check before processing (returns HTTP 403 for non-active).

---

## 🗄️ Phase 15 — Additional DB Schema

### `user_profiles` (updated columns)
- `cefr_detected` (text, nullable) — AI-detected CEFR level: A1–C2
- `cefr_confidence` (int, default 0) — 0–100, increases with more samples
- `writing_samples_count` (int, default 0) — Total analyzed writing/conversation samples

### `conversation_sessions` (NEW)
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users.id, CASCADE)
- `title` (text, nullable) — AI-generated from analysis
- `messages` (jsonb, default `[]`) — Each item: `{ role: 'user'|'ai', content: text, timestamp: ISO }`
- `analysis` (jsonb, nullable) — Full `analyze-conversation` result
- `created_at`, `updated_at` (timestamptz)
- RLS: user sees own rows only

### `user_public_profiles` (NEW)
- `user_id` (uuid, PK, FK → auth.users.id)
- `display_name` (text, nullable) — Shown on Leaderboard; falls back to email prefix
- `show_on_leaderboard` (boolean, default true) — Privacy opt-out
- `updated_at` (timestamptz)
- RLS: user can write own row; all authenticated users can SELECT

### `get_leaderboard` (FUNCTION/RPC)
- Signature: `(p_start_date timestamptz, p_end_date timestamptz)` returning TABLE.
- Aggregates `user_vocab_progress`, `conversation_sessions`, `user_writings`, `review_sessions` filtered by date ranges.
- `total_activity_count` = writing sessions + conversation sessions (with analysis) + **review sessions**
- Calculates an `overall_score` = `(mastered * 100) + (activity * 20) + (streak * 10) + mastery_points`.
- Only includes `account_status = 'active'` AND `show_on_leaderboard = true`
- Returns TABLE: `user_id`, `username`, `cefr_detected`, `target_level`, `total_mastery_points`, `words_mastered`, `total_activity_count`, `current_streak`, `best_streak`, `overall_score`

## ⚡ Edge Functions (Phase 15 additions)

### 5. `chat-message` (NEW)
- Input: `{ session_id, message, messages_history[] }`
- AI replies as a natural conversation partner. **NEVER corrects grammar mid-chat.** Appends messages to `conversation_sessions`.
- Output: `{ reply: text, messages: updated_array }`

### 6. `analyze-conversation` (v4 current)
- Input: `{ session_id, scenario_context }`
- Reads all messages, analyzes ONLY [Learner] turns.
- After analysis: calls `creditVocabUsage()` to award +10 mastery for each study word found in the learner's messages.
- Returns: `{ cefr_estimate, strengths, improvement_areas[], error_highlights[], vocabulary_suggestions[], tone_evaluation, title, credited_words[] }`
- Also updates `user_profiles.cefr_detected` via Weighted Moving Average.

### Updated: `analyze-writing` (v17)
- Now returns `cefr_estimate`, `tone_evaluation`, `error_highlights[]`.
- Updates `user_profiles` CEFR columns after each analysis.
- Prompt now uses `cefr_detected` + i+1 hypothesis for native rewrite and vocab suggestions, alongside `scenario_context`.

### Updated: `generate-challenge` (v9)
- New optional params: `story_mode: bool`, `story_context: text|null`
- When `story_mode=true`: generates/continues a linked narrative across challenges.
- Returns `story_context` field for frontend to persist per session.

## ⚡ Edge Functions (Phase 16 additions)

### 7. `generate-daily-mission` (NEW)
- Input: none (reads user from JWT)
- Queries `user_vocab_progress` joined with `vocab_master`: top 5 rows ordered by `mastery_level ASC`, `next_review_due_at ASC` — same SM-2 priority as Active Recall.
- Only considers words with `status IN ('learning', 'reviewing')`.
- Calls LLM to generate a `{ topic, prompt }` — a mission briefing that naturally frames the context so the user practices the weak words.
- Fallback (no words): returns a generic intro mission with `no_words: true`.
- Output: `{ mission_words[], topic, prompt, no_words }`.

## ⚡ Edge Functions (Phase 21 additions)

### 8. `generate-reading` (NEW — Tier 1 Graded Reading)
- Input: none (reads user from JWT)
- Reads: `cefr_detected`, `focus_topic`, `api_key_encrypted`, top 5 study words
- Logic: generates an i+1 CEFR passage (180–240 words) using study words, + 3 comprehension questions
- Saves result to `reading_sessions` table
- Output: `{ id, topic, passage, cefr_level, vocab_words[], questions[] }`

### 9. `generate-cloze` (NEW — Tier 1 Contextual Cloze Review)
- Input: `{ vocab_id }`
- Fetches word details from `vocab_master`, reads user profile for context
- Generates 2–3 natural sentences with the target word replaced by `_____`
- Output: `{ cloze_text, target_word, hint_label, word_count, definition }`
- Typo tolerance: frontend accepts edit distance ≤ 1 from target word

## 🗄️ Phase 21 — New Table

### `reading_sessions`
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users)
- `passage_text` (text)
- `cefr_level` (text)
- `topic` (text)
- `vocab_words` (text[]) — study words embedded in passage
- `questions` (jsonb) — `[{question, options[], correct_index, explanation}]`
- `user_answers` (jsonb) — `{q_index: chosen_index}`
- `score` (integer) — 0-100, set after submit
- `created_at` (timestamptz)
- RLS: owner-only read/write via `reading_sessions_own` policy

## 🖥️ Phase 21 — Frontend Features

### New Page: `/reading` (Reading.jsx)
- AI-generated graded reading passages at i+1 CEFR
- Study words highlighted with `.mark-recall` class
- 3 comprehension questions (factual, vocab-in-context, inference)
- SRS-linked: answers saved to `reading_sessions`
- Recent reading history panel (6 sessions)
- sessionStorage key: `linguist_reading_session`

### Modified: Stats.jsx — Error Pattern Intelligence
- Pulls `writing_analysed.error_highlights[]` from last 30 `user_writings`
- Pulls `analysis.error_highlights[]` from last 30 `conversation_sessions`
- Aggregates by error type → inline CSS bar chart
- Lists top 5 recurring specific errors (original → corrected pairs)
- No new API calls — pure client-side aggregation from existing data

### Modified: Review.jsx — 5-Mode Toggle + Modular Architecture (Phase 21 → Phase 24)
- Mode toggle: ✍️ Challenge | 📖 Story | ✏️ Cloze | 🔄 Translation | 📏 Grammar
- **Phase 24 Modular Refactor**: Monolithic `Review.jsx` (945 lines) decomposed into slim orchestrator (~160 lines) + 4 mode components + shared SRS module.
- **File structure**:
  - `src/pages/Review.jsx` — Orchestrator: mode tabs, due-word fetching, routing to mode components
  - `src/lib/srs.js` — Shared SRS business logic: `calcNextReview()`, `calcMaintenanceResult()`, `editDist()`, `updateSrsAfterReview()`
  - `src/components/review/ChallengeMode.jsx` — Challenge/Story word review
  - `src/components/review/ClozeMode.jsx` — Multi-blank cloze passages
  - `src/components/review/GrammarMode.jsx` — Grammar MCQ drills
  - `src/components/review/TranslationMode.jsx` — VN→EN translation practice
  - `src/components/review/ClozePassage.jsx` — Inline `[N]` → `<input>` renderer
  - `src/components/review/GrammarCard.jsx` — Individual grammar MCQ card
  - `src/components/review/ShadowingPanel.jsx` — Speech recognition + word-diff
- **All 4 review modes** log to `review_sessions` table after each exercise → counted as activity on leaderboard
- **Cloze Mode** (Phase 21, SUPERSEDED by Phase 22 — see below)
- **Enhanced Shadowing**: word-level diff (green=hit, red=miss), IPA phonetic from Dictionary API, max 3 attempts counter

### Modified: WritingSpace.jsx — Genre Scaffolding
- Genre selector: General | Formal Email | Opinion Essay | Narrative | Product Review | Argument
- Selecting a genre auto-fills Scenario Context and reveals structure outline + clickable useful phrases
- `genre` field sent to `analyze-writing` for genre-aware register evaluation
- `GENRES` constant is hardcoded (no API needed)

---

## ⚡ Edge Functions (Phase 22 — commit b2ba223)

### 10. `generate-cloze` (v2 — REPLACE v1, Multi-Blank Passage)
- **Input**: none — reads user from JWT automatically
- **Logic**:
  1. Fetches top 3–5 due words (status learning/reviewing, lowest mastery + most overdue)
  2. Prompt asks AI to generate ONE connected passage embedding ALL words as numbered blanks `[1]`, `[2]`…
  3. Shuffles word list into a `word_bank` array (reference only — user must type)
- **Output**:
```json
{
  "passage": "She decided to [1] the issue before trying to [2] a solution…",
  "blanks": [{"index": 1, "target": "look into", "vocab_id": "uuid"}],
  "word_bank": ["come up with", "look into"],
  "progress_ids": {"vocab_uuid": "progress_uuid"}
}
```
- SRS updated **per word** (each blank graded independently with `await`)
- Typo tolerance: edit distance ≤ 1

### 11. `generate-grammar-exercise` (NEW)
- **Input**: none — reads error history from DB via JWT
- **Logic**:
  1. Queries last 30 `user_writings.writing_analysed.error_highlights` where `type = 'grammar'`
  2. Queries last 30 `conversation_sessions.analysis.error_highlights` where `type = 'grammar'`
  3. Sends error list to LLM → LLM identifies PRIMARY grammar weakness + generates 5 MCQ drills
- **Output**:
```json
{
  "grammar_topic": "Past Perfect vs Simple Past",
  "topic_explanation": "Brief explanation of why this is common at this level",
  "exercises": [
    {
      "sentence_before": "By the time she arrived, he",
      "sentence_after": "already left.",
      "options": ["had already", "already has", "already", "was already having"],
      "correct_index": 0,
      "explanation": "Past perfect (had + V3) for action completed before another past action."
    }
  ]
}
```
- No DB writes — grammar exercises are session-only (not SRS-linked)

## 🖥️ Phase 22 — Frontend Features

### Modified: Review.jsx — 4-Mode Toggle (COMPLETE REWRITE)
- Mode toggle: ✍️ Challenge | 📖 Story | ✏️ Cloze | 📏 Grammar
- **Cloze Mode (REDESIGNED)**:
  - Independent of current word card — fetches 3–5 words autonomously
  - Inline `<ClozePassage>` component parses `[1]`, `[2]` placeholders → renders `<input>` fields inline in text
  - Word bank shown as reference pills (read-only) — user MUST type answers manually (deliberate: builds orthographic memory)
  - Submit graded per-blank, each awaited independently → leaderboard updates immediately
  - Result: passage shows with green ✓ / red ✗ per blank + correct answer shown for wrong blanks
- **Grammar Mode (NEW)**:
  - URL-param activated: `/review?grammar=grammar` → auto-selects Grammar tab and auto-loads exercises
  - `<GrammarCard>` component: sentence with `_____`, 4 MCQ options, inline explanation shown after submit
  - Score shown as % after "Submit All" — all 5 exercises graded at once
  - "🔄 New Set" generates a fresh batch
  - Does NOT touch SRS (grammar is a separate skill track)
- **Bug Fix (Leaderboard)**: `handleSubmitCloze` changed from sync to `async` with `await` on each DB update

### Modified: Stats.jsx — Grammar Practice CTA
- `useNavigate` import added
- "🎯 Practice" button appears next to grammar error bar (only visible when grammar error count > 0)
- Navigates to `/review?grammar=grammar`

---

## 🛡️ Phase 23 — Audit & Database Optimization (2026-04-11)

### RLS Policy Rules (MANDATORY for all future policies)
- **ALWAYS** use `(select auth.uid())` instead of `auth.uid()` in RLS policies. The subquery form evaluates ONCE per query instead of per-row, which is critical for performance at scale.
- **NEVER** create multiple permissive policies for the same role + action on a table. Merge into a single policy with OR conditions.
- Example:
```sql
-- ✅ CORRECT
USING ((select auth.uid()) = user_id)
-- ❌ WRONG (re-evaluates per row)
USING (auth.uid() = user_id)
```

### Database Indexes (Current State)
All foreign key columns MUST have covering indexes. Current indexes:
- `idx_reading_sessions_user_id` ON `reading_sessions(user_id)`
- `idx_user_vocab_progress_vocab_id` ON `user_vocab_progress(vocab_id)`
- `idx_user_writings_user_id` ON `user_writings(user_id)`

### Accepted Architectural Risks
1. **`vocab_master` open INSERT/UPDATE policies**: By design — shared global dictionary. Each user's learning progress is isolated in `user_vocab_progress` (which has proper per-user RLS). No user can see another user's study list or mastery data.
2. **Admin bypasses `AccessGuard`**: Single admin (project owner) must always access `/admin` even if accidentally self-suspended. `/admin` route wraps `AuthGuard > AdminGuard` but NOT `AccessGuard`.

### Frontend Fixes Applied
- **`NavBar.jsx`**: `handleSignOut()` now clears all `linguist_*` sessionStorage keys before `supabase.auth.signOut()` — prevents data leak between user sessions on same tab.
- **`Leaderboard.jsx`**: Fixed date mutation bug in "This Week" filter — `new Date(now)` copy created before `.setDate()` mutation.

---

## ⚡ Edge Functions (Phase 24 — Translation Review)

### 12. `generate-translation` (NEW)
- **Input**: none (reads user from JWT)
- **Logic**:
  1. Queries last 30 `user_writings.writing_analysed.error_highlights[].corrected` (priority 1) + `native_spoken_rewrite` (priority 2)
  2. Queries last 30 `conversation_sessions.analysis.error_highlights[].corrected` (priority 1)
  3. Selects 3–5 unique sentences (≥10 chars), errors prioritized over rewrites
  4. Fuzzy-matches study words using `wordAppearsIn()` (handles inflected forms: -ed, -ing, -s, etc.)
  5. Calls LLM to translate English sentences → natural Vietnamese
  6. Builds `progress_ids` map linking matched study words to their `user_vocab_progress` rows
- **Output**:
```json
{
  "exercises": [
    {
      "vietnamese": "Câu tiếng Việt tự nhiên...",
      "english_reference": "Original corrected English sentence",
      "source_type": "writing" | "conversation",
      "error_type": "grammar" | "vocab" | null,
      "vocab_words": ["tackle", "streamline"],
      "vocab_ids": ["uuid1", "uuid2"],
      "progress_ids": { "vocab_uuid": "progress_uuid" }
    }
  ]
}
```

### 13. `evaluate-translation` (NEW)
- **Input**: `{ user_translation, reference_english, target_words[] }`
- **Logic**: LLM compares user translation against reference, scores 0–100, identifies which target words were used/missed
- **Output**: `{ passed: bool, score: int, feedback: string, reference: string, words_used[], words_missed[] }`
- SRS update happens on frontend (per matched vocab word, case-insensitive)

## 🗄️ Phase 24 — New Table

### `review_sessions` (NEW)
- `id` (bigint, auto-increment PK)
- `user_id` (uuid, FK → auth.users, CASCADE)
- `review_mode` (text, CHECK: 'challenge' | 'story' | 'cloze' | 'grammar' | 'translation')
- `words_reviewed` (int, default 1)
- `score` (int, nullable)
- `created_at` (timestamptz, default now())
- Index: `idx_review_sessions_user_created` ON (user_id, created_at)
- RLS: users can INSERT and SELECT own rows only
- **Purpose**: Each submitted review exercise logs a row → counted as activity in `get_leaderboard` (+20 per session)

## 🖥️ Phase 24 — Shared SRS Module

### `src/lib/srs.js` (NEW — Extracted from Review.jsx)
- `calcNextReview(mastery, quality, ef, reps)` — SM-2 algorithm, returns `{ ef, reps, next_review_due_at, mastery, status }`
- `calcMaintenanceResult(passed)` — Mastered word re-check: pass=stay 100/mastered/+90d, fail=70/reviewing/+3d
- `editDist(a, b)` — Levenshtein distance for typo tolerance
- `updateSrsAfterReview(supabase, progressId, progressRow, quality)` — Shared DB updater used by ChallengeMode, ClozeMode, TranslationMode
- Pure functions (no React, no side-effects except `updateSrsAfterReview` which writes to DB)

