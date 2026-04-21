# Exam Language Trainer

A web application for generating vocabulary quizzes from exam papers.

## Architecture
- Frontend lecturer flow in `src/js/main.js`: auth, file upload, extraction, review, generation, save.
- Frontend student flow in `src/js/quiz.js`: load quiz, answer questions, score and review.
- Management flow in `src/js/manage.js`: list, share, and delete saved quizzes.
- Cloud API in `functions/index.js`:
	- `POST /extract-course-vocabulary` for server-side extraction.
	- `POST /generate-quiz` for SSE quiz generation.

## Current Status
- Project structure created
- Starting Iteration 1: Plain text vocabulary extraction

## Tech Stack
- Vanilla JavaScript with ES Modules
- Compromise.js for NLP
- Firebase for backend (to be added)

## Setup
```bash
npm install
```

### Run frontend static pages
Serve the `src/` directory with any local static server.

### Run Firebase Functions locally
```bash
cd functions
npm install
firebase emulators:start --only functions,firestore
```

### Run API smoke checks
With emulators running, open a second terminal in the project root:

```bash
npm run smoke:api
```

## Notes
- Exam-local mode keeps extraction in the browser.
- Course-server mode uploads the file and extracts vocabulary on the API.
- Rate limiting in functions is Firestore-backed (durable across cold starts), with in-memory fallback only if Firestore is temporarily unavailable.
- Firestore authorization rules are defined in `firestore.rules`.

## Final Review Checklist
- Architecture pass
	- Confirm module ownership and API boundaries are documented.
	- Confirm local and cloud backends are intentionally aligned.
- Behavior-risk pass
	- Validate request payload size/shape checks on API endpoints.
	- Verify stream failure cases show clear lecturer-facing messages.
	- Verify Firestore rules enforce quiz ownership.
- Refactor pass (safe only)
	- Prefer helper extraction before large file splits.
	- Keep changes behavior-preserving and easy to revert.
- Comment cleanup pass
	- Keep comments short and intent-focused.
	- Remove tutorial-style comments that restate obvious code.
- Final polish pass
	- Check modal accessibility attributes and loading state labels.
	- Check UX text consistency for buttons, headings, and errors.
	- Run diagnostics and smoke test exam-local + course-server flows.

For release execution steps, see `RELEASE-CHECKLIST.md`.

## Development Log
- [9-Feb]: Created project structure and installed compromise.js