const mongoose = require('mongoose');

/* ------------------ SERVICE REQUEST ------------------ */
const serviceRequestSchema = new mongoose.Schema({
  brand: {
    type: String,
    trim: true
  },
  issue: {
    type: String,
    trim: true
  },
  selectedSlots: [{
    dateDisplay: String,
    time: String,
    period: String,
    display: String,
    index: Number
  }],
  location: {
    address: String,
    coordinates: {
      type: [Number], // [lng, lat]
      default: [0, 0]
    }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

/* ------------------ USER SCHEMA ------------------ */
const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },

  displayName: {
    type: String,
    default: 'Customer'
  },

  /* ---------- STEP TRACKING ---------- */
  conversationStep: {
    type: Number,
    default: 0,
    index: true
  },

  conversationState: {
    type: String,
    default: 'new'
  },

  /* ---------- CURRENT BOOKING ---------- */
  currentRequest: {
    type: serviceRequestSchema,
    default: {}
  },

  /* ---------- BOOKING HISTORY ---------- */
  serviceHistory: {
    type: [serviceRequestSchema],
    default: []
  },

  /* ---------- CONSENT ---------- */
  consentGiven: {
    type: Boolean,
    default: false
  },
  consentTimestamp: Date,

  /* ---------- INTERACTION ---------- */
  messageCount: {
    type: Number,
    default: 0
  },
  lastInteraction: {
    type: Date,
    default: Date.now,
    index: true
  },
  lastMessage: String,

  /* ---------- META ---------- */
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

/* ------------------ HOOKS ------------------ */
userSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

/* ------------------ STEP → STATE ------------------ */
userSchema.methods.getStateFromStep = function () {
  const map = {
    0: 'welcome',
    1: 'consent',
    2: 'brand',
    3: 'issue',
    4: 'slot',
    5: 'location',
    6: 'summary',
    7: 'completed'
  };
  return map[this.conversationStep] || 'new';
};

module.exports = mongoose.model('User', userSchema);
