/**
 * main.js — Exam Language Trainer, Lecturer Tool
 */

import { removeStopwords, eng } from '../libs/stopword.esm.mjs'
import { saveQuiz } from './saveQuiz.js'

// ── Constants ──────────────────────────────────────────────────────────────────

const API_BASE =
  'https://us-central1-exam-language-trainer-3abec.cloudfunctions.net/api'
const DISPLAY_SIZE = 5 // Questions shown to lecturer at one time
const POOL_SIZE = 30 // Words sent to Claude (Claude picks 15 from these)

/**
 * Common words list — loaded from libs/common_words.txt at startup.
 */
let COMMON_WORDS = new Set()

// ── State ──────────────────────────────────────────────────────────────────────

/**
 * questionPool: all questions returned by Claude (up to 15).
 * displayedQuestions: the 5 currently shown on screen.
 * nextPoolIndex: pointer into questionPool — how far we've consumed it.
 */
let questionPool = []
let displayedQuestions = []
let nextPoolIndex = 0

// ── DOM references (populated after DOMContentLoaded) ─────────────────────────

let fileInput, uploadZone, fileSelected, fileNameSpan
let subjectInput, extractBtn
let spinnerExtract, spinnerApi
let sectionUpload, sectionQuiz, sectionSaved
let poolInfo, questionsDisplay, saveSection, saveBtn
let shareUrlEl, copyBtn
let wordChipsEl, wordCountNote, confirmSendBtn
let confirmModal
let saveModal, quizTitleInput, confirmSaveBtn

let candidateWords = [] // Words ready to show in confirmation modal

// ── Initialisation ────────────────────────────────────────────────────────────

async function loadCommonWords () {
  /**
   * Fetches the common words list from the text file and populates
   * the COMMON_WORDS Set.
   */
  try {
    const response = await fetch('../libs/common_words_1200.txt')
    const text = await response.text()
    COMMON_WORDS = new Set(
      text
        .split('\n')
        .map(w => w.trim().toLowerCase())
        .filter(w => w.length > 0)
    )
    console.log(`Common words loaded: ${COMMON_WORDS.size} words`)
  } catch (error) {
    console.warn(
      'Could not load common_words.txt — filtering will be limited.',
      error
    )
    // App continues to work without the list; Claude will still filter subject terms
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Load common words list before anything else
  await loadCommonWords()

  // Grab all DOM references
  fileInput = document.getElementById('fileInput')
  uploadZone = document.getElementById('uploadZone')
  fileSelected = document.getElementById('fileSelected')
  fileNameSpan = document.getElementById('fileName')
  subjectInput = document.getElementById('subjectInput')
  extractBtn = document.getElementById('extractBtn')
  spinnerExtract = document.getElementById('spinner-extract')
  spinnerApi = document.getElementById('spinner-api')
  sectionUpload = document.getElementById('section-upload')
  sectionQuiz = document.getElementById('section-quiz')
  sectionSaved = document.getElementById('section-saved')
  poolInfo = document.getElementById('poolInfo')
  questionsDisplay = document.getElementById('questionsDisplay')
  saveSection = document.getElementById('saveSection')
  saveBtn = document.getElementById('saveBtn')
  shareUrlEl = document.getElementById('shareUrl')
  copyBtn = document.getElementById('copyBtn')
  wordChipsEl = document.getElementById('wordChips')
  wordCountNote = document.getElementById('wordCountNote')
  confirmSendBtn = document.getElementById('confirmSendBtn')
  confirmModal = new bootstrap.Modal(document.getElementById('confirmModal'))
  saveModal = new bootstrap.Modal(document.getElementById('saveModal'))
  quizTitleInput = document.getElementById('quizTitleInput')
  confirmSaveBtn = document.getElementById('confirmSaveBtn')

  // Wire up events
  uploadZone.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', onFileSelected)
  uploadZone.addEventListener('dragover', e => {
    e.preventDefault()
    uploadZone.classList.add('dragover')
  })
  uploadZone.addEventListener('dragleave', () =>
    uploadZone.classList.remove('dragover')
  )
  uploadZone.addEventListener('drop', onFileDrop)
  subjectInput.addEventListener('input', checkExtractReady)
  extractBtn.addEventListener('click', onExtract)
  confirmSendBtn.addEventListener('click', onConfirmAndGenerate)
  saveBtn.addEventListener('click', onSave)
  quizTitleInput.addEventListener('input', () => {
    confirmSaveBtn.disabled = !quizTitleInput.value.trim()
  })
  confirmSaveBtn.addEventListener('click', onConfirmSave)
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(shareUrlEl.textContent)
    copyBtn.innerHTML = '<i class="bi bi-check"></i> Copied!'
  })

  console.log('Exam Language Trainer initialised')
  console.log('Compromise loaded:', typeof nlp !== 'undefined')
  console.log('removeStopwords loaded:', typeof removeStopwords !== 'undefined')
})

