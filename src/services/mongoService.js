const mongoose = require('mongoose');
require('dotenv').config();
const logger = require('../utils/logger');
const counterSchema = require('../models/counter')
 
class MongoService {
  constructor() {
    this.models = {};
    this.initializeModels();
  }
 
  initializeModels() {
    // Read MongoDB URI from .env with fallback
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ti_easy_service';
   
    // Create connection to ti_easy_service database
    const connection = mongoose.createConnection(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10
    });
 
    connection.on('connected', () => {
      logger.info('MongoService connected to ti_easy_service database');
    });
 
    connection.on('error', (err) => {
      logger.error('MongoService connection error:', err);
    });
this.models.Counter = connection.model('Counter', counterSchema)
 
 
  const userMasterSchema = new mongoose.Schema({
      userProfileName: { type: String, default: null },
      userPhoneNumber: {
        type: String,
        required: true,
        unique: true,
        index: true
      },
      completeAddress: { type: String, default: null },
      locationPin: { type: String, default: null },
      userConsent: { type: Boolean, default: false },
      rating: { type: Number, default: null, min: 1, max: 5 },
      rank: { type: String, default: null },
      createdAt: { type: Date, default: Date.now },
      updatedAt: { type: Date, default: Date.now }
    });
 
    // Service Master Schema
    const serviceMasterSchema = new mongoose.Schema({
      ticketNumber: {
        type: String,
        required: true,
        unique: true,
      },
      categoryName: { type: String, default: null },
      serviceType: { type: String, default: null },
      selectedSlot: {
        date: { type: String, default: null },
        time: { type: String, default: null },
        period: { type: String, default: null },
        display: { type: String, default: null }
      },
      customerAddress: { type: String, default: null },
      customerLocation: {
        latitude: { type: Number, default: null },
        longitude: { type: Number, default: null }
      },
      userReported: { type: String, default: null }, // Phone number
      createdDate: { type: Date, default: Date.now },
      createdBy: { type: String, default: 'WhatsApp Bot' },
      assignedDate: { type: Date, default: null },
      assignedTo: { type: String, default: null },
      whoAssigned: { type: String, default: null },
      ticketStatus: {
        type: String,
        enum: ['new', 'pending', 'assigned', 'in_progress', 'completed', 'cancelled'],
        default: 'new'
      },
      mechanicComments: { type: String, default: null },
      paymentReceived: { type: Boolean, default: false },
      invoiceNumber: { type: String, default: null },
      jobCardNumber: { type: String, default: null },
      rating: { type: Number, default: null, min: 1, max: 5 }
    });
 
    // User Activity Log Schema
    const userActivityLogSchema = new mongoose.Schema({
      userPhoneNumber: {
        type: String,
        required: true,
        index: true
      },
      timestampStarted: { type: Date, default: Date.now },
      step0Timestamp: { type: Date, default: null },
      step1Timestamp: { type: Date, default: null },
      step2Timestamp: { type: Date, default: null },
      step3Timestamp: { type: Date, default: null },
      step4Timestamp: { type: Date, default: null },
      step5Timestamp: { type: Date, default: null },
      step6Timestamp: { type: Date, default: null },
      step7Timestamp: { type: Date, default: null },
      conversationCompleted: { type: Boolean, default: false },
      sessionId: { type: String, default: null }
    });
 
// Register models with ti_easy_service database
    this.models.UserMaster = connection.model('UserMaster', userMasterSchema);
    this.models.ServiceMaster = connection.model('ServiceMaster', serviceMasterSchema);
    this.models.UserActivityLog = connection.model('UserActivityLog', userActivityLogSchema);
 
