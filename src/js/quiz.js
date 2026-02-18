import { db } from './firebase.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let currentQuestion = 0;
let score = 0;
let questions = [];
let selectedAnswer = null;
let wrongAnswers = [];

async function loadQuiz() {
    // Step 1: Get quiz ID from URL
    const params = new URLSearchParams(window.location.search);
    const quizId = params.get('id');

    if (!quizId) {
        document.querySelector('.container').innerHTML = '<p>No quiz found. Check your link.</p>';
        return;
    }

    // Step 2: Fetch quiz from Firestore
    const docRef = doc(db, "quizzes", quizId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
        document.querySelector('.container').innerHTML = '<p>Quiz not found.</p>';
        return;
    }

    const quiz = docSnap.data();
    questions = quiz.questions;

    console.log('Quiz loaded, questions:', questions.length);
    console.log('Start button found:', document.querySelector('.start-btn'));   

    document.querySelector('.start-btn').addEventListener('click', () => {
        showQuestions(0);
    });

}

function showQuestions(index){
    const q = questions[index];
    selectedAnswer = null;

    document.querySelector('.container').innerHTML = `
        <p style="color: #666;">Question ${index + 1} of ${questions.length}</p>
        <h2>${q.question}</h2>
        <div id="options">
            ${q.options.map(opt => `
                <div class="option" data-value="${opt[0]}" 
                     style="padding: 12px; margin: 8px 0; background: #f5f5f5; 
                            border-radius: 4px; cursor: pointer;">
                    ${opt}
                </div>
            `).join('')}
        </div>
        <button id="nextBtn" disabled 
                style="margin-top: 20px; opacity: 0.5;">
            ${index + 1 === questions.length ? 'Submit Quiz' : 'Next'}
        </button>
    `;

    // Handle option selection
    document.querySelectorAll('.option').forEach(option => {
        option.addEventListener('click', () => {
            // Clear previous selection
            document.querySelectorAll('.option').forEach(o => o.style.background = '#f5f5f5');
            // Highlight selected
            option.style.background = '#cce5ff';
            selectedAnswer = option.dataset.value;
            // Enable next button
            const nextBtn = document.getElementById('nextBtn');
            nextBtn.disabled = false;
            nextBtn.style.opacity = '1';
        });
    });

    // Handle next/submit
    document.getElementById('nextBtn').addEventListener('click', () => {
        if (selectedAnswer === q.correct) {
            score++;
        } else {
            wrongAnswers.push(q);
        }

        if (index + 1 === questions.length) {
            showResults();
        } else {
            showQuestions(index + 1);
        }
    });
}

function showResults() {
    document.querySelector('.container').innerHTML = `
        <h2>Quiz Complete!</h2>
        <p>You scored <strong>${score} out of ${questions.length}</strong></p>
        
        ${wrongAnswers.length > 0 ? `
            <h3>Words to review:</h3>
            ${wrongAnswers.map(q => `
                <div style="background: #fff3cd; padding: 12px; margin: 8px 0; border-radius: 4px;">
                    <p><strong>${q.word}</strong></p>
                    <p>${q.question}</p>
                    <p style="color: #28a745;">Correct answer: ${q.options.find(o => o.startsWith(q.correct))}</p>
                </div>
            `).join('')}
        ` : '<p>Perfect score! 🎉</p>'}
    `;
}

loadQuiz();