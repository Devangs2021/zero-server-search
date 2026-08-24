import './style.css';
import { chunkText } from './utils/chunker.js';

// 1. Render UI Shell
document.querySelector('#app').innerHTML = `
  <main style="max-width: 680px; margin: 2rem auto; font-family: system-ui, sans-serif; color: #fff;">
    <h2>Local File Vector Search & RAG Engine</h2>
    <p style="color: #aaa;">Upload text files, generate vector embeddings, and synthesize local answers completely offline.</p>
    
    <!-- Drag & Drop Zone -->
    <div id="drop-zone" style="border: 2px dashed #0066ff; padding: 2rem; text-align: center; border-radius: 8px; cursor: pointer; background: #111; color: #ccc;">
      Drag & Drop a <strong>.txt</strong> file here or click to browse
      <input type="file" id="file-input" accept=".txt" style="display: none;" />
    </div>

    <!-- Query Inputs -->
    <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem;">
      <input type="text" id="query-input" placeholder="Search query or question..." style="flex: 1; padding: 0.6rem; border-radius: 4px; border: 1px solid #333; background: #222; color: #fff;" disabled />
      <button id="search-btn" style="padding: 0.6rem 1rem; cursor: pointer; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px;" disabled>1. Search Matches</button>
      <button id="rag-btn" style="padding: 0.6rem 1rem; cursor: pointer; background: #0066ff; color: #fff; border: none; border-radius: 4px; font-weight: bold;" disabled>2. Synthesize Answer (RAG)</button>
    </div>

    <!-- Status Logger -->
    <div id="status" style="margin-top: 1rem; font-weight: bold; color: #aaa;">Status: Checking local storage...</div>
    
    <!-- Output Container -->
    <div id="answer-box"></div>
    <div id="results-list" style="margin-top: 1rem;"></div>
  </main>
`;

// DOM Selectors
const dropZone = document.querySelector('#drop-zone');
const fileInput = document.querySelector('#file-input');
const searchBtn = document.querySelector('#search-btn');
const ragBtn = document.querySelector('#rag-btn');
const queryInput = document.querySelector('#query-input');
const statusDiv = document.querySelector('#status');
const answerBox = document.querySelector('#answer-box');
const resultsList = document.querySelector('#results-list');

// 2. Initialize Worker Thread
const worker = new Worker(new URL('./workers/search.worker.js', import.meta.url), { type: 'module' });

// Boot storage check on load
worker.postMessage({ type: 'INIT_STORAGE' });

// 3. Handle Messages from Web Worker
worker.onmessage = (event) => {
  const { status, message, payload } = event.data;

  if (status === 'STORAGE_RESTORED') {
    statusDiv.textContent = `Status: Restored ${payload.count} document chunks from cache. Ready to search!`;
    enableControls();
  } else if (status === 'STORAGE_EMPTY') {
    statusDiv.textContent = 'Status: Storage empty. Drag and drop a .txt file to index.';
  } else if (status === 'LOADING_MODEL') {
    statusDiv.textContent = `Status: ${message}`;
  } else if (status === 'INDEX_COMPLETE') {
    statusDiv.textContent = `Status: Generated & saved vectors for ${payload.count} chunks in ${payload.executionTime}ms!`;
    enableControls();
  } else if (status === 'SEARCH_COMPLETE') {
    statusDiv.textContent = `Status: Search evaluated across vectors in ${payload.executionTime}ms!`;
    renderSearchResults(payload.results);
  } else if (status === 'RAG_COMPLETE') {
    statusDiv.textContent = `Status: Synthesized answer locally in ${payload.executionTime}ms!`;
    renderRAGAnswer(payload.query, payload.answer, payload.sources);
  } else if (status === 'ERROR') {
    statusDiv.textContent = `Error: ${message}`;
  }
};

// UI Helper Functions
function enableControls() {
  queryInput.disabled = false;
  searchBtn.disabled = false;
  ragBtn.disabled = false;
}

function renderSearchResults(results) {
  answerBox.innerHTML = ''; // Clear previous generative answer
  resultsList.innerHTML = results.slice(0, 3).map(r => `
    <div style="background: #18181b; padding: 1rem; margin-bottom: 0.5rem; border-radius: 6px; border-left: 4px solid ${r.score > 0.4 ? '#00ff66' : '#555'};">
      <div style="font-weight: bold; color: #00ff66;">Match Score: ${(r.score * 100).toFixed(1)}%</div>
      <div style="color: #eee; margin-top: 0.25rem;">${r.text}</div>
    </div>
  `).join('');
}

function renderRAGAnswer(query, answer, sources) {
  answerBox.innerHTML = `
    <div style="background: #111; border: 1px solid #00ff66; padding: 1.2rem; border-radius: 8px; margin-top: 1rem;">
      <h4 style="color: #00ff66; margin-top: 0; margin-bottom: 0.5rem;">AI Generated Answer (RAG):</h4>
      <p style="color: #fff; line-height: 1.5; font-size: 1.05rem;">${answer}</p>
      <hr style="border-color: #333; margin: 1rem 0;" />
      <small style="color: #888;">Retrieved & Analyzed ${sources.length} Context Chunks</small>
    </div>
  `;
}

// 4. File Upload Event Handlers
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => e.preventDefault());
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleFile(e.target.files[0]);
});

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const rawText = e.target.result;
    
    // Chunk file text into 300-char blocks with 50-char overlaps
    const chunks = chunkText(rawText, 300, 50);
    
    statusDiv.textContent = `Status: Parsing ${file.name} into ${chunks.length} chunks...`;
    worker.postMessage({ type: 'INDEX_DOCUMENTS', payload: { documents: chunks } });
  };
  reader.readAsText(file);
}

// 5. Button Listeners
searchBtn.addEventListener('click', () => {
  const query = queryInput.value.trim();
  if (!query) return;
  
  statusDiv.textContent = 'Status: Executing vector search...';
  worker.postMessage({ type: 'SEARCH_QUERY', payload: { query } });
});

ragBtn.addEventListener('click', () => {
  const query = queryInput.value.trim();
  if (!query) return;

  statusDiv.textContent = 'Status: Fetching context and loading SLM on WebGPU...';
  worker.postMessage({ type: 'GENERATE_RAG_ANSWER', payload: { query } });
});