    logger.info('MongoDB Service initialized with ti_easy_service database');
  }
 
 
  async generateTicketNumber() {
  const counter = await this.models.Counter.findOneAndUpdate(
    { _id: 'service_request' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  )
 
  return `SR${String(counter.seq).padStart(7, '0')}`
}
 
  // User Master Methods
  async createOrUpdateUserMaster(phoneNumber, userData) {
    try {
      const user = await this.models.UserMaster.findOneAndUpdate(
        { userPhoneNumber: phoneNumber },
        {
          ...userData,
          updatedAt: new Date()
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      );
      logger.info('UserMaster saved/updated:', { phoneNumber });
      return user;
    } catch (error) {
      logger.error('Error saving UserMaster:', error);
      throw error;
    }
  }
 
  // Service Master Methods
  async createServiceMaster(serviceData) {
    try {
      // const issue = new this.models.ServiceMaster(issueData);
      const ticketNumber = await this.generateTicketNumber()
 
const service = new this.models.ServiceMaster({
  ...serviceData,
  ticketNumber
})
 
      await service.save();
      logger.info('ServiceMaster created:', { ticketNumber: service.ticketNumber });
      return service;
    } catch (error) {
      logger.error('Error creating ServiceMaster:', error);
      throw error;
    }
  }
 
  async updateServiceMaster(ticketNumber, updateData) {
    try {
      const service = await this.models.ServiceMaster.findOneAndUpdate(
        { ticketNumber },
        updateData,
        { new: true }
      );
      logger.info('ServiceMaster updated:', { ticketNumber });
      return service;
    } catch (error) {
      logger.error('Error updating ServiceMaster:', error);
      throw error;
    }
  }
 
  // User Activity Log Methods
  async startUserActivity(phoneNumber, sessionId = null) {
    try {
      const activity = new this.models.UserActivityLog({
        userPhoneNumber: phoneNumber,
        sessionId: sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
      });
      await activity.save();
      logger.info('User activity started:', { phoneNumber, sessionId: activity.sessionId });
      return activity;
    } catch (error) {
      logger.error('Error starting user activity:', error);
      throw error;
    }
  }
 
  async logStepActivity(phoneNumber, step, sessionId = null) {
    try {
      const stepField = `step${step}Timestamp`;
      const update = { [stepField]: new Date() };
     
      if (step === 7) {
        update.conversationCompleted = true;
      }
 
      const query = { userPhoneNumber: phoneNumber };
      if (sessionId) {
        query.sessionId = sessionId;
      } else {
        // Get latest session if not provided
        const latest = await this.models.UserActivityLog.findOne(
          { userPhoneNumber: phoneNumber, conversationCompleted: false }
        ).sort({ timestampStarted: -1 });
       
        if (latest) {
          query.sessionId = latest.sessionId;
        }
      }
 
      const activity = await this.models.UserActivityLog.findOneAndUpdate(
  query,
  {
    $setOnInsert: {
      userPhoneNumber: phoneNumber,
      sessionId: query.sessionId || `sess_${Date.now()}`,
      timestampStarted: new Date()
    },
    ...update
  },
  {
    new: true,
    upsert: true   // 🔥 REQUIRED
  }
);
 
 
      logger.info('Step activity logged:', { phoneNumber, step });
      return activity;
    } catch (error) {
      logger.error('Error logging step activity:', error);
      throw error;
    }
  }
 
  // Complete service booking
  async completeServiceBooking(userData, session) {
    try {
      // 1. Update User Master
      await this.createOrUpdateUserMaster(userData.phoneNumber, {
        userProfileName: userData.displayName,
        completeAddress: session?.location?.address,
        //locationPin: this.extractPincode(session?.location?.address),
        userConsent: userData.consentGiven
      });
 
      // 2. Create Service Master
      const serviceMaster = await this.createServiceMaster({
        categoryName: this.getCategoryName(session?.selectedCategory),
        serviceType: this.getServiceType(session?.selectedService),
        userReported: userData.phoneNumber,
        customerAddress: session?.location?.address || null,
        selectedSlot: session?.selectedSlots?.[0]
          ? {
              date: session.selectedSlots[0].dateDisplay,
              time: session.selectedSlots[0].time,
              period: session.selectedSlots[0].period,
              display: session.selectedSlots[0].display
            }
          : null,
        customerLocation: {
          latitude: session?.location?.coordinates?.[1] || null,
          longitude: session?.location?.coordinates?.[0] || null
        },
        createdDate: new Date(),
        ticketStatus: 'new'
      });
 
      // 3. Log final step
      await this.logStepActivity(userData.phoneNumber, 7);
 
      logger.info('Service booking completed in MongoDB', {
        phoneNumber: userData.phoneNumber,
        ticketNumber: serviceMaster.ticketNumber
      });
 
      return {
        userMasterUpdated: true,
        serviceMasterCreated: true,
        ticketNumber: serviceMaster.ticketNumber
      };
    } catch (error) {
      logger.error('Error completing service booking:', error);
      throw error;
    }
  }
 
  // Helper methods
  extractPincode(address) {
    if (!address) return null;
    // Simple pincode extraction (Indian format: 6 digits)
    const pincodeMatch = address.match(/\b\d{6}\b/);
    return pincodeMatch ? pincodeMatch[0] : null;
  }
 
  // getBrandName(brandId) {
  //   const brandMap = {
  //     'montra': 'Montra',
  //     'bsa': 'BSA',
  //     'hercules': 'Hercules',
  //     'mach_city': 'Mach City'
  //   };
  //   return brandMap[brandId] || brandId;
  // }
  getCategoryName(categoryId) {
    const categoryMap = {
      bicycle: 'Bicycle',
      e_cycle: 'E-cycle',
      fitness: 'Fitness Equipment'
    }
 
    return categoryMap[categoryId] || categoryId
}
 
 
  // getServiceType(serviceId) {
  //   const serviceMap = {
  //     'frame_chain_pedal': 'Frame/Chain/Pedal',
  //     'tyre_tube_brake': 'Tyre/Tube/Brake',
  //     'other': 'Other Services',
  //     'frame_chain': 'Frame/Chain',
  //     'tyre_brake': 'Tyre/Brake'
  //   };
  //   return serviceMap[serviceId] || serviceId;
  // }
 
  getServiceType(serviceId) {
    const serviceMap = {
      basic_service: "Basic Service",
      advanced_service: "Advanced Service"
    }
    return serviceMap[serviceId] || serviceId
  }
 
 
  // Get user's latest activity
  async getUserLatestActivity(phoneNumber) {
    try {
      return await this.models.UserActivityLog.findOne(
        { userPhoneNumber: phoneNumber }
      ).sort({ timestampStarted: -1 });
    } catch (error) {
      logger.error('Error getting user activity:', error);
      return null;
    }
  }
 
  // Get all tickets for a user
  async getUserTickets(phoneNumber) {
    try {
      return await this.models.ServiceMaster.find(
        { userReported: phoneNumber }
      ).sort({ createdDate: -1 });
    } catch (error) {
      logger.error('Error getting user tickets:', error);
      return [];
    }
  }
}
 
// Singleton instance
const mongoService = new MongoService();
module.exports = mongoService;










// const mongoose = require('mongoose');
// require('dotenv').config();
// const logger = require('../utils/logger');
// const counterSchema = require('../models/counter')
 
// class MongoService {
//   constructor() {
//     this.models = {};
//     this.initializeModels();
//   }
 
//   initializeModels() {
//     // Read MongoDB URI from .env with fallback
//     const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ti_easy_service';
   
//     // Create connection to ti_easy_service database
//     const connection = mongoose.createConnection(mongoURI, {
//       useNewUrlParser: true,
//       useUnifiedTopology: true,
//       maxPoolSize: 10
//     });
 
//     connection.on('connected', () => {
//       logger.info('MongoService connected to ti_easy_service database');
//     });
 
//     connection.on('error', (err) => {
//       logger.error('MongoService connection error:', err);
//     });
// this.models.Counter = connection.model('Counter', counterSchema)
 
 
//   const userMasterSchema = new mongoose.Schema({
//       userProfileName: { type: String, default: null },
//       userPhoneNumber: {
//         type: String,
//         required: true,
//         unique: true,
//         index: true
//       },
//       completeAddress: { type: String, default: null },
//       locationPin: { type: String, default: null },
//       userConsent: { type: Boolean, default: false },
//       rating: { type: Number, default: null, min: 1, max: 5 },
//       rank: { type: String, default: null },
//       createdAt: { type: Date, default: Date.now },
//       updatedAt: { type: Date, default: Date.now }
//     });
 
//     // Service Master Schema
//     const serviceMasterSchema = new mongoose.Schema({
//       ticketNumber: {
//         type: String,
//         required: true,
//         unique: true,
//       },
//       categoryName: { type: String, default: null },
//       serviceType: { type: String, default: null },
//       userReported: { type: String, default: null }, // Phone number
//       createdDate: { type: Date, default: Date.now },
//       createdBy: { type: String, default: 'WhatsApp Bot' },
//       assignedDate: { type: Date, default: null },
//       assignedTo: { type: String, default: null },
//       whoAssigned: { type: String, default: null },
//       ticketStatus: {
//         type: String,
//         enum: ['new', 'pending', 'assigned', 'in_progress', 'completed', 'cancelled'],
//         default: 'new'
//       },
//       mechanicComments: { type: String, default: null },
//       paymentReceived: { type: Boolean, default: false },
//       invoiceNumber: { type: String, default: null },
//       jobCardNumber: { type: String, default: null },
//       rating: { type: Number, default: null, min: 1, max: 5 }
//     });
 
//     // User Activity Log Schema
//     const userActivityLogSchema = new mongoose.Schema({
//       userPhoneNumber: {
//         type: String,
//         required: true,
//         index: true
//       },
//       timestampStarted: { type: Date, default: Date.now },
//       step0Timestamp: { type: Date, default: null },
//       step1Timestamp: { type: Date, default: null },
//       step2Timestamp: { type: Date, default: null },
//       step3Timestamp: { type: Date, default: null },
//       step4Timestamp: { type: Date, default: null },
//       step5Timestamp: { type: Date, default: null },
//       step6Timestamp: { type: Date, default: null },
//       step7Timestamp: { type: Date, default: null },
//       conversationCompleted: { type: Boolean, default: false },
//       sessionId: { type: String, default: null }
//     });
 
// // Register models with ti_easy_service database
//     this.models.UserMaster = connection.model('UserMaster', userMasterSchema);
//     this.models.ServiceMaster = connection.model('ServiceMaster', serviceMasterSchema);
//     this.models.UserActivityLog = connection.model('UserActivityLog', userActivityLogSchema);
 
//     logger.info('MongoDB Service initialized with ti_easy_service database');
//   }
 
 
//   async generateTicketNumber() {
//   const counter = await this.models.Counter.findOneAndUpdate(
//     { _id: 'service_request' },
//     { $inc: { seq: 1 } },
//     { new: true, upsert: true }
//   )
 
//   return `SR${String(counter.seq).padStart(7, '0')}`
// }
 
//   // User Master Methods
//   async createOrUpdateUserMaster(phoneNumber, userData) {
//     try {
//       const user = await this.models.UserMaster.findOneAndUpdate(
//         { userPhoneNumber: phoneNumber },
//         {
//           ...userData,
//           updatedAt: new Date()
//         },
//         {
//           upsert: true,
//           new: true,
//           setDefaultsOnInsert: true
//         }
//       );
//       logger.info('UserMaster saved/updated:', { phoneNumber });
//       return user;
//     } catch (error) {
//       logger.error('Error saving UserMaster:', error);
//       throw error;
//     }
//   }
 
//   // Service Master Methods
//   async createServiceMaster(serviceData) {
//     try {
//       // const issue = new this.models.ServiceMaster(issueData);
//       const ticketNumber = await this.generateTicketNumber()
 
// const service = new this.models.ServiceMaster({
//   ...serviceData,
//   ticketNumber
// })
 
//       await service.save();
//       logger.info('ServiceMaster created:', { ticketNumber: service.ticketNumber });
//       return service;
//     } catch (error) {
//       logger.error('Error creating ServiceMaster:', error);
//       throw error;
//     }
//   }
 
//   async updateServiceMaster(ticketNumber, updateData) {
//     try {
//       const service = await this.models.ServiceMaster.findOneAndUpdate(
//         { ticketNumber },
//         updateData,
//         { new: true }
//       );
//       logger.info('ServiceMaster updated:', { ticketNumber });
//       return service;
//     } catch (error) {
//       logger.error('Error updating ServiceMaster:', error);
//       throw error;
//     }
//   }
 
//   // User Activity Log Methods
//   async startUserActivity(phoneNumber, sessionId = null) {
//     try {
//       const activity = new this.models.UserActivityLog({
//         userPhoneNumber: phoneNumber,
//         sessionId: sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
//       });
//       await activity.save();
//       logger.info('User activity started:', { phoneNumber, sessionId: activity.sessionId });
//       return activity;
//     } catch (error) {
//       logger.error('Error starting user activity:', error);
//       throw error;
//     }
//   }
 
//   async logStepActivity(phoneNumber, step, sessionId = null) {
//     try {
//       const stepField = `step${step}Timestamp`;
//       const update = { [stepField]: new Date() };
     
//       if (step === 7) {
//         update.conversationCompleted = true;
//       }
 
//       const query = { userPhoneNumber: phoneNumber };
//       if (sessionId) {
//         query.sessionId = sessionId;
//       } else {
//         // Get latest session if not provided
//         const latest = await this.models.UserActivityLog.findOne(
//           { userPhoneNumber: phoneNumber, conversationCompleted: false }
//         ).sort({ timestampStarted: -1 });
       
//         if (latest) {
//           query.sessionId = latest.sessionId;
//         }
//       }
 
//       const activity = await this.models.UserActivityLog.findOneAndUpdate(
//   query,
//   {
//     $setOnInsert: {
//       userPhoneNumber: phoneNumber,
//       sessionId: query.sessionId || `sess_${Date.now()}`,
//       timestampStarted: new Date()
//     },
//     ...update
//   },
//   {
//     new: true,
//     upsert: true   // 🔥 REQUIRED
//   }
// );
 
 
//       logger.info('Step activity logged:', { phoneNumber, step });
//       return activity;
//     } catch (error) {
//       logger.error('Error logging step activity:', error);
//       throw error;
//     }
//   }
 
//   // Complete service booking
//   async completeServiceBooking(userData, session) {
//     try {
//       // 1. Update User Master
//       await this.createOrUpdateUserMaster(userData.phoneNumber, {
//         userProfileName: userData.displayName,
//         completeAddress: session?.location?.address,
//         //locationPin: this.extractPincode(session?.location?.address),
//         userConsent: userData.consentGiven
//       });
 
//       // 2. Create Service Master
//       const serviceMaster = await this.createServiceMaster({
//         categoryName: this.getCategoryName(session?.selectedCategory),
//         serviceType: this.getServiceType(session?.selectedService),
//         userReported: userData.phoneNumber,
//         createdDate: new Date(),
//         ticketStatus: 'new'
//       });
 
//       // 3. Log final step
//       await this.logStepActivity(userData.phoneNumber, 7);
 
//       logger.info('Service booking completed in MongoDB', {
//         phoneNumber: userData.phoneNumber,
//         ticketNumber: serviceMaster.ticketNumber
//       });
 
//       return {
//         userMasterUpdated: true,
//         serviceMasterCreated: true,
//         ticketNumber: serviceMaster.ticketNumber
//       };
//     } catch (error) {
//       logger.error('Error completing service booking:', error);
//       throw error;
//     }
//   }
 
//   // Helper methods
//   extractPincode(address) {
//     if (!address) return null;
//     // Simple pincode extraction (Indian format: 6 digits)
//     const pincodeMatch = address.match(/\b\d{6}\b/);
//     return pincodeMatch ? pincodeMatch[0] : null;
//   }
 
//   // getBrandName(brandId) {
//   //   const brandMap = {
//   //     'montra': 'Montra',
//   //     'bsa': 'BSA',
//   //     'hercules': 'Hercules',
//   //     'mach_city': 'Mach City'
//   //   };
//   //   return brandMap[brandId] || brandId;
//   // }
//   getCategoryName(categoryId) {
//     const categoryMap = {
//       bicycle: 'Bicycle',
//       e_cycle: 'E-cycle',
//       fitness: 'Fitness Equipment'
//     }
 
//     return categoryMap[categoryId] || categoryId
// }
 
 
//   // getServiceType(serviceId) {
//   //   const serviceMap = {
//   //     'frame_chain_pedal': 'Frame/Chain/Pedal',
//   //     'tyre_tube_brake': 'Tyre/Tube/Brake',
//   //     'other': 'Other Services',
//   //     'frame_chain': 'Frame/Chain',
//   //     'tyre_brake': 'Tyre/Brake'
//   //   };
//   //   return serviceMap[serviceId] || serviceId;
//   // }
 
//   getServiceType(serviceId) {
//     const serviceMap = {
//       basic_service: "Basic Service",
//       advanced_service: "Advanced Service"
//     }
//     return serviceMap[serviceId] || serviceId
//   }
 
 
//   // Get user's latest activity
//   async getUserLatestActivity(phoneNumber) {
//     try {
//       return await this.models.UserActivityLog.findOne(
//         { userPhoneNumber: phoneNumber }
//       ).sort({ timestampStarted: -1 });
//     } catch (error) {
//       logger.error('Error getting user activity:', error);
//       return null;
//     }
//   }
 
//   // Get all tickets for a user
//   async getUserTickets(phoneNumber) {
//     try {
//       return await this.models.ServiceMaster.find(
//         { userReported: phoneNumber }
//       ).sort({ createdDate: -1 });
//     } catch (error) {
//       logger.error('Error getting user tickets:', error);
//       return [];
//     }
//   }
// }
 
// // Singleton instance
// const mongoService = new MongoService();
// module.exports = mongoService;
