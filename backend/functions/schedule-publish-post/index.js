/**
 * publish-post lambda をユーザー毎に呼び出すスケジュールを設定します。
 * もし既にスケジュールが存在している場合は、新しく作らずにレスポンスを返します。
 * Ruleは各ユーザーに一つ作られ、各SNS用のそれぞれ別のTargetがRule内に作成されます。
 */

const cloudwatch = require('@aws-sdk/client-cloudwatch-events');
const lambda = require('@aws-sdk/client-lambda');
const { headers } = require('../../utils/http-response');

const cloudWatchEventsClient = new cloudwatch.CloudWatchEventsClient();
const lambdaClient = new lambda.LambdaClient();

exports.handler = async (event) => {
  try {
    const { userId } = event.pathParameters;
    const body = JSON.parse(event.body);
    const ruleName = `publish-post-daily-${userId}`;

    if (!body.hour || !body.minute) {
      throw new Error('body.sns, body.hour, または body.minute が見つかりません')
    }

    await setupDailyEventRule({
      userId,
      ruleName,
      hour: body.hour,
      minute: body.minute,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        message: 'スケジュールを設定しました',
      }),
    };
  } catch (error) {
    // @ts-ignore
    if (error.name === 'ResourceConflictException') {
      return {
        statusCode: 202,
        headers,
        body: JSON.stringify({
          message: 'スケジュールが既に存在しています',
        }),
      };
    }
    console.error('スケジュール設定失敗', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        message: 'スケジュールの設定に失敗しました',
        // @ts-ignore
        error: error.message || error,
      }),
    };
  }
};

const checkRuleExistence = async (ruleName) => {
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

const setupDailyEventRule = async ({ userId, ruleName, hour = '12', minute = '00' }) => {
  const targetLambdaArn = process.env.PUBLISH_POST_LAMBDA_ARN;
  const scheduleExpression = `cron(${minute} ${hour} * * ? *)`;
  
  try {
    const ruleExist = await checkRuleExistence(ruleName);

    if (!ruleExist) {
      await createRule({
        ruleName, 
        scheduleExpression,
      });
    }

    await putTargetToRule({
      userId,
      ruleName, 
      targetLambdaArn,
    });

    await addInvokePermissionToPublishPostLambdaByRule(ruleName);

  } catch (error) {
    console.log('スケジュール失敗', error);
    throw error;
  }
};

const createRule = async ({ ruleName, scheduleExpression }) => {
  try {
    const putRuleCommand = new cloudwatch.PutRuleCommand({
      Name: ruleName,
      ScheduleExpression: scheduleExpression,
      State: 'ENABLED'
    });
    await cloudWatchEventsClient.send(putRuleCommand);
  } catch (error) {
    console.log('EventRule作成失敗', error);
    throw error;
  }
}

const putTargetToRule = async ({ userId, ruleName, targetLambdaArn }) => {
  try {
    const putTargetsCommand = new cloudwatch.PutTargetsCommand({
      Rule: ruleName,
      Targets: [{
        Id: `target-lambda-${userId}`,
        Arn: targetLambdaArn,
        Input: JSON.stringify({
          userId,
        })
      }]
    });
    await cloudWatchEventsClient.send(putTargetsCommand);
  } catch (error) {
    console.log('ターゲット設定失敗', error);
    throw error;
  }
}

const addInvokePermissionToPublishPostLambdaByRule = async (ruleName) => {
  try {
    const addPermissionCommand = new lambda.AddPermissionCommand({
      FunctionName: process.env.PUBLISH_POST_LAMBDA_NAME,
      StatementId: 'AllowCloudWatchEvents',
      Action: 'lambda:InvokeFunction',
      Principal: 'events.amazonaws.com',
      SourceArn: `arn:aws:events:${process.env.AWS_REGION}:${process.env.CDK_DEFAULT_ACCOUNT}:rule/${ruleName}`
    });
    await lambdaClient.send(addPermissionCommand);
  } catch (error) {
    console.log('許可の取り付け失敗', error);
    throw error;
  }
}