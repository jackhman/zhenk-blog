# 05gRPC代理模式：实现可伸缩的etcdAPI

gRPC proxy 是在 gRPC 层（L7）运行的无状态 etcd 反向代理，旨在**减少核心 etcd 集群上的总处理负载**。gRPC proxy 合并了监视和 Lease API 请求，实现了水平可伸缩性。同时，为了保护集群免受滥用客户端的侵害，gRPC proxy 实现了键值对的读请求缓存。

下面我们将围绕 gRPC proxy 基本应用、客户端端点同步、可伸缩的 API、命名空间的实现和其他扩展功能展开介绍。

### gRPC proxy 基本应用

首先我们来配置 etcd 集群，集群中拥有如下的静态成员信息：


<Image alt="202125-92345.png" src="https://s0.lgstatic.com/i/image6/M00/02/39/CioPOWAdDsCAOeHvAACGoxT-wS8912.png"/> 


使用`etcd grpc-proxy start`的命令开启 etcd 的 gRPC proxy 模式，包含上表中的静态成员：

```java
$ etcd grpc-proxy start --endpoints=http://192.168.10.7:2379,http://192.168.10.8:2379,http://192.168.10.9:2379 --listen-addr=192.168.10.7:12379
{"level":"info","ts":"2020-12-13T01:41:57.561+0800","caller":"etcdmain/grpc_proxy.go:320","msg":"listening for gRPC proxy client requests","address":"192.168.10.7:12379"}
{"level":"info","ts":"2020-12-13T01:41:57.561+0800","caller":"etcdmain/grpc_proxy.go:218","msg":"started gRPC proxy","address":"192.168.10.7:12379"}
```

可以看到，etcd gRPC proxy 启动后在`192.168.10.7:12379`监听，并将客户端的请求转发到上述三个成员其中的一个。通过下述客户端读写命令，经过 proxy 发送请求：

```java
$ ETCDCTL_API=3 etcdctl --endpoints=192.168.10.7:12379 put foo bar
OK
$ ETCDCTL_API=3 etcdctl --endpoints=192.168.10.7:12379 get foo
foo
bar
```

我们通过 grpc-proxy 提供的客户端地址进行访问，proxy 执行的结果符合预期，在使用方法上和普通的方式完全相同。

### 客户端端点同步

gRPC 代理是 gRPC 命名的提供者，支持**在启动时通过写入相同的前缀端点名称**进行注册。这样可以使客户端将其端点与具有一组相同前缀端点名的代理端点同步，进而实现高可用性。

下面我们来启动两个 gRPC 代理，在启动时指定自定义的前缀`___grpc_proxy_endpoint`来注册 gRPC 代理：

```java
$ etcd grpc-proxy start --endpoints=localhost:12379   --listen-addr=127.0.0.1:23790   --advertise-client-url=127.0.0.1:23790   --resolver-prefix="___grpc_proxy_endpoint"   --resolver-ttl=60
{"level":"info","ts":"2020-12-13T01:46:04.885+0800","caller":"etcdmain/grpc_proxy.go:320","msg":"listening for gRPC proxy client requests","address":"127.0.0.1:23790"}
{"level":"info","ts":"2020-12-13T01:46:04.885+0800","caller":"etcdmain/grpc_proxy.go:218","msg":"started gRPC proxy","address":"127.0.0.1:23790"}
2020-12-13 01:46:04.892061 I | grpcproxy: registered "127.0.0.1:23790" with 60-second lease
$ etcd grpc-proxy start --endpoints=localhost:12379 \
>   --listen-addr=127.0.0.1:23791 \
>   --advertise-client-url=127.0.0.1:23791 \
>   --resolver-prefix="___grpc_proxy_endpoint" \
>   --resolver-ttl=60
{"level":"info","ts":"2020-12-13T01:46:43.616+0800","caller":"etcdmain/grpc_proxy.go:320","msg":"listening for gRPC proxy client requests","address":"127.0.0.1:23791"}
{"level":"info","ts":"2020-12-13T01:46:43.616+0800","caller":"etcdmain/grpc_proxy.go:218","msg":"started gRPC proxy","address":"127.0.0.1:23791"}
2020-12-13 01:46:43.622249 I | grpcproxy: registered "127.0.0.1:23791" with 60-second lease
```

