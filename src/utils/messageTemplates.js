const messageTemplates = {
  welcome: (userName) => ({
    text: `👋 *Welcome ${userName || 'there'}!*\n\nThank you for reaching out to AB Service. We're excited to assist you.`,
    quickReplies: ['Start Service', 'Learn More', 'Contact Support']
  }),
  
  consentRequest: () => ({
    text: `🔐 *Privacy Consent*\n\nTo provide you with the best service, we need your consent to process your information.`,
    buttons: [
      { title: '✅ I Agree & Continue' },
      { title: '📄 View Privacy Policy' },
      { title: '❌ Cancel' }
    ]
  }),
  
  brandSelection: () => ({
    text: `🏢 *Brand Selection*\n\nPlease choose your preferred brand from our portfolio:`,
    list: {
      button: 'View Brands',
      sections: [
        {
          title: 'Premium Brands',
          rows: [
            { id: 'brand_abc', title: 'ABC Brand', description: 'Luxury products & services' },
            { id: 'brand_xyz', title: 'XYZ Solutions', description: 'Innovative tech solutions' },
            { id: 'brand_lmn', title: 'LMN Essentials', description: 'Everyday affordable options' }
          ]
        },
        {
          title: 'Specialized Brands',
          rows: [
            { id: 'brand_pro', title: 'PRO Series', description: 'Professional grade tools' },
            { id: 'brand_eco', title: 'ECO Friendly', description: 'Sustainable products' }
          ]
        }
      ]
    }
  }),
  
  confirmation: (brand) => ({
    text: `🎉 *Excellent Choice!*\n\nYou've selected *${brand}*. Our ${brand} specialist will contact you within 24 hours.\n\nIn the meantime, you can:\n• Browse ${brand} catalog\n• Schedule a demo\n• Chat with our assistant`
  })
};

module.exports = messageTemplates;