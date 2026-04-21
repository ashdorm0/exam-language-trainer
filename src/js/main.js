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

const CLOUD_API_BASE =
  'https://us-central1-exam-language-trainer-3abec.cloudfunctions.net/api'
const LOCAL_API_BASE =
  'http://127.0.0.1:5001/exam-language-trainer-3abec/us-central1/api'
const DEFAULT_API_BASE_KEY = 'eltApiBase'

const storedApiBase = window.localStorage.getItem(DEFAULT_API_BASE_KEY)
const hasManualApiBaseOverride = Boolean(storedApiBase && storedApiBase.trim())

function resolveApiBase () {
  const stored = window.localStorage.getItem(DEFAULT_API_BASE_KEY)
  if (stored && stored.trim()) return stored.trim()

  const isLocalHost =
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'

  return isLocalHost ? LOCAL_API_BASE : CLOUD_API_BASE
}

let API_BASE = resolveApiBase()
const POOL_SIZE = 60 // Target words shown to lecturer in confirmation modal
const MIN_REVIEW_WORDS = 30 // Minimum target words before fallback backfill
const MIN_QUIZ_QUESTIONS_TO_SAVE = 1
const GENERATION_BATCH_SIZE = 10
const MAX_PARALLEL_STREAMS = 2

function shouldAutoFallbackToCloud () {
  return API_BASE === LOCAL_API_BASE && !hasManualApiBaseOverride
}

function getApiUrl (path, base = API_BASE) {
  return `${base}${path}`
}

async function fetchWithApiFallback (path, options) {
  const manualBase = window.localStorage.getItem(DEFAULT_API_BASE_KEY)?.trim()
  const attemptBases = manualBase
    ? [manualBase]
    : shouldAutoFallbackToCloud()
      ? [LOCAL_API_BASE, CLOUD_API_BASE]
      : [API_BASE]

  let lastError = null

  for (const base of attemptBases) {
    try {
      const response = await fetch(getApiUrl(path, base), options)

      if (!manualBase && base === CLOUD_API_BASE && API_BASE !== CLOUD_API_BASE) {
        API_BASE = CLOUD_API_BASE
      }

      return response
    } catch (error) {
      lastError = error

      if (!manualBase && base === LOCAL_API_BASE) {
        console.warn(
          'Local Functions API unreachable. Falling back to deployed API.',
          error
        )
        continue
      }

      throw error
    }
  }

  throw lastError || new Error('API request failed before reaching the server.')
}

// Common-word dictionary loaded once at startup.
let COMMON_WORDS = new Set()

// ── State ──────────────────────────────────────────────────────────────────────

// Quiz streaming state.
// questionPool: all generated questions.
let questionPool = []
let quizQuestions = []
let filteredInvalidQuestionCount = 0
let quizGenerationComplete = false
let currentUser = null // Firebase Auth user object
let processingMode = null // exam-local | course-server

// ── DOM references (populated after DOMContentLoaded) ─────────────────────────

let fileInput, uploadZone, fileSelected, fileNameSpan
let extractBtn
let spinnerExtract, spinnerApi
let sectionMode, sectionUpload, sectionQuiz, sectionSaved
let poolInfo, questionsDisplay, saveSection, saveBtn
let quizList, quizListCount, quizListEmpty
let generatedListCount, saveThresholdHint
let addAllBtn, removeAllBtn
let shareUrlEl, copyBtn
let saveModal, quizTitleInput, confirmSaveBtn
let viewQuizBtn, downloadQrBtn, startOverBtn
let modeExamBtn, modeCourseBtn
let sidebarModePickerBtn
let sidebarBrandNote
let sidebarStep1Sub
let uploadHeroTitle, uploadHeroSubtitle, uploadModePoint
let securityBadgeStrong, securityBadgeBody
let extractBtnLabel, extractSpinnerText
let candidateWords = [] // Words ready to show in confirmation modal
let selectedWords = new Set() // Words currently selected for sending to Claude
// ── Initialisation ────────────────────────────────────────────────────────────

