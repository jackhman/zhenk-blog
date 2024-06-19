# 第20讲：日均数据量30亿的Filebeat+Kafka+Mirrormaker跨机房实时日志传送案例

### 案例环境介绍

这是我们之前的一个应用案例，先说一下业务场景，这是一款电商 App 产品，此 App 运行在某公有云上，每天都会产生大量日志，其中涉及访问日志、购买日志、订单日志等多个信息，这些信息比较敏感。因此需要日志产生后马上回传到我们自建的 IDC 数据中心，然后存储在内部的大数据平台上，最后进行各种维度的分析和报表展示。我们的日志数据量每天平均在 30 亿左右，数据是实时产生，要求能实时的传输到 IDC 数据中心，数据延时不能超过 10 秒钟。

由于涉及数据量比较大，又对实时性要求较高，并且还是跨广域网传输数据，所以传统的日志文件传输方法肯定行不通了。为了更快地传输和更小的延时，我们将 App 服务部署在了华北区域，因为我们的数据中心在北京。基于此，最初采用 Flume+Kafka 的方案，用 Flume 作为日志收集工具，在每个 App 服务器上安装 Flume Agent 来收集日志数据，然后，实时地将日志数据传输到 IDC 数据中心的 Kafka 集群中。

但此方案使用不久，就发生了问题，第一个问题是服务器上安装的 Flume Agent 太消耗系统内存和 CPU 资源，影响了 App 服务器的正常运行；第二个问题是数据传输到 Kafka 集群时，由于网络抖动或者故障会出现丢失数据或者数据重复的问题，并且一旦出现数据丢失或者重复，无法进行补录数据，这是我们所不能容忍的。

后来，在经过多次的讨论和研究，改进了数据传输方案，这次采用了 **Filebeat 加双 Kafka 集群** 的方式，也就是在 App 服务器上部署 Filebeat 软件，用来收集 App 日志数据；然后在公有云部署了一台 Kafka 集群，Filebeat 收集到的数据直接通过内网发送到公有云上的 Kafka 集群中；接着公有云上的 Kafka 集群再将数据实时同步到 IDC 数据中心的 Kafka 集群中，两个 Kafka 集群直接同步了我们采用的 **Kafka MirrorMaker**。这是 Kafka 官方提供的跨数据中心的流数据同步方案。

经过多次测试和试运行，此方案完美地满足了我们的应用需要，Filebeat 在前端 App 服务器上占有 CPU 资源最多在 10% 左右，内存维持在 2G 左右，这对 App 服务不会有任何影响。同时，由于采用了 2 个 Kafka 集群，Filebeat 和公有云上的 Kafka 是内网数据传输，所以不会出现网络问题。而两个 Kafka 之间的数据传输，虽然说也会由于网络延时或者抖动出现数据丢失或者重复的问题，但是，在发现某个时段数据有问题的时候，只需要在 IDC 数据中心的 Kafka 集群上重新拉取一下公有云 Kafka 集群上这个故障时间段的数据就行了。因而也不用担心网络出现问题。

目前此架构已经稳定运行了 2 年多，非常稳定。

### Kafka MirrorMaker 如何工作

上面案例中提到了 MirrorMaker，Kakfa MirrorMaker 是 Kafka 官方提供的一个跨数据中心的流数据同步方案。它的实现原理是从一个源 Kafka 集群消费消息，然后在将消息生产到目标 Kafka 集群，其实就是一个普通的生产和消费。要使用 MirrorMaker，只需要简单地配置一下 MirrorMaker 的 Consumer 和 Producer，然后启动 MirrorMaker，就可以实现两个 Kafka 集群的准实时数据同步。

下图是一个 MirrorMaker 原理架构图：


<Image alt="6.png" src="https://s0.lgstatic.com/i/image/M00/2B/C8/Ciqc1F7-_leALHMZAADu46coWFk590.png"/> 


从图中可以看出，MirrorMaker 位于源 Kafka 集群和目标 Kafka 集群之间，MirrorMaker 从源 Kafka 集群消费数据，此时 MirrorMaker 是一个 Consumer；接着，Kafka 将消费过来的数据直接通过网络传输到目标的 Kafka 集群中，此时 MirrorMaker 是一个 Producer。在实际的使用中，源 Kafka 集群和目标 Kafka 集群可以在不同的网络中，也可以跨广域网，此时的 MirrorMaker 就是一个 Kafka 集群的镜像，实现了数据的实时同步和异地备份。

