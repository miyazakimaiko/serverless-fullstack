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
const { NodejsFunction } = require('aws-cdk-lib/aws-lambda-nodejs');
const crypto = require('crypto');
const path = require('path');

class MainStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    /** ============================================================================
     *  S3 関連
     * ============================================================================*/

    /** --------------------------------
     * フロントエンド ホスト用 バケット
     * --------------------------------*/

    const frontendBucket = new s3.Bucket(this, `${id}-frontend-bucket`, {
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

    new s3d.BucketDeployment(this, `${id}-frontend-bucket-deployment`, {
      sources: [s3d.Source.asset('./frontend/dist')],
      destinationBucket: frontendBucket,
    });

    const mediaBucket = new s3.Bucket(this, `${id}-media-bucket`, {
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
          MaxAgeSeconds: 3000
        },
      ],
    });

    // UserID | post ID | Media location URL | created_at | last_posted_at
    // maiko  | dflskdf | https://126        | 2024-03-08 | 
    // maiko  | dfjhsld | https://126        | 2024-03-07 | 2024-03-09
    // maiko  | dsadfsa | https://126        | 2024-03-05 | 2024-03-08
    // maiko  | ghfdsgd | https://126        | 2024-03-04 | 2024-03-07
    // maiko  | fgsdghr | https://126        | 2024-03-03 | 2024-03-06
    // maiko  | ccvtrey | https://122        | 2024-03-02 | 2024-03-05
    // maiko  | syjhvwv | https://123        | 2024-03-01 | 2024-03-04

    // find the latest post's created_at -> 2024-03-08
    // find the oldest created_at post that is created_at after 2024-03-08
    // if doesn't exist, then use the post with oldest created_at

    /** ============================================================================
     *  Cognito 関連
     * ============================================================================*/

    const userPool = new cognito.UserPool(this, `${id}-user-pool`, {
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

    const userPoolClient = new cognito.UserPoolClient(this, `${id}-user-pool-client`, {
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

    /** ============================================================================
     *  DB 関連
     * ============================================================================*/

    /** --------------------------------
     * VPC
     * --------------------------------*/

    const vpc = new ec2.Vpc(this, `${id}-vpc`, {
      vpcName: `${id}-vpc`,
      natGateways: 1,
      maxAzs: 2, // 2つのアベイラビリティゾーンが DatabaseClusterに必要な最低限数のため
      subnetConfiguration: [
        {
          // 2つのサブネットが DatabaseClusterに必要な最低限数のため
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
      },
    });

    // --------------------------------------------------------------
    // メモ：
    // 少なくともCDKからは allowAllInbound: true という設定はできないため
    // Lambdaからのアクセスを許可するセキュリティグループを設定しています。
    // --------------------------------------------------------------
    const dbSecurityGroup = new ec2.SecurityGroup(this, `${id}-db-cluster-sg`, {
      securityGroupName: `${id}-db-cluster-sg`,
      vpc,
      allowAllOutbound: true,
      securityGroupName: `${id}-db-cluster-sg`,
    });

    dbSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(vpc.vpcCidrBlock),
      ec2.Port.tcp(5432),
      `Allow traffic from the CIDR block of ${id}-vpc to PostgreSQL`
    );

    /** --------------------------------
     * クラスター
     * --------------------------------*/

    const auroraCluster = new rds.DatabaseCluster(this, `${id}-db-cluster`, {
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
      vpcSubnets: [
        {
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        }
      ],
      securityGroups: [
        dbSecurityGroup
      ],
      defaultDatabaseName: process.env.DB_NAME,
    });

    /** ============================================================================
     *  SSM 関連
     * ============================================================================*/

    const encryptionKeyBytes = crypto.randomBytes(32);
    const encryptionKeyString = encryptionKeyBytes.toString('base64');

    const tokenEncryptionKeySsm = new ssm.StringParameter(this, `${id}-token-encryption-key`, {
      parameterName: `${id}-token-encryption-key`,
      stringValue: encryptionKeyString,
      tier: ssm.ParameterTier.STANDARD,
    });

    /** ============================================================================
     *  Lambda 関連
     * ============================================================================*/

    /** --------------------------------
     * 共通ポリシー
     * --------------------------------*/

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

    /** --------------------------------
     * 共通外部パッケージ Lambdaレイヤー化
     * --------------------------------*/

    const pgLayer = new lambda.LayerVersion(this, `${id}-lambda-pg-layer`, {
      layerVersionName: `${id}-lambda-pg-layer`,
      code: lambda.Code.fromAsset(path.dirname(require.resolve('pg'))),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Lambda layer for pg module',
    });

    const cognitoClientLayer = new lambda.LayerVersion(this, `${id}-lambda-cognito-sdk-layer`, {
      layerVersionName: `${id}-lambda-cognito-sdk-layer`,
      code: lambda.Code.fromAsset(
        path.dirname(require.resolve('@aws-sdk/client-cognito-identity-provider'))
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Lambda layer for client-cognito-identity-provider module',
    });

    const s3ClientLayer = new lambda.LayerVersion(this, `${id}-lambda-s3-client-layer`, {
      layerVersionName: `${id}-lambda-s3-client-layer`,
      code: lambda.Code.fromAsset(
        path.dirname(require.resolve('@aws-sdk/client-s3'))
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Lambda layer for S3 client module',
    });

    const s3PresignedPostLayer = new lambda.LayerVersion(this, `${id}-lambda-s3-presigned-post-layer`, {
      layerVersionName: `${id}-lambda-s3-presigned-post-layer`,
      code: lambda.Code.fromAsset(
        path.dirname(require.resolve('@aws-sdk/s3-presigned-post'))
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Lambda layer for s3-presigned-post module',
    });

    const ssmClientLayer = new lambda.LayerVersion(this, `${id}-lambda-ssm-client-layer`, {
      layerVersionName: `${id}-lambda-ssm-client-layer`,
      code: lambda.Code.fromAsset(
        path.dirname(require.resolve('@aws-sdk/client-ssm'))
      ),
      compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      description: 'Lambda layer for client-ssm module',
    });

    /** --------------------------------
     * create-table lambda
     * --------------------------------*/

    const createTableLambdaRole = new iam.Role(this, `${id}-create-table-lambda-role`, {
      roleName: `${id}-create-table-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    createTableLambdaRole.addToPolicy(networkInterfaceActionPolicy);

    auroraCluster.grantConnect(createTableLambdaRole, process.env.DB_USER);

    new NodejsFunction(this, `${id}-create-table-lambda`, {
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

    /** --------------------------------
     * save-account-metadata lambda
     * --------------------------------*/

    const saveAccountMetadataLambdaRole = new iam.Role(this, `${id}-save-account-metadata-lambda-role`, {
      roleName: `${id}-save-account-metadata-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    saveAccountMetadataLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [tokenEncryptionKeySsm.parameterArn],
    }));

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    saveAccountMetadataLambdaRole.addToPolicy(networkInterfaceActionPolicy);

    auroraCluster.grantConnect(saveAccountMetadataLambdaRole, process.env.DB_USER);

    const saveTokenHandler = new NodejsFunction(this, `${id}-save-account-metadata-lambda`, {
      functionName: `${id}-save-account-metadata`,
      handler: 'handler',
      entry: 'backend/functions/save-account-metadata/index.js',
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
        SSM_ENCRYPTION_KEY_PARAMETER_NAME: tokenEncryptionKeySsm.parameterName,
      },
      layers: [
        pgLayer,
        ssmClientLayer,
      ],
      role: saveAccountMetadataLambdaRole,
    });

    /** --------------------------------
     * save-post-metadata lambda
     * --------------------------------*/

    const savePostMetadataLambdaRole = new iam.Role(this, `${id}-save-post-metadata-lambda-role`, {
      roleName: `${id}-save-post-metadata-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    savePostMetadataLambdaRole.addToPolicy(networkInterfaceActionPolicy);

    auroraCluster.grantConnect(savePostMetadataLambdaRole, process.env.DB_USER);

    const savePostMetadataHandler = new NodejsFunction(this, `${id}-save-post-metadata-lambda`, {
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

    /** --------------------------------
     * get-all-post-metadata lambda
     * --------------------------------*/

    const getAllPostMetadataLambdaRole = new iam.Role(this, `${id}-get-all-post-metadata-lambda-role`, {
      roleName: `${id}-get-all-post-metadata-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    getAllPostMetadataLambdaRole.addToPolicy(networkInterfaceActionPolicy);

    auroraCluster.grantConnect(getAllPostMetadataLambdaRole, process.env.DB_USER);

    const getAllPostMetadataHandler = new NodejsFunction(this, `${id}-get-all-post-metadata-lambda`, {
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

    /** --------------------------------
     * delete-post lambda
     * --------------------------------*/

    const deletePostLambdaRole = new iam.Role(this, `${id}-delete-post-lambda-role`, {
      roleName: `${id}-delete-post-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    deletePostLambdaRole.addToPolicy(networkInterfaceActionPolicy);

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

    const deletePostHandler = new NodejsFunction(this, `${id}-delete-post-lambda`, {
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

    /** --------------------------------
     * publish-post lambda
     * --------------------------------*/

    const publishPostLambdaRole = new iam.Role(this, `${id}-publish-post-lambda-role`, {
      roleName: `${id}-publish-post-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    // Lambdaを指定のVPCに配置する際にNetworkInterfaceが必要なため
    publishPostLambdaRole.addToPolicy(networkInterfaceActionPolicy);

    auroraCluster.grantConnect(publishPostLambdaRole, process.env.DB_USER);

    const publishPostHandler = new NodejsFunction(this, `${id}-publish-post-lambda`, {
      functionName: `${id}-publish-post`,
      handler: 'handler',
      entry: 'backend/functions/publish-post/index.js',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(180),
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
      ],
      role: publishPostLambdaRole,
    });

    /** --------------------------------
     * list-users lambda
     * --------------------------------*/

    const listUsersLambdaRole = new iam.Role(this, `${id}-list-users-lambda-role`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    listUsersLambdaRole.addToPolicy(cognitoActionPolicy);

    const listUsersHandler = new NodejsFunction(this, `${id}-list-users-lambda`, {
      functionName: `${id}-list-users`,
      handler: 'handler',
      entry: 'backend/functions/list-users/index.js',
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

    /** --------------------------------
     * create-user lambda
     * --------------------------------*/

    const createUserLambdaRole = new iam.Role(this, `${id}-create-user-lambda-role`, {
      roleName: `${id}-create-user-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    createUserLambdaRole.addToPolicy(cognitoActionPolicy);

    const createUserHandler = new NodejsFunction(this, `${id}-create-user-lambda`, {
      functionName: `${id}-create-user`,
      handler: 'handler',
      entry: 'backend/functions/create-user/index.js',
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
      role: createUserLambdaRole,
    });

    /** --------------------------------
     * verify-code lambda
     * --------------------------------*/

    const verifyCodeLambdaRole = new iam.Role(this, `${id}-verify-code-lambda-role`, {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    verifyCodeLambdaRole.addToPolicy(cognitoActionPolicy);

    const verifyCodeHandler = new NodejsFunction(this, `${id}-verify-code-lambda`, {
      functionName: `${id}-verify-code`,
      handler: 'handler',
      entry: 'backend/functions/verify-code/index.js',
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
      role: verifyCodeLambdaRole,
    });

    /** --------------------------------
     * delete-user lambda
     * --------------------------------*/

    const deleteUserLambdaRole = new iam.Role(this, `${id}-delete-user-lambda-role`, {
      roleName: `${id}-delete-user-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    deleteUserLambdaRole.addToPolicy(cognitoActionPolicy);

    const deleteUserHandler = new NodejsFunction(this, `${id}-delete-user-lambda`, {
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
        cognitoClientLayer
      ],
      role: deleteUserLambdaRole,
    });

    /** --------------------------------
     * get-presigned-url lambda
     * --------------------------------*/

    const getPresignedUrlLambdaRole = new iam.Role(this, `${id}-get-presigned-url-lambda-role`, {
      roleName: `${id}-get-presigned-url-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });

    getPresignedUrlLambdaRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:*'],
      resources: [`${mediaBucket.bucketArn}/*`]
    }));

    const getPresignedUrlHandler = new NodejsFunction(this, `${id}-get-presigned-url-lambda`, {
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

    /** ============================================================================
     *  API Gateway 関連
     * ============================================================================*/

    const api = new apigateway.RestApi(this, `${id}-rest-api`, {
      restApiName: `${id}-rest-api`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['*'],
      },
    });

    const apiResource = api.root.addResource('api');

    /** --------------------------------
     * ユーザー登録周り
     * --------------------------------*/

    apiResource.resourceForPath('user')
      .addMethod('POST', new apigateway.LambdaIntegration(createUserHandler));

    apiResource.resourceForPath('verify-code')
      .addMethod('POST', new apigateway.LambdaIntegration(verifyCodeHandler));

    /** --------------------------------
     * ユーザー管理周り
     * --------------------------------*/

    apiResource.resourceForPath('users')
      .addMethod('GET', new apigateway.LambdaIntegration(listUsersHandler));

    const userIdPath = apiResource.resourceForPath('user').addResource('{userId}');

    userIdPath
      .addMethod('DELETE', new apigateway.LambdaIntegration(deleteUserHandler));

    /** --------------------------------
     * 投稿管理周り
     * --------------------------------*/

    userIdPath.resourceForPath('presigned-url')
      .addMethod('GET', new apigateway.LambdaIntegration(getPresignedUrlHandler));

    userIdPath.resourceForPath('post')
      .addMethod('POST', new apigateway.LambdaIntegration(savePostMetadataHandler));

    userIdPath.resourceForPath('posts')
      .addMethod('GET', new apigateway.LambdaIntegration(getAllPostMetadataHandler));

    userIdPath.resourceForPath('post').addResource('{postId}')
      .addMethod('DELETE', new apigateway.LambdaIntegration(deletePostHandler));

    /** --------------------------------
     * SNSアカウント管理周り
     * --------------------------------*/

    userIdPath.resourceForPath('account')
      .addMethod('POST', new apigateway.LambdaIntegration(saveTokenHandler));

    /** ============================================================================
     *  CloudFront
     * ============================================================================*/

    const distribution = new cloudfront.Distribution(this, `${id}-distribution`, {
      defaultBehavior: {
        origin: new origins.S3Origin(frontendBucket),
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS,
        viewerProtocolPolicy: 'redirect-to-https',
      },
    });

    /** ============================================================================
     *  cdk deploy コマンドアウトプット
     * ============================================================================*/

    new cdk.CfnOutput(this, 'frontend-website-url', {
      value: distribution.distributionDomainName
    });
    // frontend.envにこのアウトプットを貼り付ける
    new cdk.CfnOutput(this, 'vue-app-env', {
      value: `\nVUE_APP_COGNITO_USER_POOL_ID=${userPool.userPoolId}\nVUE_APP_COGNITO_CLIENT_ID=${userPoolClient.userPoolClientId}\nVUE_APP_API_ENDPOINT=${api.url}\nVUE_APP_MEDIA_BUCKET_URL=http://${mediaBucket.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com`
    });
  }
}

module.exports = { MainStack }