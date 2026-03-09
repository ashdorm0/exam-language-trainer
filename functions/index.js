const functions = require('firebase-functions/v2')
const express = require('express')
const Anthropic = require('@anthropic-ai/sdk')
const cors = require('cors')

const app = express()

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Simple in-memory store: tracks request timestamps per IP address.
// Each IP gets a sliding 1-hour window. After 50 requests, further requests
// are rejected with HTTP 429. This protects against runaway API costs.
const requestCounts = new Map()
const RATE_LIMIT = 50
const RATE_WINDOW = 60 * 60 * 1000 // 1 hour in ms

app.use(cors())
app.use(express.json())

app.use((req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress
  const now = Date.now()

  if (!requestCounts.has(ip)) requestCounts.set(ip, [])
  const recent = requestCounts.get(ip).filter(t => now - t < RATE_WINDOW)

  if (recent.length >= RATE_LIMIT) {
    return res
      .status(429)
      .json({ error: 'Too many requests. Please try again later.' })
  }

  recent.push(now)
  requestCounts.set(ip, recent)
  next()
})

// ─── Anthropic Client ─────────────────────────────────────────────────────────
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

// ─── Single Endpoint: /generate-quiz ─────────────────────────────────────────
//
app.post('/generate-quiz', async (req, res) => {
  try {
    const { words, subject } = req.body

    if (!words || words.length === 0) {
      return res.status(400).json({ error: 'No words provided' })
    }
    if (!subject) {
      return res.status(400).json({ error: 'No subject provided' })
    }

    console.log(
      `Generating quiz: ${words.length} candidate words, subject: "${subject}"`
    )

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `Here are words extracted from a ${subject} exam paper:
${words.join(', ')}

Your task has two parts:
1. Select the 15 most difficult GENERAL ACADEMIC vocabulary words from this list.
   - IGNORE ${subject}-specific technical terms that students of ${subject} should already know.
   - KEEP general academic English words that appear across many subjects (e.g. "contradict", "subsequent", "facilitate", "preliminary").
   - If fewer than 15 suitable words exist, return as many as you can.

2. For each selected word, generate ONE multiple-choice question (MCQ).

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

    const responseText = message.content[0].text
    console.log(
      'Claude raw response (first 200 chars):',
      responseText.slice(0, 200)
    )

    // Strip markdown code fences if Claude wraps the JSON (it sometimes does)
    const cleaned = responseText.replace(/```json\n?|\n?```/g, '').trim()
    const questions = JSON.parse(cleaned)

    console.log(`Returning ${questions.length} questions`)
    res.json({ questions })
  } catch (error) {
    console.error('Error in /generate-quiz:', error)
    res
      .status(500)
      .json({ error: 'Failed to generate quiz. Please try again.' })
  }
})

// ─── Export as Firebase Function ──────────────────────────────────────────────
exports.api = functions.https.onRequest({ secrets: ['ANTHROPIC_API_KEY'] }, app)