// ── File handling ─────────────────────────────────────────────────────────────

function onFileDrop (e) {
  e.preventDefault()
  uploadZone.classList.remove('dragover')
  const file = e.dataTransfer.files[0]
  if (file) setFile(file)
}

function onFileSelected () {
  if (fileInput.files[0]) setFile(fileInput.files[0])
}

function setFile (file) {
  if (!file.name.endsWith('.txt')) {
    alert(
      'Please upload a plain text (.txt) file. PDF and DOCX support coming in Iteration 2.'
    )
    return
  }
  // Show file name
  fileNameSpan.textContent = file.name
  fileSelected.style.display = 'block'
  uploadZone.style.borderColor = 'var(--success)'
  checkExtractReady()
}

/** Enable the Extract button only when both file and subject are provided */
function checkExtractReady () {
  const hasFile = fileInput.files && fileInput.files[0]
  const hasSubject = subjectInput.value.trim().length > 0
  extractBtn.disabled = !(hasFile && hasSubject)
}

// ── Phase 1: Client-side NLP extraction ──────────────────────────────────────

/**
 * onExtract — triggered when lecturer clicks "Extract Vocabulary"
 * This runs entirely in the browser. No network call happens here.
 */
async function onExtract () {
  const file = fileInput.files[0]
  const subject = subjectInput.value.trim()

  // Show spinner
  spinnerExtract.classList.remove('d-none')
  extractBtn.disabled = true

  const reader = new FileReader()
  reader.onload = e => {
    const text = e.target.result
    candidateWords = extractVocabulary(text)
    spinnerExtract.classList.add('d-none')

    if (candidateWords.length === 0) {
      alert(
        'No vocabulary words found. Make sure your file contains enough text.'
      )
      extractBtn.disabled = false
      return
    }

    // Show confirmation modal (Phase 2)
    showConfirmationModal(candidateWords, subject)
  }
  reader.readAsText(file)
}

/**
 * extractVocabulary — the NLP pipeline
 */
function extractVocabulary (text) {
  // Step 1: Compromise.js normalisation
  const doc = nlp(text)
  const allTerms = doc.terms().out('array')

  // Step 2: Clean tokens
  const cleaned = allTerms
    .map(word =>
      word
        .toLowerCase()
        .replace(/[^a-z]/g, '')
        .trim()
    )
    .filter(word => word.length >= 4 && /^[a-z]+$/.test(word))

  // Step 3: Stopword removal
  const withoutStopwords = removeStopwords(cleaned, eng)

  // Step 4: Remove common words
  const filtered = withoutStopwords.filter(word => !COMMON_WORDS.has(word))

  // Step 5: Count frequency
  const freqMap = {}
  for (const word of filtered) {
    freqMap[word] = (freqMap[word] || 0) + 1
  }

  // Step 6: Unique words sorted by ascending frequency
  // (rare in this document = more likely academic/difficult)
  const unique = [...new Set(filtered)]
  unique.sort((a, b) => freqMap[a] - freqMap[b])

  // Step 7: Take top POOL_SIZE
  const result = unique.slice(0, POOL_SIZE)
  console.log(
    `NLP extracted ${result.length} candidate words from ${unique.length} unique terms`
  )
  return result
}

// ── Phase 2: Confirmation modal ───────────────────────────────────────────────

function showConfirmationModal (words, subject) {
  // Render word chips
  wordChipsEl.innerHTML = words
    .map(w => `<span class="word-chip">${w}</span>`)
    .join('')

  wordCountNote.textContent =
    `${words.length} words extracted locally. Claude will select the 15 hardest ` +
    `general academic words and ignore ${subject}-specific terminology.`

  // Update step indicators
  setStep(2)

  confirmModal.show()
}

// ── Phase 3: API call ─────────────────────────────────────────────────────────

/**
 * onConfirmAndGenerate — triggered when lecturer clicks "Send to Claude"
 */