在上面的启动命令中，将需要加入的自定义端点`--resolver-prefix`设置为`___grpc_proxy_endpoint`。启动成功之后，我们来验证下，gRPC 代理在查询成员时是否列出其所有成员作为成员列表，执行如下的命令：

```java
ETCDCTL_API=3 etcdctl --endpoints=http://localhost:23790 member list --write-out table
```

通过下图，可以看到，通过相同的前缀端点名完成了自动发现所有成员列表的操作。


<Image alt="202125-92351.png" src="https://s0.lgstatic.com/i/image6/M00/02/39/CioPOWAdDuaAL9IoAAMgcPZE1jc101.png"/> 


同样地，客户端也可以通过 Sync 方法自动发现代理的端点，代码实现如下：

```java
cli, err := clientv3.New(clientv3.Config{
    Endpoints: []string{"http://localhost:23790"},
})
if err != nil {
    log.Fatal(err)
}
defer cli.Close()
// 获取注册过的 grpc-proxy 端点
if err := cli.Sync(context.Background()); err != nil {
    log.Fatal(err)
}
```

相应地，如果配置的代理没有配置前缀，gRPC 代理启动命令如下：

```java
$ ./etcd grpc-proxy start --endpoints=localhost:12379 \
>   --listen-addr=127.0.0.1:23792 \
>   --advertise-client-url=127.0.0.1:23792
# 输出结果
{"level":"info","ts":"2020-12-13T01:49:25.099+0800","caller":"etcdmain/grpc_proxy.go:320","msg":"listening for gRPC proxy client requests","address":"127.0.0.1:23792"}
{"level":"info","ts":"2020-12-13T01:49:25.100+0800","caller":"etcdmain/grpc_proxy.go:218","msg":"started gRPC proxy","address":"127.0.0.1:23792"}
```

我们来验证下 gRPC proxy 的成员列表 API 是不是只返回自己的`advertise-client-url`：

```java
ETCDCTL_API=3 etcdctl --endpoints=http://localhost:23792 member list --write-out table
```

通过下图，可以看到，结果如我们预期：当我们**没有配置代理的前缀端点名时，获取其成员列表只会显示当前节点的信息，也不会包含其他的端点**。


<Image alt="202125-92353.png" src="https://s0.lgstatic.com/i/image6/M00/02/3B/Cgp9HWAdDu2Afub8AAI6unk0A5A099.png"/> 


### 可伸缩的 watch API

如果客户端监视同一键或某一范围内的键，gRPC 代理可以将这些客户端监视程序（c-watcher）合并为连接到 etcd 服务器的单个监视程序（s-watcher）。当 watch 事件发生时，代理将所有事件从 s-watcher 广播到其 c-watcher。

假设 N 个客户端监视相同的 key，则 gRPC 代理可以将 etcd 服务器上的监视负载从 N 减少到 1。用户可以部署多个 gRPC 代理，进一步分配服务器负载。

如下图所示，三个客户端监视键 A。gRPC 代理将三个监视程序合并，从而创建一个附加到 etcd 服务器的监视程序。


<Image alt="202125-92355.png" src="https://s0.lgstatic.com/i/image6/M00/02/39/CioPOWAdDvWAAhlsAADrPgju77A709.png"/> 


为了有效地将多个客户端监视程序合并为一个监视程序，gRPC 代理在可能的情况下将新的 c-watcher 合并为现有的 s-watcher。由于网络延迟或缓冲的未传递事件，合并的 s-watcher 可能与 etcd 服务器不同步。

**如果没有指定监视版本，gRPC 代理将不能保证 c-watcher 从最近的存储修订版本开始监视**。例如，如果客户端从修订版本为 1000 的 etcd 服务器监视，则该监视者将从修订版本 1000 开始。如果客户端从 gRPC 代理监视，则可能从修订版本 990 开始监视。

**类似的限制也适用于取消**。取消 watch 后，etcd 服务器的修订版可能大于取消响应修订版。

