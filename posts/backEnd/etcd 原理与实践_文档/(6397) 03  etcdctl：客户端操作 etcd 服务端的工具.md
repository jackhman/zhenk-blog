# 03etcdctl：客户端操作etcd服务端的工具

上一讲我们介绍了 etcd 的几种安装部署方式以及 TLS 安全加密等知识点。安装好 etcd 后，我们将开始体验如何使用 etcd。这一讲，我将会基于 etcd 自带的客户端工具------etcdctl 来演示 etcd 常用的一些操作，帮助你快速入手 etcd。

### etcdctl 客户端

etcdctl 是一个命令行客户端，便于我们进行**服务测试或手动修改数据库内容**，我们刚开始熟悉 etcd 功能时可以通过 etdctl 客户端熟悉相关操作。etcdctl 在两个不同的 etcd 版本（v2 和 v3）下的功能和使用方式也完全不同。一般通过如下方式来指定使用 etcd 的版本：

```java
export ETCDCTL_API=2
export ETCDCTL_API=3
```

我们的专栏课程主要讲解 API 3。etcd 项目二进制发行包中已经包含了 etcdctl 工具，通过 etcd 安装包中的 etcdctl 可执行文件可以进行调用。下面我们先来看看 etcd 的常用命令有哪些，并进行实践应用。

### 常用命令介绍

我们首先来看下 etcdctl 支持哪些命令，通过`etcdctl -h`命令查看：

```java
$ etcdctl -h
NAME:
	etcdctl - A simple command line client for etcd3.
USAGE:
	etcdctl [flags]
VERSION:
	3.4.4
API VERSION:
	3.4
```

COMMANDS:


<Image alt="Lark20210201-172927.png" src="https://s0.lgstatic.com/i/image/M00/94/3B/Ciqc1GAXykaAefV0AAoX29H6c7o817.png"/> 


OPTIONS:


<Image alt="Lark20210201-172932.png" src="https://s0.lgstatic.com/i/image/M00/94/3C/Ciqc1GAXylSANvfVAAYmlJl-aDo653.png"/> 


etcdctl 支持的命令大体上分为**数据库操作和非数据库操作**两类。其中数据库的操作命令是最常用的命令，我们将在下面具体介绍。其他的命令如用户、角色、授权、认证相关，你可以根据语法自己尝试一下。

### 数据库操作

数据库操作基本围绕着对键值和目录的 CRUD 操作（即增删改查），及其对应的生命周期管理。我们上手这些操作其实很方便，因为这些操作是符合 REST 风格的一套 API 操作。

etcd 在键的组织上采用了类似文件系统中目录的概念，即**层次化的空间结构** ，我们指定的键可以作为键名，如：testkey，实际上，此时键值对放于根目录 / 下面。我们也可以为键的存储**指定目录结构**，如 /cluster/node/key；如果不存在 /cluster/node 目录，则 etcd Server 将会创建相应的目录结构。

下面我们基于键操作、watch、lease 三类分别介绍 etcdctl 的使用与实践。

#### 键操作

键操作包括最常用的增删改查操作，包括 PUT、GET、DELETE 等命令。

**PUT 设置或者更新某个键的值**。例如：

```java
$ etcdctl put /test/foo1 "Hello world"
$ etcdctl put /test/foo2 "Hello world2"
$ etcdctl put /test/foo3 "Hello world3"
```

成功写入三对键值，/test/foo1、/test/foo2 和 /test/foo3。

**GET 获取指定键的值**。例如获取 /testdir/testkey 对应的值：

```java
$ etcdctl get /testdir/testkey
Hello world
```

除此之外， etcdctl 的 GET 命令还提供了根据指定的键（key），获取其对应的十六进制格式值，即以十六进制格式返回：

```java
$ etcdctl get /test/foo1 --hex
\x2f\x74\x65\x73\x74\x64\x69\x72\x2f\x74\x65\x73\x74\x6b\x65\x79 #键
\x48\x65\x6c\x6c\x6f\x20\x77\x6f\x72\x6c\x64 #值
```

加上`--print-value-only`可以读取对应的值。十六进制在 etcd 中有多处使用，如**租约 ID**也是十六进制。

GET 范围内的值：

```shell
$ etcdctl get /test/foo1 /test/foo3
/test/foo1
Hello world
/test/foo2
Hello world2
```

可以看到，上述操作获取了大于等于 /test/foo1，且小于 /test/foo3 的键值对。foo3 不在范围之内，因为范围是半开区间 \[foo1, foo3)，不包含 foo3。

获取某个前缀的所有键值对，通过 --prefix 可以指定前缀：

```java
$ etcdctl get --prefix /test/foo
/test/foo1
Hello world
/test/foo2
Hello world2
/test/foo3
Hello world3
```

这样就能获取所有以 /test/foo 开头的键值对，当前缀获取的结果过多时，还可以通过 --limit=2 限制获取的数量：

```java
etcdctl get --prefix --limit=2 /test/foo
```

读取键过往版本的值，应用可能想读取键的被替代的值。