在实际的使用中，MirrorMaker 可以和目标 Kafka 集群运行在一起，也可以将 MirrorMaker 单独运行在一个独立的机器上。根据我们的使用经验，MirrorMaker 单独运行在一台机器上性能更加稳定。

### 实时日志传输架构

上面提到了 Filebeat 加双 Kafka 集群，然后通过 Kafka MirrorMaker 在两个 Kafka 集群之间同步数据的应用架构。我们的 App 服务器有 20 台，每台都安装 Filebeat，然后指定要收集的日志，而两个 Kafka 集群，都采用 6 个节点构建，MirrorMaker 分布式部署在 3 个节点上。整个实时日志传输架构如下图所示：


<Image alt="7.png" src="https://s0.lgstatic.com/i/image/M00/2B/C8/Ciqc1F7-_mOAV8jJAAI6p1ez7Zc179.png"/> 


从此图可以看出，此架构总共需要 15 台服务器，公有云 6 台、IDC 数据中心 9 台，其中，6 台部署 Kafka 集群，3 台部署 MirrorMaker 来消费公有云的 Kafka 集群数据。由于是实时传输数据，公有云每个 Kafka 节点的带宽设置为 20M 即可。

对于每个主机的配置，我们的经验是 16 核 CPU、32GB 内存即可，磁盘用普通的 HDD 硬盘可能会有性能瓶颈，推荐使用 SSD 固态硬盘。

在这个架构中，Filebeat、Kafka 的使用前面课时均进行过介绍，这里重点介绍的是 Kafka MirrorMaker 如何配置和使用。

### Filebeat 与 MirrorMaker 的配置

这里我们假定两个 Kafka 集群已经部署完成了，部署过程不再介绍。接着，我们来看看如何配置 Filebeat 和 MirrorMaker。

Filebeat 需要在 App 服务器的每个节点都部署，这里以一个节点为例，其他节点类似。Filebeat 采用 7.7.1 版本，配置好的 filebeat 文件内容如下：

```java
filebeat.inputs:
- type: log
  enabled: true
  paths:
    - /data/openresty/logs/mg_2020*.log
  fields:
   log_topic: mglogs
filebeat.config.modules:
  path: ${path.config}/modules.d/*.yml
  reload.enabled: false
name: "appserver1"
output.kafka:
  enabled: true
  hosts: ["172.16.213.31:9092", "172.16.213.41:9092", "172.16.213.70:9092"]
  version: "0.10"
  topic: '%{[fields][log_topic]}'
  codec.format.string: '%{[message]}'
  partition.round_robin:
    reachable_only: true
  worker: 2
  required_acks: 1
  compression: gzip
  max_message_bytes: 10000000
processors:
 - drop_fields:
    fields: ["input", "host", "agent.type", "agent.ephemeral_id", "agent.id", "agent.version", "ecs"]
logging.level: info
```

上面配置中，/data/openresty/logs 是 App 日志的生成目录，此目录下每隔一小时产生一个文件，文件名以时间命名，比如 mg_2020-06-23-18.log，上面通过通配符匹配的方式，将所有日志动态匹配给 Filebeat。

最后的 output.kafka 配置是将日志输出到 Kafka 集群中，hosts 中指定了 Kafka 集群节点信息。注意，这个 Kafka 集群位于公有云上。

接着，就是 MirrorMaker 的配置了，其是以一个脚本的形式默认保存在 Kafka 安装目录下的 bin 子目录下，脚本名为 kafka-mirror-maker.sh。要启动这个脚本，需要先配置两个文件，即 $KAFKA_HOME/config/consumer.properties 和 $KAFKA_HOME/config/producer.properties。consumer.properties 文件是配置 MirrorMaker 从公有云 Kafka 集群中消费数据的属性，常见的配置项内容如下：

```java
bootstrap.servers=cloudkafka1:9092,cloudkafka2:9092,cloudkafka3:9092
group.id=cloudgroup
enable.auto.commit=false
request.timeout.ms=180000
heartbeat.interval.ms=1000
session.timeout.ms=120000
max.poll.interval.ms=600000
max.poll.records=120000
auto.offset.reset=earliest
```

对这几个参数的含义介绍如下：

* bootstrap.servers：指定去消费的 Kafka 集群的 broker 地址，不需要将 Kafka 集群中所有的 broker 都配置上，因为启动后会自动地发现集群的所有 broker。

