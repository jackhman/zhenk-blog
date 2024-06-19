# 第05讲：手动模式构建双Namenode+Yarn的Hadoop集群（上）

本课时主要讲"手动模式构建双 NameNode + Yarn 的 Hadoop 集群"的内容。

### 双 NameNode 实现原理与应用架构

前面铺垫了那么多，现在是时候开始进入 Hadoop 的内容了，学习大数据运维，首先从安装、部署入手，这是大数据运维的基础，本课时将重点讲述如何构建企业级大数据应用平台。

#### 1. 什么是双 NameNode

在分布式文件系统 HDFS 中，NameNode 是 master 角色，当 NameNode 出现故障后，整个 HDFS 将不可用，所以保证 NameNode 的稳定性至关重要。在 Hadoop1.x 版本中，HDFS 只支持一个 NameNode，为了保证稳定性，只能靠 SecondaryNameNode 来实现，而 SecondaryNameNode 不能做到热备，而且恢复的数据也不是最新的元数据。基于此，从 Hadoop2.x 版本开始，HDFS 开始支持多个 NameNode，这样不但可以实现 HDFS 的高可用，而且还可以横行扩容 HDFS 的存储规模。

在实际的企业应用中，使用最多的是双 NameNode 架构，也就是一个 NameNode 处于 **Active（活跃） 状态** ，另一个 NameNode 处于 **Standby（备用）状态** ，通过这种机制，实现 NameNode 的**双机热备高可用功能**。

#### 2. 双 NameNode 的运行原理

在高可用的 NameNode 体系结构中，只有 Active 状态的 NameNode 是正常工作的，Standby 状态的 NameNode 处于随时待命状态，它时刻去同步 Active 状态 NameNode 的元数据。一旦 Active 状态的 NameNode 不能工作，可以通过手工或者自动切换方式将 Standby 状态的 NameNode 转变为 Active 状态，保持 NameNode 持续工作。这就是**两个高可靠的 NameNode 的实现机制**。

NameNode 主、备之间的切换可以通过手动或者自动方式来实现，作为线上大数据环境，都是通过自动方式来实现切换的，为保证自动切换，NameNode 使用 ZooKeeper 集群进行仲裁选举。基本的思路是 HDFS 集群中的两个 NameNode 都在 ZooKeeper 中注册，当 Active 状态的 NameNode 出故障时，ZooKeeper 能马上检测到这种情况，它会自动把 Standby 状态切换为 Active 状态。

ZooKeeper（ZK）集群作为一个高可靠系统，能够为集群协作数据提供监控，并将数据的更改随时反馈给客户端。HDFS 的热备功能依赖 ZK 提供的两个特性：错误监测、活动节点选举。HDFS 通过 ZK 实现高可用的机制如下。

每个 NameNode 都会在 ZK 中注册并且持久化一个 session 标识，一旦 NameNode 失效了，那么 session 也将过期，而 ZK 也会通知其他的 NameNode 发起一个失败切换。ZK 提供了一个简单的机制来保证只有一个 NameNode 是活动的，那就是独占锁，如果当前的活动 NameNode 失效了，那么另一个 NameNode 将获取 ZK 中的**独占锁**，表明自己是活动的节点。

ZKFailoverController（ZKFC）是 ZK 集群的客户端，用来监控 NN 的状态信息，每个运行 NameNode 的节点必须要运行一个 ZKFC。ZKFC 提供以下功能：

* 健康检查，ZKFC 定期对本地的 NN 发起 health-check 的命令，如果 NN 正确返回，那么 NN 被认为是 OK 的，否则被认为是失效节点；
* session管理，当本地 NN 是健康的时候，ZKFC 将会在 ZK 中持有一个 session，如果本地 NN 又正好是 Active，那么 ZKFC 将持有一个短暂的节点作为锁，一旦本地 NN 失效了，那么这个节点就会被自动删除；
* 基础选举，如果本地 NN 是健康的，并且 ZKFC 发现没有其他 NN 持有这个独占锁，那么它将试图去获取该锁，一旦成功，那么它就开始执行 Failover，然后变成 Active 状态的 NN 节点；Failover 的过程分两步，首先对之前的 NameNode 执行隔离（如果需要的话），然后将本地 NameNode 切换到 Active 状态。

#### 3. 双 NameNode 架构中元数据一致性如何保证

