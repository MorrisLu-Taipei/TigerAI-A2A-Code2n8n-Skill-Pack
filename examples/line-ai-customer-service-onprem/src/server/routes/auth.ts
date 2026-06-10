import express from 'express';
import { query } from '../services/db.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const result = await query('SELECT * FROM public.users WHERE email = $1 AND password = $2', [email, password]);
    
    if (result.rows.length > 0) {
      // Small mock for token/auth status
      res.json({ 
        success: true, 
        user: { email: result.rows[0].email, role: result.rows[0].role } 
      });
    } else {
      res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: '伺服器錯誤' });
  }
});

router.get('/me', (req, res) => {
  // Simple check for auth session simulation
  res.json({ authenticated: true });
});

export default router;
