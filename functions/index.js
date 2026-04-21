const functions = require('firebase-functions/v2')
const express = require('express')
const Anthropic = require('@anthropic-ai/sdk')
const admin = require('firebase-admin')
const cors = require('cors')
const path = require('path')
const fs = require('fs/promises')
const pdfParse = require('pdf-parse')
const mammoth = require('mammoth')
const nlp = require('compromise')
const { removeStopwords, eng } = require('stopword')

const app = express()
const POOL_SIZE = 60
const MAX_QUIZ_WORDS = 100
const MIN_REVIEW_WORDS = 30
const RELAXED_SCORE_FLOOR = -0.2
const MAX_WORD_LENGTH = 64
const MAX_SUBJECT_LENGTH = 120

let commonWords = new Set()

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Firestore-backed rate limit: survives function cold starts.
// In-memory map is retained as a fallback when Firestore is unavailable.
const requestCounts = new Map()
const RATE_LIMIT = 50
const RATE_WINDOW = 60 * 60 * 1000 // 1 hour in ms
const RATE_LIMIT_COLLECTION = 'rateLimits'

if (!admin.apps.length) {
  admin.initializeApp()
}

const firestore = admin.firestore()

app.use(cors())
app.use(express.json({ limit: '20mb' }))

function decodeBase64Payload (payload) {
  const { fileName, mimeType, data } = payload || {}
  if (!fileName || !data) {
    const error = new Error('No file uploaded.')
    error.statusCode = 400
    throw error
  }

  let buffer
  try {
    buffer = Buffer.from(data, 'base64')
  } catch (error) {
    const decodeError = new Error('Invalid file upload payload.')
    decodeError.statusCode = 400
    throw decodeError
  }

  return { fileName, mimeType, buffer }
}

async function loadCommonWords () {
  try {
    const [ngslText, basicText] = await Promise.all([
      fs.readFile(path.resolve(__dirname, 'common_words_ngsl.txt'), 'utf8'),
      fs.readFile(path.resolve(__dirname, 'common_words_1200.txt'), 'utf8')
    ])

    const parseWordList = text =>
      text
        .split('\n')
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length > 0)

    commonWords = new Set([...parseWordList(ngslText), ...parseWordList(basicText)])
  } catch (error) {
    console.warn('Failed to load common-word lists on server:', error)
    commonWords = new Set()
  }
}

const commonWordsReady = loadCommonWords()

function getClientIp (req) {
  const forwardedFor = req.headers['x-forwarded-for']
  return (
    req.ip ||
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    (typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : '') ||
    'unknown'
  )
}

function getRateLimitDocId (ip) {
  return Buffer.from(ip).toString('base64url')
}

async function checkFirestoreRateLimit (ip, now) {
  const ref = firestore.collection(RATE_LIMIT_COLLECTION).doc(getRateLimitDocId(ip))
  let limited = false
  let retryAfterSeconds = 0

  await firestore.runTransaction(async tx => {
    const snapshot = await tx.get(ref)
    const existing = snapshot.exists ? snapshot.data() : {}
    const history = Array.isArray(existing.timestamps) ? existing.timestamps : []
    const recent = history.filter(timestamp => now - timestamp < RATE_WINDOW)

    if (recent.length >= RATE_LIMIT) {
      limited = true
      const oldest = Math.min(...recent)
      retryAfterSeconds = Math.max(
        1,
        Math.ceil((RATE_WINDOW - (now - oldest)) / 1000)
      )
      return
    }

    recent.push(now)
    tx.set(
      ref,
      {
        ip,
        timestamps: recent,
        lastSeen: now,
        expiresAtMs: now + RATE_WINDOW,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    )
  })

  return { limited, retryAfterSeconds }
}

function checkInMemoryRateLimit (ip, now) {
  if (!requestCounts.has(ip)) requestCounts.set(ip, [])
  const recent = requestCounts.get(ip).filter(t => now - t < RATE_WINDOW)

  if (recent.length >= RATE_LIMIT) {
    const oldest = Math.min(...recent)
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((RATE_WINDOW - (now - oldest)) / 1000)
    )
    return { limited: true, retryAfterSeconds }
  }

  recent.push(now)
  requestCounts.set(ip, recent)
  return { limited: false, retryAfterSeconds: 0 }
}

app.use(async (req, res, next) => {
  const ip = getClientIp(req)
  const now = Date.now()

  try {
    const result = await checkFirestoreRateLimit(ip, now)
    if (result.limited) {
      res.setHeader('Retry-After', String(result.retryAfterSeconds))
      return res
        .status(429)
        .json({ error: 'Too many requests. Please try again later.' })
    }
    return next()
  } catch (error) {
    console.error('Firestore rate limit check failed, using fallback:', error)

    const fallbackResult = checkInMemoryRateLimit(ip, now)
    if (fallbackResult.limited) {
      res.setHeader('Retry-After', String(fallbackResult.retryAfterSeconds))
      return res
        .status(429)
        .json({ error: 'Too many requests. Please try again later.' })
    }

    return next()
  }
})