聪明的你可能要问了，两个 NameNode 架构之间的元数据是如何共享的呢？

从 Hadoop2.x 版本后，HDFS 采用了一种全新的元数据共享机制，即通过 Quorum Journal Node（JournalNode）集群或者 network File System（NFS）进行数据共享。NFS 是操作系统层面的，而 JournalNode 是 Hadoop 层面的，成熟可靠、使用简单方便，所以，这里我们采用 JournalNode 集群进行元数据共享。

JournalNode 集群以及与 NameNode 之间如何共享元数据，可参照下图所示。


<Image alt="01.png" src="https://s0.lgstatic.com/i/image/M00/07/4E/CgqCHl65FrmAJkEYAADp0NN0xGw607.png"/> 


由图可知，JournalNode 集群可以几乎实时的去 NameNode 上拉取元数据，然后保存元数据到 JournalNode 集群；同时，处于 standby 状态的 NameNode 也会实时的去 JournalNode 集群上同步 JNS 数据，通过这种方式，就实现了两个 NameNode 之间的数据同步。

那么，JournalNode 集群内部是如何实现的呢？

两个 NameNode 为了数据同步，会通过一组称作 JournalNodes 的独立进程进行相互通信。当 Active 状态的 NameNode 元数据有任何修改时，会告知大部分的 JournalNodes 进程。同时，Standby 状态的 NameNode 也会读取 JNs 中的变更信息，并且一直监控 EditLog （事务日志）的变化，并把变化应用于自己的命名空间。Standby 可以确保在集群出错时，元数据状态已经完全同步了。

下图是 JournalNode 集群的内部运行架构图。


<Image alt="02.png" src="https://s0.lgstatic.com/i/image/M00/07/4E/CgqCHl65FsmAReOgAACOMp8vfYQ648.png"/> 


由图可知，JN1、JN2、JN3 等是 JournalNode 集群的节点，QJM（Qurom Journal Manager）的基本原理是用 2N+1 台 JournalNode 存储 EditLog，每次写数据操作有 N/2+1 个节点返回成功，那么本次写操作才算成功，保证数据高可用。当然这个算法所能容忍的是最多有 N 台机器挂掉，如果多于 N 台挂掉，算法就会失效。

ANN 表示处于 Archive 状态的 NameNode，SNN 表示处于 Standbye 状态的 NameNode，QJM 从 ANN 读取数据写入 EditLog 中，然后 SNN 从 EditLog 中读取数据，进而应用到自身。

#### 4. 双 NameNode 高可用 Hadoop 集群架构

作为 Hadoop 的第二个版本，Hadoop2.x 最大的变化是 NameNode 可实现高可用，以及计算资源管理器 Yarn。本课时我们将重点介绍下如何构建一个线上高可用的 Hadoop 集群系统，这里有两个重点，一是 NameNode 高可用的构建，二是资源管理器 Yarn 的实现，通过 Yarn 实现真正的分布式计算和多种计算框架的融合。

下图是一个高可用的 Hadoop 集群运行原理图。


<Image alt="03.png" src="https://s0.lgstatic.com/i/image/M00/07/55/Ciqc1F65G7aAKwckAADqfdUc2EA969.png"/> 


此架构主要解决了两个问题，一是 NameNode 元数据同步问题，二是主备 NameNode 切换问题，由图可知，解决主、备 NameNode 元数据同步是通过 JournalNode 集群来完成的，而解决主、备 NameNode 切换可通过 ZooKeeper 来完成。

ZooKeeper 是一个独立的集群，在两个 NameNode 上还需要启动一个 failoverController（zkfc）进程，该进程作为 ZooKeeper 集群的客户端存在，通过 zkfc 可以实现与 ZooKeeper 集群的交互和状态监测。

### 双 NameNode + Yarn 构建 HDFS 高可用 Hadoop 集群过程

#### 1. 部署前主机、软件功能、磁盘存储规划

双 NameNode 的 Hadoop 集群环境涉及到的角色有 Namenode、datanode、resourcemanager、nodemanager、historyserver、ZooKeeper、JournalNode 和 zkfc，这些角色可以单独运行在一台服务器上，也可以将某些角色合并在一起运行在一台机器上。