对于大多数情况，这两个限制一般不会引起问题，未来也可能会有其他选项强制观察者绕过 gRPC 代理以获得更准确的修订响应。

### 可伸缩的 lease API

为了保持客户端申请租约的有效性，客户端至少建立一个 gRPC 连接到 etcd 服务器，以定期发送心跳信号。如果 etcd 工作负载涉及很多的客户端租约活动，这些流可能会导致 CPU 使用率过高。**为了减少核心集群上的流总数，gRPC 代理支持将 lease 流合并**。

假设有 N 个客户端正在更新租约，则单个 gRPC 代理将 etcd 服务器上的流负载从 N 减少到 1。在部署的过程中，可能还有其他 gRPC 代理，进一步在多个代理之间分配流。

在下图示例中，三个客户端更新了三个独立的租约（L1、L2 和 L3）。gRPC 代理将三个客户端租约流（c-stream）合并为连接到 etcd 服务器的单个租约（s-stream），以保持活动流。代理将客户端租约的心跳从 c-stream 转发到 s-stream，然后将响应返回到相应的 c-stream。


<Image alt="202125-92357.png" src="https://s0.lgstatic.com/i/image6/M00/02/3C/Cgp9HWAdDwCAZYOCAAC-ZGY7vng236.png"/> 


除此之外，gRPC 代理在满足一致性时会缓存请求的响应。该功能可以保护 etcd 服务器免遭恶意 for 循环中滥用客户端的攻击。

### 命名空间的实现

上面我们讲到 gRPC proxy 的端点可以通过配置前缀，自动发现。而当应用程序期望对整个键空间有完全控制，etcd 集群与其他应用程序共享的情况下，为了使所有应用程序都不会相互干扰地运行，代理可以对**etcd 键空间进行分区**，以便客户端大概率访问完整的键空间。

当给代理提供标志`--namespace`时，所有进入代理的客户端请求都将转换为**在键上具有用户定义的前缀**。普通的请求对 etcd 集群的访问将会在我们指定的前缀（即指定的 --namespace 的值）下，而来自代理的响应将删除该前缀；而这个操作对于客户端来说是透明的，根本察觉不到前缀。

下面我们给 gRPC proxy 命名，只需要启动时指定`--namespace`标识：

```java
$ ./etcd grpc-proxy start --endpoints=localhost:12379 \
>   --listen-addr=127.0.0.1:23790 \
>   --namespace=my-prefix/
{"level":"info","ts":"2020-12-13T01:53:16.875+0800","caller":"etcdmain/grpc_proxy.go:320","msg":"listening for gRPC proxy client requests","address":"127.0.0.1:23790"}
{"level":"info","ts":"2020-12-13T01:53:16.876+0800","caller":"etcdmain/grpc_proxy.go:218","msg":"started gRPC proxy","address":"127.0.0.1:23790"}
```

此时对代理的访问会在 etcd 群集上自动地加上前缀，对于客户端来说没有感知。我们通过 etcdctl 客户端进行尝试：

```java
$ ETCDCTL_API=3 etcdctl --endpoints=localhost:23790 put my-key abc
# OK
$ ETCDCTL_API=3 etcdctl --endpoints=localhost:23790 get my-key
# my-key
# abc
$ ETCDCTL_API=3 etcdctl --endpoints=localhost:2379 get my-prefix/my-key
# my-prefix/my-key
# abc
```

上述三条命令，首先通过代理写入键值对，然后读取。为了验证结果，第三条命令通过 etcd 集群直接读取，不过需要加上代理的前缀，两种方式得到的结果完全一致。因此，**使用 proxy 的命名空间即可实现 etcd 键空间分区**，对于客户端来说非常便利。

### 其他扩展功能

gRPC 代理的功能非常强大，除了上述提到的客户端端点同步、可伸缩 API、命名空间功能，还提供了指标与健康检查接口和 TLS 加密中止的扩展功能。

#### 指标与健康检查接口

gRPC 代理为`--endpoints`定义的 etcd 成员公开了`/health`和 Prometheus 的`/metrics`接口。我们通过浏览器访问这两个接口：


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image/M00/94/3D/Ciqc1GAXy8qAAw3iAAaZ1XYdHxw861.png"/> 
  
