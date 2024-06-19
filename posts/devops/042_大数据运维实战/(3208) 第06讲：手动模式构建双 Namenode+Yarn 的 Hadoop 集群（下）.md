# 第06讲：手动模式构建双Namenode+Yarn的Hadoop集群（下）

#### 4. NameNode 与 Yarn 基础配置文件功能解读

NameNode 与 Yarn 的配置中涉及的配置文件有多个，并且每个配置文件中参数众多，因此，如何设置合理的配置参数是部署 Hadoop 集群的难点。不过，Hadoop 集群有个配置原则，那就是**重写配置** 、**覆盖默认**，否则默认生效。也就是说 Hadoop 的大部分配置参数都有默认值，如果在配置文件中设置了参数值时，那么默认值失效，否则生效。

这个原则的存在，使我们不需要对每个参数都进行配置，只需要对一些重要的基础参数进行配置即可。所以，在下面的配置文件参数介绍中，仅仅讲述重要的基础参数，也是必须参数，没介绍到的保持默认即可。

Hadoop 需要进行配置的文件一共包括 5 个，即 core-site.xml、hdfs-site.xml、mapred-site.xml、yarn-site.xml 和 hosts。这些配置文件根据节点角色的不同，生效的主机也不同，但建议在每个集群节点上保持所有配置文件的一致性，这样便于后期的运维工作。运维的习惯性做法是，**将配置文件在 NameNode 节点全部配置完成后，直接复制到集群其他所有节点上**。

**（1）core-site.xml 文件**

core-site.xml 是 NameNode 的核心配置文件，主要对 NameNode 的属性进行设置，也仅仅在 NameNode 节点生效。此文件有很多参数，但不是所有参数都需要进行设置，只需要设置必须的和常用的一些参数即可。下面列出了必须的和常用的一些参数的设置值：

```html
<configuration> 

<property> 
  <name>fs.defaultFS</name> 
  <value>hdfs://bigdata</value> 
</property>

<property> 
  <name>hadoop.tmp.dir</name> 
  <value>/var/tmp/hadoop-${user.name}</value> 
</property>
 

<property> 
  <name>ha.zookeeper.quorum</name> 
  <value>slave001,slave002,slave003</value> 
</property> 

  <property>
    <name>fs.trash.interval</name>
    <value>60</value>
  </property>

</configuration>
```

其中，每个参数含义如下：


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image/M00/0A/B4/CgqCHl6-Wt2AV5l0AAFCOLCd2K4775.png"/> 


**（2）hdfs-site.xml 文件**

该文件是 HDFS 的核心配置文件，主要配置 NameNode、DataNode 的一些基于 HDFS 的属性信息、在 NameNode 和 DataNode 节点生效。hdfs-site.xml 文件有很多参数，但不是所有参数都需要进行设置，只需要设置必须的和常用的一些参数即可。下面列出了必须的和常用的一些参数的设置值：

```html
<configuration>
   <property>
        <name>dfs.nameservices</name> 
        <value>bigdata</value> 
    </property> 

    <property> 
        <name>dfs.ha.namenodes.bigdata</name> 
        <value>nn1,nn2</value> 
    </property>


    <property> 
        <name>dfs.namenode.rpc-address.bigdata.nn1</name> 
        <value>namenodemaster:9000</value> 
    </property>
 

    <property> 
        <name>dfs.namenode.rpc-address.bigdata.nn2</name> 
        <value>yarnserver:9000</value> 
    </property>


    <property> 
        <name>dfs.namenode.http-address.bigdata.nn1</name> 
        <value>namenodemaster:50070</value> 
    </property>
 
    <property> 
        <name>dfs.namenode.http-address.bigdata.nn2</name> 
        <value>yarnserver:50070</value> 
    </property>


    <property> 
        <name>dfs.namenode.shared.edits.dir</name> 
        <value>qjournal://slave001:8485;slave002:8485;slave003:8485/bigdata</value> 
    </property> 


<property> 
        <name>dfs.ha.automatic-failover.enabled.bigdata</name> 
        <value>true</value> 
</property> 

<property>
  <name>dfs.client.failover.proxy.provider.bigdata</name>
  <value>org.apache.hadoop.hdfs.server.namenode.ha.ConfiguredFailoverProxyProvider</value>
</property>


<property>
        <name>dfs.journalnode.edits.dir</name> 
        <value>/data1/hadoop/dfs/jn</value> 
</property>


<property> 
        <name>dfs.replication</name> 
        <value>2</value> 
</property>


<property> 
        <name>dfs.ha.fencing.methods</name> 
        <value>shell(/bin/true)</value> 
</property>


<property>
  <name>dfs.namenode.name.dir</name>
  <value>file:///data1/hadoop/dfs/name,file:///data2/hadoop/dfs/name</value>
  <final>true</final>
</property>


<property>
  <name>dfs.datanode.data.dir</name>
<value>file:///data1/hadoop/dfs/data,file:///data2/hadoop/dfs/data</value>
  <final>true</final>
</property>


<property>
  <name>dfs.block.size</name>
  <value>134217728</value>
</property>


<property>
  <name>dfs.permissions</name>
  <value>true</value>
</property>


<property>
  <name>dfs.permissions.supergroup</name>
  <value>supergroup</value>
</property>


<property>
  <name>dfs.hosts</name>
  <value>/etc/hadoop/conf/hosts</value>
</property>


<property>
  <name>dfs.hosts.exclude</name>
  <value>/etc/hadoop/conf/hosts-exclude</value>
</property>

</configuration>
```