async function loadCommonWords () {
  // Merge bundled easy-word lists into one lookup set.
  try {
    const [ngslResponse, basicResponse] = await Promise.all([
      fetch('../libs/common_words_ngsl.txt'),
      fetch('../libs/common_words_1200.txt')
    ])

    const parseWordList = text =>
      text
        .split('\n')
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length > 0)

    const ngslWords = parseWordList(await ngslResponse.text())
    const basicWords = parseWordList(await basicResponse.text())

    COMMON_WORDS = new Set([...ngslWords, ...basicWords])
  } catch (error) {
    console.warn(
      'Could not load common word lists — filtering will be limited.',
      error
    )
    // App continues to work without the list; some common words may slip through to the lecturer's review
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Load common words before wiring extraction flow.
  await loadCommonWords()

  // Cache DOM references.
  fileInput = document.getElementById('fileInput')
  uploadZone = document.getElementById('uploadZone')
  fileSelected = document.getElementById('fileSelected')
  fileNameSpan = document.getElementById('fileName')
  extractBtn = document.getElementById('extractBtn')
  spinnerExtract = document.getElementById('spinner-extract')
  spinnerApi = document.getElementById('spinner-api')
  sectionMode = document.getElementById('section-mode')
  sectionUpload = document.getElementById('section-upload')
  sectionQuiz = document.getElementById('section-quiz')
  sectionSaved = document.getElementById('section-saved')
  poolInfo = document.getElementById('poolInfo')
  questionsDisplay = document.getElementById('questionsDisplay')
  saveSection = document.getElementById('saveSection')
  saveBtn = document.getElementById('saveBtn')
  quizList = document.getElementById('quizList')
  quizListCount = document.getElementById('quizListCount')
  quizListEmpty = document.getElementById('quizListEmpty')
  generatedListCount = document.getElementById('generatedListCount')
  saveThresholdHint = document.getElementById('saveThresholdHint')
  addAllBtn = document.getElementById('addAllBtn')
  removeAllBtn = document.getElementById('removeAllBtn')
  shareUrlEl = document.getElementById('shareUrl')
  copyBtn = document.getElementById('copyBtn')
  viewQuizBtn = document.getElementById('viewQuizBtn')
  downloadQrBtn = document.getElementById('downloadQrBtn')
  startOverBtn = document.getElementById('startOverBtn')
  // Review step actions.
  document
    .getElementById('reviewContinueBtn')
    .addEventListener('click', onConfirmAndGenerate)
  document.getElementById('reviewBackBtn').addEventListener('click', () => {
    document.getElementById('section-review').classList.add('d-none')
    document.getElementById('section-upload').classList.remove('d-none')
    setStep(1)
  })
  saveModal = new bootstrap.Modal(document.getElementById('saveModal'))
  quizTitleInput = document.getElementById('quizTitleInput')
  confirmSaveBtn = document.getElementById('confirmSaveBtn')
  modeExamBtn = document.getElementById('modeExamBtn')
  modeCourseBtn = document.getElementById('modeCourseBtn')
  sidebarModePickerBtn = document.getElementById('sidebarModePickerBtn')
  sidebarBrandNote = document.getElementById('sidebarBrandNote')
  sidebarStep1Sub = document.getElementById('sidebarStep1Sub')
  uploadHeroTitle = document.getElementById('uploadHeroTitle')
  uploadHeroSubtitle = document.getElementById('uploadHeroSubtitle')
  uploadModePoint = document.getElementById('uploadModePoint')
  securityBadgeStrong = document.getElementById('securityBadgeStrong')
  securityBadgeBody = document.getElementById('securityBadgeBody')
  extractBtnLabel = document.getElementById('extractBtnLabel')
  extractSpinnerText = document.getElementById('extractSpinnerText')

  // Bind UI events.
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
  extractBtn.addEventListener('click', onExtract)
  modeExamBtn.addEventListener('click', () => onModeSelected('exam-local'))
  modeCourseBtn.addEventListener('click', () => onModeSelected('course-server'))
  sidebarModePickerBtn.addEventListener('click', resetToBeginning)
  saveBtn.addEventListener('click', onSave)
  addAllBtn.addEventListener('click', addAllQuestionsToQuiz)
  removeAllBtn.addEventListener('click', removeAllQuestionsFromQuiz)
  quizTitleInput.addEventListener('input', () => {
    confirmSaveBtn.disabled = !quizTitleInput.value.trim()
  })
  confirmSaveBtn.addEventListener('click', onConfirmSave)
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(shareUrlEl.textContent)
    copyBtn.innerHTML = '<i class="bi bi-check"></i> Copied!'
  })
  startOverBtn.addEventListener('click', resetToBeginning)

  // Delegate add-to-quiz clicks so newly streamed cards work without rebinding all cards.
  questionsDisplay.addEventListener('click', event => {
    const addButton = event.target.closest('.btn-add-to-quiz')
    if (!addButton) return

    const idx = Number(addButton.dataset.index)
    if (Number.isNaN(idx)) return
    addQuestionToQuiz(idx)
  })

  // Auth actions.
  document.getElementById('signInBtn').addEventListener('click', onSignIn)
  document.getElementById('registerBtn').addEventListener('click', onRegister)
  document.getElementById('sidebarSignOutBtn').addEventListener('click', onSignOut)

  // Fires on initial load and every auth change.
  onAuthStateChanged(auth, user => {
    currentUser = user
    const authSection = document.getElementById('section-auth')
    const toolSection = document.getElementById('section-lecturer-tool')
    const sidebarUserEmail = document.getElementById('sidebarUserEmail')

    if (user) {
      // Logged in: show tool, hide auth panel.
      authSection.classList.add('d-none')
      toolSection.classList.remove('d-none')
      sidebarUserEmail.textContent = user.email
      showModeSelection()
    } else {
      // Logged out: show auth panel, hide tool.
      authSection.classList.remove('d-none')
      toolSection.classList.add('d-none')
      sidebarUserEmail.textContent = ''
    }
  })

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
    if (
      error.code === 'auth/invalid-credential' ||
      error.code === 'auth/user-not-found' ||
      error.code === 'auth/wrong-password'
    ) {
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
      showAuthError(
        'An account with this email already exists. Try signing in.'
      )
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
  if (
    !name.endsWith('.txt') &&
    !name.endsWith('.pdf') &&
    !name.endsWith('.docx')
  ) {
    alert('Please upload a .txt, .pdf, or .docx file.')
    return
  }
  // Show file name
  fileNameSpan.textContent = file.name
  fileSelected.style.display = 'flex'
  fileSelected.classList.remove('is-visible')
  void fileSelected.offsetWidth
  fileSelected.classList.add('is-visible')
  uploadZone.classList.remove('has-file')
  void uploadZone.offsetWidth
  uploadZone.classList.add('has-file')
  checkExtractReady()
}

function getModeCopy (mode) {
  if (mode === 'course-server') {
    return {
      sidebar: 'Course mode selected. Extraction runs on the server.',
      title: 'Upload course material',
      subtitle:
        'Drop a file or choose one from your computer. The file is uploaded for server-side text and vocabulary extraction.',
      point: 'Processed on the server after upload',
      step1Sub: 'Upload course material',
      securityStrong: 'Course material can be uploaded for extraction.',
      securityBody:
        'Use this for teaching material where strict exam confidentiality is not required. After extraction, the workflow is identical.',
      extractBtn: 'Extract Vocabulary on Server',
      extractSpinner: 'Uploading and extracting vocabulary on server...'
    }
  }

  return {
    sidebar: 'Exam mode selected. Processing stays in your browser.',
    title: 'Upload an exam paper',
    subtitle:
      'Drop a file or choose one from your computer. The text stays in your browser until you extract vocabulary.',
    point: 'Processed locally in your browser',
    step1Sub: 'Select exam paper',
    securityStrong: 'Your exam paper stays on your computer.',
    securityBody:
      'Vocabulary is extracted locally in your browser. Only word lists - never exam content - are sent to the server.',
    extractBtn: 'Extract Vocabulary',
    extractSpinner: 'Extracting vocabulary locally...'
  }
}

