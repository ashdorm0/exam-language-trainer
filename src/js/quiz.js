/**
 * quiz.js — Exam Language Trainer, Student Quiz Interface
 *
 * OVERVIEW:
 * This file handles the entire student-facing quiz experience.
 * It has four distinct screens, each rendered by its own function:
 *
 *   1. loadQuiz()     — fetches quiz from Firestore, shows Start button
 *   2. showQuestion() — renders one MCQ at a time with option selection
 *   3. showResults()  — score summary + words to review
 *
 * State is kept in module-level variables. Each screen function
 * fully replaces the contents of .quiz-card.
 */

import { db } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// ── State ──────────────────────────────────────────────────────────────────────

let questions      = [];
let score          = 0;
let wrongAnswers   = [];
let selectedAnswer = null;

// ── Entry point ───────────────────────────────────────────────────────────────

async function loadQuiz() {
    const card = document.querySelector('.quiz-card');

    // Get quiz ID from URL query string: quiz.html?id=abc123
    const params = new URLSearchParams(window.location.search);
    const quizId = params.get('id');

    if (!quizId) {
        showError(card, 'No quiz ID found in the URL. Check your link.');
        return;
    }

    try {
        const docRef  = doc(db, 'quizzes', quizId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            showError(card, 'Quiz not found. It may have been deleted.');
            return;
        }

        const quiz = docSnap.data();
        questions  = quiz.questions;

        console.log(`Quiz loaded: "${quiz.title}", ${questions.length} questions`);

        // Show landing screen with Start button
        showLanding(card, quiz.title);

    } catch (err) {
        console.error('Firestore error:', err);
        showError(card, 'Failed to load quiz. Please check your connection.');
    }
}

// ── Screen: Landing ───────────────────────────────────────────────────────────

function showLanding(card, title) {
    card.innerHTML = `
        <div class="landing text-center">
            <div class="landing-icon"><i class="bi bi-book-half"></i></div>
            <h2>${title}</h2>
            <p>${questions.length} vocabulary questions.<br>Select the correct meaning for each word.</p>
            <button class="btn-start" id="startBtn">
                <i class="bi bi-play-fill"></i> Start Quiz
            </button>
        </div>
    `;

    document.getElementById('startBtn').addEventListener('click', () => {
        // Reset state in case of retake
        score        = 0;
        wrongAnswers = [];
        showQuestion(0);
    });
}

// ── Screen: Question ──────────────────────────────────────────────────────────

function showQuestion(index) {
    const card = document.querySelector('.quiz-card');
    const q    = questions[index];
    selectedAnswer = null;

    const isLast    = index + 1 === questions.length;
    const progress  = Math.round((index / questions.length) * 100);

    card.innerHTML = `
        <div class="progress-label">Question ${index + 1} of ${questions.length}</div>
        <div class="progress">
            <div class="progress-bar" style="width: ${progress}%"></div>
        </div>

        <div class="word-tag">${q.word}</div>
        <div class="question-text">${q.question}</div>

        <div id="options">
            ${q.options.map(opt => `
                <button class="option" data-value="${opt[0]}">
                    ${opt}
                </button>
            `).join('')}
        </div>

        <button class="btn-next" id="nextBtn" disabled>
            ${isLast ? 'Submit Quiz' : 'Next'} <i class="bi bi-arrow-right"></i>
        </button>
    `;

    // Wire up option selection
    document.querySelectorAll('.option').forEach(option => {
        option.addEventListener('click', () => {
            // Clear previous selection
            document.querySelectorAll('.option').forEach(o => o.classList.remove('selected'));
            // Mark selected
            option.classList.add('selected');
            selectedAnswer = option.dataset.value;
            // Enable next
            document.getElementById('nextBtn').disabled = false;
        });
    });

    // Wire up next/submit
    document.getElementById('nextBtn').addEventListener('click', () => {
        // Score the answer
        if (selectedAnswer === q.correct) {
            score++;
        } else {
            // Store both the question and what the student actually picked
            wrongAnswers.push({ ...q, studentAnswer: selectedAnswer });
        }

        if (isLast) {
            showResults();
        } else {
            showQuestion(index + 1);
        }
    });
}

// ── Screen: Results ───────────────────────────────────────────────────────────

function showResults() {
    const card    = document.querySelector('.quiz-card');
    const percent = Math.round((score / questions.length) * 100);

    card.innerHTML = `
        <div class="text-center mb-4">
            <div class="score-circle">
                <span class="score-number">${score}/${questions.length}</span>
                <span class="score-label">${percent}%</span>
            </div>
            <h2 style="font-family:Arial,sans-serif; font-size:1.4rem; font-weight:700;">
                ${scoreMessage(percent)}
            </h2>
        </div>

        ${wrongAnswers.length > 0 ? `
            <h3 style="font-family:Arial,sans-serif; font-size:1rem; font-weight:700; margin-bottom:0.75rem;">
                <i class="bi bi-journal-text"></i> Words to review (${wrongAnswers.length})
            </h3>
            ${wrongAnswers.map(q => `
                <div class="review-card">
                    <div class="word">${q.word}</div>
                    <div class="question-q">${q.question}</div>
                    <div style="font-family:Arial,sans-serif; font-size:0.875rem; color:#991b1b; margin-bottom:0.3rem;">
                        <i class="bi bi-x-circle-fill"></i>
                        Your answer: ${q.options.find(o => o.startsWith(q.studentAnswer))}
                    </div>
                    <div class="correct-answer">
                        <i class="bi bi-check-circle-fill"></i>
                        Correct answer: ${q.options.find(o => o.startsWith(q.correct))}
                    </div>
                </div>
            `).join('')}
        ` : `
            <div class="text-center" style="padding:1rem;">
                <p style="font-family:Arial,sans-serif; font-size:1.1rem;">
                    Perfect score! 🎉 You're well prepared.
                </p>
            </div>
        `}

        <div class="text-center mt-3">
            <button class="btn-retake" id="retakeBtn">
                <i class="bi bi-arrow-repeat"></i> Retake Quiz
            </button>
        </div>
    `;

    document.getElementById('retakeBtn').addEventListener('click', () => {
        score        = 0;
        wrongAnswers = [];
        // Shuffle questions for retake
        questions = [...questions].sort(() => Math.random() - 0.5);
        showQuestion(0);
    });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns an encouraging message based on score percentage */
function scoreMessage(percent) {
    if (percent === 100) return 'Perfect score!';
    if (percent >= 80)  return 'Great work!';
    if (percent >= 60)  return 'Good effort — review the words below.';
    return 'Keep practising — you\'ll get there.';
}

/** Renders a full-card error message */
function showError(card, message) {
    card.innerHTML = `
        <div class="state-message">
            <i class="bi bi-exclamation-circle text-danger"></i>
            <p>${message}</p>
        </div>
    `;
}

// ── Init ──────────────────────────────────────────────────────────────────────

loadQuiz();