其中，每个参数含义如下：


<Image alt="图片2-1.png" src="https://s0.lgstatic.com/i/image/M00/0A/B4/Ciqc1F6-WxCABpPmAAE9vEHRMgc089.png"/> 
  

<Image alt="图片2-2.png" src="https://s0.lgstatic.com/i/image/M00/0A/B4/Ciqc1F6-WxaAUnnLAAGL3rsyvBU330.png"/> 
  

<Image alt="图片2-3.png" src="https://s0.lgstatic.com/i/image/M00/0A/B4/Ciqc1F6-Wx2AEUU0AAG1MKpUL-A807.png"/> 


**（3）mapred-site.xml 文件**   

该文件是 MRv1 版本中针对 MR 的配置文件，此文件在 Hadoop3.x 版本中，需要配置的参数很少，下面列出了必须的和常用的一些参数的设置值：

```html
<configuration>

<property>
 <name>mapreduce.framework.name</name>
 <value>yarn</value>
</property>

<property>
 <name>mapreduce.jobhistory.address</name>
 <value>yarnserver:10020</value>
</property>

<property>
 <name>mapreduce.jobhistory.webapp.address</name>
 <value>yarnserver:19888</value>
</property>

</configuration>
```

其中，每个参数含义如下：


<Image alt="图片3.png" src="https://s0.lgstatic.com/i/image/M00/0A/B5/CgqCHl6-W0OAETx9AAC4Ao4YdUw462.png"/> 


**（4）yarn-site.xml 文件**

该文件是 Yarn 资源管理框架的核心配置文件，所有对 Yarn 的配置都在此文件进行，下面列出了必须的和常用的一些参数的设置值：