function applyModeCopy (mode) {
  const copy = getModeCopy(mode)
  sidebarBrandNote.textContent = copy.sidebar
  uploadHeroTitle.textContent = copy.title
  uploadHeroSubtitle.textContent = copy.subtitle
  uploadModePoint.textContent = copy.point
  sidebarStep1Sub.textContent = copy.step1Sub
  securityBadgeStrong.textContent = copy.securityStrong
  securityBadgeBody.textContent = copy.securityBody
  extractBtnLabel.textContent = copy.extractBtn
  extractSpinnerText.textContent = copy.extractSpinner
}

function clearSelectedFile () {
  fileInput.value = ''
  fileNameSpan.textContent = ''
  fileSelected.style.display = 'none'
  fileSelected.classList.remove('is-visible')
  uploadZone.classList.remove('has-file')
}

function onModeSelected (mode) {
  processingMode = mode
  applyModeCopy(mode)
  clearSelectedFile()
  checkExtractReady()

  sectionMode.classList.add('d-none')
  sectionUpload.classList.remove('d-none')
  sectionQuiz.classList.add('d-none')
  sectionSaved.classList.add('d-none')
  document.getElementById('section-review').classList.add('d-none')

  setStep(1)
}

function showModeSelection () {
  processingMode = null
  sectionMode.classList.remove('d-none')
  sectionUpload.classList.add('d-none')
  sectionQuiz.classList.add('d-none')
  sectionSaved.classList.add('d-none')
  document.getElementById('section-review').classList.add('d-none')
  clearSelectedFile()
  checkExtractReady()
  sidebarBrandNote.textContent = 'Choose a mode to begin.'
  setStep(0)
}

// Enable extraction only when both file and mode are set.
function checkExtractReady () {
  const hasFile = fileInput.files && fileInput.files[0]
  extractBtn.disabled = !hasFile || !processingMode
}

// ── Phase 1: Client-side NLP extraction ──────────────────────────────────────

// Start extraction flow for the selected processing mode.
async function onExtract () {
  const file = fileInput.files[0]

  if (!processingMode) {
    alert('Choose Exam Paper or Course Material mode before extracting.')
    return
  }

  // Show extraction spinner.
  spinnerExtract.classList.remove('d-none')
  extractBtn.disabled = true

  try {
    if (processingMode === 'course-server') {
      candidateWords = await extractCandidateWordsOnServer(file)
    } else {
      candidateWords = await extractCandidateWordsLocally(file)
    }

    if (candidateWords.length === 0) {
      alert(
        'No vocabulary words found. Make sure your file contains enough text.'
      )
      extractBtn.disabled = false
      return
    }

    // Move to review step.
    showConfirmationModal(candidateWords)
  } catch (error) {
    console.error('Extraction error:', error)
    const modeError =
      processingMode === 'course-server'
        ? error.message ||
          'Failed to extract vocabulary on the server. Please try another file.'
        : 'Failed to extract text from file. Please try another file.'
    alert(modeError)
  } finally {
    spinnerExtract.classList.add('d-none')
    checkExtractReady()
  }
}

async function extractCandidateWordsLocally (file) {
  let text

  if (file.name.toLowerCase().endsWith('.pdf')) {
    // PDF path.
    text = await extractTextFromPDF(file)
  } else if (file.name.toLowerCase().endsWith('.docx')) {
    // DOCX path.
    text = await extractTextFromDOCX(file)
  } else {
    // TXT path.
    text = await readFileAsText(file)
  }

  return extractVocabulary(text)
}

async function extractCandidateWordsOnServer (file) {
  const filePayload = await fileToBase64Payload(file)

  const response = await fetchWithApiFallback('/extract-course-vocabulary', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(filePayload)
  })

  if (!response.ok) {
    let errorMessage = 'Server extraction failed.'
    try {
      const payload = await response.json()
      if (payload.error) errorMessage = payload.error
    } catch {
      try {
        const text = await response.text()
        if (text) errorMessage = text.slice(0, 220)
      } catch {
        // Keep default fallback message.
      }
    }
    throw new Error(
      `Server extraction failed (${response.status}): ${errorMessage}`
    )
  }

  const payload = await response.json()
  if (!payload.words || !Array.isArray(payload.words)) {
    throw new Error('Invalid server response while extracting vocabulary.')
  }

  return payload.words
}

async function fileToBase64Payload (file) {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''

  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }

  return {
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    data: btoa(binary)
  }
}

// Wrap FileReader in a Promise for consistent async flow.
function readFileAsText (file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Failed to read text file'))
    reader.readAsText(file)
  })
}

// Extract text from all PDF pages for NLP processing.
async function extractTextFromPDF (file) {
  // Convert file to ArrayBuffer for PDF.js.
  const arrayBuffer = await file.arrayBuffer()

  // Load PDF document.
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

  let fullText = ''

  // Extract text page by page.
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items.map(item => item.str).join(' ')
    fullText += pageText + ' '
  }

  return fullText
}

function updateSelectionUI () {
  const selectedCount = selectedWords.size
  const totalCount = candidateWords.length
  const removedCount = totalCount - selectedCount

  // Update summary cards.
  document.getElementById('reviewKeeping').textContent = selectedCount
  document.getElementById('reviewRemoved').textContent = removedCount

  // Review controls.
  const note = document.getElementById('reviewCountNote')
  const continueBtn = document.getElementById('reviewContinueBtn')

  if (selectedCount < 10) {
    note.textContent = `Keep at least 10 words selected to generate a quiz.`
    continueBtn.disabled = true
  } else {
    note.textContent = `${selectedCount} of ${totalCount} words selected.`
    continueBtn.disabled = false
  }
}

// Extract raw text from DOCX using Mammoth.
async function extractTextFromDOCX (file) {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer })
  return result.value
}

