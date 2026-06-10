import express from 'express';
import { getSettings, updateSettings, query } from '../services/db.js';
import { listCollections } from '../services/qdrant.js';

const router = express.Router();

router.post('/reset-handover', async (req, res) => {
  try {
    await query('UPDATE public.user_states SET is_human_mode = false');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/settings', async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings || {});
  } catch (error) {
    console.error('Error fetching app settings:', error);
    res.status(500).json({ error: 'Failed to fetch app settings' });
  }
});

router.post('/settings', async (req, res) => {
  try {
    await updateSettings(req.body);
    res.json({ message: 'App settings updated successfully' });
  } catch (error) {
    console.error('Error updating app settings:', error);
    res.status(500).json({ error: 'Failed to update app settings' });
  }
});

router.get('/n8n/credentials', async (req, res) => {
  try {
    // Verified: n8n uses plural 'credentials_entity' in its own schema
    // This is a READ-ONLY query as per user principles
    const result = await query('SELECT id, name, type FROM n8n.credentials_entity ORDER BY name ASC');
    res.json(Array.isArray(result.rows) ? result.rows : []);
  } catch (error) {
    console.warn('Could not fetch n8n credentials from n8n.credentials_entity schema.', error);
    res.json([]); 
  }
});


router.get('/qdrant/collections', async (req, res) => {
  try {
    const collections = await listCollections();
    res.json(collections);
  } catch (error) {
    console.error('Error fetching Qdrant collections:', error);
    res.json([]);
  }
});

export default router;

