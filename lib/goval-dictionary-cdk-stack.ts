import * as cdk from '@aws-cdk/core';
import {Duration, Tag} from '@aws-cdk/core';
import {InstanceClass, InstanceSize, InstanceType, Peer, Port, SecurityGroup, SubnetType, Vpc} from '@aws-cdk/aws-ec2';
import {AwsLogDriver, Cluster, ContainerImage, Ec2TaskDefinition} from '@aws-cdk/aws-ecs';
import {LogGroup} from '@aws-cdk/aws-logs';
import {ApplicationLoadBalancedEc2Service} from '@aws-cdk/aws-ecs-patterns';
import {DnsRecordType, PrivateDnsNamespace} from '@aws-cdk/aws-servicediscovery';
import {ApplicationProtocol} from '@aws-cdk/aws-elasticloadbalancingv2';

export class GovalDictionaryCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = new Vpc(this, 'Vpc', {
      maxAzs: 2,
      cidr: '10.0.0.0/16',
    });

    // Security Group
    const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
      vpc
    });
    securityGroup.addEgressRule(Peer.anyIpv4(), Port.allTraffic());
    securityGroup.addIngressRule(Peer.ipv4('0.0.0.0/0'), Port.tcp(22));
    securityGroup.addIngressRule(Peer.ipv4('0.0.0.0/0'), Port.tcp(80));

    // ECS Cluster
    const ecsCluster = new Cluster(this, 'EcsCluster', {
      clusterName: 'goval-dictionary-cluster',
      vpc: vpc,
    });

    ecsCluster.addCapacity('Capacity', {
      instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.MICRO),
      minCapacity: 1,
      maxCapacity: 1,
      //associatePublicIpAddress: true,
      vpcSubnets: {
        subnetType: SubnetType.PUBLIC,
      },
      keyName: 'goval-dictionary-key',
    });


    // ECS Log setting
    const awsLogDriver = new AwsLogDriver({
      logGroup: new LogGroup(this, 'LogGroup', {
        logGroupName: 'goval-dictionary',
      }),
      streamPrefix: 'goval-dictionary',
    })

    // Container
    const containerImage = ContainerImage.fromRegistry('vuls/goval-dictionary:latest')

    // Task Definition
    const taskDefinition = new Ec2TaskDefinition(this, 'TaskDefinition')

    // Container
    const appContainer = taskDefinition.addContainer('AppContainer', {
      image: containerImage,
      cpu: 256,
      memoryLimitMiB: 512,
      logging: awsLogDriver,
      // MEMO: Override by empty commands
      entryPoint: [],
      command: [],
    });

    appContainer.addPortMappings({
      containerPort: 80,
      hostPort: 80,
    });

    // ECS
    const ec2Service = new ApplicationLoadBalancedEc2Service(this, 'EC2Service', {
      cluster: ecsCluster,
      serviceName: 'goval-dictionary-service',
      desiredCount: 1,
      taskDefinition: taskDefinition,
      protocol: ApplicationProtocol.HTTP,
      publicLoadBalancer: true,
      cpu: 256,
      memoryLimitMiB: 512,
    });

    // Cloud Map
    const namespace = new PrivateDnsNamespace(this, 'NameSpace', {
      name: 'my-goval-dictionary',
      vpc: vpc,
    });

    const service = namespace.createService('Service', {
      name: 'goval-dictionary',
      dnsRecordType: DnsRecordType.A_AAAA,
      dnsTtl: Duration.seconds(30),
      loadBalancer: true,
    });

    service.registerLoadBalancer('LoadBalancer', ec2Service.loadBalancer)

    // tagging
    Tag.add(this, 'ServiceName', 'goval-dictionary')
  }
}
