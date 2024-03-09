/**
 * このヘルパー関数は、指定されたデータベース内にテーブルを作成するためのものです。
 * 直接コンソールから呼び出して使えます。
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_posted_at TIMESTAMP
      );
    `;

    await pgClient.query(createTableQuery);

    console.log('テーブルが作成されました')
  } catch (error) {
    console.error('テーブル作成失敗', error);
  } finally {
    await pgClient.end();
  }
}
