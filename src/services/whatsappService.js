const axios = require('axios');
const logger = require('../utils/logger');

class WhatsAppService {
  constructor() {
    this.baseURL = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
    this.headers = {
      'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    };
  }

  async sendMessage(to, messageData) {
    try {
      const url = `${this.baseURL}/messages`;
      const response = await axios.post(url, messageData, { headers: this.headers });
      
      logger.info(`Message sent to ${to}`, {
        messageId: response.data?.messages?.[0]?.id,
        recipient: to
      });
      
      return response.data;
    } catch (error) {
      logger.error('Error sending WhatsApp message', {
        error: error.response?.data || error.message,
        recipient: to,
        data: messageData
      });
      throw error;
    }
  }

  async sendTextMessage(to, text) {
    const messageData = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'text',
      text: { body: text }
    };
    
    return this.sendMessage(to, messageData);
  }

  async sendInteractiveButtonMessage(to, text, buttons) {
    const messageData = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: text },
        action: {
          buttons: buttons.map((btn, index) => ({
            type: 'reply',
            reply: {
              id: btn.id?? `btn_${index + 1}`,
              title: btn.title
            }
          }))
        }
      }
    };
    
    return this.sendMessage(to, messageData);
  }

  async sendListMessage(to, text, buttonText, sections) {
    const messageData = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: text },
        action: {
          button: buttonText,
          sections: sections
        }
      }
    };
    
    return this.sendMessage(to, messageData);
  }

  async sendQuickReply(to, text, options) {
    const messageData = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: text },
        action: {
          buttons: options.map((opt, index) => ({
            type: 'reply',
            reply: {
              id: `quick_${index}`,
              title: opt
            }
          }))
        }
      }
    };
    
    return this.sendMessage(to, messageData);
  }
}

module.exports = new WhatsAppService();