async function onConfirmAndGenerate () {
  const subject = subjectInput.value.trim()

  confirmModal.hide()

  // Show quiz section with spinner
  sectionQuiz.classList.remove('d-none')
  spinnerApi.classList.remove('d-none')
  setStep(3)

  // Scroll to quiz section
  sectionQuiz.scrollIntoView({ behavior: 'smooth' })

  try {
    const response = await fetch(`${API_BASE}/generate-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        words: candidateWords,
        subject: subject
      })
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`API error: ${err}`)
    }

    const data = await response.json()
    console.log(`Received ${data.questions.length} questions from Claude`)

    // Initialise pool
    questionPool = data.questions
    displayedQuestions = []
    nextPoolIndex = 0

    // Fill first display batch
    fillDisplay()
  } catch (error) {
    console.error('Generation error:', error)
    questionsDisplay.innerHTML = `
            <div class="alert alert-danger" style="font-family:Arial,sans-serif;">
                <strong>Error:</strong> Failed to generate quiz. Please check your connection and try again.
                <br><small>${error.message}</small>
            </div>`
  } finally {
    spinnerApi.classList.add('d-none')
    saveSection.classList.remove('d-none')
  }
}

// ── Phase 4: Batched display ──────────────────────────────────────────────────

/**
 * fillDisplay — ensures exactly DISPLAY_SIZE (5) questions are shown,
 * pulling from the pool to fill any gaps left by removed questions.
 */
function fillDisplay () {
  // Pull from pool until we have DISPLAY_SIZE or pool is exhausted
  while (
    displayedQuestions.length < DISPLAY_SIZE &&
    nextPoolIndex < questionPool.length
  ) {
    displayedQuestions.push(questionPool[nextPoolIndex])
    nextPoolIndex++
  }

  renderQuestions()
  updatePoolInfo()
}

function updatePoolInfo () {
  const remaining = questionPool.length - nextPoolIndex
  poolInfo.textContent =
    remaining > 0
      ? `Showing ${displayedQuestions.length} of ${questionPool.length} questions · ${remaining} remaining in pool`
      : `Showing ${displayedQuestions.length} questions · Pool exhausted`
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderQuestions () {
  if (displayedQuestions.length === 0) {
    questionsDisplay.innerHTML = `
            <p style="font-family:Arial,sans-serif; color:var(--muted); text-align:center; padding:2rem;">
                All questions removed. <a href="/" style="color:var(--primary);">Start over</a> to generate new ones.
            </p>`
    saveSection.classList.add('d-none')
    return
  }

  questionsDisplay.innerHTML = displayedQuestions
    .map(
      (q, i) => `
        <div class="question-card" data-index="${i}">
            <button class="btn-remove" data-index="${i}">
                <i class="bi bi-x"></i> Remove
            </button>
            <div class="word-tag">${q.word}</div>
            <div class="question-num">Question ${i + 1}</div>
            <div class="question-text">${q.question}</div>
            <ul class="option-list">
                ${q.options
                  .map(
                    opt => `
                    <li class="${opt.startsWith(q.correct) ? 'correct' : ''}">
                        ${opt}
                        ${
                          opt.startsWith(q.correct)
                            ? '<i class="bi bi-check-circle-fill" style="margin-left:4px;"></i>'
                            : ''
                        }
                    </li>
                `
                  )
                  .join('')}
            </ul>
        </div>
    `
    )
    .join('')

  // Wire up remove buttons
  document.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index)
      removeQuestion(idx)
    })
  })
}

/**
 * removeQuestion — removes a question from the display and pulls a
 * replacement from the pool.
 */
function removeQuestion (displayIndex) {
  displayedQuestions.splice(displayIndex, 1)
  fillDisplay() // Will top up from pool if possible
}

// ── Phase 5: Save ─────────────────────────────────────────────────────────────

async function onSave () {
  // Clear any previous title and open the modal
  quizTitleInput.value = ''
  confirmSaveBtn.disabled = true
  saveModal.show()
}

/**
 * onConfirmSave — triggered when lecturer clicks "Save Quiz" inside the modal.
 * This replaces the old prompt()-based flow that caused a silent failure
 * during the Iteration 1 demo.
 */
async function onConfirmSave () {
  const title = quizTitleInput.value.trim()
  if (!title) return // safety check — button should be disabled anyway

  saveModal.hide()

  saveBtn.disabled = true
  saveBtn.innerHTML =
    '<span class="spinner-border spinner-border-sm"></span> Saving…'

  try {
    // We save only the currently displayed questions (the approved ones)
    const quizId = await saveQuiz(title, displayedQuestions)
    const quizUrl = `${window.location.origin}/quiz.html?id=${quizId}`

    // Show success
    sectionSaved.classList.remove('d-none')
    shareUrlEl.textContent = quizUrl
    saveSection.classList.add('d-none')
    setStep(4)

    sectionSaved.scrollIntoView({ behavior: 'smooth' })
  } catch (error) {
    console.error('Save error:', error)
    alert('Failed to save quiz. Please try again.')
    saveBtn.disabled = false
    saveBtn.innerHTML = '<i class="bi bi-cloud-upload"></i> Approve & Save Quiz'
  }
}

// ── Step indicator helper ─────────────────────────────────────────────────────

function setStep (activeStep) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`step-indicator-${i}`)
    el.classList.remove('active', 'done')
    if (i < activeStep) el.classList.add('done')
    if (i === activeStep) el.classList.add('active')
  }
}