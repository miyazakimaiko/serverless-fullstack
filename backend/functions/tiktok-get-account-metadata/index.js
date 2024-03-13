/**
 *　データベースへユーザーのTikTokアカウントのクライアントキーとクライアントシークレットを保存します。
 */

 const { Client } = require('pg');
 const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
 const { headers } = require('../../utils/http-response');
 const { clientConfig } = require('../../utils/db-client');
 const { decryptText } = require('../../utils/encryption');
 
 exports.handler = async (event) => {
   const pgClient = new Client(clientConfig);
 
   try {
     const { userId } = event.pathParameters;
 
     const encryptionKey = await getEncryptionKeyFromSsm();
 
     await pgClient.connect();
 
     const selectQuery = `
        SELECT client_key, encrypted_client_secret, tiktok_user_id
        FROM tiktok_account
        WHERE user_id = $1
      `;
     const response = await pgClient.query(selectQuery, [
       userId,
     ]);

     const result = response.rows[0];

     const decryptedClientSecret = decryptText({
      text: result.encrypted_client_secret,
      key: encryptionKey,
    });
 
     return {
       statusCode: 200,
       headers,
       body: JSON.stringify({
         message: 'SNSクライアントデータが保存されました',
         clientKey: result.client_key,
         clientSecret: result.encrypted_client_secret,
       }),
     };
   } catch (error) {
     console.error('SNSクライアントデータの保存に失敗しました', error);
     return {
       statusCode: 500,
       headers,
       body: JSON.stringify({
         message: 'SNSクライアントデータの保存に失敗しました',
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
 
 
 