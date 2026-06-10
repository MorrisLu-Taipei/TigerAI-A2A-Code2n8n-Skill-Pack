import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const qdrant = new QdrantClient({ 
  url: process.env.QDRANT_URL || 'http://qdrant-tigerai:6333',
  apiKey: process.env.QDRANT_API_KEY
});

const COLLECTION_NAME = 'customer_service_knowledge';

export async function initQdrant() {
  try {
    const collections = await qdrant.getCollections();
    if (!collections.collections.find(c => c.name === COLLECTION_NAME)) {
      await qdrant.createCollection(COLLECTION_NAME, {
        vectors: { size: 1536, distance: 'Cosine' } // OpenAI 1536
      });
    }
    console.log('Qdrant connected successfully');
  } catch (err) {
    console.warn('Qdrant not available, RAG features will be disabled:', (err as Error).message);
  }
}

export async function listCollections() {
  try {
    const result = await qdrant.getCollections();
    return result.collections.map(c => c.name);
  } catch (err) {
    console.warn('Qdrant not available for listing collections');
    return [];
  }
}

export async function getEmbeddings(text: string, apiKey: string) {
  const openai = new OpenAI({ apiKey });
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

export async function searchKnowledge(queryText: string, apiKey: string, topK = 3) {
  const vector = await getEmbeddings(queryText, apiKey);
  const result = await qdrant.search(COLLECTION_NAME, {
    vector,
    limit: topK,
    with_payload: true
  });
  return result.map(r => r.payload?.text).join('\n\n');
}

export async function addKnowledge(text: string, metadata: any, apiKey: string) {
  const vector = await getEmbeddings(text, apiKey);
  await qdrant.upsert(COLLECTION_NAME, {
    wait: true,
    points: [{
      id: Math.random().toString(36).substring(7),
      vector,
      payload: { ...metadata, text }
    }]
  });
}
