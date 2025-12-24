// scripts/init-mongo.js
const mongoose = require('mongoose');
require('dotenv').config();

async function initializeDatabase() {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ti_easy_service';
    
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('✅ Connected to ti_easy_service database');
    
    // Create indexes for better performance
    const db = mongoose.connection.db;
    
    // Create collections if they don't exist
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    if (!collectionNames.includes('usermasters')) {
      console.log('Creating UserMaster collection...');
      await db.createCollection('usermasters');
    }
    
    if (!collectionNames.includes('issuemasters')) {
      console.log('Creating IssueMaster collection...');
      await db.createCollection('issuemasters');
    }
    
    if (!collectionNames.includes('useractivitylogs')) {
      console.log('Creating UserActivityLog collection...');
      await db.createCollection('useractivitylogs');
    }
    
    console.log('✅ Database initialization completed');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

initializeDatabase();