```html
<configuration> 

<property> 
    <name>yarn.resourcemanager.hostname</name> 
    <value>yarnserver</value> 
</property>   

<property>
    <name>yarn.resourcemanager.scheduler.address</name>
    <value>yarnserver:8030</value>
</property>

<property>
    <name>yarn.resourcemanager.resource-tracker.address</name>
    <value>yarnserver:8031</value>
</property>

<property>
    <name>yarn.resourcemanager.address</name>
    <value>yarnserver:8032</value>
</property>

<property>
    <name>yarn.resourcemanager.admin.address</name>
    <value>yarnserver:8033</value>
</property>

<property>
    <name>yarn.resourcemanager.webapp.address</name>
    <value>yarnserver:8088</value>
</property>

<property> 
    <name>yarn.nodemanager.aux-services</name> 
    <value>mapreduce_shuffle,spark_shuffle</value> 
</property> 

<property>
    <name>yarn.nodemanager.aux-services.mapreduce_shuffle.class</name>
    <value>org.apache.hadoop.mapred.ShuffleHandler</value>
</property>

<property>
      <name>yarn.nodemanager.aux-services.spark_shuffle.class</name>
      <value>org.apache.spark.network.yarn.YarnShuffleService</value>
</property>

<property>
    <name>yarn.nodemanager.local-dirs</name>
    <value>file:///data1/hadoop/yarn/local,file:///data2/hadoop/yarn/local</value>
</property>

<property>
    <name>yarn.nodemanager.log-dirs</name>
    <value>file:///data1/hadoop/yarn/logs,file:///data2/hadoop/yarn/logs</value>
</property>


<property>
    <description>Classpath for typical applications.</description>
     <name>yarn.application.classpath</name>
     <value>
        $HADOOP_CONF_DIR,
        $HADOOP_COMMON_HOME/*,$HADOOP_COMMON_HOME/lib/*,
        $HADOOP_HDFS_HOME/*,$HADOOP_HDFS_HOME/lib/*,
        $HADOOP_MAPRED_HOME/*,$HADOOP_MAPRED_HOME/lib/*,
        $HADOOP_YARN_HOME/*,$HADOOP_YARN_HOME/lib/*,
        $HADOOP_HOME/share/hadoop/common/*, $HADOOP_COMMON_HOME/share/hadoop/common/lib/*,
        $HADOOP_HOME/share/hadoop/hdfs/*, $HADOOP_HOME/share/hadoop/hdfs/lib/*,
        $HADOOP_HOME/share/hadoop/mapreduce/*, $HADOOP_HOME/share/hadoop/mapreduce/lib/*,
        $HADOOP_HOME/share/hadoop/yarn/*, $HADOOP_YARN_HOME/share/hadoop/yarn/lib/*,
        $HIVE_HOME/lib/*, $HIVE_HOME/lib_aux/*
     </value>
</property>

<property>
  <name>yarn.nodemanager.resource.memory-mb</name>
    <value>20480</value>
</property>

<property>
    <name>yarn.nodemanager.resource.cpu-vcores</name>
    <value>8</value>
</property>

</configuration>
```

其中，每个参数含义如下：


<Image alt="图片4-1.png" src="https://s0.lgstatic.com/i/image/M00/0A/B5/Ciqc1F6-W2qADyrVAAFeCAR3VRo004.png"/> 
  

<Image alt="图片4-2.png" src="https://s0.lgstatic.com/i/image/M00/0A/B5/Ciqc1F6-W2-AYKY5AAFxWlwVqZ0347.png"/> 
  

<Image alt="图片4-3.png" src="https://s0.lgstatic.com/i/image/M00/0A/B5/CgqCHl6-W3WAMosXAADyhIAnDJM901.png"/> 


**（5）hosts 文件**

在 /etc/Hadoop/conf 下创建 hosts 文件，内容如下：

    slave001
    slave002
    slave003

其实 hosts 文件是指定 Hadoop 集群中 datanode 节点的主机名，Hadoop 在运行过程中都是通过主机名进行通信和工作的。

### 启动与维护高可用 NameNode + Yarn 分布式集群

Hadoop 在一个节点配置完成后，将配置文件直接复制到其他几个节点即可，所有配置完成后，就可以启动 Hadoop 的每个服务了。在启动服务时，要非常小心，要严格按照这里描述的步骤做，每一步要检查操作是否正确。注意，以下所有操作都以 Hadoop 这个普通用户完成。

#### 1. 启动与格式化 ZooKeeper 集群

ZooKeeper 集群所有节点配置完成后，就可以启动 ZooKeeper 服务了，在 slave001、slave002、slave003 三个节点依次执行如下命令，操作如下：

```java
[hadoop@slave001 ~]$ cd /opt/bigdata/zookeeper/current/bin
[hadoop@slave001 ~]$ ./zkServer.sh  start
[hadoop@slave001 ~]$ jps
23097 QuorumPeerMain
```

启动后，通过 jps 命令（JDK 内置命令）可以看到有一个 QuorumPeerMain 标识，这就是 ZooKeeper 启动的进程，前面的数字是进程的 PID。

在执行启动命令的当前目录下会生成一个 zookeeper.out 文件，这就是 ZooKeeper 的运行日志，通过此文件可以查看 ZooKeeper 运行状态。

接着，还需要在 ZooKeeper 集群上建立 HA 的相应节点信息。在 namenodemaster 节点执行如下命令：

```java
[hadoop@namenodemaster ~]$ hdfs zkfc -formatZK
```

这样，就完成了 ZooKeeper 集群的格式化工作。

#### 2. 启动 JournalNode 集群

根据前面的规划，JournalNode 集群是安装在 slave001、slave002、slave003 三个节点的，因此要启动 JournalNode 集群，需要分别在这三个节点执行如下命令：