访问 metrics 接口的结果


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image/M00/94/48/CgqCHmAXy8-AZ0q5AACKTo_Vhhg176.png"/> 
  
访问 health 接口的结果

通过代理访问`/metrics`端点的结果如上图所示 ，其实和普通的 etcd 集群实例没有什么区别，同样也会结合一些中间件进行统计和页面展示，如 Prometheus 和 Grafana 的组合。

除了使用默认的端点访问这两个接口，另一种方法是定义一个附加 URL，该 URL 将通过 --metrics-addr 标志来响应`/metrics`和`/health`端点。命令如下所示 ：

```java
$ ./etcd grpc-proxy start \
  --endpoints http://localhost:12379 \
  --metrics-addr http://0.0.0.0:6633 \
  --listen-addr 127.0.0.1:23790 \
```

在执行如上启动命令时，会有如下的命令行输出，提示我们指定的 metrics 监听地址为 http://0.0.0.0:6633。

```powershell
{"level":"info","ts":"2021-01-30T18:03:45.231+0800","caller":"etcdmain/grpc_proxy.go:456","msg":"gRPC proxy listening for metrics","address":"http://0.0.0.0:6633"}
```

#### TLS 加密的代理

通过使用 gRPC 代理 etcd 集群的 TLS，可以给没有使用 HTTPS 加密方式的本地客户端提供服务，实现 etcd 集群的 TLS 加密中止，即未加密的客户端与 gRPC 代理通过 HTTP 方式通信，gRPC 代理与 etcd 集群通过 TLS 加密通信。下面我们进行实践：

```java
$ etcd --listen-client-urls https://localhost:12379 --advertise-client-urls https://localhost:2379 --cert-file=peer.crt --key-file=peer.key --trusted-ca-file=ca.crt --client-cert-auth
```

上述命令使用 HTTPS 启动了单个成员的 etcd 集群，然后确认 etcd 集群以 HTTPS 的方式提供服务：

```java
# fails
$ ETCDCTL_API=3 etcdctl --endpoints=http://localhost:2379 endpoint status
# works
$ ETCDCTL_API=3 etcdctl --endpoints=https://localhost:2379 --cert=client.crt --key=client.key --cacert=ca.crt endpoint status
```

显然第一种方式不能访问。

接下来通过使用客户端证书连接到 etcd 端点`https://localhost:2379`，并在 localhost:12379 上启动 gRPC 代理，命令如下：

```java
$ etcd grpc-proxy start --endpoints=https://localhost:2379 --listen-addr localhost:12379 --cert client.crt --key client.key --cacert=ca.crt --insecure-skip-tls-verify
```

启动后，我们通过 gRPC 代理写入一个键值对测试：

```java
$ ETCDCTL_API=3 etcdctl --endpoints=http://localhost:12379 put abc def
# OK
```

可以看到，使用 HTTP 的方式设置成功。

回顾上述操作，我们通过 etcd 的 gRPC 代理实现了代理与实际的 etcd 集群之间的 TLS 加密，而本地的客户端通过 HTTP 的方式与 gRPC 代理通信。因此这是一个简便的调试和开发手段，你在生产环境需要谨慎使用，以防安全风险。

### 小结

这一讲我们主要介绍了 etcd 中的 gRPC proxy。本讲主要内容如下：


<Image alt="202125-92359.png" src="https://s0.lgstatic.com/i/image6/M00/02/39/CioPOWAdDxKAFk1BAAIimkNUiSk285.png"/> 


gRPC 代理用于支持多个 etcd 服务器端点，当代理启动时，它会随机选择一个 etcd 服务器端点来使用，该端点处理所有请求，直到代理检测到端点故障为止。如果 gRPC 代理检测到端点故障，它将切换到其他可用的端点，对客户端继续提供服务，并且隐藏了存在问题的 etcd 服务端点。

关于 gRPC 代理，你有什么经验和踩坑的经历，欢迎在留言区和我分享你的经验。

集群的部署并不是一劳永逸的事情，在我们日常的工作中经常会遇到集群的调整。下一讲，我们将会介绍如何动态配置 etcd 集群。我们下一讲再见。

