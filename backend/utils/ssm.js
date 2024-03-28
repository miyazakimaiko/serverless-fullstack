import { GetParameterCommand } from '@aws-sdk/client-ssm';

/**
 * @description 暗号化キーをSSMパラメータから取得します
 */
export const getEncryptionKeyFromSsm = async ({ ssmClient, parameterName }) => {
  try {
    const input = {
      Name: parameterName,
    };
    const command = new GetParameterCommand(input);
    const response = await ssmClient.send(command);

    if (!response?.Parameter?.Value) {
      throw Error('Response.Parameter.Valueが見つかりません');
    }

    return response.Parameter.Value;
  } catch (error) {
    console.error('暗号化キー取得失敗', error);
    throw error;
  }
}