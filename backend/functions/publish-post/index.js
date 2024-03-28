import { Client } from 'pg';
import { SSMClient } from '@aws-sdk/client-ssm';
import { clientConfig } from '../../utils/db.js';
import { getEncryptionKeyFromSsm } from '../../utils/ssm.js';
import { instaPublisher } from './publishers/instagram.js';
import { tiktokPublisher } from './publishers/tiktok.js';
import * as tokenUtils from './utils/tokens.js';
import * as postUtils from './utils/posts.js';
import { STATUS } from './utils/enums.js';

const parameterName = process.env.SSM_ENCRYPTION_KEY_PARAMETER_NAME;

/**
 *　@description データベースから指定のユーザーの投稿する一件の投稿データを取得し、インスタとTikTokに投稿
 */
export async function handler(event) {
  const ssmClient = new SSMClient();
  const pgClient = new Client(clientConfig);
  let userId;

  try {
    await pgClient.connect();

    const messageBody = JSON.parse(event.Records[0].body);

    userId = messageBody.userId;

    const encryptionKey = await getEncryptionKeyFromSsm({ ssmClient, parameterName });

    const instaTokens = await tokenUtils.getInstaTokens({
      pgClient,
      encryptionKey,
      userId,
    });

    const tiktokTokens = await tokenUtils.getTikTokTokens({
      pgClient,
      ssmClient,
      encryptionKey,
      userId,
    });

    if (!instaTokens && !tiktokTokens) {
      console.log(`インスタ・TikTok共にアカウントが登録されていません。投稿をスキップします | userId: ${userId}`);
      return; 
    }

    const postToPublish = await postUtils.getPostMetadataToPublish({
      pgClient,
      userId,
    });

    if (!postToPublish) {
      console.log(`投稿するポストが見つかりません。投稿をスキップします | userId: ${userId}`);
      return;
    }

    const instaPublisherPromise = instaPublisher({
      userId,
      tokens: instaTokens,
      postToPublish,
    });

    const tiktokPublisherPromise = tiktokPublisher({
      userId,
      tokens: tiktokTokens,
      postToPublish,
    });

    const [
      instaRes, 
      tikTokRes,
    ] = await Promise.all([
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

    if (responses.tiktok.status === STATUS.FAILED) {
      console.error('TikTok投稿失敗:', responses.tiktok.error);
    }

    if (
      responses.insta.status === STATUS.COMPLETED
      || responses.tiktok.status === STATUS.COMPLETED
    ) {
      await postUtils.updateLastPostedTimestamp({
        pgClient, 
        postId: postToPublish.id,
      });
    }
    console.log('投稿完了');
  } catch (error) {
    console.error(`投稿失敗 | userId: ${userId}`, error);
  } finally {
    pgClient.end();
  }
}
