/**
 * main.js — Exam Language Trainer, Lecturer Tool
 *
 * ARCHITECTURE OVERVIEW (useful for explaining to supervisor):
 *
 * Phase 1 — CLIENT-SIDE (never touches the network):
 *   FileReader API → raw text → Compromise.js tokenisation →
 *   stopword removal → common-word filter → top-60 word list
 *
 * Phase 2 — CONFIRMATION GATE:
 *   Lecturer sees the word list in a modal and approves before
 *   anything is sent to the server. This is a deliberate security
 *   step: the lecturer controls what leaves their browser.
 *
 * Phase 3 — SINGLE API CALL:
 *   Top-60 words + subject → Firebase Function → Claude API
 *   Claude selects 15 hardest academic words AND generates 15 MCQs.
 *   One call, one cost, one response to parse.
 *
 * Phase 4 — BATCHED DISPLAY:
 *   15 questions stored in a pool. 5 shown at a time.
 *   When lecturer removes a question, the next from the pool
 *   fills the gap. No extra API calls needed.
 */

import { removeStopwords, eng } from '../libs/stopword.esm.mjs';
import { saveQuiz } from './saveQuiz.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const API_BASE = 'https://us-central1-exam-language-trainer-3abec.cloudfunctions.net/api';
const DISPLAY_SIZE = 5;   // Questions shown to lecturer at one time
const POOL_SIZE    = 30;  // Words sent to Claude (Claude picks 15 from these)

/**
 * A small list of the most common English words.
 * Words on this list are filtered out before sending to Claude,
 * because they're too common to be useful vocabulary quiz words.
 *
 * WHY NOT USE A HUGE LIST?
 * We use Compromise.js + stopwords first to remove grammar words.
 * This list catches high-frequency content words (like "people", "system")
 * that slipped through. Keeping it small avoids over-filtering.
 */
const COMMON_WORDS_10K = new Set([
    'people','time','year','way','day','man','woman','child','world','life',
    'hand','part','place','case','week','company','system','program','question',
    'work','government','number','night','point','home','water','room','mother',
    'area','money','story','fact','month','lot','right','study','book','eye',
    'job','word','business','issue','side','kind','head','house','service',
    'friend','father','power','hour','game','line','end','among','while',
    'name','land','large','often','set','turn','put','important','different',
    'between','change','state','whether','together','example','include','form',
    'these','those','very','such','than','about','after','where','what',
    'which','there','their','when','into','only','also','back','other',
    'then','through','just','been','come','from','have','more','like',
    'some','would','make','said','each','will','many','then','long',
    'down','way','been','call','first','come','made','over','such','take',
    'even','most','well','find','here','give','think','know','look','must',
]);

// ── State ──────────────────────────────────────────────────────────────────────

/**
 * questionPool: all questions returned by Claude (up to 30).
 * displayedQuestions: the 5 currently shown on screen.
 * nextPoolIndex: pointer into questionPool — how far we've consumed it.
 *
 * WHY THIS APPROACH?
 * Storing all 30 questions upfront means we can replenish the display
 * instantly when the lecturer removes a question, with no extra API calls.
 * This is efficient and responsive.
 */
let questionPool      = [];
let displayedQuestions = [];
let nextPoolIndex     = 0;

// ── DOM references (populated after DOMContentLoaded) ─────────────────────────

let fileInput, uploadZone, fileSelected, fileNameSpan;
let subjectInput, extractBtn;
let spinnerExtract, spinnerApi;
let sectionUpload, sectionQuiz, sectionSaved;
let poolInfo, questionsDisplay, saveSection, saveBtn;
let shareUrlEl, copyBtn;
let wordChipsEl, wordCountNote, confirmSendBtn;
let confirmModal;

let candidateWords = []; // Words ready to show in confirmation modal

