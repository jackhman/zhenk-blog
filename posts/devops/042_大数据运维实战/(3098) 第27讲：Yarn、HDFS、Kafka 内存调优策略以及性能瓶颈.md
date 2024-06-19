# 第27讲：Yarn、HDFS、Kafka内存调优策略以及性能瓶颈

Hadoop 性能调优是一项复杂烦琐、难度极大的工作，不仅要求对 Hadoop 本身有深刻理解，还涉及底层硬件、网络、操作系统、Java 虚拟机等方面的调优工作。

Hadoop 性能调优，不仅靠运维，还需开发人员一起参与：

* 运维人员负责为用户提供一个高效稳定的任务运行环境；

* 开发人员则需要根据自己任务的特点写出好的程序，让任务快速、高效地完成。

### Yarn 的内存和 CPU 调优

Yarn 集群同时支持内存和 CPU 两种资源的调度，因此对 **Yarn 集群的调优** 也分为 **Yarn 的内存参数** 和 **CPU 参数调优** 两部分。

Yarn 作为一个 **资源管理器** ，主要管理的资源为 **Container** ，而它是 Yarn 里面资源分配的 **基本单位** ，包含了一定的内存及 CPU 资源。

在进行调优之前，有如下问题需要你关注：

* 一个集群节点的物理内存、CPU 如何分配给 Yarn？分配多少？

* 一个 Yarn 节点可以运行多少个 Container，每个 Container 占用多少内存和 CPU 合适？

* 一个 Yarn 节点上磁盘的数与计算性能是否有关系？

* Yarn 上可配置的 CPU、内存资源有哪些？

其实，在 Yarn 集群中，平衡内存、CPU、磁盘这三者的资源分配是很重要的，**最基本的经验就是：** 每两个 Container 使用一块磁盘、一个 CPU 核，这种配置，可以使集群的资源得到一个比较好的平衡利用。

接下来我会分别从内存、CPU 两方面介绍如何对 Yarn 集群进行资源优化。

#### 1. Yarn 内存优化配置

Yarn 的内存优化主要涉及 ResourceManager、NodeManager 相关进程以及 Yarn 的一些配置参数。下面先从这些进程对应的 JVM 内存优化讲起。

需要注意，对于内存资源的分配，要依据集群上每个节点运行的服务进行，因为一个服务器节点上会同时运行 HDFS、NodeManager、ResourceManager、HBase 等多项服务，这些服务都需要若干内存资源。

所以不能将内存都分配给某个服务；此外，操作系统运行也需要一部分内存资源，我们还需要给系统预留足够的内存。

**（1）进程堆内存优化**

* **ResourceManager 堆内存参数**

在整个 Yarn 集群中只有一个 ResourceManager，它主要负责和客户端进行通信，为每个节点提供资源的调度和分配，同时与 AppMaster 一起进行资源的分配。

如果 ResourceManager 的堆内存资源设置得不合理，那么垃圾回收时间可能过长，进而导致与 ZooKeeper 的连接超时；如果对 ResourceManager 做了主、备，那么还会引发 Active ResourceManager 的频繁切换问题，此过程中会导致一些任务执行失败。

因此，对 ResourceManager 堆内存的大小设置一定要合理，通常建议将 ResourceManager 独立运行在一台服务器上，所以只考虑操作系统对内存的占用即可。

在 hadoop 配置文件 yarn-env.sh 中添加如下内容，可设置 ResourceManager 堆内存大小：

```java
export YARN_RESOURCEMANAGER_HEAPSIZE=8192 
export YARN_RESOURCEMANAGER_OPTS="-server -Xms${YARN_RESOURCEMANAGER_HEAPSIZE}m -Xmx${YARN_RESOURCEMANAGER_HEAPSIZE}m" 
```

建议将 ResourceManager 堆内存大小设置在 **8GB 以上** 。

* **NesourceManager 堆内存参数**

NodeManager 充当 shuffle 任务的 server 端时，内存应该调大，否则会出现任务连接错误。同样修改 hadoop 配置文件 yarn-env.sh，应添加如下内容：

```java
export YARN_NODEMANAGER_HEAPSIZE=4096 
export YARN_NODEMANAGER_OPTS="-Xms${YARN_NODEMANAGER_HEAPSIZE}m -Xmx${YARN_NODEMANAGER_HEAPSIZE}m" 
```

建议将 NodeManager 堆内存大小设置在 **4GB 以上** 。

所有配置参数修改完成后，重启 ResourceManager、NodeManager 服务，配置即可生效。

**（2）Yarn 内存配置参数优化**

接着，来看一下需要优化的 Yarn 内存参数，主要有以下几个。

**RM 的内存资源配置**

* RM1:yarn.scheduler.minimum-allocation-mb，表示单个容器可以申请的最小内存，默认 1024MB。

