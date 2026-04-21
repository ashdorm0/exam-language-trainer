# Daily Diary

## Monday, January 19, 2026

### What i did today 
- Met with supervisor to discuss the project 
- Discussed security and potential workflow issues
- Learned a bit more about client/server side distinctions

### Key Insights
- **Important: security concern identified** - lecturer must not upload documents to server
- Processing must happen client-side (in the lecturer's browser) to protect exam confidentiality 
- Lecturer generates quiz locally, then uploads only the approved quiz (not the exam)

### Concerns
- Need JavaScript/browser-based text processing or if Python is possible

### Technical questions to research 
- Is NLP possible in JavaScript?
- If so what libraries exist for client-side text analysis
- How to handle file upload without sending to server

### What i learned today 
- This project has two parts:
1. A client side tool for the lecturers that runs in the browser
2. A server system for students to take the approved quizzes 

## Tuesday, January 20 2026
- Woke up later than planned, feeling pretty anxious about the project overall
- I will do my best to take things step by step and slowly move towards my goal
- After writing a draft of the first six sections of the vision document and doing so without the help of AI, outside of brainstorming and asking question, I still feel anxious about actually learning the technologies and how the project will evolve and change and if i can keep up with the work
- Regularly commited to Git after each section
- Researched a bit about competitors and found that there is mostly a market of AI tools that can generate quizzes and pseudo exams based on uploaded materials.

### Tomorrow's plan
- Finish remaining 3 sections of the vision document 

## Wednesday, January 21 2026
- Woke up on time today, feeling better as the vision document should be finished on time today
- I finished the final three sections of the vision document
- Polished the vision document by using AI to spell check
- Creating the business model canvas was a pain but it turned out alright
- Learned about proper markdown formatting for PDF conversion 
- Will upload vision document to blackboard today.

### Tomorrow's plan
- Review vision document 
- Prepare questions for Chris (i.e file formats, vocab extraction approach) 
- Meet Chris at 16:00

## Thursday, January 22 2026
- Uploaded vision document to google docs
- Realized that i forgot to properly format my vision document thanks to an email from my supervisor
- Learned that formatting is as important as content
- Meeting Chris at 16:00

## Supervisor meeting feedback
- Vision Document too wordy, sentences too long 
- Need to fix value proposition to focus on solution 
- Research direction: security approaches, client side processing, similar apps 

## Monday, January 26 2026
- Revised Vision Document based on supervisor feedback
- Added supervisors as collaborators on GitHub
- Started Specification Document

### Key learning:
- Used AI (Claude) to help rewrite wordy sections of Vision Document, but reviewed each suggestion carefully to ensure accuracy and maintain my voice
- Realized my initial drafts were too corporate/jargon-heavy - fell into trap of trying to sound "professional" instead of being clear
- Understanding the difference between simple use cases vs. complex implementation - the real challenge is in the HOW (vocabulary extraction algorithm, client-side processing)


## Monday, February 9, 2026 - Vocabulary Extraction Working!

**What I built:**
- Integrated compromise.js for NLP processing
- Integrated stopword library for filtering common words
- Built vocabulary extraction that identifies difficult words from exam text

**Technical challenges solved:**
- Module import issues: Learned difference between ES modules, UMD, and global scripts
- Compromise.js needed to be loaded as global script, not ES module
- Stopword worked as ES module import
- Text processing: Had to use .terms() instead of .nouns()/.verbs() to avoid phrase concatenation

**Key learning:**
Each library has different module formats. Check the dist/ folder and try different approaches rather than assuming one way will work.

**Current functionality:**
- Upload .txt file ✓
- Extract text ✓
- Process with NLP ✓
- Filter stopwords ✓
- Display unique vocabulary list ✓

**Next steps:**
- Add word selection UI (checkboxes for lecturer to choose words)
- Generate quiz questions from selected words
- Save approved quiz to server

**Time spent today:** ~4 hours

## Wednesday, February 11, 2026 - Vocabulary Extraction Working!

**What I built:**
- Integrated Claude API (Haiku model) for MCQ generation
- Created Node.js/Express backend to handle API calls securely
- Connected frontend to backend via fetch API
- Implemented "Regenerate" button to go back to word selection
- Quiz preview shows generated questions with correct answers highlighted

**Technical decisions:**
- Backend server keeps API key secret (never exposed to browser)
- Used async/await for API calls
- Stored vocabulary in global scope for regeneration feature
- Refactored duplicate code into reusable `showWordSelection` function

**Challenges solved:**
- Scope issues with `currentVocabulary` - moved to global scope
- API model name was wrong - used correct Haiku model identifier
- Security: API key stored in .env file, never committed to git

**Current functionality:**
- Upload .txt file 
- Extract vocabulary 
- Select words with checkboxes 
- Generate quiz questions via Claude API 
- Preview quiz 
- Regenerate with different word selection 

**Next steps:**
- Save quiz to Firebase
- Generate shareable URL and QR code
- Build student quiz interface

**Time spent today:** ~3 hours

## Monday, March 9, 2026

- Started Iteration 2. First priority was fixing the prompt() issue that caused a silent failure during the Iteration 1 demo (supervisor feedback: 7/10, demo not fluid enough).
- Replaced browser prompt() with a Bootstrap modal for the quiz save flow. The key difference is that prompt() is browser-controlled and can be silently suppressed, while a Bootstrap modal is application-controlled HTML that behaves consistently everywhere.
- The Save button is disabled until the lecturer types a title, which handles validation visually instead of silently aborting.
- Tested end-to-end locally and deployed. Git commit pushed.

## Tuesday, March 10, 2026

- Day 2 of Iteration 2. Added PDF support using PDF.js (v3.11.174) and DOCX support using Mammoth.js (v1.11.0), both loaded from CDN — consistent with how Bootstrap is already loaded, and the app requires internet anyway for Firebase/Claude API.
- Both libraries extract text client-side, maintaining the security requirement. The key architectural point: all three extraction paths (txt, pdf, docx) produce a plain text string that feeds into the same unchanged NLP pipeline. Adding a new format just means adding a new extraction function.
- PDF.js needs a worker file for background processing; Mammoth.js doesn't — extractRawText() was only 4 lines of code.
- Tested with the Software Engineering exam paper in both formats. Committed and deployed.

## Wednesday, March 11, 2026

- Added QR code generation using QRCode.js — appears alongside the share link after saving a quiz. Tested by scanning with phone.
- Implemented Firebase Authentication (email/password). The lecturer tool is now gated behind sign-in. Used onAuthStateChanged to handle auth state — this fires on login, logout, and page load, so the lecturer stays signed in on refresh.
- Each saved quiz now stores a lecturerId (the Firebase Auth UID) so quizzes can be filtered per lecturer.
- Built a new quiz management page (manage.html / manage.js). Queries Firestore with where('lecturerId', '==', currentUser.uid) to show only the logged-in lecturer's quizzes. Learned that Firestore requires a composite index when combining where and orderBy on different fields had to create one in the Firebase Console.
- Delete uses a confirmation modal before removing from Firestore.

## Thursday, April 9, 2026

- Worked through what Iteration 3 should be by re-reading supervisor feedback (both written and from the demo) carefully. Realised that the three deferred items from Iteration 2 — proper noun filtering, word removal before sending to Claude, and clarifying the subject field — were not three independent tasks. They were three answers to one question the supervisor was asking: "how does your tool decide which words to send, and can the lecturer see and control it?" Reframing them as one coherent feature (transparency and lecturer control) made the iteration much less intimidating.

### Task 1 — Proper noun filter

- One-line change in `extractVocabulary`: replaced `doc.terms().out('array')` with `doc.not('#ProperNoun').terms().out('array')`. Compromise.js tags terms during parsing, including a `#ProperNoun` umbrella that covers `#Person`, `#Place`, and `#Organization`. Filtering at the earliest stage of the pipeline meant downstream stages (stopwords, common-word filtering, frequency counting) never saw proper nouns at all.
- Tested on a real PDF and confirmed names and places like "Dublin," "Carlow," "Smith" were removed. Also discovered Compromise's tagger isn't perfect — it missed "SETU" and "February" in testing, probably because of context-dependent tagging. Worth noting: this reinforces why Task 4 (lecturer control) is necessary as a backstop, since no automatic filter is perfect.

### Task 2 — Frankenword bug discovery and fix

- While testing the proper noun filter, noticed that the extracted candidate words contained things like `httpsexamlanguagetrainerabecwebappquizhtmlidquizid` — clearly URL fragments welded into single tokens. Investigated the cleanup step and traced the root cause:
  - The old cleanup code was `.replace(/[^a-z]/g, '')` — strip all non-letter characters from each token. So a URL like `https://exam-language-trainer-3abec.web.app/quiz.html?id=quizId` had its slashes, dots, colons, and digits stripped, and the remaining letters were welded together into one giant fake word. That word was lowercase, letter-only, length ≥ 4, not a stopword, and not in the common words list — so it sailed through every filter.
- The fix was to change the regex from a grinder to a gate: instead of stripping bad characters, reject any token that contains them. New code:

```javascript
const cleaned = allTerms
  .map(word => word.toLowerCase().trim())
  .filter(word => /^[a-z]+$/.test(word) && word.length >= 4)
```

- Trade-off: this also drops legitimate hyphenated/apostrophised words like "co-operate" or "doesn't", but most of those are stopwords anyway and would be filtered later. The simplicity gain is worth the small loss.
- Insight worth keeping: there's a meaningful difference between filtering by removing characters and filtering by rejecting tokens that contain bad characters. The former silently produces garbage; the latter cleanly discards.

### Task 3 — NGSL word list upgrade

- Tested the previous two fixes on a real document (my Iteration 1 Report) and discovered the pipeline was still surfacing easy words like "gets," "steps," "zone," "drag," "core," "term," "sees" — words no academic vocabulary tool should be flagging as difficult. This had been bothering me for two iterations, and I kept telling myself I needed to apologise for the NLP being a work in progress during demos.
- Diagnosed the root cause: the `common_words_1200.txt` filter was too small. English has roughly 3,000 words covering ~95% of everyday text, but the list only had 1,200. Words like "core" and "zone" were common enough that no tool should flag them, but not common enough to make a 1,200-word cutoff.
- This was a data problem, not a pipeline problem. That distinction mattered enormously: the fix was a one-file swap, not a rewrite.
- Replaced the list with the New General Service List (NGSL) by Browne, Culligan & Phillips (2013) — 2,809 words specifically designed for "words a learner of English doesn't need help with." Free, well-established in ESL/EAP research, exactly the right tool. Verified the file format (alphabetised, one word per line, no junk, lowercased by my existing loader function).
- Tested before/after on the same PDF:
  - Before NGSL: "exam, vision, core, international, target, platform, term, specify, requirement, reveal, selection, clearly" all surfaced as candidates.
  - After NGSL: all those words removed; remaining candidates were mostly genuinely academic ("inadvertently," "stakeholder," "validated," "deliberate," "revealing").
- A handful of easy words still slip through ("helping," "sees," "gave," "four"), but this is expected and is exactly what Task 4 (lecturer control) is designed to handle.
- Important reframe — this was actually about demo shame: I had been carrying around a belief that "the NLP is the weak part of my project" and looking for ways to fix it. I almost convinced myself to rewrite the entire NLP pipeline from scratch with a new library. But the real problem turned out to be a data file, and the deeper insight is that the lecturer-control feature in Task 4 was always going to be the actual escape hatch from demo shame, because it means the pipeline doesn't have to be perfect — the lecturer curates the output. Building Task 4 well means I never have to apologise for imperfect extraction again.

### Task 4 — Interactive confirmation modal

- The biggest single piece of work in the iteration. Built in four small commits, each independently tested before moving on — a deliberate discipline improvement after Task 3, where I had bundled three logical changes into one commit (proper noun filter + frankenword fix + NGSL swap all in one).

Design decisions made before writing any code:

- Toggle select/deselect rather than click-to-delete: reversible, keeps every word visible throughout, no risk of misclick panic.
- Set-based state (`let selectedWords = new Set()`) rather than DOM-scraping or array tracking: cleaner operations (`.has()`, `.delete()`, `.size` are all O(1) and read better than equivalent array operations), and the API call needs the word list directly, which a Set spreads into trivially.
- Minimum of 10 selected words to send: lecturer-autonomy-respecting floor (initial suggestion of 15 was based on an assumption about the Claude prompt that turned out to be wrong).
- Reset selection on every modal re-open: previous selections would be meaningless against a new document.
- A single `updateSelectionUI()` function called from both the click handler and the initial render: follows the "render from state" pattern used in frameworks like React, keeps UI and state from drifting apart.

Build steps:

- CSS for the `.deselected` visual state (greyed background, strikethrough, reduced opacity, smooth 150ms transition, cursor pointer, user-select:none).
- Toggle-click behaviour with Set-based state, wired up via `data-word` attributes on each chip.
- Live counter and minimum-10 enforcement via `updateSelectionUI()`.
- Wiring `[...selectedWords]` (spread into an array — Sets don't `JSON.stringify` directly) into the fetch body of `onConfirmAndGenerate`.

- Verified end-to-end with the Network tab in DevTools: confirmed that deselected words never appear in the request payload, which is the direct evidence the feature works as intended. Took a screenshot for the iteration report.
- Things I noticed while building Task 4 but didn't act on immediately:
  - The existing static modal paragraph claimed "Claude will select the 30 hardest" — that number was nowhere in the actual code. Misleading text that needed updating.
  - The `wordCountNote` text claimed "Subject-specific terms will be filtered out" — also untrue. The subject field did no client-side filtering at all.
  - Both Claude prompts visible in the codebase had no count specifications, meaning quiz length was determined indirectly by `POOL_SIZE` minus whatever Claude filtered out — explaining why quizzes felt short.
  - Student feedback ("more questions per quiz") was probably a one-line `POOL_SIZE` change.
  - All of these were captured for follow-up rather than acted on mid-task.
- Process catch: immediately after finishing Task 4, I felt the urge to start "tightening up" the Claude prompts — pure freelance work outside the iteration plan. Recognised this as the same pattern as the morning paralysis, just inverted. Both come from not stopping at natural milestones. The morning version says "I can't start anything"; the momentum version says "I can't stop." Named it, deferred it.

### Task 5 — Subject field removal (and deeper investigation)

Started Task 5 thinking it would be a simple "remove the field, update the prompt" exercise. It turned into the most revealing investigation of the day.

**Investigation: Where does the filter prompt actually live?**

Looking at `server.js`, found a `/filter-words` endpoint with an elaborate subject-based prompt. But when I checked which endpoints the client actually called, found nothing referencing `/filter-words` — only `/generate-quiz`. Initially concluded: "the subject field is a Potemkin input doing literally nothing."

Then I was wrong, and had to correct. Discovered that `server.js` wasn't actually the deployed code. The real deployed Firebase Function lives in `functions/index.js`, and contains a streaming version of `/generate-quiz` that I hadn't seen. That version does use the subject field — it has a long prompt that does both the subject-based filtering AND the "select 15 most difficult" narrowing in one shot. So the subject field wasn't dead after all; it was being used by a server file I hadn't read.

Real architectural picture revealed:

- `server.js` — orphaned dev code, superseded ages ago, never deployed.
- `functions/index.js` — the real production endpoint, streaming, single prompt that does filtering + difficulty narrowing + question generation in one pass.
- The `/filter-words` endpoint in `server.js` — dead code from an even earlier architecture, inside an already-dead file.

**Decision: full prompt rewrite, not just subject removal.**

The deeper issue was that the deployed prompt was double-filtering: the lecturer would curate words via the new modal, and then Claude would further narrow them using its own difficulty judgement and subject-specific filtering. This actively undermined the lecturer's choices. The correct response to Task 4 was to make Claude trust the lecturer's curation and just generate one question per curated word — no second-guessing.

Important distinction I had to think carefully about: earlier in the day I had refused to "freelance tighten" the Claude prompts. Was rewriting the prompt now scope creep? No — the rewrite was forced by removing the subject field. Once `${subject}` no longer existed, the prompt couldn't reference it. The minimum change was "remove subject references"; the slightly bigger change was "also remove the difficulty-narrowing language because it now contradicts the lecturer-curation model." Both belonged together because they shared a common justification: the prompt should no longer second-guess the lecturer's word selection.

Five separate commits for Task 5:

1. **Client-side subject removal:** deleted the subject field from `index.html`, removed `subjectInput` references throughout `main.js`, simplified `checkExtractReady` to only require a file, removed the subject parameter from `showConfirmationModal`, removed `subject: subject` from the fetch body. Tested end-to-end and got an error: `{"error":"No subject provided"}` — which led to the discovery that `server.js` wasn't the deployed code (see investigation above).
2. **Rewrite the deployed `/generate-quiz` prompt in `functions/index.js`:** removed the subject validation, removed the subject field from the prompt template, removed the "select 15 most difficult" instruction, removed the "if fewer than 15 suitable words exist" clause. New prompt frames Claude's role as: "the lecturer has curated this list; generate one question per word." Also updated the logging to reflect "curated" rather than "candidate" — small wording shift but it matters semantically. Redeployed the Firebase function.
3. **Cleanup of stale comments and lying UI text in `main.js`:** deleted the hardcoded `wordCountNote` line that still referenced `${subject}` and the mythical "15 hardest"; updated the `POOL_SIZE` comment to accurately describe its actual purpose ("Max words shown to lecturer in confirmation modal"); fixed the stale `loadCommonWords` catch comment.
4. **Deleted `server.js` entirely** after verifying nothing imported it, no scripts referenced it, and `firebase.json` only deploys the `functions/` directory. Used `git rm server.js` to stage the deletion cleanly.

**Result of the prompt rewrite — major unintended improvement:**

After deploying the new prompt, tested with the full candidate pool (no deselection). The quiz generated 26 questions from a 30-word pool, dramatically more than the previous typical ~10–15. This addresses the student feedback ("more questions per quiz") as a side-effect of the prompt rewrite alone, without any need for the planned `POOL_SIZE` 30→50 bump (which I had been calling "Task 4.5"). That follow-up task is now demoted from "addresses user feedback" to "optional polish."

### Reflections on process

- **On commit discipline:** Task 3 was committed as a single bundled commit covering three logical changes. Task 4 was deliberately broken into four commits, each independently tested. Task 5 ended up with four commits as well. The Task 4/5 approach is meaningfully better — clean history, easier rollback, easier to point at specific changes in the iteration report. Worth applying to every future task.
- **On testing during development:** several bugs today were caught only because I tested after every change. The frankenword bug was found while testing the proper noun filter. The prompt-rewrite need was discovered while testing the subject field removal. The fact that `server.js` wasn't deployed was discovered only because Commit 1 of Task 5 failed at runtime. None of these would have surfaced if I'd batched up all the changes and tested at the end. Test after every commit is a real principle, not just advice.
- **On debug instrumentation:** at one point I removed `console.log` debug lines too early — right after the first successful test — and then immediately had to re-add them when a regression appeared. New rule: debug instrumentation stays in place until a feature is fully committed and stable, then removed in a dedicated cleanup commit.
- **On the urge to keep going:** caught two opposite versions of the same pattern today. Morning: "I can't start anything, I'm completely lost." Late afternoon: "I just finished Task 4, let me start tightening Claude prompts." Both came from the same root cause — not stopping at natural milestones. The cure for both is the same: explicit scoping decisions and committed plans.
- **On scope discipline more broadly:** I deferred multiple things today that I could have started: multilingual support, anonymous feedback, decoy words, prompt tightening, the POOL_SIZE bump (later rendered unnecessary anyway). Each deferral was captured with a written justification rather than just dropped. The deferrals are themselves evidence of agile thinking.
- **On editor formatter noise:** noticed the editor (Prettier?) reformats unrelated parts of `main.js` on save, polluting diffs and removing some helpful step comments from `extractVocabulary`. To investigate after Iteration 3 — small tooling issue, not urgent.
- **On `.gitignore`:** noticed `.firebase/hosting.c3Jj.cache` keeps appearing in git status because `.firebase/` isn't in `.gitignore`. Small cleanup task for a future session.