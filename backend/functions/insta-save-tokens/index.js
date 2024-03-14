/**
 *　ユーザーのInstagram長期アクセストークンとアカウントIDをDBにインサートします。
 */

 const { Client } = require('pg');
 const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
 const { headers } = require('../../utils/http-response');
 const { clientConfig } = require('../../utils/db-client');
 const { encryptText } = require('../../utils/encryption');
 
 exports.handler = async (event) => {
   const pgClient = new Client(clientConfig);
 
   try {
     const body = JSON.parse(event.body);
 
     if (!body.accessToken) {
       throw new Error('accessTokenがリクエストボディから見当たりません');
     }
     const { userId } = event.pathParameters;
 
     const encryptionKey = await getEncryptionKeyFromSsm();
 
     const encryptedAccessToken = encryptText({
       text: body.accessToken,
       key: encryptionKey,
     });
 
     await pgClient.connect();
 
     // TODO: テーブル設計が決まったらリファクタリング
     const insertQuery = `
       INSERT INTO insta_account (user_id, encrypted_access_token)
       VALUES ($1, $2)
     `;
 
     await pgClient.query(insertQuery, [
       userId,
       encryptedAccessToken,
     ]);
 
     return {
       statusCode: 200,
       headers,
       body: JSON.stringify({
         message: 'Instagramデータが保存されました',
       }),
     };
   } catch (error) {
     console.error('Instagramデータ保存失敗', error);
     return {
       statusCode: 500,
       headers,
       body: JSON.stringify({
         message: 'Instagramデータの保存に失敗しました',
         error: error.message,
       }),
     };
   } finally {
     await pgClient.end();
   }
 }
 
 const getEncryptionKeyFromSsm = async () => {
   const client = new SSMClient();
   try {
     const input = {
       Name: process.env.SSM_ENCRYPTION_KEY_PARAMETER_NAME,
     };
     const command = new GetParameterCommand(input);
     const response = await client.send(command);
 
     console.log({ response })
     return response.Parameter.Value;
   } catch (error) {
     console.log('暗号化キー取得失敗', error);
     throw error;
   }
 }
 
 
 