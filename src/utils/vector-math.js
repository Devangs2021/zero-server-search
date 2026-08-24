/**
 * Calculates Cosine Similarity between two normalized vectors.
 * Because embeddings are L2 normalized, cosine similarity is simply the Dot Product.
 */
export function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Vector dimensions must match');
  }
  let dotProduct = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
  }
  return dotProduct;
}