// Rank likely difficult vocabulary from source text.
function extractVocabulary (text) {
  const doc = nlp(text)

  const nouns = new Set(
    doc
      .nouns()
      .out('array')
      .map(normalizeWord)
      .filter(Boolean)
  )
  const verbs = new Set(
    doc
      .verbs()
      .out('array')
      .map(normalizeWord)
      .filter(Boolean)
  )
  const adjectives = new Set(
    doc
      .adjectives()
      .out('array')
      .map(normalizeWord)
      .filter(Boolean)
  )
  const adverbs = new Set(
    doc
      .adverbs()
      .out('array')
      .map(normalizeWord)
      .filter(Boolean)
  )
  const dateTerms = new Set(
    doc
      .match('#Date')
      .terms()
      .out('array')
      .map(normalizeWord)
      .filter(Boolean)
  )

  const allTerms = doc.not('#ProperNoun').terms().out('array')
  const filteredTerms = removeStopwords(
    allTerms.map(normalizeWord).filter(Boolean),
    eng
  )

  const stats = new Map()

  for (const term of filteredTerms) {
    if (!isCandidateWord(term, dateTerms)) continue

    const posScore = getPartOfSpeechScore(
      term,
      nouns,
      verbs,
      adjectives,
      adverbs
    )

    // Keep strong academic-like terms even with weak POS confidence.
    if (posScore === 0 && !hasAcademicSuffix(term) && term.length < 7) continue

    const entry = stats.get(term) || {
      word: term,
      frequency: 0,
      firstSeen: stats.size,
      posScore: 0
    }

    entry.frequency += 1
    entry.posScore = Math.max(entry.posScore, posScore)

    stats.set(term, entry)
  }

  const ranked = [...stats.values()]
    .map(entry => ({
      ...entry,
      score: scoreDifficulty(entry)
    }))
    .filter(entry => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.frequency - a.frequency ||
        a.firstSeen - b.firstSeen ||
        a.word.localeCompare(b.word)
    )

  // Keep highest-value candidates, not just rare tokens.
  const result = selectTopCandidatesWithTies(ranked, POOL_SIZE).map(
    entry => entry.word
  )

  if (result.length < MIN_REVIEW_WORDS) {
    const selected = new Set(result)
    const relaxed = [...stats.values()]
      .map(entry => ({
        ...entry,
        score: scoreDifficultyRelaxed(entry)
      }))
      .filter(entry => entry.score > 0 && !selected.has(entry.word))
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.frequency - a.frequency ||
          a.firstSeen - b.firstSeen ||
          a.word.localeCompare(b.word)
      )

    for (const entry of relaxed) {
      result.push(entry.word)
      selected.add(entry.word)
      if (result.length >= POOL_SIZE) break
    }
  }

  return result
}

function normalizeWord (word) {
  return word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '').trim()
}

function getBaseForms (word) {
  const forms = new Set([word])

  if (word.length > 3 && word.endsWith('s')) {
    forms.add(word.slice(0, -1))
  }

  if (word.length > 5 && word.endsWith('es')) {
    forms.add(word.slice(0, -2))
  }

  if (word.length > 5 && word.endsWith('ies')) {
    forms.add(`${word.slice(0, -3)}y`)
  }

  if (word.length > 5 && word.endsWith('ed')) {
    const stem = word.slice(0, -2)
    forms.add(stem)
    forms.add(`${stem}e`)

    // Handle doubled consonants: stopped -> stop, planned -> plan
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) {
      forms.add(stem.slice(0, -1))
    }
  }

  if (word.length > 6 && word.endsWith('ing')) {
    const stem = word.slice(0, -3)
    forms.add(stem)
    forms.add(`${stem}e`)

    // Handle doubled consonants: running -> run, sitting -> sit
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) {
      forms.add(stem.slice(0, -1))
    }
  }

  if (word.length > 5 && word.endsWith('er')) {
    const stem = word.slice(0, -2)
    forms.add(stem)
    forms.add(`${stem}e`)

    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) {
      forms.add(stem.slice(0, -1))
    }
  }

  if (word.length > 6 && word.endsWith('est')) {
    const stem = word.slice(0, -3)
    forms.add(stem)
    forms.add(`${stem}e`)

    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) {
      forms.add(stem.slice(0, -1))
    }
  }

  return [...forms].filter(form => form.length >= 3)
}

function isCandidateWord (word, dateTerms = new Set()) {
  if (!/^[a-z]+$/.test(word) || word.length < 4) return false
  if (/^(?:null|true|false|undefined|localhost)$/i.test(word)) return false
  if (dateTerms.has(word)) return false
  const baseForms = getBaseForms(word)
  if (baseForms.some(form => COMMON_WORDS.has(form))) return false
  if (isMashedCompound(word)) return false
  if (isLikelyCompoundArtifact(word)) return false
  if (isLikelyIdentifierArtifact(word)) return false
  return true
}

function isMashedCompound (word) {
  if (word.length < 8) return false

  const parts = splitIntoKnownWords(word)
  return parts !== null && parts.length >= 2
}

function isLikelyCompoundArtifact (word) {
  if (word.length < 11) return false

  for (let splitIndex = 4; splitIndex <= word.length - 4; splitIndex++) {
    const prefix = word.slice(0, splitIndex)
    const suffix = word.slice(splitIndex)

    if (!COMMON_WORDS.has(prefix) || suffix.length < 4) continue
    if (COMMON_WORDS.has(suffix)) continue

    if (nlp(suffix).found) return true
  }

  for (let splitIndex = 4; splitIndex <= word.length - 2; splitIndex++) {
    const prefix = word.slice(0, splitIndex)
    const suffix = word.slice(splitIndex)

    if (COMMON_WORDS.has(prefix) && suffix.length <= 3) return true
  }

  return false
}

function isLikelyIdentifierArtifact (word) {
  if (word.length < 6) return false

  const suffixPattern =
    /(id|uid|uuid|utc|xml|json|http|https|api|sql|dto|dao|repo|svc|datetime|timestamp)$/
  if (suffixPattern.test(word)) return true

  const techPattern = /(utc|json|xml|http|https|api|sql|dto|dao|repo|svc|datetime|timestamp)/g
  const matches = word.match(techPattern)
  if (matches && matches.length >= 1 && word.length >= 9) return true

  if (/^[a-z]+(?:day|date|time|routine)$/.test(word) && word.length >= 12) {
    return true
  }

  return false
}

