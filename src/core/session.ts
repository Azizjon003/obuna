const PostgresSession = require("telegraf-postgres-session");
// const session = memorySession({});

const session = new PostgresSession({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export default session;
