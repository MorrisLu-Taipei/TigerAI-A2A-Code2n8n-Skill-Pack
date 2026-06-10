import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import lineRouter from './routes/line.js';
import settingsRouter from './routes/settings.js';
import logsRouter from './routes/logs.js';
import uploadRouter from './routes/upload.js';
import authRouter from './routes/auth.js';
import agentRouter from './routes/agent.js';
import { initQdrant } from './services/qdrant.js';
import { connectRedis } from './services/redis.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for easier local dev
}));
app.use(cors());
app.use(express.json());

// Main Routes
app.use('/api/line', lineRouter);
app.use('/api/auth', authRouter);
app.use('/api', uploadRouter);
app.use('/api', settingsRouter);
app.use('/api/logs', logsRouter);
app.use('/api', agentRouter);

// Serve Frontend
const distPath = path.join(__dirname, '../../dist');
app.use(express.static(distPath));

// Fallback to index.html for SPA
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(distPath, 'index.html'));
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'OK' });
});

// Initialization
const start = async () => {
  try {
    await connectRedis();
    await initQdrant();
    console.log('Services initialized (Redis, Qdrant)');
    
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('Initialization failed', err);
  }
};

start();