function splitIntoKnownWords (word) {
  const memo = new Map()

  function isKnownFragment (fragment) {
    if (COMMON_WORDS.has(fragment)) return true
    if (fragment.length > 4 && fragment.endsWith('s')) {
      const singular = fragment.slice(0, -1)
      if (COMMON_WORDS.has(singular)) return true
    }
    if (fragment.length > 5 && fragment.endsWith('es')) {
      const singular = fragment.slice(0, -2)
      if (COMMON_WORDS.has(singular)) return true
    }
    if (fragment.length > 5 && fragment.endsWith('ed')) {
      const base = fragment.slice(0, -2)
      if (COMMON_WORDS.has(base)) return true
    }
    if (fragment.length > 6 && fragment.endsWith('ing')) {
      const base = fragment.slice(0, -3)
      if (COMMON_WORDS.has(base)) return true
    }
    return false
  }

  function helper (index) {
    if (index === word.length) return []
    if (memo.has(index)) return memo.get(index)

    for (let end = word.length; end > index; end--) {
      const fragment = word.slice(index, end)
      if (fragment.length < 3 || !isKnownFragment(fragment)) continue

      const remainder = helper(end)
      if (remainder) {
        const result = [fragment, ...remainder]
        memo.set(index, result)
        return result
      }
    }

    memo.set(index, null)
    return null
  }

  return helper(0)
}

function getPartOfSpeechScore (word, nouns, verbs, adjectives, adverbs) {
  if (adjectives.has(word)) return 1.2
  if (nouns.has(word)) return 1.05
  if (verbs.has(word)) return 0.9
  if (adverbs.has(word)) return 0
  return 0.25
}

function estimateSyllables (word) {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, '')
  if (!cleaned) return 0

  let count = 0
  let prevWasVowel = false
  for (const char of cleaned) {
    const isVowel = 'aeiouy'.includes(char)
    if (isVowel && !prevWasVowel) count += 1
    prevWasVowel = isVowel
  }

  if (cleaned.endsWith('e') && count > 1) count -= 1
  return Math.max(1, count)
}

function hasAcademicSuffix (word) {
  if (word.length < 7) return false
  return /(?:tion|sion|ment|ness|ity|ism|ist|ive|ous|ary|ory|ence|ance|ship|hood|able|ible|ically|ology|graphy)$/i.test(
    word
  )
}

function scoreDifficulty (entry) {
  const { word, frequency, posScore } = entry
  const syllables = estimateSyllables(word)

  const isLowSignalSimpleWord =
    !hasAcademicSuffix(word) && syllables < 3 && word.length < 10

  // Reject one-off simple nouns/verbs that are likely low-value noise.
  if (isLowSignalSimpleWord && frequency < 2) return -1

  let score = 0

  // Short, common, and repeated terms should be filtered out first.
  score += posScore

  if (posScore <= 0.9) score -= 0.75
  if (/(?:ing|ed)$/.test(word) && !hasAcademicSuffix(word) && !/related$/.test(word)) {
    score -= 0.75
  }

  if (posScore <= 0.9 && !hasAcademicSuffix(word) && !/related$/.test(word)) {
    return -1
  }

  if (frequency === 1) score += 1.5
  else if (frequency === 2) score += 0.75
  else score -= Math.min(2, frequency - 2)

  if (word.length >= 7) score += 0.75
  if (word.length >= 9) score += 0.5
  if (syllables >= 3) score += 1
  if (syllables >= 4) score += 0.5
  if (hasAcademicSuffix(word)) score += 1

  return score
}

function scoreDifficultyRelaxed (entry) {
  const { word, frequency, posScore } = entry
  const syllables = estimateSyllables(word)

  let score = 0
  score += Math.max(0.35, posScore)

  if (frequency === 1) score += 1.2
  else if (frequency === 2) score += 0.5
  else score -= Math.min(1.5, frequency - 2)

  if (word.length >= 7) score += 0.65
  if (word.length >= 9) score += 0.4
  if (syllables >= 3) score += 0.8
  if (syllables >= 4) score += 0.4
  if (hasAcademicSuffix(word)) score += 0.8

  if (/(?:ing|ed)$/.test(word) && !hasAcademicSuffix(word) && !/related$/.test(word)) {
    score -= 0.35
  }

  return score
}

function selectTopCandidatesWithTies (ranked, targetSize) {
  if (ranked.length <= targetSize) return ranked

  const cutoffScore = ranked[targetSize - 1].score
  let endIndex = targetSize

  while (endIndex < ranked.length && ranked[endIndex].score === cutoffScore) {
    endIndex++
  }

  return ranked.slice(0, endIndex)
}

function getQuestionKey (question) {
  if (!question) return ''
  const options = Array.isArray(question.options) ? question.options.join('||') : ''
  return [
    question.question || '',
    question.correct || '',
    options
  ].join('::')
}

function isQuestionInQuiz (question) {
  const key = getQuestionKey(question)
  return quizQuestions.some(existing => getQuestionKey(existing) === key)
}

function addQuestionToQuiz (displayIndex) {
  const question = questionPool[displayIndex]
  if (!question || isQuestionInQuiz(question)) return

  quizQuestions.push(question)
  updateQuizListUI()
  removeGeneratedQuestionCard(displayIndex)
}

function removeQuestionFromQuiz (question) {
  const key = getQuestionKey(question)
  const nextQuizQuestions = quizQuestions.filter(
    existing => getQuestionKey(existing) !== key
  )

  if (nextQuizQuestions.length === quizQuestions.length) return

  quizQuestions = nextQuizQuestions
  updateQuizListUI()
  restoreGeneratedQuestionCard(key)
}

function removeGeneratedQuestionCard (questionIndex) {
  const card = questionsDisplay.querySelector(`.question-card[data-index="${questionIndex}"]`)
  if (card) card.remove()

  if (!questionsDisplay.querySelector('.question-card')) {
    renderQuestions()
  }
}