// ─── Anthropic Client ─────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

function cleanPromptText (value) {
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim()
}

function normalizeQuizWordsInput (words) {
  if (!Array.isArray(words)) {
    const error = new Error('Words must be an array.')
    error.statusCode = 400
    throw error
  }

  if (words.length === 0) {
    const error = new Error('No words provided')
    error.statusCode = 400
    throw error
  }

  if (words.length > MAX_QUIZ_WORDS) {
    const error = new Error(`Too many words. Maximum allowed is ${MAX_QUIZ_WORDS}.`)
    error.statusCode = 400
    throw error
  }

  const normalized = []
  for (const item of words) {
    if (typeof item !== 'string') continue
    const cleaned = cleanPromptText(item).slice(0, MAX_WORD_LENGTH)
    if (!cleaned) continue
    normalized.push(cleaned)
  }

  if (normalized.length === 0) {
    const error = new Error('No valid words provided')
    error.statusCode = 400
    throw error
  }

  return normalized
}

function normalizeSubjectInput (subject) {
  if (typeof subject !== 'string') return ''
  return cleanPromptText(subject).slice(0, MAX_SUBJECT_LENGTH)
}

function normalizeWord (word) {
  return word.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '').trim()
}

function getBaseForms (word) {
  const forms = new Set([word])

  if (word.length > 3 && word.endsWith('s')) forms.add(word.slice(0, -1))
  if (word.length > 5 && word.endsWith('es')) forms.add(word.slice(0, -2))
  if (word.length > 5 && word.endsWith('ies')) forms.add(`${word.slice(0, -3)}y`)

  if (word.length > 5 && word.endsWith('ed')) {
    const stem = word.slice(0, -2)
    forms.add(stem)
    forms.add(`${stem}e`)
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) forms.add(stem.slice(0, -1))
  }

  if (word.length > 6 && word.endsWith('ing')) {
    const stem = word.slice(0, -3)
    forms.add(stem)
    forms.add(`${stem}e`)
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) forms.add(stem.slice(0, -1))
  }

  if (word.length > 5 && word.endsWith('er')) {
    const stem = word.slice(0, -2)
    forms.add(stem)
    forms.add(`${stem}e`)
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) forms.add(stem.slice(0, -1))
  }

  if (word.length > 6 && word.endsWith('est')) {
    const stem = word.slice(0, -3)
    forms.add(stem)
    forms.add(`${stem}e`)
    if (/([b-df-hj-np-tv-z])\1$/.test(stem)) forms.add(stem.slice(0, -1))
  }

  return [...forms].filter(form => form.length >= 3)
}

