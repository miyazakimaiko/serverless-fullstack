/**
 *　Cognito からユーザーと、Default EventBus からユーザーの eventRule を削除します。
 */

const cognito = require('@aws-sdk/client-cognito-identity-provider');
const cloudwatch = require('@aws-sdk/client-cloudwatch-events');
const { headers } = require('../../utils/http-response');

exports.handler = async (event) => {
  const cloudWatchEventsClient = new cloudwatch.CloudWatchEventsClient();
  const cognitoClient = new cognito.CognitoIdentityProviderClient();

  try {
    const { userId } = event.pathParameters;
    const ruleName = `publish-post-daily-${userId}`;

    const ruleExists = await checkRuleExistence({
      cloudWatchEventsClient,
      ruleName,
    });

    if (ruleExists) {
      await deleteRule({
        cloudWatchEventsClient,
        ruleName,
      });
    }

    await deleteCognitoUser({
      cognitoClient,
      userId,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'ユーザーを削除しました',
      }),
    };
  } catch (error) {
    console.error('ユーザー削除失敗:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'ユーザーの削除に失敗しました',
        // @ts-ignore
        error: error.message || error,
      }),
    };
  }
};

const checkRuleExistence = async ({ cloudWatchEventsClient, ruleName }) => {
  try {
    const describeRuleCommand = new cloudwatch.DescribeRuleCommand({
      Name: ruleName,
    });
    await cloudWatchEventsClient.send(describeRuleCommand);
    return true;
  } catch (error) {
    // @ts-ignore
    if (error.name === 'ResourceNotFoundException') {
      return false;
    }
    console.error('EventRule検索失敗', error);
    throw error;
  }
};

const deleteRule = async ({ cloudWatchEventsClient, ruleName }) => {
  try {
    const listTargetsCommand = new cloudwatch.ListTargetsByRuleCommand({
      Rule: ruleName,
    });

    const listTargetsResult = await cloudWatchEventsClient.send(listTargetsCommand);

    console.log({listTargetsResult})
    
    if (listTargetsResult.Targets && listTargetsResult.Targets.length > 0) {
      const targetIds = listTargetsResult.Targets.map(target => target.Id);
      const removeTargetsCommand = new cloudwatch.RemoveTargetsCommand({
        Rule: ruleName,
        Ids: targetIds,
      });
      await cloudWatchEventsClient.send(removeTargetsCommand);
    }

    const deleteRuleCommand = new cloudwatch.DeleteRuleCommand({
      Name: ruleName,
    });

    await cloudWatchEventsClient.send(deleteRuleCommand);
    
    return true;
  } catch (error) {
    console.error('Rule削除失敗', error);
    throw error;
  }
};

const deleteCognitoUser = async ({ cognitoClient, userId }) => {
  try {
    const command = new cognito.AdminDeleteUserCommand({
      UserPoolId: process.env.USER_POOL_ID,
      Username: userId,
    });
  
    await cognitoClient.send(command);
  } catch (error) {
    console.error('Cognitoユーザー削除失敗', error);
    throw error;
  }
}