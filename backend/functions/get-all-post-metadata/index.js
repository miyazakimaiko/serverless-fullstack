
import { Client } from 'pg';
import { headers } from '../../utils/http-response.js';
import { clientConfig } from '../../utils/db.js';

/**
 *　@description データベースから、指定のユーザーが保持する全投稿のメタデータを取得します
 */
export async function handler(event) {
  const pgClient = new Client(clientConfig);

  try {
    const { userId } = event.pathParameters;

    await pgClient.connect();

    const selectionQuery = `
      SELECT id, caption, extension, created_at, last_posted_at
      FROM post
      WHERE user_id = $1
      ORDER BY created_at
    `;
    const res = await pgClient.query(selectionQuery, [
      userId,
    ]);

    let posts = [];

    if (res.rows.length > 0) {
      const index = getLatestPostIndex(res.rows);
      posts = normalizeAndCalculatePostMetadata({
        posts: res.rows,
        latestPostIndex: index,
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        posts,
      }),
    };
  } catch (error) {
    console.error('投稿情報の取得に失敗しました', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: '投稿情報の取得に失敗しました',
        // @ts-ignore
        error: error.message || error,
      }),
    };
  } finally {
    await pgClient.end();
  }
}

const getLatestPostIndex = (posts) => {
  let index = 0;
  let latestPost = posts[index];
  
  if (!latestPost.last_posted_at) {
    // もし一番古いポストがまだ一度も投稿されていない場合は、最新投稿を最新登録投稿とする
    index = posts.length - 1;
  } else {
    // そうでなければ、ループで最新投稿ポストを探す
    for (let i = 1; i < posts.length; i++) {
      const current = posts[i];
      if (!current.last_posted_at) {
        i = posts.length;
      } else if (latestPost.last_posted_at < current.last_posted_at) {
        index = i;
        latestPost = current;
      }
    }
  }
  return index;
}

const normalizeAndCalculatePostMetadata = ({ posts, latestPostIndex }) => {
  let index = latestPostIndex;
  let counter = isBeforeNoon() ? posts.length - 1 : posts.length;
  // const startDate = isBeforeNoon() ? new Date() : new Date().setDate(new Date().getDate() - 1);
  do {
    const nextPostDate = new Date();
    nextPostDate.setDate(nextPostDate.getDate() + counter);
    nextPostDate.setHours(12, 0, 0, 0);
    posts[index] = {
      id: posts[index].id,
      extension: posts[index].extension,
      caption: posts[index].caption,
      createdAt: posts[index].created_at,
      lastPostedAt: posts[index].last_posted_at,
      nextPostedAt: nextPostDate,
    }
    index--;
    counter--;
    if (!posts[index]) index = posts.length - 1;
  } while (index !== latestPostIndex)
  return posts;
}

const isBeforeNoon = () => new Date().getHours() < 12;