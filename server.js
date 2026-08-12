require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const { initializeDatabase, closeDatabase } = require('./src/config/database');

const PORT = process.env.PORT || 3000;

initializeDatabase();

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`TaskFlow API running on port ${PORT}`);
});

function shutdown() {
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = server;
