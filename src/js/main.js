import { removeStopwords, eng } from '../libs/stopword.esm.mjs';
import { saveQuiz } from './saveQuiz.js';

console.log('Compromise loaded:', nlp);
console.log('Stopword loaded:', removeStopwords);

// Send words to backend for filtering
async function filterWordsWithClaude(words, subject) {
    const response = await fetch('https://us-central1-exam-language-trainer-3abec.cloudfunctions.net/api/filter-words', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            words: words,
            subject: subject 
        })
    });
    
    if (!response.ok) {
    const errorText = await response.text();
    console.log('API error response:', errorText);
    throw new Error('Failed to filter words');
    }
    
    const data = await response.json();
    return data.words; // Array of filtered words
}

let currentVocabulary = [];

// Wait for the page to load
document.addEventListener('DOMContentLoaded', () => {
    // Get references to HTML elements
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const output = document.getElementById('output');

    fileInput.value = '';
    output.innerHTML = '';

    // When user clicks the button
    uploadBtn.addEventListener('click', () => {
        const file = fileInput.files[0]; // Get the selected file
        const subject = document.getElementById('subjectSelect').value; // Get selected subject
        // Check if a file was selected
        if (!file) {
            output.innerHTML = '<p style="color: red;">Please select a file first</p>';
            return;
        }

        // Check if it's a text file
        if (!file.name.endsWith('.txt')) {
            output.innerHTML = '<p style="color: red;">Please upload a .txt file</p>';
            return;
        }

        // Read the file using FileReader API
        const reader = new FileReader();

        reader.onload = async (e) => {  
            const text = e.target.result;

            // Extract ALL words (no filtering yet)
            const doc = nlp(text);
            const allTerms = doc.terms().out('array');

            const cleanedWords = allTerms
                .map(word => word.toLowerCase().replace(/[.,!?;:()\-'"]/g, '').trim())
                .filter(word => {
                    return word.length >= 4 && /^[a-z]+$/.test(word);
                });
            
            const withoutStopwords = removeStopwords(cleanedWords, eng);
            const uniqueWords = [...new Set(withoutStopwords)];

            //rank by uncommonness
            const commonWordsResponse = await fetch ('../libs/common-words.txt');
            const commonWordsText = await commonWordsResponse.text();

            //Extract words into an array
            const commonWords = commonWordsText.split('\n').map(w => w.trim().toLocaleLowerCase());

            const rankedWords = uniqueWords.sort((a,b) => {
                const aIndex = commonWords.indexOf(a);
                const bIndex = commonWords.indexOf(b);
                const aScore = aIndex == -1 ? 99999 : aIndex;
                const bScore = bIndex == -1 ? 99999 : bIndex;
                return bScore - aScore;
            })
            
            console.log(`Extracted ${uniqueWords.length} words locally`);
            console.log('First 10 words:', uniqueWords.slice(0, 10));
            
            // Send to backend for filtering
            output.innerHTML = '<p>Filtering technical terms with Claude API...</p>';
            
            try {
                const filtered = await filterWordsWithClaude(rankedWords, subject);
                currentVocabulary = filtered;
                console.log(`Claude returned ${filtered.length} academic words`);
                const wordCount = parseInt(document.getElementById('wordCount').value) || 20;
                showWordSelection(filtered.slice(0, wordCount));
            } catch (error) {
                console.error('Error:', error);
                output.innerHTML = '<p style="color: red;">Error filtering words. Check console.</p>';
            }
        };

        // Start reading the file as text
        reader.readAsText(file);
    });
});

// Function to handle word selection logic
function setupWordSelection(vocabularyWords) {
    const checkboxes = document.querySelectorAll('.word-checkbox');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deselectAllBtn = document.getElementById('deselectAllBtn');
    const generateQuizBtn = document.getElementById('generateQuizBtn');
    const selectedCountSpan = document.getElementById('selectedCount');

    // Update count when checkboxes change
    function updateCount() {
        const selectedCount = document.querySelectorAll('.word-checkbox:checked').length;
        selectedCountSpan.textContent = selectedCount;
    }

    // Select all button
    selectAllBtn.addEventListener('click', () => {
        checkboxes.forEach(cb => cb.checked = true);
        updateCount();
    });

    // Deselect all button
    deselectAllBtn.addEventListener('click', () => {
        checkboxes.forEach(cb => cb.checked = false);
        updateCount();
    });

    // Update count when individual checkboxes change
    checkboxes.forEach(cb => {
        cb.addEventListener('change', updateCount);
    });

    // Generate quiz button
    generateQuizBtn.addEventListener('click', async () => {
        const selectedWords = Array.from(document.querySelectorAll('.word-checkbox:checked'))
            .map(cb => cb.value);

        if (selectedWords.length === 0) {
            alert('Please select at least one word');
            return;
        }

        // Disable button and show loading
        generateQuizBtn.disabled = true;
        generateQuizBtn.textContent = 'Generating quiz...';

        try {
            // Call backend API
            const response = await fetch('https://us-central1-exam-language-trainer-3abec.cloudfunctions.net/api/generate-quiz', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ words: selectedWords })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log('Generate quiz error:', errorText);
                throw new Error('Failed to generate quiz');
            }

            const data = await response.json();
            console.log('Quiz generated:', data);

            // Display the quiz
            displayQuiz(data.questions);

        } catch (error) {
            console.error('Error:', error);
            alert('Failed to generate quiz. Please try again.');
        } finally {
            // Re-enable button
            generateQuizBtn.disabled = false;
            generateQuizBtn.innerHTML = `Generate Quiz (<span id="selectedCount">0</span> selected)`;
        }
    });
}

function showWordSelection(vocabularyWords) {
    const output = document.getElementById('output');

    output.innerHTML = `
        <h3>Select vocabulary words to include in quiz:</h3>
        <p style="color: #666; margin-bottom: 15px;">
            Found ${vocabularyWords.length} vocabulary words
        </p>

        <div style="margin-bottom: 20px;">
            <button id="selectAllBtn" style="margin-right: 10px;">Select All</button>
            <button id="deselectAllBtn" style="margin-right: 10px;">Deselect All</button>
            <button id="generateQuizBtn" style="background-color: #28a745;">
                Generate Quiz (<span id="selectedCount">0</span> selected)
            </button>
        </div>

        <div id="wordList" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
            ${vocabularyWords.map(word => `
                <label style="display: flex; align-items: center; padding: 8px; background: #f5f5f5; border-radius: 4px; cursor: pointer;">
                    <input type="checkbox" class="word-checkbox" value="${word}" style="margin-right: 8px;">
                    <span>${word}</span>
                </label>
            `).join('')}
        </div>
    `;

    setupWordSelection(vocabularyWords);
}

// Function to display the generated quiz
function displayQuiz(questions) {
    const output = document.getElementById('output');

    output.innerHTML = `
        <h2>Generated Quiz Preview</h2>
        <p style="color: #666; margin-bottom: 20px;">
            ${questions.length} questions generated. Review and approve to save.
        </p>

        ${questions.map((q, index) => `
    <div style="background: #f9f9f9; padding: 20px; margin-bottom: 20px; border-radius: 8px;">
        <h3>Question ${index + 1}: ${q.word}</h3>
        <p style="font-size: 16px; margin: 15px 0;"><strong>${q.question}</strong></p>
        <div style="margin-left: 20px;">
            ${q.options.map(opt => `
                <div style="margin: 10px 0;">
                    <span style="font-weight: ${opt.startsWith(q.correct) ? 'bold' : 'normal'}; 
                                 color: ${opt.startsWith(q.correct) ? '#28a745' : '#333'};">
                        ${opt}
                        ${opt.startsWith(q.correct) ? ' ✓' : ''}
                    </span>
                </div>
            `).join('')}
        </div>
        <button class="remove-btn" data-index="${index}" 
            style="background:#dc3545; margin-top:10px; font-size:14px; padding:6px 14px;">
            Remove this question
        </button>
    </div>
`).join('')}
        <div style="margin-top: 30px;">
            <button id="approveQuizBtn" style="background-color: #28a745; font-size: 18px; padding: 15px 30px;">
                Approve & Save Quiz
            </button>
            <button id="regenerateBtn" style="background-color: #6c757d; margin-left: 10px;">
                Generate Different Questions
            </button>
        </div>
    `;

    document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const i = parseInt(e.target.dataset.index);
        questions.splice(i, 1);
        displayQuiz(questions);
        });
    });

   document.getElementById('approveQuizBtn').addEventListener('click', async () => {
    const title = prompt('Enter a title for this quiz:');
    if (!title) return;

    const btn = document.getElementById('approveQuizBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
        const quizId = await saveQuiz(title, questions);
        const quizUrl = `${window.location.origin}/quiz.html?id=${quizId}`;

        document.getElementById('output').innerHTML = `
            <h2>Quiz Saved!</h2>
            <p>Share this link with your students:</p>
            <a href="${quizUrl}" target="_blank">${quizUrl}</a>
        `;
    } catch (error) {
        console.error('Save failed:', error);
        alert('Failed to save quiz. Check console.');
        btn.disabled = false;
        btn.textContent = 'Approve & Save Quiz';
    }
});

   document.getElementById('regenerateBtn').addEventListener('click', () => {
        console.log('currentVocabulary length:', currentVocabulary.length);
        showWordSelection(currentVocabulary);
    });
}