import * as cdk from '@aws-cdk/core';
import {Duration, RemovalPolicy, Tags} from '@aws-cdk/core';
import {Peer, Port, SecurityGroup, Vpc} from '@aws-cdk/aws-ec2';
import {AwsLogDriver, Cluster, ContainerImage, FargateTaskDefinition} from '@aws-cdk/aws-ecs';
import {LogGroup} from '@aws-cdk/aws-logs';
import {ApplicationLoadBalancedFargateService} from '@aws-cdk/aws-ecs-patterns';
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
      vpc: vpc,
      allowAllOutbound: false,
    });
    securityGroup.addEgressRule(Peer.anyIpv4(), Port.allTraffic());
    //securityGroup.addIngressRule(Peer.ipv4('0.0.0.0/0'), Port.tcp(22));
    securityGroup.addIngressRule(Peer.ipv4('0.0.0.0/0'), Port.tcp(80));

    // ECS Cluster
    const ecsCluster = new Cluster(this, 'EcsCluster', {
      clusterName: 'goval-dictionary-cluster',
      vpc: vpc,
    });

    // ecsCluster.addCapacity('Capacity', {
    //   instanceType: InstanceType.of(InstanceClass.BURSTABLE3, InstanceSize.MICRO),
    //   minCapacity: 1,
    //   maxCapacity: 1,
    //   //associatePublicIpAddress: true,
    //   vpcSubnets: {
    //     subnetType: SubnetType.PUBLIC,
    //   },
    //   keyName: 'goval-dictionary-key',
    // });

    // ECS Log setting
    const logDriver = new AwsLogDriver({
      logGroup: new LogGroup(this, 'LogGroup', {
        logGroupName: 'goval-dictionary',
        removalPolicy: RemovalPolicy.DESTROY,
      }),
      streamPrefix: 'goval-dictionary',
    });

    // Container
    const containerImage = ContainerImage.fromRegistry('vuls/goval-dictionary:latest');

    // Task Definition
    const taskDefinition = new FargateTaskDefinition(this, 'TaskDefinition', {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    // // Task Definition
    // const taskDefinition = new Ec2TaskDefinition(this, 'TaskDefinition');

    // Container
    const appContainer = taskDefinition.addContainer('AppContainer', {
      image: containerImage,
      memoryLimitMiB: 512,
      logging: logDriver,
      //entryPoint: [],
      command: ['server', '-debug-sql', '-log-json', '-bind=0.0.0.0'],
    });

    appContainer.addPortMappings({
      containerPort: 1324,
      //hostPort: 80,
    });

    // ECS - Fargate
    const ecsService = new ApplicationLoadBalancedFargateService(this, 'ECSService', {
      cluster: ecsCluster,
      serviceName: 'goval-dictionary-service',
      desiredCount: 1,
      taskDefinition: taskDefinition,
      protocol: ApplicationProtocol.HTTP,
      publicLoadBalancer: true,
      cpu: 256,
      memoryLimitMiB: 512,
    });

    // // ECS - EC2
    // const ecsService = new ApplicationLoadBalancedEc2Service(this, 'EC2Service', {
    //   cluster: ecsCluster,
    //   serviceName: 'goval-dictionary-service',
    //   desiredCount: 1,
    //   taskDefinition: taskDefinition,
    //   protocol: ApplicationProtocol.HTTP,
    //   publicLoadBalancer: true,
    //   cpu: 256,
    //   memoryLimitMiB: 512,
    // });

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

    service.registerLoadBalancer('LoadBalancer', ecsService.loadBalancer);

    // tagging
    Tags.of(this).add('ServiceName', 'goval-dictionary');
  }
}
