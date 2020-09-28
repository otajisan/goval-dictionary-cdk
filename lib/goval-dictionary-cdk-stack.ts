import * as cdk from '@aws-cdk/core';
import {Duration, RemovalPolicy, SecretValue, Tags} from '@aws-cdk/core';
import {InstanceClass, InstanceSize, InstanceType, Peer, Port, SecurityGroup, Vpc} from '@aws-cdk/aws-ec2';
import {AwsLogDriver, Cluster, ContainerImage, FargateTaskDefinition} from '@aws-cdk/aws-ecs';
import {LogGroup} from '@aws-cdk/aws-logs';
import {ApplicationLoadBalancedFargateService} from '@aws-cdk/aws-ecs-patterns';
import {DatabaseInstance, DatabaseInstanceEngine, MysqlEngineVersion, PostgresEngineVersion} from '@aws-cdk/aws-rds';

export class GovalDictionaryCdkStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC
    const vpc = Vpc.fromLookup(this, 'Vpc', {vpcName: 'VpcStack/Vpc'});
    // Security Group
    const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
      vpc: vpc,
      securityGroupName: 'GovalDictionaryRDSSg',
      allowAllOutbound: true,
    });
    //securityGroup.addEgressRule(Peer.anyIpv4(), Port.allTraffic(), 'goval-dictionary egress');
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(5432), 'goval-dictionary access from local', false);

    // RDS
    const rds = new DatabaseInstance(this, 'GovalDictionaryDB', {
      vpc: vpc,
      securityGroups: [securityGroup],
      instanceIdentifier: 'goval-dictionary-db',
      instanceType: InstanceType.of(InstanceClass.T3, InstanceSize.MICRO),
      masterUsername: 'root',
      masterUserPassword: SecretValue.plainText('password'),
      engine: DatabaseInstanceEngine.postgres({
        version: PostgresEngineVersion.VER_12,
      }),
      databaseName: 'govaldb',
      iamAuthentication: true,
      enablePerformanceInsights: true,
      autoMinorVersionUpgrade: true,
      multiAz: false,
      backupRetention: Duration.days(7),
      deletionProtection: false,
      port: 5432,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    //rds.connections.allowDefaultPortFrom(securityGroup);

    const dbUrl = 'jdbc:postgresql://' + rds.dbInstanceEndpointAddress + ':' + rds.dbInstanceEndpointPort + '/govaldb';

    // ECS Cluster
    const ecsCluster = new Cluster(this, 'EcsCluster', {
      clusterName: 'goval-dictionary-cluster',
      vpc: vpc,
    });

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

    // Application Container
    taskDefinition.addContainer('AppContainer', {
        image: containerImage,
        memoryLimitMiB: 512,
        logging: logDriver,
        command: ['fetch-ubuntu', '14', '16', '18', '19', '20', '-dbtype=postgres', '-dbpath=' + dbUrl],
        // command: ['server', '-debug-sql', '-log-json', '-bind=0.0.0.0'], // server mode
      }
    ).addPortMappings({
      containerPort: 1324,
    });

    // ECS - Fargate
    new ApplicationLoadBalancedFargateService(this, 'ECSService', {
      cluster: ecsCluster,
      serviceName: 'goval-dictionary-service',
      desiredCount: 1,
      taskDefinition: taskDefinition,
      cpu: 256,
      memoryLimitMiB: 512,
    });

    // tagging
    Tags.of(this).add('ServiceName', 'goval-dictionary');
  }
}
