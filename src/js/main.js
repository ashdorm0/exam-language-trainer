/**
 * main.js — Exam Language Trainer, Lecturer Tool
 */

import { removeStopwords, eng } from '../libs/stopword.esm.mjs'
import { saveQuiz } from './saveQuiz.js'
import { auth } from './firebase.js'
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js'

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
let currentUser = null // Firebase Auth user object

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

  // ── Auth events ──
  document.getElementById('signInBtn').addEventListener('click', onSignIn)
  document.getElementById('registerBtn').addEventListener('click', onRegister)
  document.getElementById('signOutBtn').addEventListener('click', onSignOut)

  // Listen for auth state changes — this fires on page load too
  onAuthStateChanged(auth, (user) => {
    currentUser = user
    const authSection = document.getElementById('section-auth')
    const toolSection = document.getElementById('section-lecturer-tool')
    const userInfo = document.getElementById('userInfo')
    const userEmail = document.getElementById('userEmail')

    if (user) {
      // Logged in — show lecturer tool, hide sign-in
      authSection.classList.add('d-none')
      toolSection.classList.remove('d-none')
      userInfo.classList.remove('d-none')
      userEmail.textContent = user.email
    } else {
      // Logged out — show sign-in, hide lecturer tool
      authSection.classList.remove('d-none')
      toolSection.classList.add('d-none')
      userInfo.classList.add('d-none')
    }
  })

  console.log('Exam Language Trainer initialised')
  console.log('Compromise loaded:', typeof nlp !== 'undefined')
  console.log('removeStopwords loaded:', typeof removeStopwords !== 'undefined')
})

// ── Authentication ────────────────────────────────────────────────────────────

function showAuthError (message) {
  const errorEl = document.getElementById('authError')
  errorEl.textContent = message
  errorEl.classList.remove('d-none')
}

function clearAuthError () {
  document.getElementById('authError').classList.add('d-none')
}

async function onSignIn () {
  clearAuthError()
  const email = document.getElementById('authEmail').value.trim()
  const password = document.getElementById('authPassword').value

  if (!email || !password) {
    showAuthError('Please enter both email and password.')
    return
  }

  try {
    await signInWithEmailAndPassword(auth, email, password)
    // onAuthStateChanged will handle the UI switch
  } catch (error) {
    console.error('Sign-in error:', error.code)
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
      showAuthError('Incorrect email or password.')
    } else {
      showAuthError('Sign-in failed. Please try again.')
    }
  }
}

async function onRegister () {
  clearAuthError()
  const email = document.getElementById('authEmail').value.trim()
  const password = document.getElementById('authPassword').value

  if (!email || !password) {
    showAuthError('Please enter both email and password.')
    return
  }

  if (password.length < 6) {
    showAuthError('Password must be at least 6 characters.')
    return
  }

  try {
    await createUserWithEmailAndPassword(auth, email, password)
    // onAuthStateChanged will handle the UI switch
  } catch (error) {
    console.error('Register error:', error.code)
    if (error.code === 'auth/email-already-in-use') {
      showAuthError('An account with this email already exists. Try signing in.')
    } else if (error.code === 'auth/invalid-email') {
      showAuthError('Please enter a valid email address.')
    } else {
      showAuthError('Registration failed. Please try again.')
    }
  }
}

async function onSignOut () {
  try {
    await signOut(auth)
    // Reload the page to reset all state cleanly
    window.location.reload()
  } catch (error) {
    console.error('Sign-out error:', error)
  }
}

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
  const name = file.name.toLowerCase()
  if (!name.endsWith('.txt') && !name.endsWith('.pdf') && !name.endsWith('.docx')) {
    alert(
      'Please upload a .txt, .pdf, or .docx file.'
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

  try {
    let text

    if (file.name.toLowerCase().endsWith('.pdf')) {
      // PDF path — use PDF.js to extract text client-side
      text = await extractTextFromPDF(file)
    } else if (file.name.toLowerCase().endsWith('.docx')) {
      // DOCX path — use Mammoth.js to extract text client-side
      text = await extractTextFromDOCX(file)
    } else {
      // Plain text path — use FileReader as before
      text = await readFileAsText(file)
    }

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
  } catch (error) {
    console.error('Extraction error:', error)
    spinnerExtract.classList.add('d-none')
    alert('Failed to extract text from file. Please try another file.')
    extractBtn.disabled = false
  }
}

/**
 * readFileAsText — wraps FileReader in a Promise so we can use async/await.
 * Previously the FileReader callback was inline in onExtract; extracting it
 * keeps the two paths (txt and pdf) parallel in structure.
 */
function readFileAsText (file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Failed to read text file'))
    reader.readAsText(file)
  })
}