一般情况下，NameNode 服务要独立部署，这样两个 NameNode 就需要两台服务器，而 datanode 和 nodemanager 服务建议部署在一台服务器上，resourcemanager 服务跟 NameNode 类似，也建议独立部署在一台服务器上，而 historyserver 一般和 resourcemanager 服务放在一起。ZooKeeper 和 JournalNode 服务是基于集群架构的，因此至少需要 3 个集群节点，即需要 3 台服务器，不过 ZooKeeper 和 JournalNode 集群可以放在一起，共享 3 台服务器资源。最后，zkfc 是对 NameNode 进行资源仲裁的，所以它必须和 NameNode 服务运行在一起，这样 zkfc 就不需要占用独立的服务器了。

本着节约成本、优化资源、合理配置的原则，下面的部署通过 5 台独立的服务器来实现，操作系统均采用 Centos7.7 版本，每个服务器主机名、IP 地址以及功能角色如下表所示：


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image/M00/07/55/CgqCHl65G9OAUprTAADj0vKtWPY235.png"/> 


由表可知，namenodemaster 和 yarnserver 是作为 NameNode 的主、备两个节点，同时 yarnserver 还充当了 ResourceManager 和 JobHistoryServer 的角色。如果服务器资源充足，可以将 ResourceManager 和 JobHistoryServer 服务放在一台独立的机器上。

此外，slave001、slave002 和 slave003 三台主机上部署了 ZooKeeper 集群、JournalNode 集群，还充当了 DataNode 和 NodeManager 的角色。

在软件部署上，每个软件采用的版本如下表所示：


<Image alt="图片2.png" src="https://s0.lgstatic.com/i/image/M00/07/56/CgqCHl65G-SAIyUlAABHEvoc-ZI303.png"/> 


最后，还需要考虑**磁盘存储规划**，HDFS 文件系统的数据块都存储在本地的每个 datanode 节点上。因此，每个 datanode 节点要有大容量的磁盘，磁盘类型可以是普通的机械硬盘，有条件的话 SSD 硬盘最好，单块硬盘推荐 4T 或者 8T，这些硬盘无需做 RAID，单盘使用即可，因为 HDFS 本身已经有了副本容错机制。

在本课时介绍的环境中，我的每个 datanode 节点均有 2 块大容量硬盘用来存储 HDFS 数据块。此外，NameNode 节点所在的主机要存储 HDFS 的元数据信息，这些元数据控制着整个 HDFS 集群中的存储与读写，一旦丢失，那么 HDFS 将丢失数据甚至无法使用，所以保证 NameNode 节点 HDFS 元数据安全性至关重要。

在 NameNode 节点建议配置 4 块大小一样的磁盘，每两块做一个 raid1，共做两组 raid1，然后将元数据镜像存储在这两个 raid1 上。

#### 2. 自动化安装系统基础环境

在进行 Hadoop 集群部署之前，先需要对系统的基础环境进行配置， 包含主机名、本地解析 hosts 文件、ansible 管理机到集群节点建立 ssh 信任、系统参数修改（ulimit 资源配置、关闭 selinux）、创建 Hadoop 用户五个方面。 这五个方面可以通过 ansible playbook 脚本自动化完成，下面依次介绍。

（1）建立管理机到集群节点 ssh 无密码登录

在大数据运维中，操作系统安装基本是自动化完成的，系统安装完成后，所有主机的密码也是相同的，为了自动化运维方便，需要将 ansilbe 管理机与 Hadoop 集群所有节点之间建立单向无密码登录权限。

首先，修改 ansible 的配置文件 hosts（本例为 /etc/ansible/hosts）添加主机组信息，内容如下：

```java
[hadoophosts]
172.16.213.31   hostname=namenodemaster
172.16.213.41   hostname=yarnserver
172.16.213.70   hostname=slave001 myid=1
172.16.213.103  hostname=slave002 myid=2
172.16.213.169  hostname=slave003 myid=3
```

此主机组中，前面是 IP 地址，后面是每个主机的主机名，通过定义 hostname 变量，可实现通过 ansible 自动修改主机名。

接着，创建 /etc/ansible/roles/vars/main.yml 文件，内容如下：

```java
zk1_hostname: 172.16.213.70
zk2_hostname: 172.16.213.103
zk3_hostname: 172.16.213.169
AnsibleDir: /etc/ansible
BigdataDir: /opt/bigdata
hadoopconfigfile: /etc/hadoop
```

这里面定义了 6 个角色变量，在后面 playbook 中会用到。最后，编写 playbook 脚本，内容如下：

