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
                <h3>Select vocabulary words to include in quiz:</h3>
                <p style="color: #666; margin-bottom: 15px;">
                    Found ${uniqueVocab.length} vocabulary words
                </p>

                <div style="margin-bottom: 20px;">
                    <button id="selectAllBtn" style="margin-right: 10px;">Select All</button>
                    <button id="deselectAllBtn" style="margin-right: 10px;">Deselect All</button>
                    <button id="generateQuizBtn" style="background-color: #28a745;">
                        Generate Quiz (<span id="selectedCount">0</span> selected)
                    </button>
                </div>

                <div id="wordList" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">
                    ${uniqueVocab.map(word => `
                        <label style="display: flex; align-items: center; padding: 8px; background: #f5f5f5; border-radius: 4px; cursor: pointer;">
                            <input type="checkbox" class="word-checkbox" value="${word}" style="margin-right: 8px;">
                            <span>${word}</span>
                        </label>
                    `).join('')}
                </div>
            `;
                // Step 7: Add event listeners for the new buttons
                setupWordSelection(uniqueVocab);
}
    

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
        generateQuizBtn.addEventListener('click', () => {
            const selectedWords = Array.from(document.querySelectorAll('.word-checkbox:checked'))
                .map(cb => cb.value);
            
            if (selectedWords.length === 0) {
                alert('Please select at least one word');
                return;
            }
            
            console.log('Selected words:', selectedWords);
            alert(`Quiz generation coming soon! You selected ${selectedWords.length} words.`);
        });
    }