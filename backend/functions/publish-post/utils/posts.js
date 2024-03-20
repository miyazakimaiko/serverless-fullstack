
/**
 * 投稿の選別基準: 毎日一定時刻ににインスタとTikTokに１つ投稿
 * 投稿順序はデータ登録順として、最後の投稿内容の投稿後は最初に戻る
 */
export const getPostMetadataToPublish = async ({ pgClient, userId }) => {
  try {
    const selectStatement = `
      SELECT id, caption, extension, created_at, last_posted_at
      FROM post
      WHERE user_id = $1
      ORDER BY created_at
    `;

    const { rows: posts } = await pgClient.query(selectStatement, [
      userId,
    ]);

    if (posts.length <= 0) {
      return;
    }

    let postToPublish = posts[0];

    // 一番古いポストがまだ一度も投稿されていない場合は、この一番古いポストを投稿します
    // そうでなければ、ループで投稿するポストを探します
    if (postToPublish?.last_posted_at) {
      for (let i = 1; i < posts.length; i++) {
        const current = posts[i];
        const next = posts[i + 1];
        if (!current) {
          i = posts.length; // ループ強制終了
        }
        else if (!current.last_posted_at) {
          postToPublish = current;
          i = posts.length; // ループ強制終了
        }
        else if (!next) {
          i = posts.length; // ループ強制終了
        }
        else if (!next.last_posted_at || (current.last_posted_at > next.last_posted_at)) {
          postToPublish = next;
          i = posts.length; // ループ強制終了
        }
      }
    }
    return postToPublish;
  } catch (error) {
    console.error('投稿メタデータ取得失敗', error);
    throw error;
  }
}

export const updateLastPostedTimestamp = async ({ pgClient, postId }) => {
  try {
    const updateStatement = `
      UPDATE post 
      SET last_posted_at = $1
      WHERE id = $2
    `;
    const updatedRes = await pgClient.query(updateStatement, [
      new Date(),
      postId,
    ]);
    return updatedRes;
  } catch (error) {
    console.error('投稿日更新失敗', error);
    throw error;
  }
}