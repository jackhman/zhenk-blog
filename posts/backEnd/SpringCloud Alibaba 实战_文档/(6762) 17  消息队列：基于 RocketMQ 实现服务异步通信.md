# 17 消息队列：基于RocketMQ实现服务异步通信

上一讲，我们讲解了分布式事务的解决方案以及 Seata 分布式事务中间件AT模式的实现原理，在后面的实战篇，我们还将围绕 Seata 进行进一步的学习。本讲我们先来介绍分布式架构下另外一块重要拼图：消息队列 RocketMQ。

本讲咱们将学习以下三方面内容：

* 介绍消息队列与 Alibaba RocketMQ；

* 掌握 RocketMQ 的部署方式；

* 讲解微服务接入 RocketMQ 的开发技巧；

首先咱们先来认识什么是消息队列 MQ 呢？

### 消息队列与 RocketMQ

#### 消息队列 MQ

消息队列（Message Queue）简称 MQ，是一种跨进程的通信机制，通常用于应用程序间进行数据的异步传输，MQ 产品在架构中通常也被叫作"消息中间件"。它的最主要职责就是保证服务间进行可靠的数据传输，同时实现服务间的解耦。

这么说太过学术，我们看一个项目的实际案例，假设市级税务系统向省级税务系统上报本年度税务汇总数据，按以往的设计市级税务系统作为数据的生产者需要了解省级税务系统的 IP、端口、接口等诸多细节，然后通过 RPC、RESTful 等方式同步向省级税务系统发送数据，省级税务系统作为数据的消费者接受后响应"数据已接收"。


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image6/M00/33/1C/Cgp9HWBu2EuANOnqAAEJZsgHoCk159.png"/> 
  
系统间跨进程通信

虽然从逻辑上是没有问题的，但是从技术层面却衍生出三个新问题：

* 假如上报时省级税务系统正在升级维护，市级税务系统就必须设计额外的重发机制保证数据的完整性；

* 假如省级税务系统接收数据需要 1 分钟处理时间，市级税务系统采用同步通信，则市级税务系统传输线程就要阻塞 1 分钟，在高并发场景下如此长时间的阻塞很容易造成系统的崩溃；

* 假如省级税务系统接口的调用方式、接口、IP、端口有任何改变，都必须立即通知市级税务系统进行调整，否则就会出现通信失败。

从以上三个问题可以看出，省级系统产生的变化直接影响到市级税务系统的执行，两者产生了强耦合，如果问题放在互联网的微服务架构中，几十个服务进行串联调用，每个服务间如果都产生类似的强耦合，系统必然难以维护。

为了解决这种情况，我们需要在架构中部署消息中间件，这个组件应提供可靠的、稳定的、与业务无关的特性，使进程间通信解耦，而这一类消息中间件的代表产品就是 MQ 消息队列。当引入 MQ 消息队列后，消息传递过程会产生以下变化。


<Image alt="图片2.png" src="https://s0.lgstatic.com/i/image6/M00/33/24/CioPOWBu2FaAD6pQAAEtpzXgzW8765.png"/> 
  
引入 MQ 后通信过程

可以看到，引入消息队列后，生产者与消费者都只面向消息队列进行数据处理，数据生产者根本不需要了解具体消费者的信息，只要把数据按事先约定放在指定的队列中即可。而消费者也是一样的，消费者端监听消息队列，如果队列中产生新的数据，MQ 就会通过"推送 PUSH"或者"抽取 PULL"的方式让消费者获取到新数据进行后续处理。

通过示意图可以看到，只要消息队列产品是稳定可靠的，那消息通信的过程就是有保障的。在架构领域，很多厂商都开发了自己的 MQ 产品，最具代表性的开源产品有：

* Kafka

* ActiveMQ

* ZeroMQ

* RabbitMQ

* RocketMQ

每一种产品都有自己不同的设计与实现原理，但根本的目标都是相同的：为进程间通信提供可靠的异步传输机制。RocketMQ 作为阿里系产品天然被整合进 Spring Cloud Alibaba 生态，在经历过多次双 11 的考验后，RocketMQ 在性能、可靠性、易用性方面都是非常优秀的，下面咱们来了解下 RocketMQ 吧。