例如，应用可能想**通过访问键的过往版本回滚到旧的配置** 。或者，应用可能想**通过多个请求得到一个覆盖多个键的统一视图**，而这些请求可以通过访问键历史记录而来。因为 etcd 集群上键值存储的每个修改都会增加 etcd 集群的全局修订版本，应用可以通过提供旧有的 etcd 修改版本来读取被替代的键。现有如下键值对：

```java
foo = bar         # revision = 2
foo1 = bar2       # revision = 3
foo = bar_new     # revision = 4
foo1 = bar1_new   # revision = 5
```

以下是访问以前版本 key 的示例：

```java
$ etcdctl get --prefix foo # 访问最新版本的 key
foo
bar_new
foo1
bar1_new
$ etcdctl get --prefix --rev=4 foo # 访问第 4 个版本的 key
foo
bar_new
foo1
bar1
$ etcdctl get --prefix --rev=3 foo #  访问第 3 个版本的 key
foo
bar
foo1
bar1
$ etcdctl get --prefix --rev=2 foo #  访问第 3 个版本的 key
foo
bar
$ etcdctl get --prefix --rev=1 foo #  访问第 1 个版本的 key
```

应用可能想读取大于等于指定键的 byte 值的键。假设 etcd 集群已经有如下列键：

```java
a = 123
b = 456
z = 789
```

读取大于等于键 b 的 byte 值的键的命令：

```java
$ etcdctl get --from-key b
b
456
z
789
```

**DELETE 键，应用可以从 etcd 集群中删除一个键或者特定范围的键**。

假设 etcd 集群已经有下列键：

```java
foo = bar
foo1 = bar1
foo3 = bar3
zoo = val
zoo1 = val1
zoo2 = val2
a = 123
b = 456
z = 789
```

删除键 foo 的命令：

```java
$ etcdctl del foo
1 # 删除了一个键
```

删除从 foo 到 foo9 范围的键的命令：

```java
$ etcdctl del foo foo9
2 # 删除了两个键
```

删除键 zoo 并返回被删除的键值对的命令：

```java
$ etcdctl del --prev-kv zoo
1   # 一个键被删除
zoo # 被删除的键
val # 被删除的键的值
```

删除前缀为 zoo 的键的命令：

```java
$ etcdctl del --prefix zoo
2 # 删除了两个键
```

删除大于等于键 b 的 byte 值的键的命令：

```java
$ etcdctl del --from-key b
2 # 删除了两个键
```

#### watch 键值对的改动

etcd 的 watch 功能是一个常用的功能，我们来看看通过 etcdctl 如何实现 watch 指定的键值对。

watch 监测一个键值的变化，一旦**键值发生更新，就会输出最新的值并退出**。例如：用户更新 testkey 键值为 Hello watch。

```java
$ etcdctl watch testkey
# 在另外一个终端: etcdctl put testkey Hello watch
testkey
Hello watch
```

从 foo to foo9 范围内键的命令：

```java
$ etcdctl watch foo foo9
# 在另外一个终端: etcdctl put foo bar
PUT
foo
bar
# 在另外一个终端: etcdctl put foo1 bar1
PUT
foo1
bar1
```

以 16 进制格式在键 foo 上进行观察的命令：

```java
$ etcdctl watch foo --hex
# 在另外一个终端: etcdctl put foo bar
PUT
\x66\x6f\x6f          # 键
\x62\x61\x72          # 值
```

观察多个键 foo 和 zoo 的命令：

```java
$ etcdctl watch -i
$ watch foo
$ watch zoo
# 在另外一个终端: etcdctl put foo bar
PUT
foo
bar
# 在另外一个终端: etcdctl put zoo val
PUT
zoo
val
```

查看 key 的历史改动，应用可能想观察 etcd 中键的历史改动。

例如，应用服务想要获取某个键的所有修改。如果应用客户端一直与 etcd 服务端保持连接，使用 watch 命令就能够实现了。但是当应用或者 etcd 实例出现异常，该键的改动可能发生在出错期间，这样导致了应用客户端没能实时接收这个更新。因此，**应用客户端必须观察键的历史变动**，为了做到这点，应用客户端可以在观察时指定一个历史修订版本。

首先我们需要完成下述序列的操作：

```java
$ etcdctl put foo bar         # revision = 2
OK
$ etcdctl put foo1 bar1       # revision = 3
OK
$ etcdctl put foo bar_new     # revision = 4
OK
$ etcdctl put foo1 bar1_new   # revision = 5
OK
```

观察历史改动：

```java
# 从修订版本 2 开始观察键 `foo` 的改动
$ etcdctl watch --rev=2 foo
PUT
foo
bar
PUT
foo
bar_new
```

从上一次历史修改开始观察：

```java
# 在键 `foo` 上观察变更并返回被修改的值和上个修订版本的值
$ etcdctl watch --prev-kv foo
# 在另外一个终端: etcdctl put foo bar_latest
PUT
foo         # 键
bar_new     # 在修改前键 foo 的上一个值
foo         # 键
bar_latest  # 修改后键 foo 的值
```

