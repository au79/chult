import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'node:path';

export class ChultServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const hostedZoneId = new cdk.CfnParameter(this, 'HostedZoneId', {
      type: 'String',
      default: '',
      description: 'Route 53 hosted zone ID for custom domain (optional).',
    });

    const hostedZoneName = new cdk.CfnParameter(this, 'HostedZoneName', {
      type: 'String',
      default: '',
      description: 'Route 53 hosted zone name (no trailing dot, optional).',
    });

    const subdomain = new cdk.CfnParameter(this, 'Subdomain', {
      type: 'String',
      default: '',
      description:
        'Subdomain label to use for the service (no zone suffix, optional).',
    });

    const imageTag = new cdk.CfnParameter(this, 'ImageTag', {
      type: 'String',
      default: 'latest',
      description: 'ECR image tag for the Lambda container.',
    });

    const serviceBucketName = new cdk.CfnParameter(this, 'ServiceBucketName', {
      type: 'String',
      default: '',
      description: 'S3 bucket name for service assets (optional).',
    });

    const cloudFrontCertArn = new cdk.CfnParameter(this, 'CloudFrontCertArn', {
      type: 'String',
      default: '',
      description:
        'ACM certificate ARN in us-east-1 for CloudFront (optional).',
    });

    const ecrRepositoryName = new cdk.CfnParameter(this, 'EcrRepositoryName', {
      type: 'String',
      default: 'chult-map-service',
      description: 'ECR repository name to use (must already exist).',
    });

    const lambdaRoleName = new cdk.CfnParameter(this, 'LambdaRoleName', {
      type: 'String',
      default: 'ChultLambdaExecutionRole',
      description:
        'Pre-created Lambda execution role name to use for the service.',
    });

    const hexesTableName = new cdk.CfnParameter(this, 'HexesTableNameParam', {
      type: 'String',
      default: 'chult-map-hexes',
      description: 'DynamoDB table name for revealed hex state.',
    });
    hexesTableName.overrideLogicalId('HexesTableName');

    const hexesMapId = new cdk.CfnParameter(this, 'HexesMapIdParam', {
      type: 'String',
      default: 'default',
      description: 'Map partition key to use within DynamoDB hex state table.',
    });
    hexesMapId.overrideLogicalId('HexesMapId');

    const fullDomainName = `${subdomain.valueAsString}.${hostedZoneName.valueAsString}`;

    const useDefaultServiceBucketName = new cdk.CfnCondition(
      this,
      'UseDefaultServiceBucketName',
      {
        expression: cdk.Fn.conditionEquals(serviceBucketName.valueAsString, ''),
      },
    );
    const resolvedServiceBucketName = cdk.Fn.conditionIf(
      useDefaultServiceBucketName.logicalId,
      cdk.Fn.sub('chult-map-service-${AWS::AccountId}-${AWS::Region}'),
      serviceBucketName.valueAsString,
    ) as unknown as string;

    const serviceBucket = s3.Bucket.fromBucketName(
      this,
      'ServiceAssetsBucket',
      resolvedServiceBucketName,
    );

    const repo = ecr.Repository.fromRepositoryName(
      this,
      'ChultRepo',
      ecrRepositoryName.valueAsString,
    );

    const lambdaRole = iam.Role.fromRoleName(
      this,
      'ChultLambdaRole',
      lambdaRoleName.valueAsString,
    );

    const hexesTable = dynamodb.Table.fromTableName(
      this,
      'HexesTable',
      hexesTableName.valueAsString,
    );

    const useCustomDomain = new cdk.CfnCondition(this, 'UseCustomDomain', {
      expression: cdk.Fn.conditionAnd(
        cdk.Fn.conditionNot(
          cdk.Fn.conditionEquals(hostedZoneId.valueAsString, ''),
        ),
        cdk.Fn.conditionNot(
          cdk.Fn.conditionEquals(hostedZoneName.valueAsString, ''),
        ),
        cdk.Fn.conditionNot(
          cdk.Fn.conditionEquals(subdomain.valueAsString, ''),
        ),
        cdk.Fn.conditionNot(
          cdk.Fn.conditionEquals(cloudFrontCertArn.valueAsString, ''),
        ),
      ),
    });

    let distribution: cloudfront.Distribution;
    const handler = new lambda.DockerImageFunction(this, 'ChultHandler', {
      code: lambda.DockerImageCode.fromEcr(repo, {
        tagOrDigest: imageTag.valueAsString,
      }),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      role: lambdaRole,
      environment: {
        DATA_PATH: '/tmp/chult/shown-hexes.txt',
        HEX_ID_STORAGE: 'dynamodb',
        HEX_DDB_TABLE_NAME: hexesTable.tableName,
        HEX_DDB_MAP_ID: hexesMapId.valueAsString,
      },
    });

    const functionUrl = handler.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });

    const s3Origin =
      cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(serviceBucket);

    const apiOrigin = new cloudfrontOrigins.FunctionUrlOrigin(functionUrl);
    const htmlRewriteFunction = new cloudfront.Function(
      this,
      'HtmlRewriteFunction',
      {
        code: cloudfront.FunctionCode.fromFile({
          filePath: path.join(__dirname, '../cloudfront/html-rewrite.js'),
        }),
      },
    );

    const apiOriginRequestPolicy = new cloudfront.OriginRequestPolicy(
      this,
      'ApiOriginRequestPolicy',
      {
        headerBehavior: cloudfront.OriginRequestHeaderBehavior.allowList(
          'Origin',
          'Access-Control-Request-Method',
          'Access-Control-Request-Headers',
          'Content-Type',
        ),
        cookieBehavior: cloudfront.OriginRequestCookieBehavior.none(),
        queryStringBehavior: cloudfront.OriginRequestQueryStringBehavior.all(),
      },
    );

    distribution = new cloudfront.Distribution(this, 'ChultDistribution', {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: s3Origin,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: htmlRewriteFunction,
          },
        ],
      },
      additionalBehaviors: {
        'api/*': {
          origin: apiOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: apiOriginRequestPolicy,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        health: {
          origin: apiOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: apiOriginRequestPolicy,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
    });

    const cfnDistribution = distribution.node
      .defaultChild as cloudfront.CfnDistribution;
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.Aliases',
      cdk.Fn.conditionIf(
        useCustomDomain.logicalId,
        [fullDomainName],
        cdk.Aws.NO_VALUE,
      ),
    );
    cfnDistribution.addPropertyOverride(
      'DistributionConfig.ViewerCertificate',
      cdk.Fn.conditionIf(
        useCustomDomain.logicalId,
        {
          AcmCertificateArn: cloudFrontCertArn.valueAsString,
          SslSupportMethod: 'sni-only',
          MinimumProtocolVersion: 'TLSv1.2_2021',
        },
        cdk.Aws.NO_VALUE,
      ),
    );

    const zone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      'HostedZone',
      {
        hostedZoneId: hostedZoneId.valueAsString,
        zoneName: hostedZoneName.valueAsString,
      },
    );
    const aliasRecord = new route53.ARecord(this, 'CloudFrontAliasRecord', {
      zone,
      recordName: subdomain.valueAsString,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
    });
    (
      aliasRecord.node.defaultChild as route53.CfnRecordSet
    ).cfnOptions.condition = useCustomDomain;

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: repo.repositoryUri,
    });

    new cdk.CfnOutput(this, 'CloudFrontDomainName', {
      value: distribution.domainName,
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
    });

    new cdk.CfnOutput(this, 'HexesTableName', {
      value: hexesTableName.valueAsString,
    });
  }
}