function splitIntoKnownWords (word) {
  const memo = new Map()

  function isKnownFragment (fragment) {
    if (commonWords.has(fragment)) return true
    if (fragment.length > 4 && fragment.endsWith('s')) {
      const singular = fragment.slice(0, -1)
      if (commonWords.has(singular)) return true
    }
    if (fragment.length > 5 && fragment.endsWith('es')) {
      const singular = fragment.slice(0, -2)
      if (commonWords.has(singular)) return true
    }
    if (fragment.length > 5 && fragment.endsWith('ed')) {
      const base = fragment.slice(0, -2)
      if (commonWords.has(base)) return true
    }
    if (fragment.length > 6 && fragment.endsWith('ing')) {
      const base = fragment.slice(0, -3)
      if (commonWords.has(base)) return true
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

    if (!commonWords.has(prefix) || suffix.length < 4) continue
    if (commonWords.has(suffix)) continue

    if (nlp(suffix).found) return true
  }

  for (let splitIndex = 4; splitIndex <= word.length - 2; splitIndex++) {
    const prefix = word.slice(0, splitIndex)
    const suffix = word.slice(splitIndex)

    if (commonWords.has(prefix) && suffix.length <= 3) return true
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

function hasAcademicSuffix (word) {
  if (word.length < 7) return false
  return /(?:tion|sion|ment|ness|ity|ism|ist|ive|ous|ary|ory|ence|ance|ship|hood|able|ible|ically|ology|graphy)$/i.test(
    word
  )
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

function getPartOfSpeechScore (word, nouns, verbs, adjectives, adverbs) {
  if (adjectives.has(word)) return 1.2
  if (nouns.has(word)) return 1.05
  if (verbs.has(word)) return 0.9
  if (adverbs.has(word)) return 0
  return 0.25
}

function isCandidateWord (word, dateTerms = new Set()) {
  if (!/^[a-z]+$/.test(word) || word.length < 4) return false
  if (/^(?:null|true|false|undefined|localhost)$/i.test(word)) return false
  if (dateTerms.has(word)) return false
  const baseForms = getBaseForms(word)
  if (baseForms.some(form => commonWords.has(form))) return false
  if (isMashedCompound(word)) return false
  if (isLikelyCompoundArtifact(word)) return false
  if (isLikelyIdentifierArtifact(word)) return false
  return true
}

function scoreDifficulty (entry) {
  const { word, frequency, posScore } = entry
  const syllables = estimateSyllables(word)

  const isLowSignalSimpleWord =
    !hasAcademicSuffix(word) && syllables < 3 && word.length < 10
  if (isLowSignalSimpleWord && frequency < 2) return -1

  let score = 0
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
    .map(entry => ({ ...entry, score: scoreDifficulty(entry) }))
    .filter(entry => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.frequency - a.frequency ||
        a.firstSeen - b.firstSeen ||
        a.word.localeCompare(b.word)
    )

  const result = selectTopCandidatesWithTies(ranked, POOL_SIZE).map(entry => entry.word)

  if (result.length < MIN_REVIEW_WORDS) {
    const selected = new Set(result)
    const relaxed = [...stats.values()]
      .map(entry => ({
        ...entry,
        score: scoreDifficultyRelaxed(entry)
      }))
      .filter(entry => entry.score > RELAXED_SCORE_FLOOR && !selected.has(entry.word))
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

async function extractTextFromUpload (file) {
  const ext = path.extname(file.fileName || '').toLowerCase()
  if (!['.txt', '.pdf', '.docx'].includes(ext)) {
    const error = new Error('Only .txt, .pdf, and .docx files are supported.')
    error.statusCode = 400
    throw error
  }

  if (ext === '.txt') return file.buffer.toString('utf8')
  if (ext === '.pdf') {
    const result = await pdfParse(file.buffer)
    return result.text || ''
  }

  const result = await mammoth.extractRawText({ buffer: file.buffer })
  return result.value || ''
}

// ─── Course Material Endpoint: /extract-course-vocabulary ────────────────────
app.post('/extract-course-vocabulary', async (req, res) => {
  try {
    await commonWordsReady

    const file = decodeBase64Payload(req.body)

    const text = await extractTextFromUpload(file)
    if (!text || text.trim().length < 30) {
      return res.status(400).json({ error: 'Uploaded file has too little readable text.' })
    }

    const words = extractVocabulary(text)
    return res.json({
      words,
      meta: {
        mode: 'course-server',
        sourceType: path.extname(file.fileName || '').toLowerCase(),
        mimeType: file.mimeType
      }
    })
  } catch (error) {
    console.error('Error in /extract-course-vocabulary:', error)
    const message =
      error.message || 'Failed to extract vocabulary from uploaded course material.'
    const statusCode = error.statusCode || 500
    return res.status(statusCode).json({ error: message })
  }
})

// ─── Single Endpoint: /generate-quiz ─────────────────────────────────────────
// Stream Claude output over SSE so the browser can render progressively.
app.post('/generate-quiz', async (req, res) => {
  try {
    const { words, subject } = req.body
    const normalizedWords = normalizeQuizWordsInput(words)
    const normalizedSubject = normalizeSubjectInput(subject)

    // Configure SSE response headers.
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const stream = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      stream: true,
      messages: [
        {
          role: 'user',
          content: `The lecturer has curated the following list of vocabulary words from an exam paper${normalizedSubject ? ` for ${normalizedSubject}` : ''}. Generate one multiple-choice vocabulary question for each word.

Words:
${normalizedWords.join(', ')}

For each word, create ONE question with:
- A clear question about the word's meaning or usage in academic English
- 4 answer options (A, B, C, D)
- Mark which option is correct

Return ONLY a JSON array. No explanation, no markdown, no extra text. Format:
[
  {
    "word": "subsequent",
    "question": "What does 'subsequent' mean?",
    "options": ["A) Coming after in time or order", "B) Happening at the same time", "C) Occurring before an event", "D) Unrelated to previous events"],
    "correct": "A"
  }
]`
        }
      ]
    })

    // Forward each text chunk as an SSE event.
    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        // SSE frame payload.
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
      }
    }

    // Signal end of stream.
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    res.end()

  } catch (error) {
    console.error('Error in /generate-quiz:', error)
    // Return JSON error when stream has not started.
    if (!res.headersSent) {
      const statusCode = error.statusCode || 500
      res
        .status(statusCode)
        .json({ error: error.message || 'Failed to generate quiz. Please try again.' })
    } else {
      // Stream already started; send error frame.
      res.write(
        `data: ${JSON.stringify({
          error: 'Stream interrupted. Please try again.'
        })}\n\n`
      )
      res.end()
    }
  }
})

// ─── Export as Firebase Function ──────────────────────────────────────────────
exports.api = functions.https.onRequest({ secrets: ['ANTHROPIC_API_KEY'] }, app)
