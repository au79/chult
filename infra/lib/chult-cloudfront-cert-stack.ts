import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';

export class ChultCloudFrontCertStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const hostedZoneId = new cdk.CfnParameter(this, 'HostedZoneId', {
      type: 'String',
      description: 'Route 53 hosted zone ID for your domain (for example, example.com).',
    });

    const hostedZoneName = new cdk.CfnParameter(this, 'HostedZoneName', {
      type: 'String',
      description: 'Route 53 hosted zone name (no trailing dot).',
    });

    const subdomain = new cdk.CfnParameter(this, 'Subdomain', {
      type: 'String',
      default: 'chult',
      description: 'Subdomain label to use for the service (no zone suffix).',
    });

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'HostedZone', {
      hostedZoneId: hostedZoneId.valueAsString,
      zoneName: hostedZoneName.valueAsString,
    });

    const fullDomainName = `${subdomain.valueAsString}.${hostedZoneName.valueAsString}`;

    const certificate = new acm.Certificate(this, 'ChultCloudFrontCertificate', {
      domainName: fullDomainName,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    new cdk.CfnOutput(this, 'CloudFrontCertArn', {
      value: certificate.certificateArn,
    });
  }
}
