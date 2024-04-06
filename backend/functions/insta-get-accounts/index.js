import { headers } from '../../utils/http-response.js';

const facebookApiUrl = 'https://graph.facebook.com/v19.0';

/**
 * @descirtion https://graph.facebook.com/v19.0 を使用し長期ユーザーアクセストークンを取得
 */
export async function handler(event) {
  try {
    const { fbUserId, accessToken } = event.queryStringParameters;

    const tokenRes = await getUserLongLivedAccessToken(accessToken);

    console.log({ tokenRes })

    if (tokenRes.error) {
      console.error('レスポンス内エラー', tokenRes.error);
      throw Error('長期ユーザートークン取得失敗');
    }

    const res = await getFbPages({
      fbUserId,
      accessToken: tokenRes.accessToken
    });
    console.log({ res })
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        res,
      }),
    };
  } catch (error) {
    console.error('失敗', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: '失敗しました',
        // @ts-ignore
        error: error.message || error,
      }),
    };
  }
}

/**
 * @description
 */
const getUserLongLivedAccessToken = async (accessToken, baseUrl = facebookApiUrl) => {
  try {
    const queryParams = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: '942588953810826',
      client_secret: 'a479a0f9f9bdd461f31c0980d0127a14',
      fb_exchange_token: accessToken,
    });

    const getQueryRes = await fetch(`${baseUrl}/oauth/access_token?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
       },
    });
    const jsonRes = await getQueryRes.json();

    return {
      accessToken: jsonRes.access_token,
      tokenType: jsonRes.token_type
    };
  } catch (error) {
    console.error('長期ユーザーアクセストークン取得失敗', error);
    throw error;
  }
}

const getFbPages = async ({ fbUserId, accessToken, baseUrl = facebookApiUrl }) => {
  try {
    const queryParams = new URLSearchParams({
      access_token: accessToken,
    });

    const accountsRes = await fetch(`${baseUrl}/${fbUserId}/accounts?${queryParams}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
       },
    });

    const page = await accountsRes.json();
    return page.data;
  } catch (error) {
    console.error('Facebookページリスト取得失敗', error);
    throw error;
  }
}