function restoreGeneratedQuestionCard (questionKey) {
  const questionIndex = questionPool.findIndex(
    question => getQuestionKey(question) === questionKey
  )
  if (questionIndex === -1) return

  if (questionsDisplay.querySelector(`.question-card[data-index="${questionIndex}"]`)) {
    return
  }

  const emptyState = questionsDisplay.querySelector('.questions-empty')
  if (emptyState) emptyState.remove()

  const nextCard = [...questionsDisplay.querySelectorAll('.question-card')].find(
    cardEl => Number(cardEl.dataset.index) > questionIndex
  )
  const cardMarkup = buildQuestionCard(questionPool[questionIndex], questionIndex)

  if (nextCard) {
    nextCard.insertAdjacentHTML('beforebegin', cardMarkup)
  } else {
    questionsDisplay.insertAdjacentHTML('beforeend', cardMarkup)
  }

  updateQuestionCardStates()
}

function updateQuestionCardStates () {
  questionsDisplay.querySelectorAll('.question-card').forEach(cardEl => {
    const index = Number(cardEl.dataset.index)
    const question = questionPool[index]
    if (!question) return

    const isAdded = isQuestionInQuiz(question)
    cardEl.classList.toggle('added-to-quiz', isAdded)

    const addBtn = cardEl.querySelector('.btn-add-to-quiz')
    if (addBtn) {
      addBtn.disabled = isAdded
      addBtn.innerHTML = isAdded
        ? '<i class="bi bi-check-lg"></i> Added to quiz'
        : '<i class="bi bi-plus-lg"></i> Add to quiz'
    }
  })
}

function updateQuizListUI () {
  if (!quizList || !quizListCount || !quizListEmpty) return

  quizListCount.textContent = `${quizQuestions.length} in quiz list`
  quizListEmpty.classList.toggle('d-none', quizQuestions.length > 0)
  quizList.innerHTML = quizQuestions
    .map((question, index) => {
      const questionLabel = `Question ${index + 1}`
      const optionsText = question.options.slice(0, 2).join(' • ')

      return `
        <div class="quiz-list-card" data-index="${index}">
          <div class="quiz-list-card-index">${questionLabel}</div>
          <div class="quiz-list-card-title">${question.question}</div>
          <div class="quiz-list-card-meta">${optionsText}</div>
          <div class="quiz-list-card-actions">
            <span class="quiz-list-card-index">In quiz list</span>
            <button type="button" class="btn-remove" data-index="${index}">
              <i class="bi bi-x"></i> Remove
            </button>
          </div>
        </div>
      `
    })
    .join('')

  quizList.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.index)
      const question = quizQuestions[index]
      if (!question) return
      removeQuestionFromQuiz(question)
    })
  })

  const generationDone = quizGenerationComplete
  saveBtn.disabled = !generationDone || quizQuestions.length < MIN_QUIZ_QUESTIONS_TO_SAVE

  if (saveThresholdHint) {
    if (!generationDone) {
      saveThresholdHint.textContent = 'Save unlocks after generation finishes.'
    } else if (quizQuestions.length < MIN_QUIZ_QUESTIONS_TO_SAVE) {
      saveThresholdHint.textContent = `Add at least ${MIN_QUIZ_QUESTIONS_TO_SAVE} question to save.`
    } else {
      saveThresholdHint.textContent = `Ready to save (${quizQuestions.length} selected).`
    }
  }

  updateGeneratedListCount()
  updateBulkActionButtons()
  updatePoolInfo()
}

function updateGeneratedListCount () {
  if (!generatedListCount) return

  const available = questionPool.filter(question => !isQuestionInQuiz(question)).length
  generatedListCount.textContent = `${available} available`
}

function updateBulkActionButtons () {
  const generationDone = quizGenerationComplete
  const available = questionPool.filter(question => !isQuestionInQuiz(question)).length

  if (addAllBtn) {
    addAllBtn.disabled = !generationDone || available === 0
    addAllBtn.textContent = available > 0 ? `Add all (${available})` : 'Add all'
  }

  if (removeAllBtn) {
    removeAllBtn.disabled = !generationDone || quizQuestions.length === 0
    removeAllBtn.textContent =
      quizQuestions.length > 0 ? `Remove all (${quizQuestions.length})` : 'Remove all'
  }
}

function addAllQuestionsToQuiz () {
  let addedCount = 0

  for (const question of questionPool) {
    if (isQuestionInQuiz(question)) continue
    quizQuestions.push(question)
    addedCount += 1
  }

  if (addedCount === 0) return

  updateQuizListUI()
  renderQuestions()
}

function removeAllQuestionsFromQuiz () {
  if (quizQuestions.length === 0) return

  const shouldClearAll = window.confirm(
    `Remove all ${quizQuestions.length} question${quizQuestions.length === 1 ? '' : 's'} from the quiz list?`
  )
  if (!shouldClearAll) return

  quizQuestions = []
  updateQuizListUI()
  renderQuestions()
}

// ── Phase 2: Review selections ────────────────────────────────────────────────

function showConfirmationModal (words) {
  // Start with all words selected.
  selectedWords = new Set(words)

  // Show extracted count.
  document.getElementById('reviewExtracted').textContent = words.length

  // Render word chips.
  const reviewChipsEl = document.getElementById('reviewChips')
  reviewChipsEl.innerHTML = words
    .map(w => `<span class="word-chip" data-word="${w}">${w}</span>`)
    .join('')

  // Toggle word inclusion on chip click.
  reviewChipsEl.querySelectorAll('.word-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const word = chip.dataset.word
      if (selectedWords.has(word)) {
        selectedWords.delete(word)
        chip.classList.add('deselected')
      } else {
        selectedWords.add(word)
        chip.classList.remove('deselected')
      }
      updateSelectionUI()
    })
  })

  // Swap upload section for review section.
  document.getElementById('section-upload').classList.add('d-none')
  document.getElementById('section-review').classList.remove('d-none')

  setStep(2)
  updateSelectionUI()
}

// ── Phase 3: Generate quiz ────────────────────────────────────────────────────

