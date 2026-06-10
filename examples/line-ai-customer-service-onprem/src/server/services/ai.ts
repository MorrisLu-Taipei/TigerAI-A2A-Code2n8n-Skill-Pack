import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';
import { searchKnowledge } from './qdrant.js';

export async function callAI(settings: any, userMessage: string) {
  const activeAI = settings.active_ai || 'gpt';
  
  // RAG: Query Qdrant for relevant context
  let ragContext = '';
  if (settings.gpt_api_key) {
    try {
      ragContext = await searchKnowledge(userMessage, settings.gpt_api_key);
    } catch (e) {
      console.log('RAG Error', e);
    }
  }

  const systemPrompt = `${settings.system_prompt}\n\n[知識庫參考資料]\n${ragContext}\n\n[靜態參考資料]\n${settings.reference_text}`;

  if (activeAI === 'gpt') return await callGPT(settings, systemPrompt, userMessage);
  if (activeAI === 'gemini') return await callGemini(settings, systemPrompt, userMessage);
  if (activeAI === 'ollama') return await callOllama(settings, systemPrompt, userMessage);
  
  throw new Error('Unsupported AI model');
}

async function callGPT(settings: any, systemPrompt: string, userMessage: string) {
  const openai = new OpenAI({ apiKey: settings.gpt_api_key });
  const messages: any[] = [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }];
  
  const completion = await openai.chat.completions.create({
    model: settings.gpt_model_name,
    messages,
    max_tokens: settings.gpt_max_tokens,
    temperature: settings.gpt_temperature
  });

  return completion.choices[0].message.content || '';
}

async function callGemini(settings: any, systemPrompt: string, userMessage: string) {
  const genAI = new GoogleGenerativeAI(settings.gemini_api_key);
  const model = genAI.getGenerativeModel({ model: settings.gemini_model_name });

  const result = await model.generateContent(`${systemPrompt}\n\nUser: ${userMessage}`);
  return result.response.text();
}

async function callOllama(settings: any, systemPrompt: string, userMessage: string) {
  const response = await fetch(`${settings.ollama_base_url}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({
      model: settings.ollama_model_name,
      system: systemPrompt,
      prompt: userMessage,
      stream: false
    })
  });
  const data: any = await response.json();
  return data.response;
}
