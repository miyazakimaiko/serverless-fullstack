/**
 *　データベースから指定のユーザーの投稿する一件の投稿データを取得し、インスタとTikTokに投稿します。
 */
const { Client } = require('pg');
const { SSMClient } = require('@aws-sdk/client-ssm');
const { clientConfig } = require('../../utils/db-client.js');
const { getEncryptionKeyFromSsm } = require('../../utils/client-ssm.js');
const tokensUtils = require('./utils/tokens.js');
const postsUtils = require('./utils/posts.js');
const instaPublisher = require('./publishers/instagram.js');
const tiktokPublisher = require('./publishers/tiktok.js');
const { STATUS } = require('./utils/enums.js');

exports.handler = async (event) => {
  const ssmClient = new SSMClient();
  const pgClient = new Client(clientConfig);
  let userId;

  try {
    await pgClient.connect();

    userId = event.userId;

    const encryptionKey = await getEncryptionKeyFromSsm(ssmClient);

    const instaTokens = await tokensUtils.getInstaTokens({
      pgClient,
      encryptionKey,
      userId,
    });

    const tiktokTokens = await tokensUtils.getTikTokTokens({
      pgClient,
      encryptionKey,
      userId,
    });

    if (!instaTokens && !tiktokTokens) {
      console.log(`インスタ・TikTok共にアカウントが登録されていません。投稿をスキップします | userId: ${userId}`);
      return; 
    }

    const postToPublish = await postsUtils.getPostMetadataToPublish({
      pgClient,
      userId,
    });

    if (!postToPublish) {
      console.log(`投稿するポストが見つかりません。投稿をスキップします | userId: ${userId}`);
      return;
    }

    const instaPublisherPromise = instaPublisher.main({
      userId,
      tokens: instaTokens,
      postToPublish,
    });

    const tiktokPublisherPromise = tiktokPublisher.main({
      userId,
      tokens: tiktokTokens,
      postToPublish,
    });

    const [instaRes, tikTokRes] = await Promise.all([
      instaPublisherPromise,
      tiktokPublisherPromise,
    ]);

    const responses = {
      insta: instaRes,
      tiktok: tikTokRes,
    };

    if (responses.insta.status === STATUS.FAILED) {
      console.error('インスタ投稿失敗:', responses.insta.error);
    }

    if (responses.tiktok.status === 'failed') {
      console.error('インスタ投稿失敗:', responses.tiktok.error);

    }

    if (responses.insta.status === 'completed'
      || responses.tiktok.status === 'completed'
    ) {
      await postsUtils.updateLastPostedTimestamp({
        pgClient, 
        postId: postToPublish.id,
      });
    }

  } catch (error) {
    console.error(`投稿失敗 | userId: ${userId}`, error);
  } finally {
    pgClient.end();
  }
}
