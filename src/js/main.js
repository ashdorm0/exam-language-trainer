import { removeStopwords, eng } from '../libs/stopword.esm.mjs';
console.log('Compromise loaded:', nlp);
console.log('Stopword loaded:', removeStopwords);

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

        reader.onload = (e) => {
            const text = e.target.result;

            // Step 1: Process with compromise
            const doc = nlp(text);

            // Step 2: Get ALL terms (individual words)
            const allTerms = doc.terms().out('array');

            // Step 3: Clean each word - remove punctuation
            const cleanedWords = allTerms
                .map((word) => word.toLowerCase().replace(/[.,!?;:()\-]/g, '').trim())
                .filter((word) => {
                    return (
                        word.length > 2 &&
                        !/^\d+$/.test(word) &&
                        word !== 'question' &&
                        word !== 'questions'
                    );
                });

            // Step 4: Remove stopwords
            const vocabulary = removeStopwords(cleanedWords, eng);

            // Step 5: Remove duplicates
            const uniqueVocab = [...new Set(vocabulary)];
            currentVocabulary = uniqueVocab;

            // Step 6: Display results
            showWordSelection(uniqueVocab);
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

    // Add event listeners
    document.getElementById('approveQuizBtn').addEventListener('click', () => {
        alert('Save quiz functionality coming next!');
        console.log('Quiz to save:', questions);
    });

    document.getElementById('regenerateBtn').addEventListener('click', () => {
        showWordSelection(currentVocabulary);
    });
}