```sql
- hosts: hadoophosts
  gather_facts: no
  roles:
   - roles
  tasks:
   - name: close ssh yes/no check
     lineinfile: path=/etc/ssh/ssh_config regexp='(.*)StrictHostKeyChecking(.*)' line="StrictHostKeyCheck
ing no"
   - name: delete /root/.ssh/
     file: path=/root/.ssh/ state=absent
   - name: create .ssh directory
     file: dest=/root/.ssh mode=0600 state=directory
   - name: generating local public/private rsa key pair
     local_action: shell ssh-keygen -t rsa -b 2048 -N '' -y -f /root/.ssh/id_rsa
   - name: view id_rsa.pub
     local_action: shell cat /root/.ssh/id_rsa.pub
     register: sshinfo
   - set_fact: sshpub={ {sshinfo.stdout}}
   - name: add ssh record
     local_action: shell echo { {sshpub}} > { {AnsibleDir}}/roles/templates/authorized_keys.j2
   - name: copy authorized_keys.j2 to all
     template: src={ {AnsibleDir}}/roles/templates/authorized_keys.j2 dest=/root/.ssh/authorized_keys mode
=0600
     tags:
     - install ssh
```

将此playbook脚本命名为sshk.yml，然后在命令行执行如下命令完成ssh单向信任：

```sql
[root@server239 ansible]# pwd
/etc/ansible
[root@server239 ansible]# ansible-playbook  sshk.yml -k
```

注意，这里添加了一个"-k"参数，因为现在管理机和 Hadoop 节点之间还没有建立 ssh 信任，所以需要指定此参数手动输入密码，但这个操作仅需执行一次，后面的操作就可以无需输入密码了。

（2）自动修改主机名

紧接上面的 ansible 配置环境，要实现批量自动修改主机名，执行如下 playbook 脚本即可：

```sql
- hosts: hadoophosts
  remote_user: root
  tasks:
  - name: change name
    shell: "echo { {hostname}} > /etc/hostname"
  - name:
    shell: hostname { {hostname|quote}}
```

将此 playbook 脚本命名为 hostname.yml，然后在命令行执行如下命令完成主机名修改：

```sql
 [root@server239 ansible]# ansible-playbook  hostname.yml
```

（3）自动构建本地解析hosts文件

紧接上面的 ansible 配置环境，要自动构建本地解析 hosts 文件，可通过如下 playbook 脚本实现：

```java
- hosts: hadoophosts
  remote_user: root
  roles:
  - roles
  tasks:
   - name: add localhost
     local_action: shell echo "127.0.0.1   localhost" > { {AnsibleDir}}/roles/templates/hosts.j2
     run_once: true
   - set_fact: ipaddress={ {inventory_hostname}}
   - set_fact: hostname={ {hostname}}
   - name: add host record
     local_action: shell echo { {ipaddress}} { {hostname}} >> { {AnsibleDir}}/roles/templates/hosts.j2
   - name: copy hosts.j2 to all host
     template: src={ {AnsibleDir}}/roles/templates/hosts.j2 dest=/etc/hosts
```

将 playbook 脚本命名为 hosts.yml，然后在命令行执行如下命令，完成构建本地解析 hosts 文件并分发集群每个节点：

```sql
[root@server239 ansible]# pwd
/etc/ansible
[root@server239 ansible]# ansible-playbook  hosts.yml
```

（4）自动修改优化系统参数

紧接上面的 ansible 配置环境，系统参数优化主要有关闭 selinux、关闭防火墙 firewalld、iptables、添加 ulimit 资源限制、添加时间同步服务器等，要实现自动优化系统参数，可通过如下 playbook 脚本实现：

```java
- hosts: hadoophosts
  remote_user: root
  gather_facts: false
  tasks:
   - name: selinux disabled
     lineinfile: dest=/etc/selinux/config regexp='SELINUX=(.*)' line='SELINUX=disabled'
   - name:
     lineinfile: dest=/etc/security/limits.conf line="{ {item.value}}"
     with_items:
     - {value: "*         soft    nofile         655360"}
     - {value: "*         hard    nofile         655360"}
   - name: disabled iptables and firewalld
     shell: systemctl stop firewalld&&systemctl disable firewalld&&iptables --F
   - name: cron ntpdate
     cron: name=ntpdate minute=*/5 user=root job="source /etc/profile;/usr/sbin/ntpdate -u 172.16.213.154;/sbin/hwclock -w"
```

