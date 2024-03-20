/**
 * https://graph.facebook.com/v19.0 を使用しインスタへ投稿します。
 */
export const main = async ({ userId, postToPublish, tokens }) => {
  try {
    if (!tokens) {
      console.log(`インスタアカウントが登録されていません。インスタ投稿をスキップします | userId ${userId}`);
      return { 
        status: 'skipped',
        userId,
      }
    }
    
    const publishRes = await publishPostToInstagram({
      userId,
      accountId: tokens.accountId, 
      accessToken: tokens.accessToken,
      postMetadata: postToPublish,
    });
  
    if (publishRes.id) {
      console.log(`インスタ投稿成功 | userId ${userId}`);
      return { 
        status: 'completed',
      }
    } else {
      return { 
        status: 'failed',
        error: publishRes,
      }
    }
  } catch (error) {
    return { 
      status: 'failed',
      error,
    }
  }
}

const publishPostToInstagram = async ({ userId, accountId, accessToken, postMetadata }) => {
  const mediaBucketName = process.env.MEDIA_BUCKET_NAME;
  const baseUrl = 'https://graph.facebook.com/v19.0';
  const accountBaseUrl = `${baseUrl}/${accountId}`;

  try {
    const { caption, extension, id: postId } = postMetadata;
  
    const mediaType = determineMediaType(extension);
    const urlParamKey = determineUrlParamKey(extension);
    const mediaQueryUrl = 
      `https://${mediaBucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${userId}/${postId}.${extension}`;
  
    const mediaQueryRes = await sendMediaRequest({
      baseUrl: accountBaseUrl, 
      caption,
      mediaType,
      mediaQueryUrl,
      urlParamKey,
      accessToken,
    });

    let readyToPublish;

    while (!readyToPublish) {
      const statusQueryRes = await sendMediaStatusCheckRequest({
        baseUrl,
        containerId: mediaQueryRes.id,
        accessToken
      })
  
      // 動画を投稿する際は、sendMediaRequest を送った後投稿ができるようになるまで時間がかかるので
      // ここでチェックをしながら待ちます。準備ができたら sendMediaPublishRequest を送ります
      if (statusQueryRes.status_code !== 'IN_PROGRESS') {
        readyToPublish = true;
      } else {
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    }
  
    return await sendMediaPublishRequest({
      baseUrl: accountBaseUrl, 
      creationId: mediaQueryRes.id, 
      accessToken,
    });
  } catch (error) {
    console.error('インスタ投稿失敗', error);
    throw error;
  }
}

const determineMediaType = (extension) => {
  if (extension === 'mp3' || extension === 'mp4') {
    return 'REELS';
  } else {
    return '';
  }
}

const determineUrlParamKey = (extension) => {
  if (extension === 'mp3' || extension === 'mp4') {
    return 'video_url';
  } else {
    return 'image_url';
  }
}

const sendMediaRequest = async ({ baseUrl, caption, mediaType, mediaQueryUrl, urlParamKey, accessToken, }) => {
  try {
    const queryParams = new URLSearchParams({
      [urlParamKey]: mediaQueryUrl,
      media_type: mediaType, //画像だけの投稿なら空、動画だけの投稿なら値をREELS、ストーリーなら値をSTORIESにする
      caption,
    });

    const mediaQueryRes = await fetch(`${baseUrl}/media?${queryParams}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
       },
    });
    return await mediaQueryRes.json();
  } catch (error) {
    console.error('mediaステップ失敗');
    throw error;
  }
}

const sendMediaStatusCheckRequest = async ({ baseUrl, containerId, accessToken }) => {
  try {  
    const statusRes = await fetch(`${baseUrl}/${containerId}?fields=status_code`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
       },
    });
    return await statusRes.json();
  } catch (error) {
    console.error('mediaステータスチェック失敗');
    throw error;
  }
}

const sendMediaPublishRequest = async ({ baseUrl, creationId, accessToken }) => {
  try {
    const publishQueryParams = new URLSearchParams({
      creation_id: creationId
    });
  
    const publishRes = await fetch(`${baseUrl}/media_publish?${publishQueryParams}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
       },
    });
    return await publishRes.json();
  } catch (error) {
    console.error('media_publishステップ失敗');
    throw error;
  }
}