// ── Initialisation ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

    // Grab all DOM references
    fileInput       = document.getElementById('fileInput');
    uploadZone      = document.getElementById('uploadZone');
    fileSelected    = document.getElementById('fileSelected');
    fileNameSpan    = document.getElementById('fileName');
    subjectInput    = document.getElementById('subjectInput');
    extractBtn      = document.getElementById('extractBtn');
    spinnerExtract  = document.getElementById('spinner-extract');
    spinnerApi      = document.getElementById('spinner-api');
    sectionUpload   = document.getElementById('section-upload');
    sectionQuiz     = document.getElementById('section-quiz');
    sectionSaved    = document.getElementById('section-saved');
    poolInfo        = document.getElementById('poolInfo');
    questionsDisplay = document.getElementById('questionsDisplay');
    saveSection     = document.getElementById('saveSection');
    saveBtn         = document.getElementById('saveBtn');
    shareUrlEl      = document.getElementById('shareUrl');
    copyBtn         = document.getElementById('copyBtn');
    wordChipsEl     = document.getElementById('wordChips');
    wordCountNote   = document.getElementById('wordCountNote');
    confirmSendBtn  = document.getElementById('confirmSendBtn');
    confirmModal    = new bootstrap.Modal(document.getElementById('confirmModal'));

    // Wire up events
    uploadZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', onFileSelected);
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', onFileDrop);
    subjectInput.addEventListener('input', checkExtractReady);
    extractBtn.addEventListener('click', onExtract);
    confirmSendBtn.addEventListener('click', onConfirmAndGenerate);
    saveBtn.addEventListener('click', onSave);
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(shareUrlEl.textContent);
        copyBtn.innerHTML = '<i class="bi bi-check"></i> Copied!';
    });

    console.log('Exam Language Trainer initialised');
    console.log('Compromise loaded:', typeof nlp !== 'undefined');
    console.log('removeStopwords loaded:', typeof removeStopwords !== 'undefined');
});

// ── File handling ─────────────────────────────────────────────────────────────

function onFileDrop(e) {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) setFile(file);
}

function onFileSelected() {
    if (fileInput.files[0]) setFile(fileInput.files[0]);
}

function setFile(file) {
    if (!file.name.endsWith('.txt')) {
        alert('Please upload a plain text (.txt) file. PDF and DOCX support coming in Iteration 2.');
        return;
    }
    // Show file name
    fileNameSpan.textContent = file.name;
    fileSelected.style.display = 'block';
    uploadZone.style.borderColor = 'var(--success)';
    checkExtractReady();
}

/** Enable the Extract button only when both file and subject are provided */
function checkExtractReady() {
    const hasFile    = fileInput.files && fileInput.files[0];
    const hasSubject = subjectInput.value.trim().length > 0;
    extractBtn.disabled = !(hasFile && hasSubject);
}

// ── Phase 1: Client-side NLP extraction ──────────────────────────────────────

/**
 * onExtract — triggered when lecturer clicks "Extract Vocabulary"
 *
 * This runs entirely in the browser. No network call happens here.
 * We use FileReader API to read the file, then Compromise.js to
 * tokenise and normalise the text, then filter through three layers:
 *   1. Stopword removal (grammar words: "the", "and", "is"…)
 *   2. Common-word filter (frequent content words: "people", "system"…)
 *   3. Deduplication and length filter
 *
 * Then we show the confirmation modal.
 */
async function onExtract() {
    const file    = fileInput.files[0];
    const subject = subjectInput.value.trim();

    // Show spinner
    spinnerExtract.classList.remove('d-none');
    extractBtn.disabled = true;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        candidateWords = extractVocabulary(text);
        spinnerExtract.classList.add('d-none');

        if (candidateWords.length === 0) {
            alert('No vocabulary words found. Make sure your file contains enough text.');
            extractBtn.disabled = false;
            return;
        }

        // Show confirmation modal (Phase 2)
        showConfirmationModal(candidateWords, subject);
    };
    reader.readAsText(file);
}

