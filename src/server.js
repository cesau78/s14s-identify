require('dotenv').config();
const app = require('./app');
const { connectToDatabase } = require('./database/connection');

const PORT = process.env.PORT || 3000;

async function start() {
  await connectToDatabase();
  console.log('Connected to MongoDB');

  app.listen(PORT, () => {
    console.log(`S14S Identify running on port ${PORT}`);
    console.log(`Swagger UI available at http://localhost:${PORT}/api-docs`);
  });
}

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