#### RocketMQ

RocketMQ 是一款分布式消息队列中间件，官方地址为[http://rocketmq.apache.org/](http://rocketmq.apache.org/?fileGuid=xxQTRXtVcqtHK6j8)，目前最新版本为4.8.0。RocketMQ 最初设计是为了满足阿里巴巴自身业务对异步消息传递的需要，在 3.X 版本后正式开源并捐献给 Apache，目前已孵化为 Apache 顶级项目，同时也是国内使用最广泛、使用人数最多的 MQ 产品之一。


<Image alt="图片3.png" src="https://s0.lgstatic.com/i/image6/M00/33/1C/Cgp9HWBu2GKABJW5AAPatFf4EbA571.png"/> 


RocketMQ 有很多优秀的特性，在可用性方面，RocketMQ 强调集群无单点，任意一点高可用，客户端具备负载均衡能力，可以轻松实现水平扩容；在性能方面，在天猫双 11 大促背后的亿级消息处理就是通过 RocketMQ 提供的保障；在 API 方面，提供了丰富的功能，可以实现异步消息、同步消息、顺序消息、事务消息等丰富的功能，能满足大多数应用场景；在可靠性方面，提供了消息持久化、失败重试机制、消息查询追溯的功能，进一步为可靠性提供保障。

了解 RocketMQ 的诸多特性后，咱们来理解 RocketMQ 几个重要的概念：

* 消息 Message：消息在广义上就是进程间传递的业务数据，在狭义上不同的 MQ 产品对消息又附加了额外属性如：Topic（主题）、Tags（标签）等；

* 消息生产者 Producer：指代负责生产数据的角色，在前面案例中市级税务系统就充当了消息生产者的角色；

* 消息消费者 Consumer：指代使用数据的角色，前面案例的省级税务系统就是消息消费者；

* MQ消息服务 Broker：MQ 消息服务器的统称，用于消息存储与消息转发；

* 生产者组 Producer Group：对于发送同一类消息的生产者，RocketMQ 对其分组，成为生产者组；

* 消费者组 Consumer Group：对于消费同一类消息的消费者，RocketMQ 对其分组，成为消费者组。


<Image alt="图片4.png" src="https://s0.lgstatic.com/i/image6/M00/33/1C/Cgp9HWBu2G-ASqw3AAELZIiTELk603.png"/> 
  
RocketMQ 组成示意图

在理解这些基本概念后，咱们正式进入 RocketMQ 的部署与使用环节，通过案例代码理解 RocketMQ 的执行过程。对于 RocketMQ 来说，使用它需要两个阶段：搭建 RocketMQ 服务器集群与应用接入 RocketMQ 队列，首先咱们来部署 RocketMQ 集群。

### 部署 RocketMQ 集群

RocketMQ 天然采用集群模式，常见的 RocketMQ 集群有三种形式：**多 Master 模式** 、**多 Master 多 Slave- 异步复制模式** 、**多 Master 多 Slave- 同步双写模式**，这三种模式各自的优缺点如下。

* 多 Master 模式是配置最简单的模式，同时也是使用最多的形式。优点是单个 Master 宕机或重启维护对应用无影响，在磁盘配置为 RAID10 时，即使机器宕机不可恢复情况下，由于 RAID10 磁盘非常可靠，同步刷盘消息也不会丢失，性能也是最高的；缺点是单台机器宕机期间，这台机器上未被消费的消息在机器恢复之前不可订阅，消息实时性会受到影响。

* 多 Master 多 Slave 异步复制模式。每个 Master 配置一个 Slave，有多对 Master-Slave，HA 采用异步复制方式，主备有短暂消息毫秒级延迟，即使磁盘损坏只会丢失少量消息，且消息实时性不会受影响。同时 Master 宕机后，消费者仍然可以从 Slave 消费，而且此过程对应用透明，不需要人工干预，性能同多 Master 模式几乎一样；缺点是 Master 宕机，磁盘损坏情况下会丢失少量消息。

* 多 Master 多 Slave 同步双写模式，HA 采用同步双写方式，即只有主备都写成功，才向应用返回成功，该模式数据与服务都无单点故障，Master 宕机情况下，消息无延迟，服务可用性与数据可用性都非常高；缺点是性能比异步复制模式低 10% 左右，发送单个消息的执行时间会略高，且目前版本在主节点宕机后，备机不能自动切换为主机。

本讲我们将搭建一个双 Master 服务器集群，首先来看一下部署架构图：


<Image alt="图片5.png" src="https://s0.lgstatic.com/i/image6/M00/33/24/CioPOWBu2HyAJB6-AACJ2Or_yLg890.png"/> 
  
双 Master 架构图

在双 Master 架构中，出现了一个新角色 NameServer（命名服务器），NameServer 是 RocketMQ 自带的轻量级路由注册中心，支持 Broker 的动态注册与发现。在 Broker 启动后会自动向 NameServer 发送心跳包，通知 Broker 上线。当 Provider 向 NameServer 获取路由信息，然后向指定 Broker 建立长连接完成数据发送。

为了避免单节点瓶颈，通常 NameServer 会部署两台以上作为高可用冗余。NameServer 本身是无状态的，各实例间不进行通信，因此在 Broker 集群配置时要配置所有 NameServer 节点以保证状态同步。

部署 RocketMQ 集群要分两步：部署 NameServer 与部署 Broker 集群。

#### 第一步，部署 NameServer 集群。

我们创建两台 CentOS7 虚拟机，IP 地址分别为 192.168.31.200 与 192.168.31.201，要求这两台虚拟机内存大于 2G，并安装好 64 位 JDK1.8，具体过程不再演示。

之后访问 Apache RocketMQ 下载页：

[https://www.apache.org/dyn/closer.cgi?path=rocketmq/4.8.0/rocketmq-all-4.8.0-bin-release.zip](https://www.apache.org/dyn/closer.cgi?path=rocketmq/4.8.0/rocketmq-all-4.8.0-bin-release.zip&fileGuid=xxQTRXtVcqtHK6j8)

获取 RocketMQ 最新版 rocketmq-all-4.8.0-bin-release.zip，解压后编辑 rocketmq-all-4.8.0-bin-release/bin/runserver.sh 文件，因为 RocketMQ 是服务器软件，默认为其配置 8G 内存，这是 PC 机及或者笔记本吃不消的，所以在 82 行附近将 JVM 内存缩小到 1GB 以方便演示。

修改前：

```java
JAVA_OPT="${JAVA_OPT} -server -Xms8g -Xmx8g -Xmn4g -XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=320m"
```

修改后：

```java
JAVA_OPT="${JAVA_OPT} -server -Xms1g -Xmx1g -Xmn512m -XX:MetaspaceSize=128m -XX:MaxMetaspaceSize=320m"
```

修改完毕，将 rocketmq-all-4.8.0-bin-release 上传到两台 NameServer 虚拟机的 /usr/local 目录下，执行 bin 目录下的 mqnamesrv 命令。

```java
cd /usr/local/rocketmq-all-4.8.0-bin-release/bin/
sh mqnamesrv
```

mqnamesrv 是 RocketMQ 自带 NameServer 的启动命令，执行后看到 The Name Server boot success. serializeType=JSON 就代表 NameServer 启动成功，NameServer 将占用 9876 端口提供服务，不要忘记在防火墙设置放行。之后如法炮制在另一台 201 设备上部署 NameServer，构成 NameServer 集群。

#### 第二步，部署 Broker 集群。

我们再额外创建两台 CentOS7 虚拟机，IP 地址分别为 192.168.31.210 与 192.168.31.211，同样要求这两台虚拟机内存大于 2G，并安装好 64 位 JDK1.8。

打开 rocketmq-all-4.8.0-bin-release 目录，编辑 /bin/runbroker.sh 文件，同样将启动 Broker 默认占用内存从 8G 缩小到 1G，将 64 行调整为以下内容：

```java
JAVA_OPT="${JAVA_OPT} -server -Xms1g -Xmx1g -Xmn512m"
```

在 conf 目录下，RocketMQ 已经给我们贴心的准备好三组集群配置模板：

* 2m-2s-async 代表双主双从异步复制模式；

* 2m-2s-sync 代表双主双从同步双写模式；

* 2m-noslave 代表双主模式。

我们在 2m-noslave 双主模式目录中，在 broker-a.properties 与 broker-b.properties 末尾追加 NameServer 集群的地址，为了方便理解我也将模板里面每一项的含义进行注释，首先是 broker-a.properties 的完整内容如下：

```java
#集群名称，同一个集群下的 broker 要求统一
brokerClusterName=DefaultCluster
#broker 名称
brokerName=broker-a
#brokerId=0 代表主节点，大于零代表从节点
brokerId=0
#删除日志文件时间点，默认凌晨 4 点
deleteWhen=04
#日志文件保留时间，默认 48 小时
fileReservedTime=48
#Broker 的角色
#- ASYNC_MASTER 异步复制Master
#- SYNC_MASTER 同步双写Master
brokerRole=ASYNC_MASTER
#刷盘方式
#- ASYNC_FLUSH 异步刷盘，性能好宕机会丢数
#- SYNC_FLUSH 同步刷盘，性能较差不会丢数
flushDiskType=ASYNC_FLUSH
#末尾追加，NameServer 节点列表，使用分号分割
namesrvAddr=192.168.31.200:9876;192.168.31.201:9876
```

broker-b.properties 只有 brokerName 不同，如下所示：

```java
brokerClusterName=DefaultCluster
brokerName=broker-b
brokerId=0
deleteWhen=04
fileReservedTime=48
brokerRole=ASYNC_MASTER
flushDiskType=ASYNC_FLUSH
#末尾追加，NameServer 节点列表，使用分号分割
namesrvAddr=192.168.31.200:9876;192.168.31.201:9876
```

之后将 rocketmq-all-4.8.0-bin-release 目录上传到 /usr/local 目录，运行下面命令启动 broker 节点 a。

```java
cd /usr/local/rocketmq-all-4.8.0-bin-release/
sh bin/mqbroker -c ./conf/2m-noslave/broker-a.properties
```

在 mqbroker 启动命令后增加 c 参数说明要加载哪个 Broker 配置文件。

启动成功会看到下面的日志，Broker 将占用 10911 端口提供服务，请设置防火墙放行。

```java
The broker[broker-a, 192.168.31.210:10911] boot success. serializeType=JSON and name server is 192.168.31.200:9876;192.168.31.201:9876
```

同样的，在另一台 Master 执行下面命令，启动并加载 broker-b 配置文件。

```java
cd /usr/local/rocketmq-all-4.8.0-bin-release/
sh bin/mqbroker -c ./conf/2m-noslave/broker-b.properties
```

到这里 NameServer 集群与 Broker 集群就部署好了，下面执行两个命令验证下。

第一个，使用 mqadmin 命令查看集群状态。

在 bin 目录下存在 mqadmin 命令用于管理 RocketMQ 集群，我们可以使用 clusterList 查看集群节点，命令如下：

```java
sh mqadmin clusterList -n 192.168.31.200:9876
```

通过查询 NameServer 上的注册信息，得到以下结果。


<Image alt="图片6.png" src="https://s0.lgstatic.com/i/image6/M00/33/1C/Cgp9HWBu2J6APWfJAAH7nUt8GHs198.png"/> 
  
Broker 集群信息

可以看到在 DefaultCluster 集群中存在两个 Broker，因为 BID 编号为 0，代表它们都是 Master 主节点。

第二个，利用 RocketMQ 自带的 tools.sh 工具通过生成演示数据来测试 MQ 实际的运行情况。在 bin 目录下使用下面命令。

```java
export NAMESRV_ADDR=192.168.31.200:9876
sh tools.sh org.apache.rocketmq.example.quickstart.Producer
```

你会看到屏幕输出日志：

```java
SendResult [sendStatus=SEND_OK, msgId=7F0000010B664DC639969F28CF540000, offsetMsgId=C0A81FD200002A9F00000000000413B6, messageQueue=MessageQueue [topic=TopicTest, brokerName=broker-a, queueId=1], queueOffset=0]
SendResult [sendStatus=SEND_OK, msgId=7F0000010B664DC639969F28CF9B0001, offsetMsgId=C0A81FD200002A9F000000000004147F, messageQueue=MessageQueue [topic=TopicTest, brokerName=broker-a, queueId=2], queueOffset=0]
SendResult [sendStatus=SEND_OK, msgId=7F0000010B664DC639969F28CFA30002, offsetMsgId=C0A81FD200002A9F0000000000041548, messageQueue=MessageQueue [topic=TopicTest, brokerName=broker-a, queueId=3], queueOffset=0]
SendResult [sendStatus=SEND_OK, msgId=7F0000010B664DC639969F28CFA70003, offsetMsgId=C0A81FD300002A9F0000000000033C56, messageQueue=MessageQueue [topic=TopicTest, brokerName=broker-b, queueId=0], queueOffset=0]
SendResult [sendStatus=SEND_OK, msgId=7F0000010B664DC639969F28CFD60004, offsetMsgId=C0A81FD300002A9F0000000000033D1F, messageQueue=MessageQueue [topic=TopicTest, brokerName=broker-b, queueId=1], queueOffset=0]
SendResult [sendStatus=SEND_OK, msgId=7F0000010B664DC639969F28CFDB0005, offsetMsgId=C0A81FD300002A9F0000000000033DE8, messageQueue=MessageQueue [topic=TopicTest, brokerName=broker-b, queueId=2], queueOffset=0]
...
```

其中**broker-a、broker-b 交替出现**说明集群生效了。

前面测试的是服务提供者，下面测试消费者，运行下面命令：

```java
export NAMESRV_ADDR=192.168.31.200:9876
sh tools.sh org.apache.rocketmq.example.quickstart.Consumer
```

会看到消费者也获取到数据，到这里 RocketMQ 双 Master 集群的搭建就完成了，至于多 Master 多 Slave 的配置也是相似的，大家查阅官方文档相信也能很快上手。

```java
ConsumeMessageThread_11 Receive New Messages: [MessageExt [brokerName=broker-b, queueId=2, storeSize=203, queueOffset=157, sysFlag=0, bornTimestamp=1612100880154, bornHost=/192.168.31.210:54104, storeTimestamp=1612100880159, storeHost=/192.168.31.211:10911, msgId=C0A81FD300002A9F0000000000053509, commitLogOffset=341257, bodyCRC=1116443590, reconsumeTimes=0, preparedTransactionOffset=0, toString()=Message{topic='TopicTest', flag=0, properties={MIN_OFFSET=0, MAX_OFFSET=158, CONSUME_START_TIME=1612100880161, UNIQ_KEY=7F0000010DA64DC639969F2C4B1A0314, CLUSTER=DefaultCluster, WAIT=true, TAGS=TagA}, body=[72, 101, 108, 108, 111, 32, 82, 111, 99, 107, 101, 116, 77, 81, 32, 55, 56, 56], transactionId='null'}]] 
ConsumeMessageThread_12 Receive New Messages: [MessageExt [brokerName=broker-b, queueId=3, storeSize=203, queueOffset=157, sysFlag=0, bornTimestamp=1612100880161, bornHost=/192.168.31.210:54104, storeTimestamp=1612100880162, storeHost=/192.168.31.211:10911, msgId=C0A81FD300002A9F00000000000535D4, commitLogOffset=341460, bodyCRC=898409296, reconsumeTimes=0, preparedTransactionOffset=0, toString()=Message{topic='TopicTest', flag=0, properties={MIN_OFFSET=0, MAX_OFFSET=158, CONSUME_START_TIME=1612100880164, UNIQ_KEY=7F0000010DA64DC639969F2C4B210315, CLUSTER=DefaultCluster, WAIT=true, TAGS=TagA}, body=[72, 101, 108, 108, 111, 32, 82, 111, 99, 107, 101, 116, 77, 81, 32, 55, 56, 57], transactionId='null'}]]
```

集群部署好，那如何使用 RocketMQ 进行消息收发呢？我们结合 Spring Boot 代码进行讲解。

### 应用接入 RocketMQ 集群


<Image alt="图片2.png" src="https://s0.lgstatic.com/i/image6/M00/33/24/CioPOWBu2KuAeQ6nAAEtpzXgzW8352.png"/> 
  
案例说明

我们以前面的报税为例，利用 Spring Boot 集成 MQ 客户端实现消息收发，首先咱们模拟生产者 Producer。

#### 生产者 Producer 发送消息

第一步，利用 Spring Initializr 向导创建 rocketmq-provider 工程，确保 pom.xml 引入以下依赖。

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<!-- RocketMQ客户端，版本与Broker保持一致 -->
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-client</artifactId>
    <version>4.8.0</version>
</dependency>
```

第二步，配置应用 application.yml。

rocketmq-client 主要通过编码实现通信，因此无须在 application.yml 做额外配置。

```yaml
server:
  port: 8000
spring:
  application:
    name: rocketmq-producer
```

第三步，创建 Controller，生产者发送消息。

```java
@RestController
public class ProviderController {
    Logger logger = LoggerFactory.getLogger(ProviderController.class);
    @GetMapping(value = "/send_s1_tax")
    public String send1() throws MQClientException {
        //创建DefaultMQProducer消息生产者对象
        DefaultMQProducer producer = new DefaultMQProducer("producer-group");
        //设置NameServer节点地址，多个节点间用分号分割
        producer.setNamesrvAddr("192.168.31.200:9876;192.168.31.201:9876");
        //与NameServer建立长连接
        producer.start();
        try {
            //发送一百条数据
            for(int i = 0 ; i< 100 ; i++) {
                //数据正文
                String data = "{\"title\":\"X市2021年度第一季度税务汇总数据\"}";
                /*创建消息
                    Message消息三个参数
                    topic 代表消息主题，自定义为tax-data-topic说明是税务数据
                    tags 代表标志，用于消费者接收数据时进行数据筛选。2021S1代表2021年第一季度数据
                    body 代表消息内容
                */
                Message message = new Message("tax-data-topic", "2021S1", data.getBytes());
                //发送消息，获取发送结果
                SendResult result = producer.send(message);
                //将发送结果对象打印在控制台
                logger.info("消息已发送：MsgId:" + result.getMsgId() + "，发送状态:" + result.getSendStatus());
            }
        } catch (RemotingException e) {
            e.printStackTrace();
        } catch (MQBrokerException e) {
            e.printStackTrace();
        } catch (InterruptedException e) {
            e.printStackTrace();
        } finally {
            producer.shutdown();
        }
        return "success";
    }
}
```

在程序运行后，访问[http://localhost:8000/send_s1_tax](http://localhost:8000/send_s1_tax?fileGuid=xxQTRXtVcqtHK6j8)，在控制台会看到如下输出说明数据已被 Broker 接收，Broker 接收后 Producer 端任务已完成。

```java
消息已发送：MsgId:7F00000144E018B4AAC29F3B7B280062，发送状态:SEND_OK
消息已发送：MsgId:7F00000144E018B4AAC29F3B7B2A0063，发送状态:SEND_OK
```

下面咱们开发消费者 Consumer。

#### 消费者 Consumer 接收消息

第一步，利用 Spring Initializr 向导创建 rocketmq-consumer 工程，确保 pom.xml 引入以下依赖。

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<!-- RocketMQ客户端，版本与Broker保持一致 -->
<dependency>
    <groupId>org.apache.rocketmq</groupId>
    <artifactId>rocketmq-client</artifactId>
    <version>4.8.0</version>
</dependency>
```

第二步，application.yml 同样无须做额外设置。

```yaml
server:
  port: 9000
spring:
  application:
    name: rocketmq-consumer
```

第三步，在应用启动入口 RocketmqConsumerApplication 增加消费者监听代码，关键的代码都已做好注释。

```java
@SpringBootApplication
public class RocketmqConsumerApplication {
    private static Logger logger = LoggerFactory.getLogger(RocketmqConsumerApplication.class);
    public static void main(String[] args) throws MQClientException {
        SpringApplication.run(RocketmqConsumerApplication.class, args);
        //创建消费者对象
        DefaultMQPushConsumer consumer = new DefaultMQPushConsumer("consumer-group");
        //设置NameServer节点
        consumer.setNamesrvAddr("192.168.31.200:9876;192.168.31.201:9876");
        /*订阅主题，
        consumer.subscribe包含两个参数：
        topic: 说明消费者从Broker订阅哪一个主题，这一项要与Provider保持一致。
        subExpression: 子表达式用于筛选tags。
            同一个主题下可以包含很多不同的tags，subExpression用于筛选符合条件的tags进行接收。
            例如：设置为*，则代表接收所有tags数据。
            例如：设置为2020S1，则Broker中只有tags=2020S1的消息会被接收，而2020S2就会被排除在外。
        */
        consumer.subscribe("tax-data-topic", "*");
        //创建监听，当有新的消息监听程序会及时捕捉并加以处理。
        consumer.registerMessageListener(new MessageListenerConcurrently() {
            public ConsumeConcurrentlyStatus consumeMessage(
                    List<MessageExt> msgs, ConsumeConcurrentlyContext context) {
                //批量数据处理
                for (MessageExt msg : msgs) {
                    logger.info("消费者消费数据:"+new String(msg.getBody()));
                }
                //返回数据已接收标识
                return ConsumeConcurrentlyStatus.CONSUME_SUCCESS;
            }
        });
        //启动消费者，与Broker建立长连接，开始监听。
        consumer.start();
    }
}
```

当应用启动后，Provider 产生新消息的同时，Consumer 端就会立即消费掉，控制台产生输出。

```java
2021-01-31 22:25:14.212  INFO 17328 --- [MessageThread_3] c.l.r.RocketmqConsumerApplication        : 消费者消费数据:{"title":"X市2021年度第一季度税务汇总数据"}
2021-01-31 22:25:14.217  INFO 17328 --- [MessageThread_2] c.l.r.RocketmqConsumerApplication        : 消费者消费数据:{"title":"X市2021年度第一季度税务汇总数据"}
```

以上便是 Spring Boot 接入 RocketMQ 集群的过程。对于当前的案例我们是通过代码方式控制消息收发，在 Spring Cloud 生态中还提供了 Spring Cloud Stream 模块，允许程序员采用"声明式"的开发方式实现与 MQ 更轻松的接入，但 Spring Cloud Stream 本身封装度太高，很多 RocketMQ 的细节也被隐藏了，这对于入门来说并不是一件好事。在掌握 RocketMQ 的相关内容后再去学习 Spring Cloud Stream 你会理解得更加透彻。

### 小结与预告

本讲咱们学习了三方面内容，首先介绍了什么是 MQ 以及 Alibaba RocketMQ 的特性；其次详细讲解了 RocketMQ 双主集群的部署过程；最后通过 Spring Boot 应用中引入 RocketMQ-Client 实现消息的收发。

这里为你留一道思考题：目前主流的 MQ 产品有 RocketMQ、RabbitMQ、Kafka、ActiveMQ、ZeroMQ......不同的产品有不同的设计，假设在银行的金融交易基于 MQ 实现，对 MQ 的可靠性与一致性要求较高，但对数据的响应时间不敏感。如果你是架构师该如何选型，欢迎你把自己的思考写在评论区和大家一起分享。

下一讲我们将开始一个新的篇章，将之前学过的 Spring Cloud Alibaba 综合运用，看在实际项目中有哪些成熟的经验可以为我所用。

