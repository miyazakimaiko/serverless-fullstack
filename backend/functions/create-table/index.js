/**
 * このヘルパー関数は指定されたデータベース内にテーブルを作成するためのものです。
 * 直接AWSコンソールから呼び出して使えます。
 */

const { Client } = require('pg');
const { clientConfig } = require('../../utils/db-client');

exports.handler = async () => {
  const pgClient = new Client(clientConfig);

  try {
    await pgClient.connect();

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS post (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        caption TEXT,
        extension VARCHAR(5) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_posted_at TIMESTAMP
      );
    `;

    const createTikTokAccountTableQuery = `
      CREATE TABLE IF NOT EXISTS tiktok_account (
        user_id VARCHAR(255) NOT NULL,
        tiktok_user_id VARCHAR(255),
        client_key VARCHAR(255) NOT NULL,
        encrypted_client_secret TEXT NOT NULL,
        encrypted_access_token TEXT,
        access_expired_at TIMESTAMP,
        encrypted_refresh_token TEXT,
        refresh_expired_at TIMESTAMP,
        token_scope VARCHAR(255),
        token_type VARCHAR(20),
      );
    `;

    const createInstaAccountTableQuery = `
    CREATE TABLE IF NOT EXISTS insta_account (
      user_id VARCHAR(255) NOT NULL,
      account_id VARCHAR(255) NOT NULL,
      encrypted_access_token TEXT NOT NULL
    );
  `;

    await pgClient.query(createTableQuery);
    await pgClient.query(createTikTokAccountTableQuery);
    await pgClient.query(createInstaAccountTableQuery);

    return 'テーブルが作成されました';
  } catch (error) {
    console.error('テーブル作成失敗', error);
  } finally {
    await pgClient.end();
  }
}