* RM2:yarn.scheduler.maximum-allocation-mb，表示单个容器可以申请的最大内存，默认8291MB。

* APP1:yarn.app.mapreduce.am.resource.mb，MR 运行于 Yarn 上时，为 AM 分配多少内存。

* APP2:yarn.app.mapreduce.am.command-opts，运行 MRAppMaster 时的 jvm 参数，可设置 -Xmx、-Xms 等选项。

**NM 的内存资源配置**

* NM1:yarn.nodemanager.resource.memory-mb，表示节点可用的最大内存。

* NM2:yarn.nodemanager.vmem-pmem-ratio，表示虚拟内存率，默认 2.1。

**AM 内存配置相关参数**

* AM1:mapreduce.map.memory.mb，分配给 map Container 的内存大小。

* AM2:mapreduce.map.java.opts，运行 map 任务的 jvm 参数，可设置 -Xmx、-Xms 等选项。

* AM3:mapreduce.reduce.memory.mb，分配给 reduce Container 的内存大小。

* AM4:mapreduce.reduce.java.opts，运行 reduce 任务的 jvm 参数，可设置 -Xmx、-Xms 等选项。

**需要注意**

* RM1、RM2 的值均不能大于 NM1 的值

* AM1 和 AM3 的值应该在 RM1 和 RM2 这两个值之间

* AM3 的值最好为 AM1 的两倍

* AM2 和 AM4 的值应该在 AM1 和 AM3 之间

根据上面给出的规则，我们给出一个例子，来说明下相关参数如何进行配置，当然还需要在运行测试过程中不断检验和调整。

**（3）Yarn 参数优化实例**

假定我们的 Yarn 集群有 100 个节点，每个节点配置 128GB 物理内存、32 核 CPU，并挂载 8 块磁盘，同时再运行 datanode 和 nodemanager 两个服务。

要规划 Yarn 可使用的内存，首先需要去掉系统占用的内存，还需去掉 datanode、nodemanager 的 JVM 占用的内存，一般情况下给系统预留 20% 左右内存即可，而 datanode、nodemanager 的 JVM 内存都按照 4GB 来配置即可。

这样算下来，Yarn 可用的内存为如下公式结果：128-(128\*20%)-4-4≈94GB。

此时通过如下公式，可计算出 **每个节点最多能拥有多少个 container** ：

```java
containers = min (2*CORES, 1.8*DISKS, (Total available RAM) / MIN_CONTAINER_SIZE) 
```

其中：

* CORES 为机器 CPU 的核数；

* DISKS 为机器上挂载的磁盘个数；

* Total available RAM 为 Yarn 可用内存；

* MIN_CONTAINER_SIZE 是指 Container 最小的容量大小，24GB 物理内存以上机器的 Container 最小值建议为 2GB。

根据上面的计算公式，每个节点可以拥有 14（min (2\*32, 1.8\*8 , (94)/2) = min (64, 14, 47) =14 个 container。

通过如下公式，可计算 **每个 Container 占用的内存大小** ：

```yaml
RAM-per-container = max(MIN_CONTAINER_SIZE, (Total Available RAM)/containers) 
```

因此，RAM-per-container = max (2, (94)/14) = max (2, 7) = 7，也就是说每个 Container 的内存大小为 7GB，由于采用四舍五入算法，所以我也可以设置每个 Container 为 6GB 内存。

知道了每个节点上的 Container 数以及每个 Container 占用的内存后，就可以算出 Yarn 几个内存参数占用的资源量了。计算方法如下表所示：

|      配置文件       |                 配置项                  |              计算公式               | 计算结果  |
|-----------------|--------------------------------------|---------------------------------|-------|
| yarn-site.xml   | yarn.nodemanager.resource.memory-mb  | containers \* RAM-per-container | 84GB  |
| yarn-site.xml   | yarn.scheduler.minimum-allocation-mb | RAM-per-container               | 6GB   |
| yarn-site.xml   | yarn.scheduler.maximum-allocation-mb | containers \* RAM-per-container | 84GB  |
| yarn-site.xml   | yarn.app.mapreduce.am.resource.mb    | 2 \* RAM-per-container          | 12GB  |
| yarn-site.xml   | yarn.app.mapreduce.am.command-opts   | 0.8 \* 2 \* RAM-per-container   | 9.6GB |
| mapred-site.xml | mapreduce.map.memory.mb              | RAM-per-container               | 6GB   |
| mapred-site.xml | mapreduce.reduce.memory.mb           | 2 \* RAM-per-container          | 12GB  |
| mapred-site.xml | mapreduce.map.java.opts              | 0.8 \* RAM-per-container        | 4.8GB |
| mapred-site.xml | mapreduce.reduce.java.opts           | 0.8 \* 2 \* RAM-per-container   | 9.6GB |

