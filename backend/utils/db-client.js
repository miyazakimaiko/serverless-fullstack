const host = process.env.DB_ENDPOINT;
const database = process.env.DB_NAME;
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;

export const clientConfig = {
  host,
  database,
  user,
  password,
  port: 5432,
  ssl: {
    rejectUnauthorized: false,
  },
};