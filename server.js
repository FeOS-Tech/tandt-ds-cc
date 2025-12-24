// server.js - Updated with Config
const express = require('express');
const { config, validateConfig } = require('./src/config');
const database = require('./src/config/database');
const messageController = require('./src/controllers/messageController');

const app = express();
app.use(express.json());

// Initialize
validateConfig();

// Connect to Database
database.connect().catch(console.error);

// Webhook Routes
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Webhook verification failed');
    res.sendStatus(403);
  }
});

// app.post('/webhook', async (req, res) => {
//   try {
//     console.log('📩 Webhook received');
    
//     const entry = req.body.entry?.[0];
//     const changes = entry?.changes?.[0];
//     const value = changes?.value;
    
//     if (value?.messages) {
//       const message = value.messages[0];
//       await messageController.handleMessage(message);
//     }
    
//     res.sendStatus(200);
//   } catch (error) {
//     console.error('❌ Webhook processing error:', error);
//     res.sendStatus(500);
//   }
// });

app.post('/webhook', async (req, res) => {
  try {
    res.sendStatus(200); // respond immediately

    const entry = req.body.entry?.[0];
    const value = entry?.changes?.[0]?.value;

    if (!value?.messages?.length) return;

    const message = value.messages[0];

    if (value.contacts?.length) {
      message.contacts = value.contacts;
    }

    await messageController.handleMessage(message);
  } catch (err) {
    console.error('❌ Webhook error:', err);
  }
});


// Health Check
app.get('/health', async (req, res) => {
  const dbStatus = database.getConnectionStatus();
  
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'WhatsApp Chatbot API',
    environment: config.server.nodeEnv,
    database: {
      connected: dbStatus.connected,
      readyState: dbStatus.readyState,
      host: dbStatus.host,
      name: dbStatus.name
    },
    whatsapp: {
      configured: !!config.whatsapp.token,
      phoneNumberId: config.whatsapp.phoneNumberId
    }
  });
});

// Start Server
const PORT = config.server.port;
app.listen(PORT, () => {
  console.log(`
  🚀 WhatsApp Chatbot Server Started!
  ===================================
  📍 Port: ${PORT}
  🌍 Environment: ${config.server.nodeEnv}
  🔗 Webhook URL: http://localhost:${PORT}/webhook
  📊 Health Check: http://localhost:${PORT}/health
  🗄️  MongoDB: ${database.isConnected ? 'Connected ✅' : 'Disconnected ❌'}
  📱 WhatsApp: ${config.whatsapp.phoneNumberId ? 'Configured ✅' : 'Not Configured ❌'}
  ===================================
  `);
});