const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { validateWebhook } = require('../middleware/webhookMiddleware');

// Webhook verification
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      console.log('✅ Webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(400);
  }
});

// Handle incoming messages
router.post('/', validateWebhook, async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    
    if (value?.messages) {
      for (const message of value.messages) {
        // Process message asynchronously
        messageController.handleMessage(message).catch(console.error);
      }
    }
    
    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.sendStatus(500);
  }
});

module.exports = router;