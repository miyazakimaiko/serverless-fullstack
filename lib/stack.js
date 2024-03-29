const cdk = require('aws-cdk-lib');
const s3 = require('aws-cdk-lib/aws-s3');
const iam = require('aws-cdk-lib/aws-iam');
const cloudfront = require('aws-cdk-lib/aws-cloudfront');
const origins = require('aws-cdk-lib/aws-cloudfront-origins');
const apigateway = require('aws-cdk-lib/aws-apigateway');
const lambda = require('aws-cdk-lib/aws-lambda');
const cognito = require('aws-cdk-lib/aws-cognito');
const s3d = require('aws-cdk-lib/aws-s3-deployment');
const rds = require('aws-cdk-lib/aws-rds');
const ec2 = require('aws-cdk-lib/aws-ec2');
const logs = require('aws-cdk-lib/aws-logs')
const ssm = require('aws-cdk-lib/aws-ssm');
const sqs = require('aws-cdk-lib/aws-sqs');
const events = require('aws-cdk-lib/aws-events');
const targets = require('aws-cdk-lib/aws-events-targets');
const { NodejsFunction } = require('aws-cdk-lib/aws-lambda-nodejs');
const { SqsEventSource } = require('aws-cdk-lib/aws-lambda-event-sources');
const path = require('path');

class MainStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    if (!process.env.AWS_ACCOUNT
      || !process.env.AWS_REGION
      || !process.env.AWS_STAGE
      || !process.env.APP_NAME
      || !process.env.DB_USER
      || !process.env.DB_PASSWORD
      || !process.env.DB_NAME
      || !process.env.ENCRYPTION_KEY_STRING
      || !process.env.TIKTOK_CLIENT_KEY
      || !process.env.TIKTOK_CLIENT_SECRET
    ) {
      throw Error('必要な環境変数が定義されていません');
    }

    /** =======================================================================================
     *  S3 関連
     * =======================================================================================*/

    /** ----------------------------------------
     * フロントエンド ホスト用 バケット
     * ----------------------------------------*/

    const frontendBucket = new s3.Bucket(this, 'frontend-bucket', {
      bucketName: `${id}-frontend-bucket`,
      websiteIndexDocument: 'index.html',
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS, // publicReadAccess: true にする際必要
      accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL, // publicReadAccess: true にする際必要
      cors: [ // フロントエンドからAPIリクエストを許可するため
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
            s3.HttpMethods.HEAD,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY, // テストスタック用
      autoDeleteObjects: true, // テストスタック用
    });

    new s3d.BucketDeployment(this, 'frontend-bucket-deployment', {
      sources: [s3d.Source.asset('./frontend/dist')],
      // @ts-ignore
      destinationBucket: frontendBucket,
    });

    const mediaBucket = new s3.Bucket(this, 'media-bucket', {
      bucketName: `${id}-media-bucket`,
      publicReadAccess: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS, // publicReadAccess: true にする際必要
      accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL, // publicReadAccess: true にする際必要
      removalPolicy: cdk.RemovalPolicy.DESTROY, // テストスタック用
      autoDeleteObjects: true, // テストスタック用
      cors: [ // フロントエンドからAPIリクエストを許可するため
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.POST,
            s3.HttpMethods.PUT,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });

    /** =======================================================================================
     *  CloudFront 関連
     * =======================================================================================*/

    const cloudfrontEdgeHandler = new cloudfront.experimental.EdgeFunction(this, 'cloudfront-edge-lambda', {
      functionName: `${id}-cloudfront-edge-lambda`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('./backend/functions/cloudfront-edge'),
    });

    const distribution = new cloudfront.Distribution(this, 'distribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        edgeLambdas: [
          {
            functionVersion: cloudfrontEdgeHandler.currentVersion,
            eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          },
        ],
      },
      defaultRootObject: 'index.html',
      errorResponses: [{
        httpStatus: 404,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: cdk.Duration.minutes(30),
      }]
    });

    /** =======================================================================================
     *  Cognito 関連
     * =======================================================================================*/

    const userPool = new cognito.UserPool(this, 'user-pool', {
      userPoolName: `${id}-user-pool`,
      selfSignUpEnabled: true,
      autoVerify: { email: true },
      signInAliases: { email: true },
      userVerification: {
        emailSubject: 'アカウント確認コード',
        emailBody: '確認コードは {####} です。',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'user-pool-client', {
      userPoolClientName: `${id}-user-pool-client`,
      userPool,
      authFlows: {
        userPassword: true,
        userSrp: true
      },
    });

    new cognito.CfnUserPoolGroup(this, 'admin-group', {
      groupName: 'Admin',
      userPoolId: userPool.userPoolId
    });

    new cognito.CfnUserPoolGroup(this, 'user-group', {
      groupName: 'User',
      userPoolId: userPool.userPoolId
    });

    /** =======================================================================================
     *  DB 関連
     * =======================================================================================*/

    /** ----------------------------------------
     * VPC
     * ----------------------------------------*/

    const vpc = new ec2.Vpc(this, 'vpc', {
      vpcName: `${id}-vpc`,
      natGateways: 1,
      maxAzs: 2, // 2つのアベイラビリティゾーンが DatabaseClusterに必要な最低限数のため
      subnetConfiguration: [
        {
          subnetType: ec2.SubnetType.PUBLIC,
          name: `${id}-public`,
        },
        {
          // DatabaseClusterと、DBアクセスが必要なLambdaをこのサブネットに設置
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          name: `${id}-private`,
        },
      ],
      gatewayEndpoints: {
        S3: {
          // vpc内のLambdaからS3へのアクセスを可能にするため
          service: ec2.GatewayVpcEndpointAwsService.S3,
        },
      }
    });

    // vpc内のLambdaからSSMへのアクセスを可能にするため
    vpc.addInterfaceEndpoint('ssm-endpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SSM,
    });

    // allowAllInbound: true という設定はできないため
    // Lambdaからのアクセスを許可するセキュリティグループを設定しています
    const dbSecurityGroup = new ec2.SecurityGroup(this, 'db-cluster-sg', {
      securityGroupName: `${id}-db-cluster-sg`,
      vpc,
      allowAllOutbound: true,
    });

    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      `Allow traffic from the CIDR block of ${id}-vpc to PostgreSQL`
    );

    /** ----------------------------------------
     * クラスター
     * ----------------------------------------*/

    const auroraCluster = new rds.DatabaseCluster(this, 'db-cluster', {
      clusterIdentifier: `${id}-db-cluster`,
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_1,
      }),
      credentials: rds.Credentials.fromPassword(
        process.env.DB_USER,
        new cdk.SecretValue(process.env.DB_PASSWORD)
      ),
      writer: rds.ClusterInstance.serverlessV2(`${id}-db-writer-instance`),
      vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      securityGroups: [
        dbSecurityGroup
      ],
      defaultDatabaseName: process.env.DB_NAME,
    });

    /** =======================================================================================
     *  SSM 関連
     * =======================================================================================*/

    const tokenEncryptionKeySsm = new ssm.StringParameter(this, 'token-encryption-key', {
      parameterName: `${id}-token-encryption-key`,
      stringValue: process.env.ENCRYPTION_KEY_STRING,
      tier: ssm.ParameterTier.ADVANCED,
    });

    /** =======================================================================================
     *  SQS 関連
     * =======================================================================================*/

    const publishPostQueue = new sqs.Queue(this, 'publish-post-sqs', {
      queueName: `${id}-publish-post-sqs`,
      // publishPostLambda の timeout の値と同じかそれ以上の値にする
      visibilityTimeout: cdk.Duration.seconds(600),
    });

    /** =======================================================================================
     *  EventBridge 関連
     * =======================================================================================*/

    const addusersToPublishEventRule = new events.Rule(this, 'add-users-to-publish-event', {
      ruleName: `${id}-add-users-to-publish-event`,
      schedule: events.Schedule.expression('cron(0 12 * * ? *)'),
    });

    /** =======================================================================================
     *  Lambda 関連
     * =======================================================================================*/

    /** ----------------------------------------
     * 共通ポリシー
     * ----------------------------------------*/

    const networkInterfaceActionPolicy = new iam.PolicyStatement({
      actions: [
        'ec2:CreateNetworkInterface',
        'ec2:DeleteNetworkInterface',
        'ec2:DescribeNetworkInterfaces',
      ],
      resources: ['*'],
    });

    const cognitoActionPolicy = new iam.PolicyStatement({
      actions: [
        'cognito-idp:*',
      ],
      resources: ['*'],
    });

    const logPolicy = new iam.PolicyStatement({
      actions: [
        'logs:CreateLogGroup',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
      ],
      resources: ['arn:aws:logs:*:*:*'],
    });

    /** ----------------------------------------
     * Lambda 共通外部パッケージ レイヤー化
     * ----------------------------------------*/

    const pgLayer = new lambda.LayerVersion(this, 'pg-layer', {
      layerVersionName: `${id}-pg-layer`,
      code: lambda.Code.fromAsset(path.dirname(require.resolve('pg'))),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Lambda layer for pg module',
    });

    const cognitoClientLayer = new lambda.LayerVersion(this, 'cognito-sdk-layer', {
      layerVersionName: `${id}-cognito-sdk-layer`,
      code: lambda.Code.fromAsset(
        path.dirname(require.resolve('@aws-sdk/client-cognito-identity-provider'))
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Lambda layer for client-cognito-identity-provider module',
    });

    const s3ClientLayer = new lambda.LayerVersion(this, 's3-client-layer', {
      layerVersionName: `${id}-s3-client-layer`,
      code: lambda.Code.fromAsset(
        path.dirname(require.resolve('@aws-sdk/client-s3'))
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Lambda layer for S3 client module',
    });

    const s3PresignedPostLayer = new lambda.LayerVersion(this, 's3-presigned-post-layer', {
      layerVersionName: `${id}-s3-presigned-post-layer`,
      code: lambda.Code.fromAsset(
        path.dirname(require.resolve('@aws-sdk/s3-presigned-post'))
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Lambda layer for s3-presigned-post module',
    });

    const ssmClientLayer = new lambda.LayerVersion(this, 'ssm-client-layer', {
      layerVersionName: `${id}-ssm-client-layer`,
      code: lambda.Code.fromAsset(
        path.dirname(require.resolve('@aws-sdk/client-ssm'))
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Lambda layer for client-ssm module',
    });

    const sqsClientLayer = new lambda.LayerVersion(this, 'sqs-client-layer', {
      layerVersionName: `${id}-sqs-client-layer`,
      code: lambda.Code.fromAsset(
        path.dirname(require.resolve('@aws-sdk/client-sqs'))
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Lambda layer for client-sqs module',
    });

    /** ----------------------------------------
     * create-table lambda
     * ----------------------------------------*/

    const createTableLambdaRole = new iam.Role(this, 'create-table-lambda-role', {
      roleName: `${id}-create-table-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    createTableLambdaRole.addToPolicy(networkInterfaceActionPolicy);

    createTableLambdaRole.addToPolicy(logPolicy);

    auroraCluster.grantConnect(createTableLambdaRole, process.env.DB_USER);

    new NodejsFunction(this, 'create-table-lambda', {
      functionName: `${id}-create-table`,
      entry: 'backend/functions/create-table/index.js',
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      vpc, // DBと通信するためにDBと同じVPC内に配置
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      environment: {
        DB_ENDPOINT: auroraCluster.clusterEndpoint.hostname,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_NAME: process.env.DB_NAME
      },
      layers: [
        pgLayer,
      ],
      role: createTableLambdaRole,
    });

    /** ----------------------------------------
     * tiktok-get-and-save-tokens lambda
     * ----------------------------------------*/

    const tiktokGetAndSaveTokensLambdaRole = new iam.Role(this, 'tiktok-get-and-save-tokens-lambda-role', {
      roleName: `${id}-tiktok-get-and-save-tokens-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    tiktokGetAndSaveTokensLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [tokenEncryptionKeySsm.parameterArn],
    }));

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    tiktokGetAndSaveTokensLambdaRole.addToPolicy(networkInterfaceActionPolicy);

    createTableLambdaRole.addToPolicy(logPolicy);

    auroraCluster.grantConnect(tiktokGetAndSaveTokensLambdaRole, process.env.DB_USER);

    const tiktokGetAndSaveTokensHandler = new NodejsFunction(this, 'tiktok-get-and-save-tokens-lambda', {
      functionName: `${id}-tiktok-get-and-save-tokens`,
      handler: 'handler',
      entry: 'backend/functions/tiktok-get-and-save-tokens/index.js',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      vpc, // DBと通信するためにDBと同じVPC内に配置
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      environment: {
        DB_ENDPOINT: auroraCluster.clusterEndpoint.hostname,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_NAME: process.env.DB_NAME,
        TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY,
        TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET,
        TIKTOK_REDIRECT_URI: `https://${distribution.distributionDomainName}/tiktok-redirect`,
        SSM_ENCRYPTION_KEY_PARAMETER_NAME: tokenEncryptionKeySsm.parameterName,
      },
      layers: [
        pgLayer,
        ssmClientLayer,
      ],
      role: tiktokGetAndSaveTokensLambdaRole,
    });

    /** ----------------------------------------
     * insta-save-token lambda
     * ----------------------------------------*/

    const saveInstaTokenLambdaRole = new iam.Role(this, 'insta-save-token-lambda-role', {
      roleName: `${id}-insta-save-token-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    saveInstaTokenLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [tokenEncryptionKeySsm.parameterArn],
    }));

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    saveInstaTokenLambdaRole.addToPolicy(networkInterfaceActionPolicy);

    createTableLambdaRole.addToPolicy(logPolicy);

    auroraCluster.grantConnect(saveInstaTokenLambdaRole, process.env.DB_USER);

    const saveInstaTokensHandler = new NodejsFunction(this, 'insta-save-tokens-lambda', {
      functionName: `${id}-insta-save-tokens`,
      handler: 'handler',
      entry: 'backend/functions/insta-save-tokens/index.js',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      vpc, // DBと通信するためにDBと同じVPC内に配置
      environment: {
        DB_ENDPOINT: auroraCluster.clusterEndpoint.hostname,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_NAME: process.env.DB_NAME,
        SSM_ENCRYPTION_KEY_PARAMETER_NAME: tokenEncryptionKeySsm.parameterName,
      },
      layers: [
        pgLayer,
        ssmClientLayer,
      ],
      role: saveInstaTokenLambdaRole,
    });

    /** ----------------------------------------
     * save-post-metadata lambda
     * ----------------------------------------*/

    const savePostMetadataLambdaRole = new iam.Role(this, 'save-post-metadata-lambda-role', {
      roleName: `${id}-save-post-metadata-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    savePostMetadataLambdaRole.addToPolicy(networkInterfaceActionPolicy);

    createTableLambdaRole.addToPolicy(logPolicy);

    auroraCluster.grantConnect(savePostMetadataLambdaRole, process.env.DB_USER);

    const savePostMetadataHandler = new NodejsFunction(this, 'save-post-metadata-lambda', {
      functionName: `${id}-save-post-metadata`,
      handler: 'handler',
      entry: 'backend/functions/save-post-metadata/index.js',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      vpc, // DBと通信するためにDBと同じVPC内に配置
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      environment: {
        DB_ENDPOINT: auroraCluster.clusterEndpoint.hostname,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_NAME: process.env.DB_NAME,
      },
      layers: [
        pgLayer,
      ],
      role: savePostMetadataLambdaRole,
    });

    /** ----------------------------------------
     * get-all-post-metadata lambda
     * ----------------------------------------*/

    const getAllPostMetadataLambdaRole = new iam.Role(this, 'get-all-post-metadata-lambda-role', {
      roleName: `${id}-get-all-post-metadata-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    getAllPostMetadataLambdaRole.addToPolicy(networkInterfaceActionPolicy);

    createTableLambdaRole.addToPolicy(logPolicy);

    auroraCluster.grantConnect(getAllPostMetadataLambdaRole, process.env.DB_USER);

    const getAllPostMetadataHandler = new NodejsFunction(this, 'get-all-post-metadata-lambda', {
      functionName: `${id}-get-all-post-metadata`,
      handler: 'handler',
      entry: 'backend/functions/get-all-post-metadata/index.js',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      vpc, // DBと通信するためにDBと同じVPC内に配置
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      environment: {
        DB_ENDPOINT: auroraCluster.clusterEndpoint.hostname,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_NAME: process.env.DB_NAME,
      },
      layers: [
        pgLayer,
      ],
      role: getAllPostMetadataLambdaRole,
    });

    /** ----------------------------------------
     * delete-post lambda
     * ----------------------------------------*/

    const deletePostLambdaRole = new iam.Role(this, 'delete-post-lambda-role', {
      roleName: `${id}-delete-post-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    deletePostLambdaRole.addToPolicy(networkInterfaceActionPolicy);

    createTableLambdaRole.addToPolicy(logPolicy);

    deletePostLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:ListBucket'
      ],
      resources: [`${mediaBucket.bucketArn}`]
    }));

    deletePostLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        's3:GetObject',
        's3:DeleteObject',
      ],
      resources: [`${mediaBucket.bucketArn}/*`]
    }));

    auroraCluster.grantConnect(deletePostLambdaRole, process.env.DB_USER);

    const deletePostHandler = new NodejsFunction(this, 'delete-post-lambda', {
      functionName: `${id}-delete-post`,
      handler: 'handler',
      entry: 'backend/functions/delete-post/index.js',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      vpc, // DBと通信するためにDBと同じVPC内に配置
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      environment: {
        DB_ENDPOINT: auroraCluster.clusterEndpoint.hostname,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_NAME: process.env.DB_NAME,
        MEDIA_BUCKET_NAME: mediaBucket.bucketName,
      },
      layers: [
        pgLayer,
        s3ClientLayer,
      ],
      role: deletePostLambdaRole,
    });


    /** ----------------------------------------
     * add-user-to-group lambda
     * ----------------------------------------*/

    const addUserToGroupLambdaRole = new iam.Role(this, 'add-user-to-group-lambda-role', {
      roleName: `${id}-add-user-to-group-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    addUserToGroupLambdaRole.addToPolicy(cognitoActionPolicy);

    createTableLambdaRole.addToPolicy(logPolicy);

    const addUserToGroupHandler = new NodejsFunction(this, 'add-user-to-group-lambda', {
      functionName: `${id}-add-user-to-group`,
      handler: 'handler',
      entry: 'backend/functions/add-user-to-group/index.js',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      },
      layers: [
        cognitoClientLayer
      ],
      role: addUserToGroupLambdaRole,
    });

    /** ----------------------------------------
     * delete-user lambda
     * ----------------------------------------*/

    const deleteUserLambdaRole = new iam.Role(this, 'delete-user-lambda-role', {
      roleName: `${id}-delete-user-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    deleteUserLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: [
        'events:DescribeRule',
        'events:DeleteRule',
        'events:ListTargetsByRule',
        'events:RemoveTargets'
      ],
      resources: [`arn:aws:events:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT}:rule/*`]
    }));

    deleteUserLambdaRole.addToPolicy(cognitoActionPolicy);

    createTableLambdaRole.addToPolicy(logPolicy);

    const deleteUserHandler = new NodejsFunction(this, 'delete-user-lambda', {
      functionName: `${id}-delete-user`,
      handler: 'handler',
      entry: 'backend/functions/delete-user/index.js',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
      },
      layers: [
        cognitoClientLayer,
      ],
      role: deleteUserLambdaRole,
    });

    /** ----------------------------------------
     * get-users lambda
     * ----------------------------------------*/

    const listUsersLambdaRole = new iam.Role(this, 'get-users-lambda-role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    listUsersLambdaRole.addToPolicy(cognitoActionPolicy);

    createTableLambdaRole.addToPolicy(logPolicy);

    const listUsersHandler = new NodejsFunction(this, 'get-users-lambda', {
      functionName: `${id}-get-users`,
      handler: 'handler',
      entry: 'backend/functions/get-users/index.js',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      allowPublicSubnet: true,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
      },
      layers: [
        cognitoClientLayer,
      ],
      role: listUsersLambdaRole,
    });

    /** ----------------------------------------
     * add-users-to-publish-queue lambda
     * ----------------------------------------*/

    const addUsersToPublishQueueLambdaRole = new iam.Role(this, 'add-users-to-publish-queue-lambda-role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    addUsersToPublishQueueLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['sqs:SendMessage'],
      resources: [publishPostQueue.queueArn],
    }));

    addUsersToPublishQueueLambdaRole.addToPolicy(cognitoActionPolicy);

    createTableLambdaRole.addToPolicy(logPolicy);

    const addUsersToPublishQueueHandler = new NodejsFunction(this, 'add-users-to-publish-queue-lambda', {
      functionName: `${id}-add-users-to-publish-queue`,
      handler: 'handler',
      entry: 'backend/functions/add-users-to-publish-queue/index.js',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      allowPublicSubnet: true,
      environment: {
        USER_POOL_ID: userPool.userPoolId,
        PUBLISH_QUEUE_URL: publishPostQueue.queueUrl
      },
      layers: [
        cognitoClientLayer,
        sqsClientLayer
      ],
      role: addUsersToPublishQueueLambdaRole,
    });

    addusersToPublishEventRule.addTarget(
      new targets.LambdaFunction(addUsersToPublishQueueHandler)
    );

    /** ----------------------------------------
     * publish-post lambda
     * ----------------------------------------*/

    const publishPostLambdaRole = new iam.Role(this, 'publish-post-lambda-role', {
      roleName: `${id}-publish-post-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchAgentServerPolicy'),
      ]
    });

    publishPostLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [tokenEncryptionKeySsm.parameterArn],
    }));

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    publishPostLambdaRole.addToPolicy(networkInterfaceActionPolicy);
    
    publishPostLambdaRole.addToPolicy(logPolicy);

    auroraCluster.grantConnect(publishPostLambdaRole, process.env.DB_USER);

    const publishPostLambda = new NodejsFunction(this, 'publish-post-lambda', {
      functionName: `${id}-publish-post`,
      handler: 'handler',
      entry: 'backend/functions/publish-post/index.js',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(600),
      logRetention: logs.RetentionDays.ONE_WEEK,
      vpc, // DBと通信するためにDBと同じVPC内に配置
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      environment: {
        DB_ENDPOINT: auroraCluster.clusterEndpoint.hostname,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_NAME: process.env.DB_NAME,
        MEDIA_BUCKET_NAME: mediaBucket.bucketName,
        SSM_ENCRYPTION_KEY_PARAMETER_NAME: tokenEncryptionKeySsm.parameterName,
        TIKTOK_CLIENT_KEY: process.env.TIKTOK_CLIENT_KEY,
        TIKTOK_CLIENT_SECRET: process.env.TIKTOK_CLIENT_SECRET,
      },
      layers: [
        pgLayer,
        ssmClientLayer,
      ],
      role: publishPostLambdaRole,
    });

    publishPostLambda.addEventSource(new SqsEventSource(publishPostQueue, {
      batchSize: 1
    }));

    /** ----------------------------------------
     * get-presigned-url lambda
     * ----------------------------------------*/

    const getPresignedUrlLambdaRole = new iam.Role(this, 'get-presigned-url-lambda-role', {
      roleName: `${id}-get-presigned-url-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    getPresignedUrlLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:*'],
      resources: [`${mediaBucket.bucketArn}/*`]
    }));

    getPresignedUrlLambdaRole.addToPolicy(logPolicy);

    const getPresignedUrlHandler = new NodejsFunction(this, 'get-presigned-url-lambda', {
      functionName: `${id}-get-presigned-url`,
      handler: 'handler',
      entry: 'backend/functions/get-presigned-url/index.js',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(10),
      logRetention: logs.RetentionDays.ONE_WEEK,
      environment: {
        MEDIA_BUCKET_NAME: mediaBucket.bucketName,
      },
      layers: [
        s3ClientLayer,
        s3PresignedPostLayer,
      ],
      role: getPresignedUrlLambdaRole
    });

    /** =======================================================================================
     *  API Gateway 関連
     * =======================================================================================*/

    const api = new apigateway.RestApi(this, 'rest-api', {
      restApiName: `${id}-rest-api`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['*'],
      },
      deployOptions: {
        stageName: process.env.AWS_STAGE,
      },
    });

    const apiResource = api.root.addResource('api');

    /** ----------------------------------------
     * ユーザー登録周り
     * ----------------------------------------*/

    apiResource.resourceForPath('user')
      .addMethod('PUT', new apigateway.LambdaIntegration(addUserToGroupHandler));

    /** ----------------------------------------
     * ユーザー管理周り
     * ----------------------------------------*/

    apiResource.resourceForPath('users')
      .addMethod('GET', new apigateway.LambdaIntegration(listUsersHandler));

    const userIdPath = apiResource.resourceForPath('user').addResource('{userId}');

    userIdPath
      .addMethod('DELETE', new apigateway.LambdaIntegration(deleteUserHandler));

    /** ----------------------------------------
     * 投稿管理周り
     * ----------------------------------------*/

    userIdPath.resourceForPath('presigned-url')
      .addMethod('GET', new apigateway.LambdaIntegration(getPresignedUrlHandler));

    userIdPath.resourceForPath('post')
      .addMethod('POST', new apigateway.LambdaIntegration(savePostMetadataHandler));

    userIdPath.resourceForPath('posts')
      .addMethod('GET', new apigateway.LambdaIntegration(getAllPostMetadataHandler));

    userIdPath.resourceForPath('post').addResource('{postId}')
      .addMethod('DELETE', new apigateway.LambdaIntegration(deletePostHandler));

    /** ----------------------------------------
     * SNS アカウント管理周り
     * ----------------------------------------*/

    const snsAccountPath = userIdPath.resourceForPath('account');

    // TikTok

    const tiktokPath = snsAccountPath.resourceForPath('tiktok');

    tiktokPath.resourceForPath('tokens')
      .addMethod('POST', new apigateway.LambdaIntegration(tiktokGetAndSaveTokensHandler));

    // Instagram

    const instaPath = snsAccountPath.resourceForPath('insta');

    instaPath.resourceForPath('tokens')
      .addMethod('POST', new apigateway.LambdaIntegration(saveInstaTokensHandler));

    /** =======================================================================================
     *  cdk deploy コマンドアウトプット
     * =======================================================================================*/

    // frontend.envにこのアウトプットを貼り付ける
    new cdk.CfnOutput(this, 'vue-app-env', {
      value: `\n\nVUE_APP_COGNITO_USER_POOL_ID=${userPool.userPoolId}\nVUE_APP_COGNITO_CLIENT_ID=${userPoolClient.userPoolClientId}\nVUE_APP_API_ENDPOINT=${api.url}api\nVUE_APP_MEDIA_BUCKET_URL=https://${mediaBucket.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com\nVUE_APP_SITE_URL=https://${distribution.distributionDomainName}\nVUE_APP_TIKTOK_CLIENT_KEY=${process.env.TIKTOK_CLIENT_KEY}\n`
    });
  }
}

module.exports = { MainStack }