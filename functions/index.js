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
// Streams Claude's response to the browser using Server-Sent Events (SSE).
// The browser receives text chunks in real time and can parse complete
// question objects as they arrive, rather than waiting for the full response.
//
app.post('/generate-quiz', async (req, res) => {
  try {
    const { words, subject } = req.body

    if (!words || words.length === 0) {
      return res.status(400).json({ error: 'No words provided' })
    }

    console.log(`Generating quiz (streaming): ${words.length} curated words`)

    // Set headers for Server-Sent Events
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
          content: `The lecturer has curated the following list of vocabulary words from an exam paper. Generate one multiple-choice vocabulary question for each word.

Words:
${words.join(', ')}

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

    // Forward each text chunk to the browser as an SSE event
    for await (const chunk of stream) {
      if (
        chunk.type === 'content_block_delta' &&
        chunk.delta.type === 'text_delta'
      ) {
        // SSE format: "data: <text>\n\n"
        res.write(`data: ${JSON.stringify({ text: chunk.delta.text })}\n\n`)
      }
    }

    // Signal end of stream
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`)
    res.end()

    console.log('Stream complete')
  } catch (error) {
    console.error('Error in /generate-quiz:', error)
    // If headers haven't been sent yet, send JSON error
    if (!res.headersSent) {
      res
        .status(500)
        .json({ error: 'Failed to generate quiz. Please try again.' })
    } else {
      // Headers already sent (mid-stream error) — send error as SSE
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
