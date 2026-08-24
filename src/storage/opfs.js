const DB_FILE_NAME = 'vector_index.json';

/**
 * Accesses the root OPFS directory inside worker scope
 */
async function getOPFSRoot() {
  return await navigator.storage.getDirectory();
}

/**
 * Saves the document store (metadata + vectors) to OPFS disk
 */
export async function saveIndexToOPFS(documentStore) {
  try {
    const root = await getOPFSRoot();
    const fileHandle = await root.getFileHandle(DB_FILE_NAME, { create: true });
    
    // Create a writable stream to sync data to disk
    const writable = await fileHandle.createWritable();
    const serializedData = JSON.stringify(documentStore);
    
    await writable.write(serializedData);
    await writable.close();
    
    console.log('[OPFS] Vector index successfully persisted to disk.');
    return true;
  } catch (error) {
    console.error('[OPFS] Error saving index:', error);
    throw error;
  }
}

/**
 * Loads persisted document index and vectors from OPFS disk
 */
export async function loadIndexFromOPFS() {
  try {
    const root = await getOPFSRoot();
    
    // Check if the index file exists
    const fileHandle = await root.getFileHandle(DB_FILE_NAME, { create: false });
    const file = await fileHandle.getFile();
    const contents = await file.text();
    
    const parsedStore = JSON.parse(contents);
    console.log(`[OPFS] Restored ${parsedStore.length} document vectors from disk.`);
    return parsedStore;
  } catch (error) {
    // Return empty array if file does not exist yet (cold start)
    console.log('[OPFS] No existing vector store found on disk.');
    return null;
  }
}