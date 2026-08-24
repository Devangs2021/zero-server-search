import { pipeline } from '@huggingface/transformers';
import { cosineSimilarity } from '../utils/vector-math.js';

let extractor = null;
let generator = null;
let documentStore = [];

// --- IndexedDB Persistence Handlers ---
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('VectorSearchDB', 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('store', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveToStorage(data) {
  const db = await openDB();
  const tx = db.transaction('store', 'readwrite');
  const store = tx.objectStore('store');
  await store.clear();
  data.forEach((item) => store.put(item));
  return tx.complete;
}

async function loadFromStorage() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('store', 'readonly');
    const store = tx.objectStore('store');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
// ----------------------------------------

async function getExtractor() {
  if (!extractor) {
    self.postMessage({ status: 'LOADING_MODEL', message: 'Loading Embedding Model onto WebGPU/WASM...' });
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      device: 'webgpu',
    });
    self.postMessage({ status: 'LOADING_MODEL', message: 'Embedding Model Ready!' });
  }
  return extractor;
}

async function getGenerator() {
  if (!generator) {
    self.postMessage({ status: 'LOADING_MODEL', message: 'Loading Qwen2.5-0.5B SLM (350MB)...' });
    generator = await pipeline('text-generation', 'onnx-community/Qwen2.5-0.5B-Instruct', {
      device: 'webgpu',
      dtype: 'q4',
    });
    self.postMessage({ status: 'LOADING_MODEL', message: 'Generative Engine Ready!' });
  }
  return generator;
}

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  // Task 1: Check and restore existing vectors on startup
  if (type === 'INIT_STORAGE') {
    try {
      const savedDocs = await loadFromStorage();
      if (savedDocs && savedDocs.length > 0) {
        documentStore = savedDocs;
        self.postMessage({
          status: 'STORAGE_RESTORED',
          payload: { count: documentStore.length },
        });
      } else {
        self.postMessage({ status: 'STORAGE_EMPTY', message: 'Storage empty.' });
      }
    } catch (err) {
      self.postMessage({ status: 'STORAGE_EMPTY', message: 'Ready to index.' });
    }
  }

  // Task 2: Vectorize File Chunks & Persist to Storage
  if (type === 'INDEX_DOCUMENTS') {
    try {
      const model = await getExtractor();
      const startTime = performance.now();

      const output = await model(payload.documents, { pooling: 'mean', normalize: true });
      const embeddings = output.tolist();

      documentStore = payload.documents.map((text, idx) => ({
        id: idx + 1,
        text,
        vector: embeddings[idx],
      }));

      await saveToStorage(documentStore);

      const executionTime = (performance.now() - startTime).toFixed(2);
      self.postMessage({
        status: 'INDEX_COMPLETE',
        payload: { count: documentStore.length, executionTime },
      });
    } catch (err) {
      console.error('Worker Indexing Error:', err);
      self.postMessage({ status: 'ERROR', message: err.message });
    }
  }

  // Task 3: Vector Similarity Search
  if (type === 'SEARCH_QUERY') {
    try {
      if (documentStore.length === 0) throw new Error('Vector index is empty. Upload a file first.');

      const model = await getExtractor();
      const startTime = performance.now();

      const queryOutput = await model([payload.query], { pooling: 'mean', normalize: true });
      const queryVector = queryOutput.tolist()[0];

      const results = documentStore
        .map((doc) => ({
          id: doc.id,
          text: doc.text,
          score: cosineSimilarity(queryVector, doc.vector),
        }))
        .sort((a, b) => b.score - a.score);

      const executionTime = (performance.now() - startTime).toFixed(2);
      self.postMessage({
        status: 'SEARCH_COMPLETE',
        payload: { query: payload.query, results, executionTime },
      });
    } catch (err) {
      console.error('Worker Search Error:', err);
      self.postMessage({ status: 'ERROR', message: err.message });
    }
  }

  // Task 4: Local RAG Answer Synthesis
  if (type === 'GENERATE_RAG_ANSWER') {
    try {
      if (documentStore.length === 0) throw new Error('Vector index is empty. Upload a file first.');

      const embedder = await getExtractor();
      const startTime = performance.now();

      // Retrieve top context chunks
      const queryOutput = await embedder([payload.query], { pooling: 'mean', normalize: true });
      const queryVector = queryOutput.tolist()[0];

      const topChunks = documentStore
        .map((doc) => ({ text: doc.text, score: cosineSimilarity(queryVector, doc.vector) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const contextText = topChunks.map((c) => c.text).join('\n---\n');

      // Generate response using SLM
      const llm = await getGenerator();
      const messages = [
        {
          role: 'system',
          content: 'You are an AI assistant. Answer the user question strictly using only the provided context snippets.',
        },
        {
          role: 'user',
          content: `Context:\n${contextText}\n\nQuestion: ${payload.query}`,
        },
      ];

      const output = await llm(messages, { max_new_tokens: 128, temperature: 0.2 });
      const responseText = output[0].generated_text.at(-1).content;

      const executionTime = (performance.now() - startTime).toFixed(2);
      self.postMessage({
        status: 'RAG_COMPLETE',
        payload: { query: payload.query, answer: responseText, sources: topChunks, executionTime },
      });
    } catch (err) {
      console.error('Worker RAG Error:', err);
      self.postMessage({ status: 'ERROR', message: err.message });
    }
  }
};