require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    apiPrefix: '/api/v1'
  },
  
  // WhatsApp Configuration
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: process.env.BUSINESS_ACCOUNT_ID,
    apiVersion: 'v19.0',
    verifyToken: process.env.VERIFY_TOKEN,
    webhookUrl: process.env.WEBHOOK_URL
  },
  
  // Database Configuration
  database: {
    mongoURI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ti_easy_service',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10
    }
  },
  
  // Business Configuration
  business: {
    name: 'TI Cycles',
    displayName: 'Track & Trail Door Step Cycle Service',
    supportPhone: process.env.SUPPORT_PHONE || '+91-44-XXXX-XXXX',
    supportEmail: process.env.SUPPORT_EMAIL || 'service@ticycles.com',
    hours: '8:00 AM - 8:00 PM (Mon-Sun)',
    address: 'TI House, 6th Floor, Chennai - 600 034'
  },
  
  // Service Configuration
  service: {
    brands: [
      { 
        id: 'bsa', 
        name: 'BSA', 
        emoji: '🚴‍♂️',
        description: 'Trusted Brand Since 1949'
      },
      { 
        id: 'hercules', 
        name: 'Hercules', 
        emoji: '🛡️',
        description: 'Strong & Durable Bikes'
      },
      { 
        id: 'montra', 
        name: 'Montra', 
        emoji: '🚲',
        description: 'Premium Performance Bikes'
      },
      { 
        id: 'mach_city', 
        name: 'Mach City', 
        emoji: '🏙️',
        description: 'Urban Commuter Bikes'
      },
      { 
        id: 'others', 
        name: 'Others', 
        emoji: '🚲',
        description: 'Other Bikes'
      }
    ],
    
    issues: [
      { 
        id: 'regular_ser', 
        name: 'Regular Service', 
        emoji: '🔩',
        description: 'Frame alignment, cracks, welding'
      },
      { 
        id: 'brake_issue', 
        name: 'Braking System', 
        emoji: '🛞',
        description: 'Puncture, wear, replacement'
      },
      { 
        id: 'wheel_issue', 
        name: 'Wheel & Tyre', 
        emoji: '⛓️',
        description: 'Brake adjustment, pad replacement'
      },
      { 
        id: 'drive_issue', 
        name: 'Drivetrain', 
        emoji: '🔗',
        description: 'Chain lubrication, replacement'
      },
       { 
        id: 'bearing_issue', 
        name: 'Bearing & Rotation', 
        emoji: '🔗',
        description: 'Chain lubrication, replacement'
      }  
    ],
    
    // Time slots configuration
    slots: {
      daysAhead: 7,
      slotsPerDay: 3,
      morning: '10:00 AM',
      afternoon: '02:00 PM',
      evening: '06:00 PM',
      duration: 120, // minutes
      maxSlotsPerBooking: 3
    },
    
    // Service details
    duration: '1-2 hours',
    technicianCall: 'Before visit',
    requirements: ['Bicycle', 'ID Proof', 'Service History if any']
  },
  
  // Messages Configuration
  messages: {
    welcome: 'Dear {name}, Welcome to TI Cycles Easy Service',
    consent: 'Your consent is required for TI Cycles to process personal information for service fulfillment in line with applicable data protection laws. Reply YES to proceed.',
    thankYou: 'Thank you! Our Technician will call you before the visit.',
    exit: 'Thank you for your time. If you need service assistance later, just say Hi!'
  },
  
  // Flow Configuration
  flow: {
    useLists: true, // Use lists instead of buttons for better UX
    confirmSteps: true, // Ask for confirmation at each step
    timeout: 300000, // 5 minutes timeout for each step
    maxRetries: 2
  }
};

// Validation
function validateConfig() {
  const required = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'VERIFY_TOKEN'];
  const missing = [];
  
  required.forEach(key => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing);
    console.error('Please check your .env file');
    process.exit(1);
  }
  
  console.log('✅ Configuration loaded');
  console.log(`🚲 TI Cycles Bot: ${config.business.displayName}`);
  console.log(`📱 Using: ${config.flow.useLists ? 'Interactive Lists' : 'Buttons'}`);
}

module.exports = { config, validateConfig };