// Request quiz generation and progressively render streamed questions.
async function onConfirmAndGenerate () {
  document.getElementById('section-review').classList.add('d-none')

  // Show quiz section and loading state.
  sectionQuiz.classList.remove('d-none')
  spinnerApi.classList.remove('d-none')
  setStep(3)

  // Bring quiz section into view.
  sectionQuiz.scrollIntoView({ behavior: 'smooth' })

  // Reset question state for a fresh run.
  questionPool = []
  quizQuestions = []
  filteredInvalidQuestionCount = 0
  quizGenerationComplete = false
  renderQuestions()
  updateQuizListUI()

  try {
    const selectedWordList = [...selectedWords]
    const batches = chunkWords(selectedWordList, GENERATION_BATCH_SIZE)
    const spinnerTextEl = spinnerApi.querySelector('.spinner-text')
    const totalBatches = batches.length

    if (spinnerTextEl) {
      spinnerTextEl.textContent =
        `Streaming ${selectedWordList.length} questions in ${totalBatches} batch${totalBatches === 1 ? '' : 'es'}...`
    }

    let nextBatchIndex = 0
    let completedBatches = 0

    const runNextBatch = async () => {
      while (nextBatchIndex < batches.length) {
        const batchIndex = nextBatchIndex
        nextBatchIndex += 1

        await streamQuestionBatch(batches[batchIndex])

        completedBatches += 1
        if (spinnerTextEl) {
          spinnerTextEl.textContent =
            `Streaming ${selectedWordList.length} questions... ${completedBatches}/${totalBatches} batches complete`
        }
      }
    }

    const workerCount = Math.min(MAX_PARALLEL_STREAMS, batches.length)
    const batchResults = await Promise.allSettled(
      Array.from({ length: workerCount }, () => runNextBatch())
    )

    const failedWorkers = batchResults.filter(result => result.status === 'rejected')
    if (failedWorkers.length > 0) {
      throw failedWorkers[0].reason
    }

    if (questionPool.length === 0) {
      throw new Error('No quiz questions were returned. Please try again.')
    }

    quizGenerationComplete = true
    updateQuizListUI()
  } catch (error) {
    console.error('Generation error:', error)
    questionsDisplay.innerHTML = `
            <div class="alert alert-danger" style="font-family:Arial,sans-serif;">
                <strong>Error:</strong> Failed to generate quiz. Please check your connection and try again.
                <br><small>${error.message}</small>
            </div>`
    quizGenerationComplete = false
    updateQuizListUI()
  } finally {
    spinnerApi.classList.add('d-none')
  }

  if (questionPool.length > 0) {
    updateQuizListUI()
  }
}

function chunkWords (words, chunkSize) {
  const chunks = []

  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize))
  }

  return chunks
}

