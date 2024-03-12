/**
 *　データベースから指定のユーザーの投稿する一件のポストのデータを取得し、インスタとTikTokに投稿します。
 *  投稿順は登録日順です。
 */

const { Client } = require('pg');
const crypto = require('crypto');
const { clientConfig } = require('../../utils/db-client');
const { publishPostToInstagram } = require('./publisher/instagram.js');

exports.handler = async (event) => {
  try {
    const pgClient = new Client(clientConfig);

    const userId = event.userId;
    const postToPublish = await getPostMetadataToPublish({ 
      pgClient, 
      userId,
    });

    const publishRes = await publishPostToInstagram({
      userId,
      accountId: '', 
      accessToken: '', 
      postMetadata: postToPublish,
    });

    if (publishRes.id) {
      console.log('投稿しました');
    } else {
      throw publishRes;
    }

  } catch (error) {
    console.error('投稿失敗', error);
  }
}

const getPostMetadataToPublish = async ({ pgClient, userId }) => {
  try {    
    await pgClient.connect();
  
    const selectionQuery = `
      SELECT id, caption, extension, created_at, last_posted_at
      FROM posts
      WHERE user_id = $1
      ORDER BY created_at
    `;

    const { rows: posts } = await pgClient.query(selectionQuery, [
      userId
    ]);

    let postToPublish = posts[0];

    // もし一番古いポストがまだ一度も投稿されていない場合は、この一番古いポストを投稿する
    // そうでなければ、ループで投稿するポストを探す
    if (postToPublish?.last_posted_at) {
      for (let i = 1; i < posts.length; i++) {
        const current = posts[i];
        const next = posts[i + 1];
        if (!current) {
          i = posts.length; // ループ強制終了
        }
        if (!current.last_posted_at) {
          postToPublish = current;
          i = posts.length; // ループ強制終了
        }
        if (!next) {
          i = posts.length; // ループ強制終了
        }
        if (!next.last_posted_at || current.last_posted_at > next.last_posted_at) {
          postToPublish = next;
          i = posts.length; // ループ強制終了
        }
      }
    }
    return postToPublish;
  } catch (error) {
    console.error('投稿メタデータ取得失敗', error);
    throw error;
  } finally {
    pgClient.end();
  }
}

const decryptToken = (encryptedToken, key) => {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key);
  let decrypted = decipher.update(encryptedToken, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}