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
      CREATE TABLE IF NOT EXISTS posts (
        id BIGSERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        caption TEXT,
        extension VARCHAR(5) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_posted_at TIMESTAMP
      );
    `;

    const createTokenTableQuery = `
      CREATE TABLE IF NOT EXISTS accounts (
        user_id VARCHAR(255) NOT NULL,
        sns_name VARCHAR(10) NOT NULL,
        account_id VARCHAR(255) NOT NULL,
        encrypted_token TEXT NOT NULL
      );
    `;

    await pgClient.query(createTableQuery);
    await pgClient.query(createTokenTableQuery);

    console.log('テーブルが作成されました')
  } catch (error) {
    console.error('テーブル作成失敗', error);
  } finally {
    await pgClient.end();
  }
}
