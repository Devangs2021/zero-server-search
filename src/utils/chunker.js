/**
 * Splits raw text into fixed-length chunks with overlapping boundaries.
 * Overlap prevents context loss across chunk splits.
 */
export function chunkText(text, chunkSize = 300, chunkOverlap = 50) {
  // Clean up whitespace and newlines
  const cleanText = text.replace(/\s+/g, ' ').trim();
  if (!cleanText) return [];

  const chunks = [];
  let startIndex = 0;

  while (startIndex < cleanText.length) {
    let endIndex = startIndex + chunkSize;
    
    // If we are not at the end of the string, attempt to break at a natural word boundary
    if (endIndex < cleanText.length) {
      const lastSpace = cleanText.lastIndexOf(' ', endIndex);
      if (lastSpace > startIndex) {
        endIndex = lastSpace;
      }
    }

    const chunk = cleanText.slice(startIndex, endIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    // Move sliding window forward by chunk size minus overlap
    startIndex += chunkSize - chunkOverlap;
  }

  return chunks;
}