import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
import { addKnowledge } from '../services/qdrant.js';
import { getSettings } from '../services/db.js';

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).send('No file uploaded');

  const settings = await getSettings();
  if (!settings?.gpt_api_key) return res.status(500).send('OpenAI API Key not set (Required for embeddings)');

  try {
    let text = '';
    const filePath = file.path;

    if (file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      text = data.text;
    } else {
      text = fs.readFileSync(filePath, 'utf8');
    }

    // Optional: Chunk the text for long documents
    // For MVP, just index the whole text or first 4000 chars
    const chunks = text.match(/[\s\S]{1,4000}/g) || [];
    for (const chunk of chunks) {
      await addKnowledge(chunk, { filename: file.originalname }, settings.gpt_api_key);
    }

    res.json({ 
      message: 'File uploaded and indexed in Qdrant',
      publicUrl: `/api/files/${file.filename}` 
    });
  } catch (err) {
    console.error('Upload Error', err);
    res.status(500).send('Internal Server Error');
  }
});

// Serve uploaded files
router.use('/files', express.static('uploads'));

export default router;