* group.id：指定该 consumer 想要加入哪个 Group 中，也就是指定一个 Consumer Group。一条消息可以被多个 Consumer Group 消费，但是一条消息只会被 Consumer Group 中的一个 Consumer 消费。

* enable.auto.commit：指定了消费者是否自动提交偏移量，默认值是 true，但自动提交会带来重复消费和数据丢失的问题，建议把它设置为 false，手动控制提交偏移量。

* request.timeout.ms：当请求发起后，并不一定会很快接收到响应信息，这个配置就是来配置请求的超时时间。

* heartbeat.interval.ms：表示心跳间隔，心跳是确定 consumer 存活，加入或者退出 Group 的有效手段。

* session.timeout.ms：表示 Consumer Session 过期时间，当 Consumer 由于某种原因不能发 Heartbeat 到协调器时，并且时间超过 session.timeout.ms 的设置，Kafka 就会认为该 Consumer 已退出，它所订阅的 Partition 会分配到同一 Group 内的其他 Consumer 上，此值必须大于 heartbeat.interval.ms 的值。

* max.poll.interval.ms：设置 Consumer 处理逻辑最大时间，如果 Consumer 长时间没有调用 poll，且间隔超过这个值时，就会认为这个 Consumer 失败了。

* max.poll.records：Consumer 每次调用 poll 时取到的消息的最大数量，需要合理设置这个值，如果设置过大，会导致一次 poll 操作返回的消息记录无法在 max.poll.interval.ms 指定的时间内完成，就会触发 rebalance 操作。

* auto.offset.reset：设置消费者在读取一个没有偏移量或者偏移量无效的情况下，应该如何处理，默认值是 latest，也就是从最新纪录读取数据；还有一个值为 earliest，表示在偏移量无效的情况下，消费者从头开始消费数据。建议使用 earliest。设置该参数后 Kafka 如果出错重启，找到未消费的 offset 可以继续消费。而 latest 这个设置容易丢失数据。

此配置文件中，大部分是优化参数，优化参数的设置需要根据具体应用场景来设定，因此需要深入了解每个参数的含义和使用细节。

另一个需要配置的是 producer.properties，此文件用来控制将数据发送到 IDC 数据中心的 Kafka 集群的属性值，常见的配置项内容如下：

```java
bootstrap.servers=idckafka1:9092,idckafka2:9092,idckafka3:9092
acks=all
batch.size=16348
linger.ms=1
max.block.ms=9223372036854775807
compression.type=gzip
request.timeout.ms=90000
```

对这几个参数的含义介绍如下：

* bootstrap.servers：指定将消息发送到 IDC 数据中心 Kafka 集群的 Broker 地址，不需要将 Kafka 集群中所有的 Broker 都配置上。

* acks：该参数指定了在集群中有多少个分区副本收到消息，Kafka Producer 才会认为消息写入成功。这个参数对消息是否丢失有很大的影响，可以设置的值有 0、1 和 all，其中 0 和 1 都有可能丢失数据，设置为 all 时，并且集群至少有 2 个以上的副本时，可以保证不丢失任何数据。此模式安全性最高，但是效率最低。

* batch.size：用来设置 Producer 批量发送的基本单位，每个 Batch 要存放 batch.size 大小的数据后，才可以发送出去。batch.size 默认值是 16KB，因此，Producer 要凑够 16KB 的数据才会发送。

* linger.ms：设置一个 Batch 被创建之后，最多过多久、不管这个 Batch 有没有写满，都必须发送出去了。linger.ms 配合 batch.size 一起来设置，可避免一个 Batch 迟迟凑不满，导致消息一直积压在内存里发送不出去的情况。

* max.block.ms：设置获取 Kafka 集群元数据时生产者的阻塞时间，在超过这个阻塞时间后，生产者会抛出超时异常。

* compression.type：指定消息发送到 Kafka 的 Broker 之前使用哪一种压缩算法，使用压缩可以降低网络传输开销和存储开销，而这往往是向 Kafka 发送消息的瓶颈所在。

* request.timeout.ms：指定了生产者在发送数据时等待 Kafka 集群返回响应的时间。

这两个文件配置完成后，就可以启动 Kakfa MirrorMaker 了，这里我将 MirrorMaker 部署在三个独立的主机上，依次在三台主机上启动 MirrorMaker 服务，启动方式如下：

