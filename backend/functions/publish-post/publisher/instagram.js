export const publishPostToInstagram = async ({ userId, accountId, accessToken, postMetadata }) => {
  const mediaBucketName = process.env.MEDIA_BUCKET_NAME;
  const baseUrl = 'https://graph.facebook.com/v19.0';
  const accountBaseUrl = `${baseUrl}/${accountId}`;

  const { caption, extension, id: postId } = postMetadata;

  const mediaType = determineMediaType(extension);
  const urlParamKey = determineUrlParamKey(extension);
  const mediaQueryUrl = 
    `http://${mediaBucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${userId}/${postId}.${extension}`;

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
      caption,
      media_type: mediaType //画像だけの投稿なら空、動画だけの投稿なら値をREELS、ストーリーなら値をSTORIESにする
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