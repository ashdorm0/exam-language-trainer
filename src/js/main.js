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
        
        // This function runs when the file is loaded
        reader.onload = (e) => {
            const text = e.target.result; // The file content
            
            // Display the extracted text
            output.innerHTML = `
                <h3>Extracted Text:</h3>
                <pre>${text}</pre>
                <p><strong>File size:</strong> ${file.size} bytes</p>
                <p><strong>Character count:</strong> ${text.length}</p>
            `;
        };
        
        // Start reading the file as text
        reader.readAsText(file);
    });
});