playbook 脚本依次执行了关闭 selinux、添加用户资源配置、关闭防火墙和增加时间同步服务器，其中 172.16.213.154 是我内网的时间同步服务器，如果没有这个时间服务器，也可以使用外网时间同步时钟，但要**保证机器能够访问互联网**。

将 playbook 脚本命名为 os.yml，然后在命令行执行如下命令，完成优化系统参数：

```sql
[root@server239 ansible]# ansible-playbook  os.yml
```

（5）自动化批量创建 Hadoop 用户

Hadoop 用户作为集群的管理员用户，需要在每个集群节点进行创建，此用户不需要密码，仅创建一个用户即可，后面所有服务的启动，均是通过 Hadoop 用户来完成的。如下 playbook 脚本可自动完成创建用户的工作，脚本内容如下：

```java
- name: create user
  hosts: hadoophosts
  remote_user: root
  gather_facts: true
  vars:
    user1: hadoop
  tasks:
   - name: start createuser
     user: name="{ {user1}}"
```

将 playbook 脚本命名为 adduser.yml，然后在命令行执行如下命令完成用户创建：

```sql
[root@server239 ansible]# ansible-playbook  adduser.yml
```

#### 3. 自动化安装 JDK、ZooKeeper 及 Hadoop

整个 Hadoop 集群的安装部署需要三个步骤， 即安装 JDK 并设置 Java 环境变量、ZooKeeper 集群的安装部署以及 Hadoop 集群的安装和部署。

软件的部署一般分为安装和配置，若通过自动化工具来进行部署的话，一般是将软件下载好，然后修改配置文件，最后将程序和配置进行打包压缩，这样，一个自动化部署程序就包装好了。将包装好的程序放在 ansible 管理机对应的目录下，进行调用即可。

这里我们将 JDK、ZooKeeper 和 Hadoop 都安装在服务器的 /opt/bigdata 目录下。先从最简单的 JDK 安装部署开始，仍然采用编写 ansible-playbook 脚本的方式进行，编写好的自动化安装 JDK 脚本内容如下：

```java
- hosts: hadoophosts
  remote_user: root
  roles:
  - roles
  tasks:
   - name: mkdir jdk directory
     file: path={ {BigdataDir}} state=directory mode=0755
   - name: copy and unzip jdk
     unarchive: src={ {AnsibleDir}}/roles/files/jdk.tar.gz dest={ {BigdataDir}}
   - name: chmod bin
     file: dest={ {BigdataDir}}/jdk/bin mode=0755 recurse=yes
   - name: set jdk env
     lineinfile: dest=/home/hadoop/.bash_profile line="{ {item.value}}" state=present
     with_items:
     - {value: "export JAVA_HOME={ {BigdataDir}}/jdk"}
     - {value: "export CLASSPATH=.:$JAVA_HOME/jre/lib/rt.jar:$JAVA_HOME/lib/dt.jar:$JAVA_HOME/lib/tools.jar"}
     - {value: "export PATH=$JAVA_HOME/bin:$PATH"}
```

此脚本仍然使用了角色变量 BigdataDir 和 AnsibleDir，其中，jdk.tar.gz 是包装好的 JDK 安装程序，只需要拷贝到集群每个节点解压即可完成安装。

将 playbook 脚本命名为 jdk.yml，然后在命令行执行如下命令完成 JDK 安装：

```sql
[root@server239 ansible]# ansible-playbook  jdk.yml
```

接着，编写自动化安装 ZooKeeper 集群的脚本，内容如下：

```java
 - hosts: hadoophosts
  remote_user: root
  roles:
  - roles
  tasks:
   - name: mkdir directory for bigdata data
     file: dest={ {BigdataDir}} mode=0755 state=directory
   - name: install zookeeper
     unarchive: src={ {AnsibleDir}}/roles/files/zookeeper.tar.gz dest={ {BigdataDir}}
   - name: install configuration file for zookeeper
     template: src={ {AnsibleDir}}/roles/templates/zoo.cfg.j2 dest={ {BigdataDir}}/zookeeper/current/conf/zoo.cfg
   - name: create data and log directory
     file: dest={ {BigdataDir}}/zookeeper/current/{ {item}} mode=0755 state=directory
     with_items:
     - dataLogDir
     - data
   - name: add myid file
     shell: echo { { myid }} > { {BigdataDir}}/zookeeper/current/data/myid
   - name: chown hadoop for zk directory
     file: dest={ {BigdataDir}}/zookeeper owner=hadoop group=hadoop state=directory recurse=yes
```

