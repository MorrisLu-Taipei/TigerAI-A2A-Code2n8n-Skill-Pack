import express from 'express';
import { query } from '../services/db.js';

const router = express.Router();

// 1. Add Log Entry
router.post('/add', async (req, res) => {
  const { line_user_id, role, content } = req.body;
  try {
    const result = await query(
      'INSERT INTO public.chat_logs (line_user_id, role, content) VALUES ($1, $2, $3) RETURNING *',
      [line_user_id, role, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Search Logs
router.get('/search', async (req, res) => {
  const { query: searchQuery, userId, limit = 50 } = req.query;
  try {
    let sql = 'SELECT * FROM public.chat_logs WHERE 1=1';
    const params: any[] = [];

    if (searchQuery) {
      params.push(`%${searchQuery}%`);
      sql += ` AND content ILIKE $${params.length}`;
    }

    if (userId) {
      params.push(userId);
      sql += ` AND line_user_id = $${params.length}`;
    }

    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