这个计算方法是官方推荐的，但有些参数的内存设置可能过大了。例如，单个容器可以申请的最大内存，这个一般情况下不需要配置这么大，可根据情况进行降低，其他参数也同理。

#### 2. CPU 优化参数

由于每个服务器的 CPU 计算能力可能不同，因此 Yarn 引入了虚拟 CPU 的概念，将物理 CPU 划分为多个虚拟 CPU。这里的虚拟 CPU，可通过如下命令查看：

```dart
[root@nnmaster scripts]#cat /proc/cpuinfo| grep "cpu cores" |uniq  
```

这个命令得到的结果是 **每颗 CPU 的核数，然后** 乘以 **CPU 个数** ，就得到此服务器有多少个可用的 **CPU core** ，知道了每个集群节点的 CPU 核数后，就可以对 CPU 进行相关配置优化了。

在 Yarn 中，和 CPU 配置相关的参数有如下几个：

* yarn.nodemanager.resource.cpu-vcores 表示该节点服务器上 Yarn 可使用的虚拟 CPU 个数，默认为 8。由于需要给操作系统、datanode、nodemanager 进程预留一定量的 CPU，所以一般将系统 CPU 的 90% 留给此参数即可，例如集群节点有 32 个 core，那么分配 28 个 core 给 yarn。

* yarn.scheduler.minimum-allocation-vcores 表示单个任务可申请的最小虚拟核数，默认为 1。

* yarn.scheduler.maximum-allocation-vcores 表示单个任务可申请的最大虚拟核数，默认为 4。

这里我们结合上文介绍的内存调优案例讲一下，由于每个节点最多可运行 14 个 container，每个 container 占用 6GB 内存。如果设置每个 container 占用 2 个 CPU core，那么每个节点刚好分配了 28 个 CPU core。通过这样的配置，CPU、内存资源刚好充分得到了利用，没有资源浪费。

### HDFS 性能调优

对 HDFS 文件进行性能优化，你需要对 HDFS 的构成和运行原理有一定的了解，我在前面的课时中对此已做了详细介绍，你可以回顾复习一下。

接下来我会从 HDFS 配置参数、JVM 堆内存两方面介绍如何进行 HDFS 性能优化。

#### 1. HDFS 性能参数配置

* **dfs.replication**

此参数用来设置 **文件副本数** ，副本数通常设为 3，不建议修改。这个参数可用来保障 HDFS 数据安全，副本数越多，浪费的磁盘存储空间越多，但数据安全性也会更高。

所以，此参数要根据整体情况来权衡设置，比如对于 100 个节点以内的小集群，将参数设为 3 便是个不错的选择，随着集群节点数的增多，你可适当增加副本数。

* **dfs.block.size**

此参数用来设置 HDFS 中 **数据块的大小** ，默认为 128M，所以，存储到 HDFS 的数据最好都大于 128M 或者是 128 的整数倍，这是最理想的情况；对于数据量较大的集群，可设为 256MB 或 512MB。数据块设置太小，会增加 NameNode 的压力；数据块设置过大，会增加定位数据的时间。

* **dfs.datanode.data.dir**

此参数是设置 HDFS **数据块的存储路径** ，配置的值应当是分布在各个独立磁盘上的目录，这样可以充分利用节点的 IO 读写能力，提高 HDFS 读写性能。

* **dfs.datanode.max.transfer.threads**

这个值是配置 datanode 可 **同时处理的最大文件数量** ，建议将这个值尽量调大，最大值可以配置为 65535。

#### 2. HDFS 内存资源调优

优化 HDFS 内存资源，主要是配置 Namenode 的堆内存。Namenode 堆内存配置过小，会导致频繁产生 Full GC，进而导致 namenode 宕机；而在 Hadoop 中，数据的读取、写入都要经过 namenode，所以 namenode 的堆内存需要足够多，尤其是在海量数据读写场景中。

此外 Hadoop 集群中的文件数越多，Namenode 的内存压力也会越来越大，这也是 Hadoop 不适于存储海量小文件的原因。

企业应用中，一般将 Namenode 运行在一台独立的服务器上，要设置 Namenode 堆内存大小，可通过在 Hadoop 配置文件 hadoop-env.sh 中添加如下内容实现：

```java
export HADOOP_HEAPSIZE_MAX=30720 
export HADOOP_HEAPSIZE_MIN=30720 
```

这里建议 Namenode 堆内存大小设置为物理内存的一半以上。

接着，是对 Datanode 堆内存参数的设置，同样修改 Hadoop 配置文件 hadoop-env.sh，添加如下内容：

```java
export HDFS_DATANODE_HEAPSIZE=4096 
export HDFS_DATANODE_OPTS="-Xms${HDFS_DATANODE_HEAPSIZE}m -Xmx${HDFS_DATANODE_HEAPSIZE}m" 
```