压缩修订版本。

参照上述内容，etcd 保存修订版本以便应用客户端可以读取键的历史版本。但是，为了避免积累无限数量的历史数据，需要对历史的修订版本进行压缩。**经过压缩，etcd 删除历史修订版本，释放存储空间，且在压缩修订版本之前的数据将不可访问**。

下述命令实现了压缩修订版本：

```java
$ etcdctl compact 5
compacted revision 5 #在压缩修订版本之前的任何修订版本都不可访问
$ etcdctl get --rev=4 foo
{"level":"warn","ts":"2020-05-04T16:37:38.020+0800","caller":"clientv3/retry_interceptor.go:62","msg":"retrying of unary invoker failed","target":"endpoint://client-c0d35565-0584-4c07-bfeb-034773278656/127.0.0.1:2379","attempt":0,"error":"rpc error: code = OutOfRange desc = etcdserver: mvcc: required revision has been compacted"}
Error: etcdserver: mvcc: required revision has been compacted
```

#### lease（租约）

lease 意为租约，类似于 Redis 中的 TTL(Time To Live)。etcd 中的键值对可以绑定到租约上，实现**存活周期控制**。在实际应用中，常用来实现服务的心跳，即服务在启动时获取租约，将租约与服务地址绑定，并写入 etcd 服务器，为了保持心跳状态，服务会定时刷新租约。

**授予租约**

应用客户端可以为 etcd 集群里面的键授予租约。当键被附加到租约时，它的存活时间被绑定到租约的存活时间，而租约的存活时间相应的被 TTL 管理。在授予租约时，每个租约的最小 TTL 值由应用客户端指定。**一旦租约的 TTL 到期，租约就会过期并且所有附带的键都将被删除**。

```java
# 授予租约，TTL 为 100 秒
$ etcdctl lease grant 100
lease 694d71ddacfda227 granted with TTL(10s)
# 附加键 foo 到租约 694d71ddacfda227
$ etcdctl put --lease=694d71ddacfda227 foo10 bar
OK
```

在实际的操作中，**建议 TTL 时间设置久一点**，避免来不及操作而出现如下错误：

```shell
{"level":"warn","ts":"2020-12-04T17:12:27.957+0800","caller":"clientv3/retry_interceptor.go:62","msg":"retrying of unary invoker failed","target":"endpoint://client-f87e9b9e-a583-453b-8781-325f2984cef0/127.0.0.1:2379","attempt":0,"error":"rpc error: code = NotFound desc = etcdserver: requested lease not found"}
```

**撤销租约**

应用通过租约 ID 可以撤销租约。撤销租约将删除所有附带的 key。

我们进行下列操作：

```java
$ etcdctl lease revoke 694d71ddacfda227
lease 694d71ddacfda227 revoked
$ etcdctl get foo10
```

**刷新租期**

应用程序可以通过刷新其 TTL 保持租约存活，因此不会过期。

```java
$ etcdctl lease keep-alive 694d71ddacfda227
lease 694d71ddacfda227 keepalived with TTL(100)
lease 694d71ddacfda227 keepalived with TTL(100)
...
```

**查询租期**

应用客户端可以查询租赁信息，检查续订或租赁的状态，是否存在或者是否已过期。应用客户端还可以查询特定租约绑定的 key。

我们进行下述操作：

```java
$ etcdctl lease grant 300
lease 694d71ddacfda22c granted with TTL(300s)
$ etcdctl put --lease=694d71ddacfda22c foo10 bar
OK
```

获取有关租赁信息以及哪些 key 绑定了租赁信息：

```java
$ etcdctl lease timetolive 694d71ddacfda22c
lease 694d71ddacfda22c granted with TTL(300s), remaining(282s)
$ etcdctl lease timetolive --keys 694d71ddacfda22c
lease 694d71ddacfda22c granted with TTL(300s), remaining(220s), attached keys([foo10])
```

### 小结

这一讲我们主要介绍了 etcdctl 相关命令的说明以及数据库命令的使用实践。etcdctl 为用户提供一些简洁的命令，用户通过 etcdctl 可以直接与 etcd 服务端交互。etcdctl 客户端提供的操作与 HTTP API 基本上是对应的，甚至可以替代 HTTP API 的方式。通过 etcdctl 客户端工具的学习，对于我们快速熟悉 etcd 组件的功能和入门使用非常有帮助。

本讲内容如下：


<Image alt="Lark20210201-172935.png" src="https://s0.lgstatic.com/i/image2/M01/0C/36/CgpVE2AXynmAbZxPAAEoYddgUBM139.png"/> 


学完这一讲内容，想必你对 etcd 的常用功能已经有了一个整体的了解，但是如果在 etcd 集群信息变更的情况下，etcdctl 如何稳定地访问 etcd 服务实例，非 gRPC 客户端又该如何访问 etcd 服务端呢？这也是我们下一讲的主要内容，希望你能提前思考，也欢迎你在留言区和我交流，我们下一讲再见。