```java
[kafka@mirrormaker1  kafka]$ cd /usr/local/kafka
[kafka@mirrormaker1 kafka]$ nohup bin/kafka-mirror-maker.sh --consumer.config /usr/local/kafka/config/consumer.properties --num.streams 16 --producer.config /usr/local/kafka/config/producer.properties --whitelist="mglogs*" &
```

其中：

* --num.streams：设置此 MirrorMaker 进程开启的线程数，每个线程就是一个独立的 Consumer。例如上面开启了 16 个线程，也就创建了 16 个 Consumer 进行消息消费。

* --whitelist：设置要同步的 Topic，如果要同步的 Topic 比较多，可以使用正则表达式。

这样，MirrorMaker 服务就启动成功了，可通过查看 nohup.out 文件检查 MirrorMaker 服务是否运行正常。

### 开启数据实时同步

所有配置完成后，就可以开启服务进行数据同步了，首先开启 App 服务器上的每个 Filebeat 服务，然后启动两个 Kafka 集群，最后启动 MirrorMaker 服务，启动后，两个 Kafka 集群就自动开始同步数据了，要查看两个 Kafka 集群之间的数据同步状态，可执行如下命令：

```java
[kafka@mirrormaker1  kafka]$ cd /usr/local/kafka
[kafka@mirrormaker1 kafka]$ bin/kafka-consumer-groups.sh  --bootstrap-server 172.16.213.152:9092,172.16.213.138:9092,172.16.213.80:9092 --describe --group cloudgroup
```

注意，这个命令中指定的 bootstrap-server，是公有云 Kafka 集群的地址和端口。命令执行后，可获得下图所示的状态：


<Image alt="8.png" src="https://s0.lgstatic.com/i/image/M00/2B/C8/Ciqc1F7-_pKAF4RAAABpI2OKlhc572.png"/> 


在这个输出中，分为 9 列。第 1 列是消费组名，第 2 列是同步的 Topic 名，第 3 列 Topic 是对应的 Partition，第 4 列 CURRENT-OFFSET 是现在消费到的 OFFSET 位置，第 5 列 LOG-END-OFFSET 是公有云的 Kafka 集群目前的 OFFSET，第 6 列 LAG 是数据同步延时值，其实就是 LOG-END-OFFSET 减去 CURRENT-OFFSE 的结果，第 7 列是消费者的 ID，如果开启了 16 个消费线程，那么就会有 16 个消费 ID，第 8 列的 HOST 表示 MirrorMaker 服务对应的主机地址，最后一列显示的是消费者对应的客户端 ID。

这里需要重点关注的是 LAG 这一列，通过此列可以看出两个 Kafka 之间数据同步、延时状态。如果长期持续 LAG 列对应的值很大，就要考虑优化 MirrorMaker，因为过大的延时会导致实时数据同步出现延时，影响后端的实时分析业务。

### 使用 MirrorMaker 需要注意的事项

在使用 MirrorMaker 对两个 Kafka 集群进行数据同步时，经常出现的问题有数据延时、数据重复或数据丢失。如果两个 Kafka 集群之间是跨广域网同步，那么数据不一致问题可能会经常发生，针对这种情况，可从如下几个方面优化，最大限度保证数据的完整性。

（1）如果出现数据延时过大，那么可启动多个 MirrorMaker 进程，同时单个进程启动多个 Consuemr Streams，这样可以提高吞吐量。

（2）MirrorMaker 建议单独部署在一个独立服务器上，尽量不要和 Kafka 集群共用一台主机，同时，MirrorMaker 服务器应该和目标 Kafka 集群放在同一个网络中。

（3）在跨广域网同步消息时，如果出现网络问题导致同步失败，可在 MirrorMaker 服务器上重新消费某个故障时间段的数据。为了保障数据的完整性，可以将数据按小时同步和存放，例如每小时一个 Topic，这样的话，如果某个小时出现数据异常，可通过另一个消费组重新消费这个小时的数据即可完成数据的补录。

### 总结

本课时主要介绍了如何通过 MirrorMaker 实现两个 Kafka 集群之间的数据同步，此架构部署起来比较简单，但是要做到稳定运行，并不容易。因为网络环境不同，业务量不同，要具体优化的参数也不同，所以，我们要在了解此架构的基础上，根据具体的应用场景进行针对性地调试和优化，做到灵活应用。

