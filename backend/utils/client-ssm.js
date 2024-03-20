const { GetParameterCommand } = require('@aws-sdk/client-ssm');

export const getEncryptionKeyFromSsm = async (client) => {
  try {
    const input = {
      Name: process.env.SSM_ENCRYPTION_KEY_PARAMETER_NAME,
    };
    const command = new GetParameterCommand(input);
    const response = await client.send(command);

    if (!response?.Parameter?.Value) {
      throw Error('Response.Parameter.Valueが見つかりません');
    }

    return response.Parameter.Value;
  } catch (error) {
    console.error('暗号化キー取得失敗', error);
    throw error;
  }
}