/**
 * extractTextFromPDF — reads a PDF file entirely client-side using PDF.js.
 * The PDF never leaves the browser. Each page's text content is extracted
 * and concatenated into a single string for the NLP pipeline.
 */
async function extractTextFromPDF (file) {
  // Convert file to ArrayBuffer for PDF.js
  const arrayBuffer = await file.arrayBuffer()

  // Load the PDF document
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  console.log(`PDF loaded: ${pdf.numPages} pages`)

  let fullText = ''

  // Extract text from each page
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    fullText += pageText + ' '
  }

  console.log(`PDF text extracted: ${fullText.length} characters`)
  return fullText
}

/**
 * extractTextFromDOCX — reads a Word .docx file entirely client-side using Mammoth.js.
 * The document never leaves the browser. Mammoth extracts the raw text content,
 * stripping all formatting, which is exactly what the NLP pipeline needs.
 */
async function extractTextFromDOCX (file) {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer })
  console.log(`DOCX text extracted: ${result.value.length} characters`)
  return result.value
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
 *
 * STREAMING VERSION: Instead of waiting for the full API response,
 * this reads Server-Sent Events from the backend and renders each
 * question as soon as Claude finishes generating it. The lecturer
 * sees questions appearing one by one instead of waiting 5-8 seconds.
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

  // Reset state
  questionPool = []
  displayedQuestions = []
  nextPoolIndex = 0
  questionsDisplay.innerHTML = ''

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

    // Read the SSE stream
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let rawText = '' // Accumulates the full Claude response
    let sseBuffer = '' // Handles partial SSE lines

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      // Decode the chunk and add to SSE buffer
      sseBuffer += decoder.decode(value, { stream: true })

      // Process complete SSE lines
      const lines = sseBuffer.split('\n')
      // Keep the last (potentially incomplete) line in the buffer
      sseBuffer = lines.pop()

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const jsonStr = line.slice(6) // Remove "data: " prefix

        try {
          const event = JSON.parse(jsonStr)

          if (event.error) {
            throw new Error(event.error)
          }

          if (event.done) {
            console.log('Stream complete')
            break
          }

          if (event.text) {
            rawText += event.text

            // Try to extract complete question objects from what we have so far
            tryParseQuestions(rawText)
          }
        } catch (parseErr) {
          // Ignore parse errors on incomplete chunks
          if (parseErr.message !== 'Stream interrupted. Please try again.') {
            continue
          }
          throw parseErr
        }
      }
    }

    // Final parse attempt on complete response
    tryParseQuestions(rawText)
    console.log(`Stream finished. Total questions: ${questionPool.length}`)

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

/**
 * tryParseQuestions — attempts to extract complete question objects from
 * the raw streamed text. Called repeatedly as new text arrives.
 *
 * Strategy: Claude returns a JSON array like [{...}, {...}, ...].
 * We look for complete objects by finding matched { } pairs.
 * Each time we find a new complete object, we add it to the pool
 * and update the display.
 */
