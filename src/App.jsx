import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, Search, Cpu, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { chunkText } from './utils/chunker';
import './style.css';

export default function App() {
  const [status, setStatus] = useState('Initializing local database...');
  const [statusType, setStatusType] = useState('loading'); // 'loading' | 'success' | 'error' | 'idle'
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [answer, setAnswer] = useState(null);
  const [sources, setSources] = useState([]);
  const workerRef = useRef(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('./workers/search.worker.js', import.meta.url), { type: 'module' });
    workerRef.current.postMessage({ type: 'INIT_STORAGE' });

    workerRef.current.onmessage = (event) => {
      const { status: messageStatus, message, payload } = event.data;

      if (messageStatus === 'STORAGE_RESTORED') {
        setStatus(`Restored ${payload.count} document chunks from disk cache. Ready to search!`);
        setStatusType('success');
        setIsLoading(false);
        setIsReady(true);
      } else if (messageStatus === 'STORAGE_EMPTY') {
        setStatus('Ready. Drag & drop a .txt file to index vectors.');
        setStatusType('idle');
        setIsLoading(false);
      } else if (messageStatus === 'LOADING_MODEL') {
        setStatus(message);
        setStatusType('loading');
        setIsLoading(true);
      } else if (messageStatus === 'INDEX_COMPLETE') {
        setStatus(`Indexed & saved ${payload.count} chunks in ${payload.executionTime}ms on WebGPU!`);
        setStatusType('success');
        setIsLoading(false);
        setIsReady(true);
      } else if (messageStatus === 'SEARCH_COMPLETE') {
        setStatus(`Evaluated search query across vectors in ${payload.executionTime}ms`);
        setStatusType('success');
        setIsLoading(false);
        setAnswer(null);
        setResults(payload.results);
      } else if (messageStatus === 'RAG_COMPLETE') {
        setStatus(`Synthesized local answer in ${payload.executionTime}ms!`);
        setStatusType('success');
        setIsLoading(false);
        setResults([]);
        setAnswer(payload.answer);
        setSources(payload.sources);
      } else if (messageStatus === 'ERROR') {
        setStatus(`Error: ${message}`);
        setStatusType('error');
        setIsLoading(false);
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  const handleFileUpload = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const chunks = chunkText(e.target.result, 300, 50);
      setStatus(`Parsing ${file.name} into ${chunks.length} chunks...`);
      setStatusType('loading');
      setIsLoading(true);
      workerRef.current.postMessage({ type: 'INDEX_DOCUMENTS', payload: { documents: chunks } });
    };
    reader.readAsText(file);
  };

  const executeSearch = () => {
    if (!query.trim()) return;
    setStatus('Executing vector search in Web Worker...');
    setStatusType('loading');
    setIsLoading(true);
    workerRef.current.postMessage({ type: 'SEARCH_QUERY', payload: { query } });
  };

  const executeRAG = () => {
    if (!query.trim()) return;
    setStatus('Loading SLM & running generative synthesis on WebGPU...');
    setStatusType('loading');
    setIsLoading(true);
    workerRef.current.postMessage({ type: 'GENERATE_RAG_ANSWER', payload: { query } });
  };

  return (
    <div className="container">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', marginBottom: '0.5rem' }}>
          <ShieldCheck size={18} />
          <span style={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.02em' }}>
            100% ON-DEVICE ZERO-EGRESS ARCHITECTURE
          </span>
        </div>
        <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: 700 }}>Local File Vector Search & RAG Engine</h1>
        <p style={{ color: '#9ca3af', marginTop: '0.5rem', fontSize: '1rem' }}>
          Hardware-accelerated embedding generation and LLM answer synthesis running locally on WebGPU.
        </p>
      </motion.div>

      {/* Upload Zone */}
      <motion.div 
        className="drop-zone"
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        onClick={() => document.getElementById('file-input').click()}
      >
        <Upload size={36} color="#38bdf8" style={{ marginBottom: '0.75rem' }} />
        <div style={{ fontSize: '1.05rem', color: '#e2e8f0' }}>
          Drag & drop a <strong>.txt</strong> file here, or click to browse
        </div>
        <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.4rem' }}>
          Files are parsed, chunked, and embedded entirely inside your browser memory.
        </div>
        <input 
          id="file-input" 
          type="file" 
          accept=".txt" 
          style={{ display: 'none' }} 
          onChange={(e) => e.target.files[0] && handleFileUpload(e.target.files[0])} 
        />
      </motion.div>

      {/* Query Bar */}
      <div className="input-group">
        <input 
          className="search-input" 
          placeholder="Ask a question about your uploaded document..." 
          value={query} 
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && executeSearch()}
          disabled={!isReady || isLoading}
        />
        <button 
          className="btn btn-secondary" 
          disabled={!isReady || !query.trim() || isLoading}
          onClick={executeSearch}
        >
          <Search size={16} /> Vector Search
        </button>
        <button 
          className="btn btn-primary" 
          disabled={!isReady || !query.trim() || isLoading}
          onClick={executeRAG}
        >
          <Cpu size={16} /> Synthesize (RAG)
        </button>
      </div>

      {/* Live Animated Status Banner */}
      <motion.div 
        className={`status-banner ${statusType}`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {isLoading && <div className="spinner" />}
        {!isLoading && statusType === 'success' && <CheckCircle2 size={18} color="#34d399" />}
        {!isLoading && statusType === 'error' && <AlertCircle size={18} color="#f87171" />}
        <span>{status}</span>
      </motion.div>

      {/* Results Section */}
      <AnimatePresence>
        {answer && (
          <motion.div 
            className="card rag-card"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#34d399', fontWeight: 600 }}>
              <Cpu size={18} /> AI Generated Answer (Qwen2.5-0.5B WebGPU):
            </div>
            <p style={{ lineHeight: 1.6, marginTop: '0.75rem', fontSize: '1.05rem', color: '#f3f4f6' }}>{answer}</p>
            <hr style={{ borderColor: 'rgba(55, 65, 81, 0.6)', margin: '1rem 0' }} />
            <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Retrieved Context Sources: {sources.length} Document Chunks</span>
          </motion.div>
        )}

        {results.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h4 style={{ marginTop: '1.5rem', color: '#9ca3af' }}>Top Similarity Vector Matches:</h4>
            {results.slice(0, 3).map((r, i) => (
              <motion.div 
                key={i} 
                className="card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div style={{ color: '#34d399', fontWeight: 600, fontSize: '0.9rem' }}>
                  Similarity Match Score: ${(r.score * 100).toFixed(1)}%
                </div>
                <div style={{ marginTop: '0.4rem', color: '#e5e7eb', lineHeight: 1.5 }}>{r.text}</div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}