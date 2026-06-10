import express from 'express';
import { query } from '../services/db.js';

const router = express.Router();

// GET /api/user_states?is_human_mode=true — list users in human mode
router.get('/user_states', async (req, res) => {
  try {
    const { is_human_mode } = req.query;
    let sql = 'SELECT * FROM public.user_states';
    const params: any[] = [];

    if (is_human_mode !== undefined) {
      params.push(is_human_mode === 'true');
      sql += ' WHERE is_human_mode = $1';
    }

    sql += ' ORDER BY last_human_interaction DESC';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error: any) {
    console.error('Error fetching user_states:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/user_states — update user state (switch back to AI)
router.post('/user_states', async (req, res) => {
  try {
    const { is_human_mode, last_ai_reset_at, line_user_id } = req.body;
    const sql = `
      UPDATE public.user_states
      SET is_human_mode = $1, last_human_interaction = NOW()
      WHERE line_user_id = $2
      RETURNING *;
    `;
    const result = await query(sql, [is_human_mode ?? false, line_user_id]);
    res.json(result.rows[0] || {});
  } catch (error: any) {
    console.error('Error updating user_states:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;