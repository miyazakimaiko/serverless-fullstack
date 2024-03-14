export const publishPostToTikTok = async ({ accountId, accessToken, postMetadata }) => {

  //   curl--location 'https://open.tiktokapis.com/v2/post/publish/video/init/' \
  //   --header 'Authorization: Bearer act.example12345Example12345Example' \
  //   --header 'Content-Type: application/json; charset=UTF-8' \
  //   --data - raw '{
  //   "post_info": {
  //     "title": "this will be a funny #cat video on your @tiktok #fyp",
  //       "privacy_level": "MUTUAL_FOLLOW_FRIENDS",
  //         "disable_duet": false,
  //           "disable_comment": true,
  //             "disable_stitch": false,
  //               "video_cover_timestamp_ms": 1000
  //   },
  //   "source_info": {
  //     "source": "PULL_FROM_URL",
  //       "video_url": "https://example.verified.domain.com/example_video.mp4",
  //   }
  // }'

  const creatorMetadata = getCreatorMetadata({
    accessToken,
  });


  const { caption, extension, postId } = postMetadata;

  publishVideo({

  })
}

const getCreatorMetadata = async ({ accessToken }) => {
  const url = 'https://open.tiktokapis.com/v2/post/publish/creator_info/query/';

  const mediaQueryRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return await mediaQueryRes.json();
}

const publishVideo = async ({ caption, extension, postId }) => {
  const url = `https://open.tiktokapis.com/v2/post/publish/video/init/`;
  const mediaBucketName = process.env.MEDIA_BUCKET_NAME;

  const body = {
    post_info: {
      title: caption,
      privacy_level: 'MUTUAL_FOLLOW_FRIENDS',
      disable_duet: false,
      disable_comment: true,
      disable_stitch: false,
      video_cover_timestamp_ms: 1000
    },
    source_info: {
        source: 'PULL_FROM_URL',
        video_url: `http://${mediaBucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${userId}/${postId}.${extension}`,
    }
  }

  const publishRes = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const mpublishJsonRes = await publishRes.json();
}