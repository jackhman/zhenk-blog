# 第18讲：Elaticearch应用架构的实现与调优

### Elasticsearch 介绍

Elasticsearch 是一个实时的分布式搜索和分析引擎，它可以用于全文搜索、结构化搜索及分析，并采用 Java 语言编写，它的主要特点如下：

* 实时搜索、实时分析；

* 分布式架构、实时文件存储，并将每一个字段都编入索引；

* 文档导向，所有的对象全部是文档；

* 高可用性、易扩展，支持集群（Cluster）、分片和复制（Shards and Replicas）；

* 接口友好，支持 JSON。

### Elasticsearch 集群的安装与基础调优

#### 1. Elasticsearch 集群的架构与角色

Elasticsearch 集群的一个**主要特点是去中心化**，从字面上理解就是无中心节点，这是从集群外部来说的，因为从外部来看 Elasticsearch 集群，它在逻辑上是一个整体，与任何一个节点的通信和与整个 Elasticsearch 集群通信是完全相同的。另外，从集群内部来看，集群中可以有多个节点，其中有一个为主节点（Master node），该主节点不是通过配置文件定义的，而是通过选举产生的。

下图为 Elasticsearch 集群的运行架构图：


<Image alt="image1.png" src="https://s0.lgstatic.com/i/image/M00/26/62/CgqCHl7x1ZOAOu_oAAGRjSv511Y066.png"/> 


在 ElasticSearch 的架构中，有三类角色，分别是 Client node、Data node 和 Master node。其关系如下：搜索查询的请求一般是经过 Client node 来向 Data node 获取数据；而索引查询首先请求 Master node 节点，然后 Master node 将请求分配到多个 Data node 节点完成一次索引查询。

本课时介绍的 Elasticsearch 架构中，我们只用了 Data node 和 Master node 角色，省去了 Client node 节点，集群采用 3 个节点，每个节点采用 CentOS 7.7 版本。关于主机和对应的各个角色如下表所示：

|  节点名称   |     IP 地址      |         集群角色          |        安装软件         |
|---------|:--------------:|-----------------------|:-------------------:|
| server1 | 172.16.213.152 | Master node、Data node | elasticsearch-7.7.1 |
| server2 | 172.16.213.138 | Master node、Data node | elasticsearch-7.7.1 |
| server3 | 172.16.213.80  | Data node             | elasticsearch-7.7.1 |

这里对集群中每个角色的含义介绍如下。

* Master node

可以理解为主节点，主要用于元数据（Metadata）的处理，比如索引的新增、删除、分片分配等，以及管理集群各个节点的状态。Elasticsearch 集群中可以定义多个主节点，但是在同一时刻，只有一个主节点起作用，其他定义的主节点，是作为主节点的候选节点存在。当一个主节点故障后，集群会从候选主节点中选举出**新的主节点**。

由于数据的存储和查询都不会走主节点，所以主节点的压力相对较小，因此主节点的内存分配也可以相对少些，但是主节点却是**最重要的** ，因为一旦主节点宕机，整个 Elasticsearch 集群将不可用，所以**一定要保证主节点的稳定性**。

* Data node

可以理解为数据节点，这些节点上保存了数据分片。它负责数据相关操作，比如分片的 CRUD、搜索和整合等。数据节点上面执行的操作都比较消耗 CPU、内存和 I/O 资源，因此数据节点服务器要选择较好的硬件配置，才能获取高效的存储和分析性能。

* Client node

可以理解为客户端节点，属于可选节点，是作为任务分发用的，它里面也会存元数据，但是它不会对元数据做任何修改。Client node 存在的好处是可以分担 Data node 的一部分压力，因为 Elasticsearch 的查询是两层汇聚的结果，第 1 层是在 Data node 上做查询结果汇聚，然后把结果发给 Client node，接收到 Data node 发来的结果后再做第 2 次的汇聚，然后把最终的查询结果返回给用户。这样，Client node 就替 Data node 分担了部分压力。

由上可以看出，每个节点都有存在的意义，我们只有把相关功能和角色划分清楚了，每种节点各尽其责，才能充分发挥出分布式集群的效果。

