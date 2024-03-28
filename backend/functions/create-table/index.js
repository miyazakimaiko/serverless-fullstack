
import { Client } from 'pg';
import { clientConfig } from '../../utils/db.js';

/**
 * @description このヘルパー関数は指定されたデータベース内にテーブルを作成するためのものです
 * 直接AWSコンソールから呼び出して使えます
 */
export async function handler() {
  const pgClient = new Client(clientConfig);

  try {
    await pgClient.connect();

    const createPostTableStatement = `
      CREATE TABLE IF NOT EXISTS post (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        caption TEXT,
        extension VARCHAR(5) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_posted_at TIMESTAMP
      );
    `;

    const createTikTokAccountTableStatement = `
      CREATE TABLE IF NOT EXISTS tiktok_account (
        user_id VARCHAR(255) NOT NULL,
        open_id VARCHAR(255),
        encrypted_access_token TEXT,
        encrypted_refresh_token TEXT,
        access_expires_at TIMESTAMP,
        refresh_expires_at TIMESTAMP
      );
    `;
    
    const createInstaAccountTableStatement = `
      CREATE TABLE IF NOT EXISTS insta_account (
        user_id VARCHAR(255) NOT NULL,
        account_id VARCHAR(255) NOT NULL UNIQUE,
        encrypted_access_token TEXT NOT NULL
      );
    `;

    await pgClient.query(createPostTableStatement);
    await pgClient.query(createTikTokAccountTableStatement);
    await pgClient.query(createInstaAccountTableStatement);

    return 'テーブルが作成されました';
  } catch (error) {
    console.error(error);
    return 'テーブル作成失敗';
  } finally {
    await pgClient.end();
  }
}