此脚本引用了一个模板文件 zoo.cfg.j2，它位于管理机上 /etc/ansible/roles/templates/ 路径下，此文件内容如下：

```java
tickTime=2000
initLimit=20
syncLimit=10
dataDir={ {BigdataDir}}/zookeeper/current/data
dataLogDir={ {BigdataDir}}/zookeeper/current/dataLogDir
clientPort=2181
quorumListenOnAllIPs=true
server.1={ {zk1_hostname}}:2888:3888
server.2={ {zk2_hostname}}:2888:3888
server.3={ {zk3_hostname}}:2888:3888
```

在这个模板文件中，也引用了几个角色变量 BigdataDir、zk1_hostname、zk2_hostname 和 zk3_hostname，这些变量都在 roles 文件夹中 vars 子文件夹下的 main.yml 文件中定义。

将 playbook 脚本命名为 zk.yml，然后在命令行执行如下命令，完成 ZooKeeper 的自动化安装与配置：

```sql
[root@server239 ansible]# ansible-playbook  zk.yml
```

最后，重点内容来了，即编写自动化安装 Hadoop 脚本，我们采用 Hadoop3.2.1 版本，下载二进制安装包进行，其实就是将包装好的 Hadoop 安装程序打包成 hadoop.tar.gz 这种压缩格式，然后从管理机自动拷贝到集群每个节点，playbook 文件内容如下：

```java
 - hosts: hadoophosts
  remote_user: root
  roles:
  - roles
  tasks:
   - name: create hadoop user
     user: name=hadoop state=present
   - name: mkdir directory for bigdata directory
     file: dest={ {BigdataDir}} mode=0755 state=directory
   - name: mkdir directory for bigdata configfiles
     file: dest={ {hadoopconfigfile}} mode=0755 state=directory
   - name: install hadoop
     unarchive: src={ {AnsibleDir}}/roles/files/hadoop.tar.gz dest={ {BigdataDir}}
   - name: chown hadoop configfiles directory
     file: dest={ {BigdataDir}}/hadoop owner=hadoop group=hadoop state=directory
   - name: install configuration file for hadoop
     unarchive: src={ {AnsibleDir}}/roles/files/conf.tar.gz dest={ {hadoopconfigfile}}
   - name: chown hadoop configfiles directory
     file: dest={ {hadoopconfigfile}}/conf owner=hadoop group=hadoop state=directory
   - name: set hadoop env
     lineinfile: dest=/home/hadoop/.bash_profile insertafter="{ {item.position}}" line="{ {item.value}}" st
ate=present
     with_items:
     - {position: EOF, value: "export HADOOP_HOME={ {BigdataDir}}/hadoop/current"}
     - {position: EOF, value: "export HADOOP_MAPRED_HOME=${HADOOP_HOME}"}
     - {position: EOF, value: "export HADOOP_COMMON_HOME=${HADOOP_HOME}"}
     - {position: EOF, value: "export HADOOP_HDFS_HOME=${HADOOP_HOME}"}
     - {position: EOF, value: "export HADOOP_YARN_HOME=${HADOOP_HOME}"}
     - {position: EOF, value: "export HTTPFS_CATALINA_HOME=${HADOOP_HOME}/share/hadoop/httpfs/tomcat"}
     - {position: EOF, value: "export CATALINA_BASE=${HTTPFS_CATALINA_HOME}"}
     - {position: EOF, value: "export HADOOP_CONF_DIR={ {hadoopconfigfile}}/conf"}
     - {position: EOF, value: "export HTTPFS_CONFIG={ {hadoopconfigfile}}/conf"}
     - {position: EOF, value: "export PATH=$PATH:$HADOOP_HOME/bin:$HADOOP_HOME/sbin"}
   - name: enforce env
     shell: source /home/hadoop/.bash_profile
```

将此 playbook 脚本命名为 hadoop.yml，然后在命令行执行如下命令，完成 Hadoop 的自动化安装与配置：

```sql
[root@server239 ansible]# ansible-playbook  hadoop.yml
```


