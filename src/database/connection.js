const mongoose = require('mongoose');

async function connectToDatabase(uri) {
  const connectionUri = uri || process.env.MONGODB_URI || 'mongodb://localhost:27017/s14s-identify';
  await mongoose.connect(connectionUri);
  return mongoose.connection;
}

async function disconnectFromDatabase() {
  await mongoose.disconnect();
}

module.exports = { connectToDatabase, disconnectFromDatabase };
