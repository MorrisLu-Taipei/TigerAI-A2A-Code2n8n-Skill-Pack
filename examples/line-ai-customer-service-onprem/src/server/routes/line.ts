import express from 'express';
import { Client, validateSignature, WebhookEvent } from '@line/bot-sdk';
import { query, getSettings } from '../services/db.js';
import { cache } from '../services/redis.js';
import { callAI } from '../services/ai.js';

const router = express.Router();

router.post('/webhook', async (req, res) => {
  const settings = await getSettings();
  if (!settings) return res.status(500).send('Settings not found');

  const signature = req.headers['x-line-signature'] as string;
  if (!validateSignature(JSON.stringify(req.body), settings.line_channel_secret, signature)) {
    return res.status(401).send('Invalid signature');
  }

  const events: WebhookEvent[] = req.body.events;

  // [n8n Forwarding] If enabled, forward the entire payload to n8n and short-circuit.
  if (settings.use_n8n && settings.n8n_webhook_url) {
    try {
      await fetch(settings.n8n_webhook_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-line-signature': signature
        },
        body: JSON.stringify(req.body)
      });
      console.log(`[n8n] Forwarded payload to ${settings.n8n_webhook_url}`);
      return res.status(200).send('OK');
    } catch (e) {
      console.error('[n8n] Forwarding failed, falling back to local logic', e);
    }
  }

  const lineClient = new Client({
    channelAccessToken: settings.line_channel_access_token,
    channelSecret: settings.line_channel_secret,
  });

  for (const event of events) {
    if (event.type === 'message' && event.message.type === 'text') {
      const userId = event.source.userId!;
      const userMessage = event.message.text.trim();
      const eventId = (event as any).webhookEventId;

      if (!userMessage || !eventId) continue;

      // 1. Redis Deduplication (TTL 5 mins)
      const dedupeKey = `processed_event:${eventId}`;
      const isProcessed = await cache.exists(dedupeKey);
      if (isProcessed) {
        console.log(`[Dedupe] Skipping event: ${eventId}`);
        continue;
      }
      await cache.set(dedupeKey, '1', 300);

      // 2. Redis User State (Cache)
      const stateKey = `user_state:${userId}`;
      let userStateJson = await cache.get(stateKey);
      let userState = userStateJson ? JSON.parse(userStateJson) : null;

      if (!userState) {
        // Fallback to DB
        const dbRes = await query('SELECT * FROM user_states WHERE line_user_id = $1', [userId]);
        userState = dbRes.rows[0];
      }

      // 3. Handover Logic
      const handoverKeywords = settings.handover_keywords?.split(',') || [];
      if (handoverKeywords.some((k: string) => userMessage.includes(k.trim()))) {
        let nickname = userState?.nickname || '匿名用戶';
        try { nickname = (await lineClient.getProfile(userId)).displayName; } catch (e) {}
        
        const newState = { line_user_id: userId, nickname, is_human_mode: true, last_human_interaction: new Date().toISOString() };
        await query('INSERT INTO user_states (line_user_id, nickname, is_human_mode, last_human_interaction) VALUES ($1, $2, $3, $4) ON CONFLICT (line_user_id) DO UPDATE SET is_human_mode = $3, last_human_interaction = $4', [userId, nickname, true, newState.last_human_interaction]);
        await cache.set(stateKey, JSON.stringify(newState), 86400);

        await lineClient.replyMessage(event.replyToken, { type: 'text', text: '已為您轉接真人客服，請稍候。' });
        continue;
      }

      // 4. Human Mode Check
      if (userState?.is_human_mode) {
        const lastInteraction = new Date(userState.last_human_interaction).getTime();
        const timeoutMs = (settings.handover_timeout_minutes || 30) * 60 * 1000;
        if (Date.now() - lastInteraction < timeoutMs) continue;
      }

      // 5. AI Response
      if (settings.is_ai_enabled) {
        try {
          const aiResult = await callAI(settings, userMessage);
          if (aiResult) {
            await lineClient.replyMessage(event.replyToken, { type: 'text', text: aiResult });
          }
        } catch (e) {
          console.error('AI Error', e);
        }
      }
    }
  }

  res.status(200).send('OK');
});

export default router;