建议 Datanode 堆内存大小设置为 4GB 以上。

所有配置参数修改完成后，重启 Namenode、Datanode 服务以使配置生效。

### Kafka 性能调优

Kafka 是一个高吞吐量分布式消息系统，并且提供了持久化存储功能，其高性能有两个重要特征：

* 磁盘连续读写性能远远高于随机读写的特点；

* 通过将一个 topic 拆分多个 partition，可提供并发和吞吐量。

要充分发挥 Kafka 的性能，就需要满足以上两个条件，常见的调优方式有如下。

#### 1. 内存优化

对内存的调优，主要是对 Linux 系统下内存的优化，这里需要关注两个操作系统参数。

**（1）vm.dirty_background_ratio**

这个参数指的是，当文件系统缓存脏页（Page Cache 中的数据称为脏页数据）数量在系统中的内存占比达到一定比例（默认 10%）时，就会触发后台回写进程，将一定缓存的脏页异步地刷入磁盘。增、减这个值是最主要的调优手段。

**（2）vm.dirty_ratio**

这个参数指的是，当文件系统缓存脏页数量在系统中的内存占比达到一定比例（默认 20%）时，为了避免数据丢失，系统就不得不开始处理缓存脏页，将过多的脏页刷入磁盘。在这一过程中，可能会由于系统刷新内存数据到磁盘，导致应用进程出现 IO 阻塞。

上述两个系统参数对应的内核参数文件如下：

```java
vm.dirty_background_ratio：/proc/sys/vm/dirty_background_ratio 
vm.dirty_ratio：/proc/sys/vm/dirty_ratio 
```

建议将 vm.dirty_background_ratio 设置为 5%，vm.dirty_ratio 设置为 10%，但还是要根据环境的不同，具体问题具体分析，总之需要你进行测试、测试，再测试。

最后，Kafka 虽然也是 Java 应用，但是它需要的堆内存较小（因为数据不放入 JVM 中），因此，建议将物理内存的 60% 以上分配给给操作系统，来保证 page cache 的分配。

#### 2. topic 的拆分

Kafka 读写的单位是 partition，将一个 topic 拆分为多个 partition 可以提高系统的吞吐量， **但有一个前提条件：不同的 partition 要分布在不同的磁盘上。** 如果多个 partition 分布在同一个磁盘上，那么多个进程就会同时对一个磁盘的多个文件进行读写，这会使操作系统对磁盘的读写进行频繁的调度，从而破坏磁盘读写的连续性。

要将不同的 partition 分布在不同在磁盘上，可以将磁盘的多个目录配置到 broker 的 log.dirs，例如下面的配置：

```java
log.dirs=/disk1/logs,/disk2/logs,/disk3/logs 
```

Kafka 会在新建 partition 的时候，将新 partition 分布在 partition 数量最少的目录上，因此，一般不能将同一个磁盘的多个目录设置到 log.dirs。

#### 3. 配置参数优化

**（1）日志保留策略配置优化**

当 Kafka Server 被写入海量消息后，会生成很多数据文件，且占用大量磁盘空间，如果你不及时清理，磁盘空间可能会不够用。Kafka 默认保留天数是 7 天，但我建议尽量减少日志保留时间，推荐设置为 3 天即可。

可如下，设置日志保留天数（以 3 天为例）：

```java
 log.retention.hours=72 
```

**（2）段文件大小优化**

段文件配置 1GB，有利于快速回收磁盘空间，重启 Kafka 加载也会加快；相反，如果文件过小，则文件数量就会比较多，Kafka 启动时，是单线程扫描目录（log.dir）下所有数据文件。在这种情况下，扫描文件就会消耗很多时间，影响 Kafka 启动速度。

配置段文件大小，可在 Kafka 配置文件中添加如下内容：

```java
log.segment.bytes=1073741824 
```

**（3）log 数据文件刷盘策略优化**

为大幅度提高 producer 写入吞吐量，需要定期批量写文件，优化建议如下。

每当 producer 写入 10000 条消息时，刷数据到磁盘，可通过如下选项配置：log.flush.interval.messages=10000。

每间隔 1 秒钟时间，刷数据到磁盘，可通过如下选项配置：log.flush.interval.ms=1000。

对 Kafka 参数的优化，并不是固定不变的，你要根据应用场景的不同，进行多次修改、测试，反复调试，直到最终找出最合理的配置。

### 小结

本课时主要讲解了对 Yarn 集群、HDFS 集群、Kafka 集群的调优思路和具体方法，调优讲究的是因地制宜、具体问题具体分析。如果你的集群还没有暴露出性能问题，那么不要贸然进行调优，这将毫无意义，只有出现了性能问题，才需要进行调优，此时根据现象判断问题，然后找到合适的点进行优化。这是调优的一个基础宗旨。