function tryParseQuestions (rawText) {
  // Strip markdown code fences if present
  const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim()

  // Find the opening bracket
  const startIdx = cleaned.indexOf('[')
  if (startIdx === -1) return

  const content = cleaned.slice(startIdx)

  // Count complete question objects by tracking brace depth
  let depth = 0
  let inString = false
  let escape = false
  let objectStart = -1
  const objects = []

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]

    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && inString) {
      escape = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === '{') {
      if (depth === 0) objectStart = i
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0 && objectStart !== -1) {
        const objStr = content.slice(objectStart, i + 1)
        try {
          const obj = JSON.parse(objStr)
          objects.push(obj)
        } catch (e) {
          // Incomplete or malformed — skip
        }
        objectStart = -1
      }
    }
  }

  // If we found new questions, add them to the pool and update display
  if (objects.length > questionPool.length) {
    const newQuestions = objects.slice(questionPool.length)
    questionPool = objects
    console.log(`Parsed ${newQuestions.length} new question(s), total: ${questionPool.length}`)

    // Update display
    fillDisplay()
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

  // Count how many cards are already rendered on screen
  const existingCards = questionsDisplay.querySelectorAll('.question-card').length

  // Only append NEW cards — don't touch existing ones (prevents flash during streaming)
  for (let i = existingCards; i < displayedQuestions.length; i++) {
    const cardHTML = buildQuestionCard(displayedQuestions[i], i)

    // Create a temporary container to build the DOM element
    const temp = document.createElement('div')
    temp.innerHTML = cardHTML
    const cardEl = temp.firstElementChild

    // Wire up the remove button on this card only
    const btn = cardEl.querySelector('.btn-remove')
    btn.addEventListener('click', () => {
      removeQuestion(parseInt(btn.dataset.index))
    })

    questionsDisplay.appendChild(cardEl)
  }
}

/**
 * fullRenderQuestions — rebuilds the entire display from scratch.
 * Used after a removal (where indices change), NOT during streaming.
 */
function fullRenderQuestions () {
  questionsDisplay.innerHTML = ''

  if (displayedQuestions.length === 0) {
    questionsDisplay.innerHTML = `
            <p style="font-family:Arial,sans-serif; color:var(--muted); text-align:center; padding:2rem;">
                All questions removed. <a href="/" style="color:var(--primary);">Start over</a> to generate new ones.
            </p>`
    saveSection.classList.add('d-none')
    return
  }

  questionsDisplay.innerHTML = displayedQuestions
    .map((q, i) => buildQuestionCard(q, i))
    .join('')

  // Wire up remove buttons
  questionsDisplay.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index)
      removeQuestion(idx)
    })
  })
}

/**
 * buildQuestionCard — returns the HTML string for a single question card.
 * Extracted so both renderQuestions (append) and fullRenderQuestions (rebuild)
 * can use the same template.
 */
function buildQuestionCard (q, i) {
  return `
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
}

/**
 * removeQuestion — removes a question from the display and pulls a
 * replacement from the pool.
 */
function removeQuestion (displayIndex) {
  displayedQuestions.splice(displayIndex, 1)
  // After removal, indices change so we need a full rebuild
  // Pull replacement from pool first
  if (nextPoolIndex < questionPool.length) {
    displayedQuestions.push(questionPool[nextPoolIndex])
    nextPoolIndex++
  }
  fullRenderQuestions()
  updatePoolInfo()
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
    const quizId = await saveQuiz(title, displayedQuestions, currentUser.uid)
    const quizUrl = `${window.location.origin}/quiz.html?id=${quizId}`

    // Show success
    sectionSaved.classList.remove('d-none')
    shareUrlEl.textContent = quizUrl
    document.getElementById('viewQuizBtn').href = quizUrl
    saveSection.classList.add('d-none')
    setStep(4)

    // Generate QR code for the quiz URL
    const qrContainer = document.getElementById('qrCode')
    qrContainer.innerHTML = '' // Clear any previous QR code
    new QRCode(qrContainer, {
      text: quizUrl,
      width: 160,
      height: 160,
      colorDark: '#1e293b',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    })

    // Wire up QR download button
    document.getElementById('downloadQrBtn').addEventListener('click', () => {
      const canvas = qrContainer.querySelector('canvas')
      if (!canvas) return
      const link = document.createElement('a')
      link.download = 'quiz-qr-code.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    })

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