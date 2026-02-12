const functions = require('firebase-functions/v2');
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');

const app = express();

// Simple rate limiting: track recent requests by IP
const requestCounts = new Map();
const RATE_LIMIT = 10; // Max requests per IP
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds

// Middleware
app.use(cors());
app.use(express.json());

// Rate limiting middleware
app.use((req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // Get or create request history for this IP
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
    }
    
    const requests = requestCounts.get(ip);
    
    // Remove old requests outside the time window
    const recentRequests = requests.filter(time => now - time < RATE_WINDOW);
    
    // Check if over limit
    if (recentRequests.length >= RATE_LIMIT) {
        return res.status(429).json({ 
            error: 'Too many requests. Please try again later.' 
        });
    }
    
    // Add this request
    recentRequests.push(now);
    requestCounts.set(ip, recentRequests);
    
    next();
});

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

// Endpoint to generate quiz
app.post('/generate-quiz', async (req, res) => {
    try {
        const { words } = req.body;
        
        if (!words || words.length === 0) {
            return res.status(400).json({ error: 'No words provided' });
        }
        
        console.log('Generating quiz for words:', words);
        
        // Call Claude API
        const message = await anthropic.messages.create({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: `Create a multiple-choice vocabulary quiz for these words: ${words.join(', ')}

For each word, create ONE question with:
- The word being tested
- A clear question about the word's meaning or usage
- 4 answer options (A, B, C, D)
- Mark which option is correct

Format as JSON array:
[
  {
    "word": "oligopoly",
    "question": "What is an oligopoly?",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correct": "A"
  }
]

Return ONLY the JSON array, no other text.`
            }]
        });
        
        // Extract the response
        const responseText = message.content[0].text;
        console.log('Claude response:', responseText);
        
        // Parse JSON response
        const quizQuestions = JSON.parse(responseText);
        
        res.json({ questions: quizQuestions });
        
    } catch (error) {
        console.error('Error generating quiz:', error);
        res.status(500).json({ error: 'Failed to generate quiz' });
    }
});

// Export the Express app as a Firebase Function
exports.api = functions.https.onRequest(
    {
        secrets: ['ANTHROPIC_API_KEY']
    },
    app
);