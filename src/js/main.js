import { removeStopwords, eng } from '../../node_modules/stopword/dist/stopword.esm.mjs';

console.log('Compromise loaded:', nlp);
console.log('Stopword loaded:', removeStopwords);

// Wait for the page to load
document.addEventListener('DOMContentLoaded', () => {
    // Get references to HTML elements
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const output = document.getElementById('output');

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

            // Step 6: Display results
            output.innerHTML = `
                <h3>Extracted Vocabulary (${uniqueVocab.length} unique words):</h3>
                <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: 20px;">
                    ${uniqueVocab
                        .map(
                            (word) => `
                                <span style="background: #e3f2fd; padding: 5px 10px; border-radius: 4px;">
                                    ${word}
                                </span>
                            `
                        )
                        .join('')}
                </div>
            `;
        };

        // Start reading the file as text
        reader.readAsText(file);
    });
});