```java
[hadoop@slave001 ~]$ hdfs --daemon start journalnode
```

在每个节点执行完启动命令后，执行以下验证，以确定服务启动正常，这里以 slave001 为例：

```java
[hadoop@slave001 ~]$ jps
15279 Jps
15187 JournalNode
14899 QuorumPeerMain
```

在启动 JournalNode 后，会在本地磁盘产生一个目录 /data1/hadoop/dfs/jn，此目录在配置文件定义过，用于保存 NameNode 的 edits 文件的目录。

#### 3. 格式化并启动主节点 NameNode 服务

NameNode 服务在启动之前，需要进行格式化，目的是产生 NameNode 元数据，在 namenodemaster 上执行以下命令：

```java
[hadoop@namenodemaster ~]$ hdfs namenode -format -clusterId bigdataserver（此名称可随便指定）
```

然后会在 hdfs-site.xml 配置文件 dfs.NameNode.name.dir 参数指定的目录下产生一个目录，用于保存 NameNode 的 fsimage、edits 等文件。格式化完成后，就可以在 namenodemaster 上启动 NameNode 服务了，启动服务很简单，执行如下命令即可：

```java
[hadoop@namenodemaster ~]$ hdfs --daemon start namenode
[hadoop@namenodemaster ~]$ jps
11724 NameNode
11772 Jps
```

可以看到，会产生一个新的 Java 进程 NameNode。如果启动失败，可通过查看日志来排查问题，日志文件默认位于 Hadoop 安装目录的 logs 目录下。例如 NameNode 日志文件类似 hadoop-hadoop-namenode-namenodemaster.log 这样的名字，可以通过查看日志检查哪里出现了问题，进而解决问题。

#### 4. NameNode 主、备节点同步元数据

现在主 NameNode 服务已经启动起来了，那么备用的 NameNode 也需要启动服务，但是在启动之前，需要将元数据进行同步，也就是将主 NameNode 上的元数据同步到备用的节点上，同步的方法很简单，只需要在备用 NameNode 上执行如下命令即可：

```java
[hadoop@yarnserver ~]$ hdfs namenode -bootstrapStandby
```

如果命令执行没有出错，那么元数据应该已经同步到了备用节点上。

#### 5. 启动备用节点的 NameNode 服务

备机在同步完成元数据后，也需要启动 NameNode 服务，启动过程如下：

```java
[hadoop@yarnserver ~]$ hdfs --daemon start namenode
[hadoop@yarnserver ~]$ jps
1880 NameNode
15439 Jps
```

随后也会产生一个新的 Java 进程 NameNode，表示启动成功。如果启动失败，也可通过查看启动日志来排查问题。

#### 6. 启动 ZooKeeper FailoverController（zkfc）服务

在两个 NameNode 都启动后，默认处于 Standby 状态，要将某个节点转变成 Active 状态，则需要先在此节点上启动 zkfc 服务。

首先在 namenodemaster 上执行启动 zkfc 命令，操作如下：

```java
[hadoop@namenodemaster ~]$ hdfs --daemon start zkfc
```

这样 namenodemaster 节点的 NameNode 状态将变成 Active，也就是变成了 HA 的主节点。接着在 yarnserver 上也启动 zkfc 服务，随后 yarnserver 上的 NameNode 状态将保持为 standby。

至此，双 NameNode 服务都已经正常启动。

#### 7. 启动存储节点 DataNode 服务

DataNode 节点用于 HDFS 分布式文件系统存储，根据之前规划，需要在 slave001、slave002、slave003 上依次启动 DataNode 服务，这里以 slave001 为例，操作如下：

```java
[hadoop@slave001 ~]$ hdfs --daemon start datanode
```

这样服务就启动起来了。接着，依次在节点 slave002、slave003 按照相同方法启动 DataNode 服务即可。如果启动失败，就通过 DataNode 启动日志排查错误。

#### 8. 启动 ResourceManager、NodeManager 及 historyserver 服务

分布式存储 HDFS 服务启动起来后，就可以执行存储数据的相关操作了。接下来还需要启动分布式计算服务，主要有 ResourceManager 和 NodeManager，首先要启动 ResourceManager 服务，根据之前的配置，要在 yarnserver 主机上启动 ResourceManager 服务，操作如下：

```java
[hadoop@yarnserver ~]$ yarn --daemon start resourcemanager
```

