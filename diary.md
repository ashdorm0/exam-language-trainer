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