async function streamQuestionBatch (wordBatch) {
  const response = await fetchWithApiFallback('/generate-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      words: wordBatch
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API error: ${err}`)
  }

  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error('API returned an invalid streaming response.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let rawText = ''
  let sseBuffer = ''
  let seenObjectCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    sseBuffer += decoder.decode(value, { stream: true })
    const lines = sseBuffer.split('\n')
    sseBuffer = lines.pop()

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const jsonStr = line.slice(6)

      try {
        const event = JSON.parse(jsonStr)

        if (event.error) {
          throw new Error(event.error)
        }

        if (event.done) {
          break
        }

        if (event.text) {
          rawText += event.text
          seenObjectCount = mergeParsedBatchQuestions(rawText, seenObjectCount)
        }
      } catch (parseErr) {
        if (parseErr instanceof SyntaxError) {
          continue
        }
        throw parseErr
      }
    }
  }

  mergeParsedBatchQuestions(rawText, seenObjectCount)
}

function mergeParsedBatchQuestions (rawText, seenObjectCount) {
  const parsedObjects = parseQuestionsFromRaw(rawText)
  if (!Array.isArray(parsedObjects)) {
    return seenObjectCount
  }

  if (parsedObjects.length <= seenObjectCount) {
    return seenObjectCount
  }

  const existingKeys = new Set(questionPool.map(getQuestionKey))
  const nextObjects = parsedObjects.slice(seenObjectCount)
  const uniqueNewQuestions = []

  for (const question of nextObjects) {
    const key = getQuestionKey(question)
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    uniqueNewQuestions.push(question)
  }

  if (uniqueNewQuestions.length > 0) {
    const previousCount = questionPool.length
    questionPool.push(...uniqueNewQuestions)
    appendNewQuestions(previousCount)
  }

  return parsedObjects.length
}

// Extract complete question objects from partial streamed JSON.
function parseQuestionsFromRaw (rawText) {
  // Strip optional markdown code fences.
  const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim()

  // Find JSON array start.
  const startIdx = cleaned.indexOf('[')
  if (startIdx === -1) return []

  const content = cleaned.slice(startIdx)

  // Track brace depth to isolate complete objects.
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
          if (isValidQuestionObject(obj)) {
            objects.push(obj)
          } else {
          }
        } catch (e) {
          // Skip incomplete/malformed objects.
        }
        objectStart = -1
      }
    }
  }

  return objects
}

function isValidQuestionObject (question) {
  if (!question || typeof question !== 'object') return false
  if (typeof question.question !== 'string' || !question.question.trim()) return false
  if (typeof question.correct !== 'string' || !/^[A-D]$/.test(question.correct.trim())) {
    return false
  }
  if (!Array.isArray(question.options) || question.options.length !== 4) return false

  for (const option of question.options) {
    if (typeof option !== 'string' || !option.trim()) return false
  }

  const correctPrefix = `${question.correct.trim()})`
  return question.options.some(option => option.trim().startsWith(correctPrefix))
}

// ── Phase 4: Batched display ──────────────────────────────────────────────────

function updatePoolInfo () {
  const remaining = 0
  poolInfo.textContent =
    questionPool.length > 0
      ? `Showing ${questionPool.length} generated · ${quizQuestions.length} added to quiz`
      : 'Waiting for generated questions'
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderQuestions () {
  if (questionPool.length === 0) {
    questionsDisplay.innerHTML = `
            <p class="questions-empty" style="font-family:Arial,sans-serif; color:var(--muted); text-align:center; padding:2rem;">
                Generated questions will appear here. Keep adding the ones you want to the quiz list.
            </p>`
    updateQuestionCardStates()
    updateGeneratedListCount()
    return
  }

  const visibleQuestions = questionPool
    .map((question, index) => ({ question, index }))
    .filter(entry => !isQuestionInQuiz(entry.question))

  if (visibleQuestions.length === 0) {
    questionsDisplay.innerHTML = `
            <p class="questions-empty" style="font-family:Arial,sans-serif; color:var(--muted); text-align:center; padding:2rem;">
                All generated questions are in your quiz list. Remove one on the right to bring it back here.
            </p>`
    updateQuestionCardStates()
    updateGeneratedListCount()
    return
  }

  questionsDisplay.innerHTML = visibleQuestions
    .map(entry => buildQuestionCard(entry.question, entry.index))
    .join('')

  updateQuestionCardStates()
  updateGeneratedListCount()
}

function appendNewQuestions (startIndex) {
  if (questionPool.length === 0 || startIndex >= questionPool.length) {
    updateQuestionCardStates()
    return
  }

  const emptyState = questionsDisplay.querySelector('.questions-empty')
  if (emptyState) emptyState.remove()

  const newMarkup = questionPool
    .map((question, index) => ({ question, index }))
    .filter(entry => entry.index >= startIndex && !isQuestionInQuiz(entry.question))
    .map(entry => buildQuestionCard(entry.question, entry.index))
    .join('')

  if (!newMarkup) {
    updateQuestionCardStates()
    updateGeneratedListCount()
    return
  }

  questionsDisplay.insertAdjacentHTML('beforeend', newMarkup)
  updateQuestionCardStates()
  updateGeneratedListCount()
}

// Build one question-card HTML fragment.
function buildQuestionCard (q, i) {
  const isAdded = isQuestionInQuiz(q)
  return `
    <div class="question-card${isAdded ? ' added-to-quiz' : ''}" data-index="${i}">
        <button type="button" class="btn-add-to-quiz btn-add-side" data-index="${i}" ${isAdded ? 'disabled' : ''}>
          ${isAdded ? '<i class="bi bi-check-lg"></i> Added to quiz' : '<i class="bi bi-plus-lg"></i> Add to quiz'}
        </button>
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

// ── Phase 5: Save ─────────────────────────────────────────────────────────────

async function onSave () {
  if (quizQuestions.length < MIN_QUIZ_QUESTIONS_TO_SAVE) {
    alert(`Add at least ${MIN_QUIZ_QUESTIONS_TO_SAVE} question to the quiz list before saving.`)
    return
  }

  // Clear any previous title and open the modal
  quizTitleInput.value = ''
  confirmSaveBtn.disabled = true
  saveModal.show()
}

// Save approved questions with title from modal input.
async function onConfirmSave () {
  const title = quizTitleInput.value.trim()
  if (!title) return // Safety guard.

  saveModal.hide()

  saveBtn.disabled = true
  saveBtn.innerHTML =
    '<span class="spinner-border spinner-border-sm"></span> Saving…'

  try {
    // Save only the curated quiz list.
    const quizId = await saveQuiz(title, quizQuestions, currentUser.uid)
    const quizUrl = `${window.location.origin}/quiz.html?id=${quizId}`

    // Show success state.
    document.getElementById('section-quiz').classList.add('d-none')
    sectionSaved.classList.remove('d-none')
    shareUrlEl.textContent = quizUrl
    viewQuizBtn.href = quizUrl
    saveSection.classList.add('d-none')
    setStep(4)

    // Build QR code for share URL.
    const qrContainer = document.getElementById('qrCode')
    qrContainer.innerHTML = '' // Clear previous QR code.
    new QRCode(qrContainer, {
      text: quizUrl,
      width: 160,
      height: 160,
      colorDark: '#1e293b',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    })

    // Bind QR download action.
    downloadQrBtn.onclick = () => {
      const canvas = qrContainer.querySelector('canvas')
      if (!canvas) return
      const link = document.createElement('a')
      link.download = 'quiz-qr-code.png'
      link.href = canvas.toDataURL('image/png')
      link.click()
    }

    sectionSaved.scrollIntoView({ behavior: 'smooth' })
  } catch (error) {
    console.error('Save error:', error)
    alert('Failed to save quiz. Please try again.')
    saveBtn.disabled = false
    saveBtn.innerHTML = '<i class="bi bi-cloud-upload"></i> Save Quiz'
  }
}

function resetToBeginning () {
  // Reset quiz state and return to mode selection.
  candidateWords = []
  selectedWords = new Set()
  questionPool = []
  quizQuestions = []
  quizGenerationComplete = false

  clearSelectedFile()
  extractBtn.disabled = true

  spinnerExtract.classList.add('d-none')
  spinnerApi.classList.add('d-none')
  saveSection.classList.add('d-none')

  document.getElementById('section-review').classList.add('d-none')
  document.getElementById('section-quiz').classList.add('d-none')
  document.getElementById('section-saved').classList.add('d-none')
  document.getElementById('section-upload').classList.add('d-none')
  document.getElementById('section-mode').classList.remove('d-none')

  processingMode = null
  sidebarBrandNote.textContent = 'Choose a mode to begin.'

  questionsDisplay.innerHTML = ''
  quizList.innerHTML = ''
  document.getElementById('reviewChips').innerHTML = ''
  document.getElementById('reviewExtracted').textContent = '0'
  document.getElementById('reviewKeeping').textContent = '0'
  document.getElementById('reviewRemoved').textContent = '0'
  document.getElementById('reviewCountNote').textContent = ''

  updateQuizListUI()

  setStep(0)
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── Step indicator helper ─────────────────────────────────────────────────────

function setStep (activeStep) {
  for (let i = 1; i <= 4; i++) {
    // Legacy top step bar (kept for backward compatibility).
    const topEl = document.getElementById(`step-indicator-${i}`)
    if (topEl) {
      topEl.classList.remove('active', 'done')
      if (i < activeStep) topEl.classList.add('done')
      if (i === activeStep) topEl.classList.add('active')
    }

    // Sidebar step indicator.
    const sideEl = document.getElementById(`sidebar-step-${i}`)
    if (sideEl) {
      sideEl.classList.remove('active', 'done')
      if (i < activeStep) sideEl.classList.add('done')
      if (i === activeStep) sideEl.classList.add('active')
    }
  }
}