接着依次在 slave001、slave002、slave003 上启动 NodeManager 服务，这里以 slave001 为例，操作如下：

```java
[hadoop@slave001 ~]$ yarn --daemon start nodemanager
```

这样 NodeManager 和 ResourceManager 服务就启动起来了，可以进行分布式计算了。

最后，还需要启动 historyserver 服务，此服务用于日志查看，分布式计算服务的每个 job 运行后，都会有日志输出，因此开启 historyserver 是非常有必要的，可通过如下命令在 yarnserver 节点启动 historyserver 服务，操作如下：

```java
[hadoop@yarnserver ~]$ mapred --daemon start historyserver
```

至此，Hadoop 集群服务完全启动，分布式 Hadoop 集群部署完成。

#### 9. 测试双 NameNode 高可用功能

正常情况下，高可用 NameNode 中，namenodemaster 主机处于 Active 状态， 访问 http:// namenodemaster:50070，得到如下截图：


<Image alt="image4.png" src="https://s0.lgstatic.com/i/image/M00/0A/B6/Ciqc1F6-XMKAJagjAACPxB44lJU201.png"/> 


由图可知，namenodemaster 目前是 Active 状态，还看到 Namespace、Namenode ID、Version、Cluster ID 等信息，这些信息在前面介绍配置文件时定义好的。此外，还能看到 HDFS 的 Summary 信息，前面课时中已经做过介绍了；另外，还有 NameNode Journal Status、NameNode Storage 及 DFS Storage Types 等信息，如下图所示：


<Image alt="image5.png" src="https://s0.lgstatic.com/i/image/M00/0A/B6/Ciqc1F6-XMqAM4oAAADRhtEnqsY823.png"/> 


其中，NameNode Journal Status 部分显示了 JournalNode 集群的节点信息以及目前处于 inprogress 的 edits 文件写的位置。NameNode Storage 部分显示了 NameNode 元数据的存放路径，可以看到元数据有两份互为镜像，且状态均为 active，这表明两个元数据均正常，如果元数据状态不是 Active，说明元数据有问题，需要检查对应路径下的元数据信息。最后 DFS Storage Types 部分，主要展示了 HDFS 的总存储容量以及活跃的节点数。

接着来看看 yarnserver 主机，此时 yarnserver 应该处于 standby 状态，访问 http:// yarnserver:50070，得到如下截图：


<Image alt="image6.png" src="https://s0.lgstatic.com/i/image/M00/0A/B6/CgqCHl6-XNOAFkL5AACO-vATZLk481.png"/> 


Yarnserver 上展示的 HDFS 集群状态跟 namenodemaster 主机上基本相同，不同的是 NameNode Journal Status 部分，因为是 standby 状态，所以对 JournalNode 集群是只读的。

下面测试下两个 NameNode 是否能够实现自动切换功能，测试方法很简单，可以将目前处于 Active 状态的 NameNode 的服务关闭，或者切断它的网络，然后观察另一个 NameNode 是否会自动从 Standby 状态变为 Active 状态。

如果高可用的 NameNode 配置正常，那么当 Active 状态的 NameNode 发生故障后，Standby 状态的 NameNode 会在几秒钟内自动接管服务，将状态转换为 Active，可以动手测试一下。

#### 10. 验证 Yarn 是否正常运行

在 ResourceManager 和 NodeManager 服务启动后，可通过访问 <http://yarnserver:8088/cluster/nodes> 来检查 Yarn 资源管理器是否正常运行，如下图所示：


<Image alt="image7.png" src="https://s0.lgstatic.com/i/image/M00/0A/B6/CgqCHl6-XNuAMmICAAGXC0we9l4454.png"/> 


上图中，显示了 yarn 资源管理器中可用的计算资源，主要是可用 CPU VCores、内存以及活跃的计算节点数，最下面显示的是每个节点的运行状态、节点地址以及节点可用的 CPU、内存等资源信息。目前集群总共三个计算节点，每个节点提供了 8 个 CPU 核、20GB 内存，所以 Yarn 总共可用的 CPU 资源为 24 核，内存资源为 60GB。

### 总结

本课时主要介绍了如何通过手动方式去构建一个双 Namenode + Yarn 的 Hadoop 集群系统，手动部署方式有助于我们了解 Haoop 的内部运作机制和技术细节，这对于大数据运维来说非常重要。

