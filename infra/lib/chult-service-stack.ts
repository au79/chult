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
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export class ChultServiceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const hostedZoneId = new cdk.CfnParameter(this, 'HostedZoneId', {
      type: 'String',
      description: 'Route 53 hosted zone ID for oolong.com',
    });

    const hostedZoneName = new cdk.CfnParameter(this, 'HostedZoneName', {
      type: 'String',
      default: 'oolong.com',
      description: 'Route 53 hosted zone name (no trailing dot).',
    });

    const subdomain = new cdk.CfnParameter(this, 'Subdomain', {
      type: 'String',
      default: 'chult',
      description: 'Subdomain label to use for the service (no zone suffix).',
    });

    const imageTag = new cdk.CfnParameter(this, 'ImageTag', {
      type: 'String',
      default: 'latest',
      description: 'ECR image tag for the Lambda container.',
    });

    const serviceBucketName = new cdk.CfnParameter(this, 'ServiceBucketName', {
      type: 'String',
      default: 'oolong-chult-map-service',
      description: 'S3 bucket name for service assets.',
    });

    const cloudFrontCertArn = new cdk.CfnParameter(this, 'CloudFrontCertArn', {
      type: 'String',
      description: 'ACM certificate ARN in us-east-1 for CloudFront.',
    });

    const ecrRepositoryName = new cdk.CfnParameter(this, 'EcrRepositoryName', {
      type: 'String',
      default: 'chult-map-service',
      description: 'ECR repository name to use (must already exist).',
    });

    const lambdaRoleName = new cdk.CfnParameter(this, 'LambdaRoleName', {
      type: 'String',
      default: 'ChultLambdaExecutionRole',
      description: 'Pre-created Lambda execution role name to use for the service.',
    });

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: hostedZoneId.valueAsString,
      zoneName: hostedZoneName.valueAsString,
    });

    const fullDomainName = `${subdomain.valueAsString}.${hostedZoneName.valueAsString}`;

    const serviceBucket = s3.Bucket.fromBucketName(
      this,
      'ServiceAssetsBucket',
      serviceBucketName.valueAsString,
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

    const handler = new lambda.DockerImageFunction(this, 'ChultHandler', {
      code: lambda.DockerImageCode.fromEcr(repo, {
        tagOrDigest: imageTag.valueAsString,
      }),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      role: lambdaRole,
      environment: {
        DATA_PATH: '/tmp/chult/shown-hexes.txt',
        SERVICE_BUCKET_NAME: serviceBucketName.valueAsString,
      },
    });

    const functionUrl = handler.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      cors: {
        allowedOrigins: [`https://${fullDomainName}`],
        allowedMethods: [
          lambda.HttpMethod.GET,
          lambda.HttpMethod.POST,
        ],
        allowedHeaders: ['Content-Type'],
      },
    });

    const s3Origin = cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(
      serviceBucket,
    );

    const apiOrigin = new cloudfrontOrigins.FunctionUrlOrigin(functionUrl);

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

    const distribution = new cloudfront.Distribution(this, 'ChultDistribution', {
      defaultRootObject: 'player.html',
      domainNames: [fullDomainName],
      certificate: acm.Certificate.fromCertificateArn(
        this,
        'CloudFrontCertificate',
        cloudFrontCertArn.valueAsString,
      ),
      defaultBehavior: {
        origin: s3Origin,
        compress: true,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      additionalBehaviors: {
        'api/*': {
          origin: apiOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: apiOriginRequestPolicy,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        health: {
          origin: apiOrigin,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: apiOriginRequestPolicy,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
      },
    });

    new route53.ARecord(this, 'CloudFrontAliasRecord', {
      zone,
      recordName: subdomain.valueAsString,
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution),
      ),
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: repo.repositoryUri,
    });

    new cdk.CfnOutput(this, 'CloudFrontDistributionId', {
      value: distribution.distributionId,
    });
  }
}
