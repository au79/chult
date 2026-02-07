import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as elbv2Targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';

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

    const domainName = new cdk.CfnParameter(this, 'DomainName', {
      type: 'String',
      default: 'chult.oolong.com',
      description: 'Full domain name for the service.',
    });

    const imageTag = new cdk.CfnParameter(this, 'ImageTag', {
      type: 'String',
      default: 'latest',
      description: 'ECR image tag for the Lambda container.',
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

    const vpc = new ec2.Vpc(this, 'ChultVpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
        },
      ],
    });

    const albSecurityGroup = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'Security group for the ALB',
      allowAllOutbound: true,
    });

    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    albSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP redirect');

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'ChultAlb', {
      vpc,
      internetFacing: true,
      securityGroup: albSecurityGroup,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: hostedZoneId.valueAsString,
      zoneName: hostedZoneName.valueAsString,
    });

    const certificate = new acm.Certificate(this, 'ChultCertificate', {
      domainName: domainName.valueAsString,
      validation: acm.CertificateValidation.fromDns(zone),
    });

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
      code: lambda.DockerImageCode.fromEcr(repo, { tag: imageTag.valueAsString }),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
      role: lambdaRole,
    });

    const httpsListener = loadBalancer.addListener('HttpsListener', {
      port: 443,
      certificates: [certificate],
      open: true,
    });

    httpsListener.addTargets('LambdaTarget', {
      targets: [new elbv2Targets.LambdaTarget(handler)],
    });

    loadBalancer.addListener('HttpListener', {
      port: 80,
      open: true,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true,
      }),
    });

    new route53.ARecord(this, 'AlbAliasRecord', {
      zone,
      recordName: domainName.valueAsString,
      target: route53.RecordTarget.fromAlias(new route53Targets.LoadBalancerTarget(loadBalancer)),
    });

    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: loadBalancer.loadBalancerDnsName,
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: repo.repositoryUri,
    });
  }
}