/**
 * extractVocabulary — the NLP pipeline
 *
 * Steps:
 * 1. Compromise.js tokenises and normalises (handles plurals, verb forms, case)
 * 2. Clean tokens: lowercase, remove punctuation, min 4 chars, letters only
 * 3. Remove stopwords using the stopword library
 * 4. Remove common high-frequency words from our 10k list
 * 5. Count word frequency in the document
 * 6. Sort by frequency (less frequent = potentially harder/more academic)
 * 7. Return top POOL_SIZE unique words
 *
 * WHY SORT BY FREQUENCY?
 * Very frequent words in the document are likely core subject terms
 * (students know them). Less frequent words are more likely to be
 * general academic vocabulary students may struggle with.
 */
function extractVocabulary(text) {
    // Step 1: Compromise.js normalisation
    const doc      = nlp(text);
    const allTerms = doc.terms().out('array');

    // Step 2: Clean tokens
    const cleaned = allTerms
        .map(word => word.toLowerCase().replace(/[^a-z]/g, '').trim())
        .filter(word => word.length >= 4 && /^[a-z]+$/.test(word));

    // Step 3: Stopword removal
    const withoutStopwords = removeStopwords(cleaned, eng);

    // Step 4: Remove common words
    const filtered = withoutStopwords.filter(word => !COMMON_WORDS_10K.has(word));

    // Step 5: Count frequency
    const freqMap = {};
    for (const word of filtered) {
        freqMap[word] = (freqMap[word] || 0) + 1;
    }

    // Step 6: Unique words sorted by ascending frequency
    // (rare in this document = more likely academic/difficult)
    const unique = [...new Set(filtered)];
    unique.sort((a, b) => freqMap[a] - freqMap[b]);

    // Step 7: Take top POOL_SIZE
    const result = unique.slice(0, POOL_SIZE);
    console.log(`NLP extracted ${result.length} candidate words from ${unique.length} unique terms`);
    return result;
}

// ── Phase 2: Confirmation modal ───────────────────────────────────────────────

function showConfirmationModal(words, subject) {
    // Render word chips
    wordChipsEl.innerHTML = words
        .map(w => `<span class="word-chip">${w}</span>`)
        .join('');

    wordCountNote.textContent =
        `${words.length} words extracted locally. Claude will select the 15 hardest ` +
        `general academic words and ignore ${subject}-specific terminology.`;

    // Update step indicators
    setStep(2);

    confirmModal.show();
}

// ── Phase 3: API call ─────────────────────────────────────────────────────────

/**
 * onConfirmAndGenerate — triggered when lecturer clicks "Send to Claude"
 *
 * This is the only network call in the lecturer workflow.
 * We send: the word list + subject name.
 * We receive: up to 30 MCQ objects.
 *
 * WHY ONE COMBINED CALL?
 * The previous design had two calls: /filter-words then /generate-quiz.
 * Combining them into one prompt halves the latency and API cost,
 * and simplifies the code. Claude can do both jobs in a single response.
 */
async function onConfirmAndGenerate() {
    const subject = subjectInput.value.trim();

    confirmModal.hide();

    // Show quiz section with spinner
    sectionQuiz.classList.remove('d-none');
    spinnerApi.classList.remove('d-none');
    setStep(3);

    // Scroll to quiz section
    sectionQuiz.scrollIntoView({ behavior: 'smooth' });

    try {
        const response = await fetch(`${API_BASE}/generate-quiz`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                words: candidateWords,
                subject: subject
            })
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`API error: ${err}`);
        }

        const data = await response.json();
        console.log(`Received ${data.questions.length} questions from Claude`);

        // Initialise pool
        questionPool       = data.questions;
        displayedQuestions = [];
        nextPoolIndex      = 0;

        // Fill first display batch
        fillDisplay();

    } catch (error) {
        console.error('Generation error:', error);
        questionsDisplay.innerHTML = `
            <div class="alert alert-danger" style="font-family:Arial,sans-serif;">
                <strong>Error:</strong> Failed to generate quiz. Please check your connection and try again.
                <br><small>${error.message}</small>
            </div>`;
    } finally {
        spinnerApi.classList.add('d-none');
        saveSection.classList.remove('d-none');
    }
}

