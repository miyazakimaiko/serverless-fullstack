import { CognitoUserPool } from 'amazon-cognito-identity-js';

export const poolData = {
  UserPoolId: `${process.env.VUE_APP_COGNITO_USER_POOL_ID}`,
  ClientId: `${process.env.VUE_APP_COGNITO_CLIENT_ID}`,
}

export default new CognitoUserPool(poolData);