#### 2. 安装 Elasticsearch 与授权

Elasticsearch 的安装非常简单，首先点击[Elastic](https://www.elastic.co/)[官网下载页面](https://www.elastic.co/)找到适合版本，然后选择 zip、tar、rpm 等格式安装包进行下载。这里我们下载的软件包为 elasticsearch-7.7.1.tar.gz。安装过程如下：

```dart
[root@localhost ~]# tar -zxvf elasticsearch-7.7.1.tar.gz -C /usr/local
[root@localhost ~]# mv /usr/local/elasticsearch-7.7.1  /usr/local/elasticsearch
```

这里我们将 Elasticsearch 安装到了 /usr/local 目录下。由于 Elasticsearch 可以接收用户输入的脚本并且执行，为了系统安全考虑，需要创建一个单独的用户来运行 Elasticsearch。这里创建的普通用户是 elasticsearch，操作如下：

```dart
[root@localhost ~]# useradd elasticsearch
```

然后将 Elasticsearch 的安装目录都授权给该用户，操作如下：

```dart
[root@localhost ~]# chown -R elasticsearch:elasticsearch  /usr/local/elasticsearch
```

#### 3. 操作系统调优

操作系统及 JVM 调优主要是针对安装 Elasticsearch 的机器，为了获取高效、稳定的性能，需要从操作系统和 JVM 两个方面对 Elasticsearch 进行一个简单调优。

对于操作系统，需要调整几个内核参数，将下面内容添加到 /etc/sysctl.conf 文件中：

```dart
fs.file-max=655360
vm.max_map_count = 262144
```

其中，第一个参数 fs.file-max 主要是配置系统最大打开文件描述符数，建议修改为 655360 或者更高；第二个参数 vm.max_map_count 影响 Java 线程数量，用于限制一个进程可以拥有的 VMA（虚拟内存区域）的大小，系统默认是 65530，建议修改成 262144 或者更高。

另外，还需要调整进程最大打开文件描述符（nofile）、最大用户进程数（nproc）和最大锁定内存地址空间（memlock），添加如下内容到 /etc/security/limits.conf 文件中：

```dart
* soft nproc 20480
* hard nproc 20480
* soft nofile 65536
* hard nofile 65536
* soft memlock unlimited
* hard memlock unlimited
```

最后，还需要修改 /etc/security/limits.d/20-nproc.conf 文件（CentOS 7.x系统），将 \* soft nproc 4096 修改为 \* soft nproc 20480，或者直接删除 /etc/security/limits.d/20-nproc.conf 文件也行。

#### 4. JVM 调优

JVM 调优主要是针对 Elasticsearch 的 JVM 内存资源进行优化，其内存资源配置文件为 jvm.options，此文件位于 /usr/local/elasticsearch/config 目录下，打开此文件，修改如下内容：

* -Xms1g

* -Xmx1g

可以看到，默认 JVM 内存为 1G，可根据服务器内存大小，修改为合适的值。**一般设置为服务器物理内存的一半最佳。**

### 配置 Elasticsearch

Elasticsearch 的配置文件均在 Elasticsearch 根目录下的 config 文件夹中，这里是 /usr/local/elasticsearch/config 目录，主要有 jvm.options、elasticsearch.yml 和 log4j2.properties 三个主要配置文件。其中 jvm.options 为 JVM 配置文件，log4j2.properties 为日志配置，两者都相对比较简单，这里重点介绍 elasticsearch.yml 一些重要的配置项及其含义。

这里配置的 Elasticsearch.yml 文件内容如下：

```dart
cluster.name: my-application
node.name: server1
node.master: true
node.data: true
path.data: /data1/elasticsearch,/data2/elasticsearch
path.logs: /usr/local/elasticsearch/logs
bootstrap.memory_lock: true
network.host: 0.0.0.0
http.port: 9200
discovery.seed_hosts: ["server1", "server2", "server3"]
cluster.initial_master_nodes: ["server1", "server2"]
```

在上述内容中，每个配置项的含义分别介绍如下。

（1）cluster.name: my-application

配置 Elasticsearch 集群名称，默认是 Elasticsearch，这里修改为 my-application。Elasticsearch 会自动发现在同一网段下的集群名为 Esbigdata 的主机，如果在同一网段下有多个集群，就可以通过这个属性来区分不同的集群。

（2）node.name: server1

节点名，任意指定一个即可，这里是 server1，我们这个集群环境中有 3 个节点，即 server1、server2 和 server3，**记得根据主机的不同，要修改相应的节点名称。**

（3）node.master: true

指定该节点是否有资格被选举成为 master，默认是 true，Elasticsearch 集群中默认第一台启动的机器为 master 角色，如果这台服务器宕机就会重新选举新的 master。我在这个集群环境中，定义了 server1 和 server2 两个 master 节点，因此这两个节点上 Node.Master 的值要设置为 true。

（4）node.data: true

指定该节点是否存储索引数据，默认为 true，表示数据存储节点，如果节点配 node.master 为 false，并且配置 node.data 为 false，则该节点就是 Client Node，它类似于一个"路由器"，负责将集群层面的请求转发到主节点上，然后将数据相关的请求转发到数据节点。在我们这个集群环境中，定义了 server1、server2 和 server3 均为数据存储节点，因此这三个节点上 node.data 的值要设置为 true。

（5）path.data:/data1/elasticsearch, /data2/elasticsearch

设置索引数据的存储路径，默认是 elasticsearch 根目录下的 data 文件夹，这里自定义了两个路径，可以设置多个存储路径，用逗号隔开。

（6）path.logs: /usr/local/elasticsearch/logs

设置日志文件的存储路径，默认是 elasticsearch 根目录下的 logs 文件夹。

（7）bootstrap.memory_lock: true

此配置项一般设置为 true 用来锁住物理内存。在 Linux 下物理内存的执行效率要远远高于虚拟内存（swap）的执行效率，因此，当 JVM 开始使用 swap 内存时 Elasticsearch 的执行效率会降低很多，所以要保证它不使用 swap，保证机器有足够的物理内存分配给 Elasticsearch。同时也要允许 Elasticsearch 的进程可以锁住物理内存，Linux 下可以通过"ulimit -l"命令查看最大锁定内存地址空间（memlock）是不是 unlimited，这个参数在之前系统调优的时候已经设置过了。

（8）network.host: 172.16.213.151

此配置项设置将 Elasticsearch 服务绑定到哪个网络上，配置为服务器的内网 IP 地址即可。设置为 0.0.0.0 的话，如果服务器有外网 IP，那么也可以通过外网访问 Elasticsearch，这样会非常不安全。

（9）http.port: 9200

设置 Elasticsearch 对外提供服务的 http 端口，默认为 9200。其实，还有一个端口配置选项 transport.tcp.port，此配置项用来设置节点间交互通信的 TCP 端口，默认是 9300。

（10）discovery.seed_hosts

配置集群的所有主机地址，配置之后集群的主机之间可以自动发现。

（11）cluster.initial_master_nodes

用来设置一系列符合 master 节点条件的主机名或 IP 地址来引导启动集群。

### 启动 Elasticsearch

启动 Elasticsearch 服务需要在一个普通用户下完成，如果通过 root 用户启动 Elasticsearch 的话，可能会收到如下错误：

```dart
java.lang.RuntimeException: can not run elasticsearch as root
at org.elasticsearch.bootstrap.Bootstrap.initializeNatives(Bootstrap.java:106)
~[elasticsearch-6.3.2.jar:6.3.2]
at org.elasticsearch.bootstrap.Bootstrap.setup(Bootstrap.java:195)
~[elasticsearch-6.3.2.jar:6.3.2]
at org.elasticsearch.bootstrap.Bootstrap.init(Bootstrap.java:342)
[elasticsearch-6.3.2.jar:6.3.2]
```

这是出于系统安全考虑，Elasticsearch 服务必须通过普通用户来启动，在上面第一小节中，已经创建了一个普通用户 elasticsearch，直接切换到这个用户下启动 Elasticsearch 集群即可。分别登录到 server1、server2 和 server3 三台主机上，执行如下操作：

```dart
[root@localhost ~]# su - elasticsearch
[elasticsearch@localhost ~]$ cd /usr/local/elasticsearch/
[elasticsearch@localhost elasticsearch]$ bin/elasticsearch -d
```

其中，"-d" 参数的意思是将 Elasticsearch 放到后台运行。

### 验证 Elasticsearch 集群的正确性

将所有 Elasticsearch 节点的服务启动后，在任意一个节点执行如下命令：

```dart
[root@localhost ~]# curl http://172.16.213.152:9200
```

如果返回类似如下结果，则表示 Elasticsearch 集群运行正常。


<Image alt="image2.png" src="https://s0.lgstatic.com/i/image/M00/26/63/CgqCHl7x1paAeDKuAABMVLoLmig568.png"/> 


从安装、基础调优、配置，再到启动、验证，Elasticsearch 集群安装与配置的讲解已经完成了。下面讲解如何安装 Head 插件。

### 安装 Head 插件

#### 1. 安装 Head 插件

Head 插件是 Elasticsearch 的图形化界面工具，通过此插件可以很方便地对数据进行增删改查等数据交互操作。在 Elasticsearch 5.X 版本以后，Head 插件已经是一个独立的 Web App 了，所以不需要和 Elasticsearch 进行集成，可以将 Head 插件安装到任何一台机器上。这里将 Head 插件安装到 172.16.213.138（server2）机器上，可以点击 [GitHub 网站](https://github.com/mobz/elasticsearch-head) 获取插件安装包。

由于 Head 插件本质上是一个 Node.js 工程，因此需要先安装 Node.js，使用 npm 工具来安装依赖的包。

在 CentOS 7.X 系统上，可以直接通过 yum 在线安装 Node.js（前提是你的机器要能上网），操作如下：

```dart
[root@localhost ~]# curl --silent --location https://rpm.nodesource.com/setup_10.x | sudo bash -
[root@localhost ~]# yum install -y nodejs
```

这里我们通过 git 克隆方式下载 Head 插件，所以还需要安装一个 git 命令工具，执行如下命令即可：

```dart
[root@localhost ~]# yum install -y git
```

接着，开始安装 Head 插件，这里将 Head 插件安装到 /usr/local 目录下，操作过程如下：

```dart
[root@localhost ~]# cd /usr/local
[root@localhost local]# git clone git://github.com/mobz/elasticsearch-head.git
[root@localhost local]# npm config set registry "http://registry.npm.taobao.org/"
[root@localhost local]# cd elasticsearch-head
[root@localhost elasticsearch-head]# npm install
```

其中，第一步是通过 git 命令从 GitHub 上克隆 Head 插件程序，第二步是修改源地址为淘宝 NPM 镜像，因为默认 NPM 的官方源为 https://registry.npmjs.org/， 国内下载速度会很慢，所以建议切换到淘宝的 NPM 镜像站点。第三步是安装 Head 插件所需的库和第三方框架。

克隆下来的 Head 插件程序目录名为 elasticsearch-head，进入此目录，修改配置文件 /usr/local/elasticsearch-head/_site/app.js，找到如下内容：

```dart
this.base_uri = this.config.base_uri || this.prefs.get("app-base_uri") || "http://localhost:9200";
```

将其中的 http://localhost:9200，修改为 Elasticsearch 集群中任意一台主机的 IP 地址，这里修改为:

```dart
<http://172.16.213.138:9200>
```

表示的意思是 Head 插件将通过 172.16.213.138（server2）访问 Elasticsearch 集群。注意，访问 Elasticsearch 集群中的任意一个节点，都能获取集群的所有信息。

#### 2. 修改 Elasticsearch 配置

在上面的配置中，将 Head 插件访问集群的地址配置为 172.16.213.138（server2）主机，下面还需要修改此主机上 Elasticsearch 的配置，添加跨域访问支持。

修改 Elasticsearch 配置文件，允许 Head 插件跨域访问 Elasticsearch，在 Elasticsearch.yml 文件最后添加如下内容：

```dart
http.cors.enabled: true
http.cors.allow-origin: "*"
```

其中：

* http.cors.enabled 表示开启跨域访问支持，此值默认为 false；

* http.cors.allow-origin 表示跨域访问允许的域名地址，可以使用正则表达式，这里的"\*"表示允许所有域名访问。

#### 3. 启动 Head 插件服务

所有配置完成之后，就可以启动插件服务了，执行如下操作：

```dart
[root@localhost ~]# cd /usr/local/elasticsearch-head
[root@localhost elasticsearch-head]# npm run start
```

Head 插件服务启动之后，默认的访问端口为 9100，直接访问 http://172.16.213.138:9100 就可以访问 Head 插件了。

下图是配置完成后的一个 Head 插件截图：


<Image alt="image3.png" src="https://s0.lgstatic.com/i/image/M00/26/63/CgqCHl7x1tWAVw01AADCWjPJ2oA913.png"/> 
  

配置完成后的 Head 插件图

从上图可以看到，Elasticsearch 集群有 server1、server2 和 server3 三个节点，其中，server1 是目前的主节点。点击图上的信息按钮，可查看节点详细信息。

其次，从这个页面上可以看到 Elasticsearch 基本的分片信息，比如主分片、副本分片等，以及多少可用分片。由于在 Elasticsearch 配置中设置了 5 个分片、一个副本分片，因此可以看到每个索引都有 10 个分片，每个分片都用 0、1、2、3、4 等数字加方框表示，其中，粗体方框是主分片，细体方框是副本分片。

再者，图中 my-application 是集群的名称，后面的"集群健康值"通过不同的颜色表示集群的健康状态：其中，绿色表示主分片和副本分片都可用；黄色表示只有主分片可用，没有副本分片；红色表示主分片中的部分索引不可用，但是某些索引还可以继续访问。正常情况下都显示绿色。

### Elasticsearch 的优化

#### 1. JVM 内存的优化

首先，作为一个 Java 应用，就脱离不开 JVM 和 GC。

下面先做一些简单地 JVM 介绍。Java 中的堆是 JVM 所管理的最大的一块内存空间，主要用于存放各种类的实例对象。在 Java 中，堆被划分成两个不同的区域：新生代（Young）、老年代（Old），其目的是使 JVM 能够更好地管理堆内存中的对象，包括内存的分配以及回收。

然后再对 GC 进行简单介绍。设置堆内存的唯一目的是创建对象实例，所有的对象实例和数组都要在堆上分配，堆由垃圾回收（Garbage Collect）来负责，因此也叫作 "GC 堆"，垃圾回收采用分代算法，堆由此分为**新生代** 和**老年代**。堆的优势是可以动态地分配内存大小，生存期也不必事先告诉编译器，因为它是在运行时动态分配内存的，Java 的垃圾回收器会自动回收这些不再使用的数据。

了解了堆内存的概念和作用后，下面来说下 Elasticsearch 的 JVM 设置堆内存的方法。默认情况下，Elasticsearch JVM 使用堆内存最小和最大值为 1G，可以在 Elasticsearch 的配置目录下 jvm.options 文件中找到如下内容：

```dart
-Xms1g
-Xmx1g
```

其中，Xms 是设置堆最小内存，Xmx 是设置堆最大内存，很明显，默认的这个值太小，我们生产系统环境中必须要修改这个值。修改方法很简单，直接修改 jvm.options 文件中这两个值即可，比如修改为 16G，可以这么写：

```dart
-Xms16g
-Xmx16g
```

然后再次重启 Elasticsearch，配置才能生效。

那么问题来了，这个最小堆大小（Xms）和最大堆大小（Xmx）设置多少合适呢？继续往下看。

**堆内存值的设置取决于服务器上可用的内存大小。** 原则上来说，堆内存设置的越大，Elasticsearch 可用的堆就越多，可用于缓存的内存就越多，但不能无限大，太多的堆内存可能会使垃圾回收机制暂停，并且还会浪费大量内存。

根据经验，将最小堆大小（Xms）和最大堆大小（Xmx）设置为相同值，可以防止堆在运行时调整大小，因为这是一个非常消耗性能的过程。

**那么设置堆内存多大合适呢？一个经验值是：不超过物理内存的 50％，以确保有足够的物理内存留给内核文件系统缓存，一般设置对内存最大不超过 32GB。**

为什么呢？继续往下看。

堆内存对于 Elasticsearch 来说非常重要，它可以为数据提供快速操作，但还有另外一个非常重要的内存使用者：Lucene。

Lucene 是一个开源的全文检索引擎工具包，而 Elasticsearch 底层是基于 Lucene 的，并对其进行了扩展，提供了比 Lucene 更丰富的查询语言，以及简单易用的 restful api 接口、java api 接口等。一句话概括就是，Elasticsearch 是 Lucene 面向企业搜索应用的扩展，可极大地缩短研发周期。

Lucene 设计的目的是把底层操作系统数据缓存到内存中，而 Lucene 段（segment）存储在单个文件中，这些文件都不会发生变化，所以更利于缓存，同时操作系统也会把这些热段（hot segments）保留在内存中，以便更快地访问，这些热段包括倒排索引（用于全文搜索）和文档值（用于聚合）。

由此可知，Lucene 的性能依赖于与操作系统的这种交互。如果把所有可用的内存都给了 Elasticsearch 的堆，那么 Lucene 就不会有任何剩余的内存，这将严重影响性能。

所以正如前部分所说：建议将可用内存的 50％ 提供给 Elasticsearch 堆，而将其他 50％ 空闲，但这剩余 50% 的空闲内存不会被真的闲置，因为 Lucene 正等待使用这剩余 50% 的内存资源。

#### 2. 操作系统内存优化

操作系统作为运行 Elasticsearch 的基础，为保证性能，最好禁用系统的 Swap 使用，方法如下。

（1）暂时关闭 Swap，重启后恢复。

```dart
 swapoff   -a
```

（2）永久关闭 Swap

编辑 /etc/fstab，注释掉如下 Swap 分区项即可。

```dart
#UUID=0b55fdb8-a9d8-4215-80f7-f42f75644f87 none  swap    sw      0       0
```

如果是混合服务器，不能完全禁用 Swap 的话，可以尝试降低 swappiness，该值控制操作系统尝试交换内存的积极性。当 swappiness=0 的时候，则表示最大限度使用物理内存，然后才是 Swap 空间；当 swappiness＝100 的时候，则表示积极的使用 Swap 分区，并且把内存上的数据及时地搬运到 Swap 空间里面。

Linux 的基本默认设置为 60，具体如下：

```dart
cat /proc/sys/vm/swappiness
```

也就是说，你的内存在使用到 100-60=40% 的时候，就开始出现有交换分区的使用。

操作系统层面要尽可能使用内存，此时就需要对该参数进行调整。

临时调整的方法如下，比如调成 10，可以在命令行执行如下：

```dart
sysctl vm.swappiness=10
```

要想永久调整的话，则需要将在 /etc/sysctl.conf 修改，加上：

```dart
cat /etc/sysctl.conf
vm.swappiness=10
```

#### 3. 使用更快的硬件

要保证 Elasticsearch 的性能，在硬件上配置 SSD 硬盘是最有效果的，如果有多个 SSD 硬盘，则可以配置成 RAID 0 阵列以获得更佳的 IO 性能，但是任何一个 SSD 损坏都有可能破坏 index。

**因此，通常正确的做法是优化单的 shard 存储性能，然后添加 replicat 放在不同的节点，同时使用 snapshot 快照和 restore 功能去备份 index。**

### 总结

本课时注意讲解了 Elasticsearch 的集群安装、配置与基础调优，以及 Head 插件的使用，其中，Elasticsearch 集群的部署，以及每个参数的含义是需要熟练掌握的内容，因为对于故障的处理和优化，必须要掌握 Elasticsearch 每个参数的含义。