// ── Phase 4: Batched display ──────────────────────────────────────────────────

/**
 * fillDisplay — ensures exactly DISPLAY_SIZE (5) questions are shown,
 * pulling from the pool to fill any gaps left by removed questions.
 *
 * HOW BATCHING WORKS:
 * - questionPool holds all 30 questions from Claude.
 * - displayedQuestions holds the 5 currently visible.
 * - nextPoolIndex tracks how far into the pool we've consumed.
 * - When a question is removed: splice it from displayedQuestions,
 *   then call fillDisplay() to pull the next unused question from the pool.
 * - This means the lecturer never has to wait for another API call.
 */
function fillDisplay() {
    // Pull from pool until we have DISPLAY_SIZE or pool is exhausted
    while (displayedQuestions.length < DISPLAY_SIZE && nextPoolIndex < questionPool.length) {
        displayedQuestions.push(questionPool[nextPoolIndex]);
        nextPoolIndex++;
    }

    renderQuestions();
    updatePoolInfo();
}

function updatePoolInfo() {
    const remaining = questionPool.length - nextPoolIndex;
    poolInfo.textContent = remaining > 0
        ? `Showing ${displayedQuestions.length} of ${questionPool.length} questions · ${remaining} remaining in pool`
        : `Showing ${displayedQuestions.length} questions · Pool exhausted`;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderQuestions() {
    if (displayedQuestions.length === 0) {
        questionsDisplay.innerHTML = `
            <p style="font-family:Arial,sans-serif; color:var(--muted); text-align:center; padding:2rem;">
                All questions removed. <a href="/" style="color:var(--primary);">Start over</a> to generate new ones.
            </p>`;
        saveSection.classList.add('d-none');
        return;
    }

    questionsDisplay.innerHTML = displayedQuestions.map((q, i) => `
        <div class="question-card" data-index="${i}">
            <button class="btn-remove" data-index="${i}">
                <i class="bi bi-x"></i> Remove
            </button>
            <div class="word-tag">${q.word}</div>
            <div class="question-num">Question ${i + 1}</div>
            <div class="question-text">${q.question}</div>
            <ul class="option-list">
                ${q.options.map(opt => `
                    <li class="${opt.startsWith(q.correct) ? 'correct' : ''}">
                        ${opt}
                        ${opt.startsWith(q.correct) ? '<i class="bi bi-check-circle-fill" style="margin-left:4px;"></i>' : ''}
                    </li>
                `).join('')}
            </ul>
        </div>
    `).join('');

    // Wire up remove buttons
    document.querySelectorAll('.btn-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.index);
            removeQuestion(idx);
        });
    });
}

/**
 * removeQuestion — removes a question from the display and pulls a
 * replacement from the pool.
 */
function removeQuestion(displayIndex) {
    displayedQuestions.splice(displayIndex, 1);
    fillDisplay(); // Will top up from pool if possible
}

// ── Phase 5: Save ─────────────────────────────────────────────────────────────

async function onSave() {
    const title = prompt('Enter a title for this quiz:');
    if (!title || !title.trim()) return;

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving…';

    try {
        // We save only the currently displayed questions (the approved ones)
        // Alternatively: save all remaining pool questions. Design decision:
        // save displayed only — the lecturer has reviewed those.
        const quizId = await saveQuiz(title.trim(), displayedQuestions);
        const quizUrl = `${window.location.origin}/quiz.html?id=${quizId}`;

        // Show success
        sectionSaved.classList.remove('d-none');
        shareUrlEl.textContent = quizUrl;
        saveSection.classList.add('d-none');
        setStep(4);

        sectionSaved.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Save error:', error);
        alert('Failed to save quiz. Please try again.');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-cloud-upload"></i> Approve & Save Quiz';
    }
}

// ── Step indicator helper ─────────────────────────────────────────────────────

function setStep(activeStep) {
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`step-indicator-${i}`);
        el.classList.remove('active', 'done');
        if (i < activeStep) el.classList.add('done');
        if (i === activeStep) el.classList.add('active');
    }
}