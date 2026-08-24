# Edge-RAG: Zero-Egress In-Browser Vector Search & Synthesis Engine

A privacy-focused, client-side Retrieval-Augmented Generation (RAG) engine built with JavaScript, Web Workers, WebGPU, and ONNX Runtime Web. It extracts, chunks, vectorizes, stores, and queries documents completely on-device—guaranteeing 100% data privacy with zero server compute costs.

![Architecture Diagram](https://img.shields.io/badge/Architecture-WebWorkers%20%7C%20WebGPU%20%7C%20IndexedDB-blue)
![Privacy](https://img.shields.io/badge/Privacy-100%25%20On--Device%20(Zero%20Egress)-brightgreen)

## Key Technical Features
* **Multithreaded Execution:** Offloads tensor operations and model execution to background Web Workers, maintaining a consistent 60fps UI thread.
* **On-Device Hardware Acceleration:** Executes quantized ONNX models directly on client GPUs via WebGPU (`all-MiniLM-L6-v2` for embeddings, `Qwen2.5-0.5B-Instruct` for SLM synthesis).
* **Automatic Chunking Pipeline:** Implements recursive character splitting with overlapping sliding windows to preserve context across text splits.
* **Disk Persistence:** Caches generated vector embeddings and document metadata to IndexedDB to eliminate re-indexing across page reloads.
* **Zero External API Dependencies:** Works completely offline after initial model weight load.

## Architecture & Data Flow

```text
[ Uploaded .txt File ]
         │
         ▼
[ Recursive Chunker (300 chars, 50 overlap) ]
         │
         ▼ (postMessage)
┌─────────────────────────────────────────────────────────────┐
│                 BACKGROUND WEB WORKER                       │
│  1. Generates 384-dim Float32 vectors via WebGPU            │
│  2. Syncs vectors & text metadata to IndexedDB              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 RAG RETRIEVAL & SYNTHESIS                   │
│  1. Vectorizes user query in Worker                         │
│  2. Ranks chunks using Cosine Similarity ($A \cdot B$)      │
│  3. Feeds top context chunks to local Qwen2.5-0.5B SLM      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
[ Animated UI Layer (Main Thread - React / Framer Motion) ]