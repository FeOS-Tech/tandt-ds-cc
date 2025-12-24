const mongoose = require('mongoose');
const { config } = require('./index');
const logger = require('../utils/logger');

class Database {
  constructor() {
    this.mongoose = mongoose;
    this.isConnected = false;
  }

  async connect() {
    try {
      if (this.isConnected) {
        logger.info('Using existing database connection');
        return;
      }

      logger.info('Connecting to MongoDB...', {
        uri: config.database.mongoURI.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@') // Hide credentials in logs
      });

      await mongoose.connect(config.database.mongoURI, config.database.options);
      
      this.isConnected = true;
      
      // Event listeners for connection
      mongoose.connection.on('connected', () => {
        logger.info('✅ MongoDB connected successfully');
      });

      mongoose.connection.on('error', (err) => {
        logger.error('❌ MongoDB connection error:', err);
        this.isConnected = false;
      });

      mongoose.connection.on('disconnected', () => {
        logger.warn('⚠️ MongoDB disconnected');
        this.isConnected = false;
      });

      // Graceful shutdown
      process.on('SIGINT', async () => {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed through app termination');
        process.exit(0);
      });

    } catch (error) {
      logger.error('Failed to connect to MongoDB:', error);
      process.exit(1);
    }
  }

  async disconnect() {
    try {
      await mongoose.connection.close();
      this.isConnected = false;
      logger.info('MongoDB disconnected successfully');
    } catch (error) {
      logger.error('Error disconnecting from MongoDB:', error);
    }
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      readyState: mongoose.connection.readyState,
      host: mongoose.connection.host,
      name: mongoose.connection.name,
      models: Object.keys(mongoose.models)
    };
  }
}

module.exports = new Database();