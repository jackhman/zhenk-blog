# 第11讲：BootService核心实现解析，Agent的“地基”原来是这样的

在 08 课时"SkyWalking Agent 启动流程剖析"中我详细介绍了 ServiceManager 加载并初始化 BootService 实现的核心逻辑。下图展示了 BootService 接口的所有实现类，本课时将深入分析这些 BootService 实现类的具体逻辑：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/85/D6/Cgq2xl6OzXqACRPAAAEm5IQEH5Y241.png"/> 


### 网络连接管理

在前面的介绍中提到 SkyWalking Agent 会定期将收集到的 JVM 监控和 Trace 数据定期发送到后端的 OAP 集群，GRPCChannelManager 负责维护 Agent 与后端 OAP 集群通信时使用的网络连接。这里首先说一下 gRPC 里面的两个组件：

* \*\*ManagedChanne l：它是 gRPC 客户端的核心类之一，它逻辑上表示一个 Channel，底层持有一个 TCP 链接，并负责维护此连接的活性。也就是说，在 RPC 调用的任何时机，如果检测到底层连接处于关闭状态（terminated），将会尝试重建连接。通常情况下，我们不需要在 RPC 调用结束后就关闭 Channel ，该 Channel 可以被一直重用，直到整个客户端程序关闭。当然，我们可以在客户端内以连接池的方式使用多个 ManagedChannel ，在每次 RPC 请求时选择使用轮训或是随机等算法选择一个可用的 Channel，这样可以提高客户端整体的并发能力。
* \*\*ManagedChannelBuilder：\*\*它负责创建客户端 Channel，ManagedChannelBuilder 使用了 provider 机制，具体是创建了哪种 Channel 由 provider 决定，常用的 ManagedChannelBuilder 有三种：NettyChannelBuilder、OkHttpChannelBuilder、InProcessChannelBuilder，如下图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/0C/C0/Ciqah16OzXqAYIu0AABBDZDMT8c843.png"/> 


在 SkyWalking Agent 中用的是 NettyChannelBuilder，其创建的 Channel 底层是基于 Netty 实现的。OkHttpChannelBuilder 创建的 Channel 底层是基于 OkHttp 库实现的。InProcessChannelBuilder 用于创建进程内通信使用的 Channel。

SkyWalking 在 ManagedChannel 的基础上封装了自己的 Channel 实现 ------ GRPCChannel ，可以添加一些装饰器，目前就只有一个验证权限的修饰器，实现比较简单，这里就不展开分析了。

介绍完基础知识之后，回到 GRPCChannelManager，其中维护了一个 GRPCChannel 连接以及注册在其上的 Listener 监听，另外还会维护一个后台线程定期检测该 GRPCChannel 的连接状态，如果发现连接断开，则会进行重连。GRPCChannelManager 的核心字段如下：

```java
// 封装了上面介绍的gRPC Channel
private volatile GRPCChannel managedChannel = null; 
// 定时检查 GRPCChannel的连接状态重连gRPC Server的定时任务
private volatile ScheduledFuture<?> connectCheckFuture; 
// 是否重连。当 GRPCChannel断开时会标记 reconnect为 true，后台线程会根据该标
// 识决定是否进行重连
private volatile boolean reconnect = true; 
// 加在 Channel上的监听器，主要是监听 Channel的状态变化
private List<GRPCChannelListener> listeners;
 // 可选的 gRPC Server集合，即后端OAP集群中各个OAP实例的地址
private volatile List<String> grpcServers;
```

前文介绍 ServiceManager 时提到，Agent 启动过程中会依次调用 BootService 实现的 prepare() 方法 → boot() 方法 → onComplete() 方法之后，才能真正对外提供服务。GRPCChannelManager 的 prepare() 方法 、onComplete() 方法都是空实现，在 boot() 方法中首先会解析 agent.config 配置文件指定的后端 OAP 实例地址初始化 grpcServers 字段，然后会初始化这个定时任务，初次会立即执行，之后每隔 30s 执行一次，具体执行的就是 GRPCChannelManager.run() 方法，其核心逻辑是检测链接状态并适时重连：

```java
public void run() {
    if (reconnect && grpcServers.size() > 0) {
        // 根据配置，连接指定OAP实例的IP和端口
        managedChannel = GRPCChannel.newBuilder(ipAndPort[0], 
                Integer.parseInt(ipAndPort[1]))
            .addManagedChannelBuilder(new StandardChannelBuilder())
            .addManagedChannelBuilder(new TLSChannelBuilder())
            .addChannelDecorator(new AuthenticationDecorator())
            .build();
        // notify()方法会循环调用所有注册在当前连接上的GRPCChannelListener实
        // 例(记录在listeners集合中)的statusChanged()方法，通知它们连接创建
        // 成功的事件
        notify(GRPCChannelStatus.CONNECTED);
        // 设置 reconnect字段为false，暂时不会再重建连接了
        reconnect = false;
    }
}
```

GRPCChannelListener 是一个监听器接口，有多个需要发送网络请求的 BootService 实现类同时实现了该接口，如下图所示，后面会详细介绍这些 BootService 实现类的具体功能。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/85/D6/Cgq2xl6OzXqAXhA7AACNDBlVUrQ730.png"/> 


最后，GRPCChannelManager 对外提供了 reportError() 方法，在其他依赖该网络连接的 BootService 实现发送请求失败时，可以通过该方法将 reconnect 字段设置为 true，并由后台线程重新创建 GRPCChannel。

### 注册协议及实现

介绍完 Agent 与后端 OAP 集群基本的连接方式之后，还需要了解 Agent 和 Server 交互的流程和协议。在 Agent 与后端 OAP 创建连接成功后的第一件事是进行注册流程。

首先来介绍注册协议涉及的 proto 的定义------ Register.proto 文件，其位置如下：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/0C/C0/Ciqah16OzXuAO6enAAJXETLoQmo373.png"/> 


Register.proto 中定义了 Register 服务，这里先关注 doServiceRegister() 和 doServiceInstanceRegister() 两个 RPC 接口，如下所示：

```java
service Register {
    rpc doServiceRegister(Services)returns(ServiceRegisterMapping) {}

    rpc doServiceInstanceRegister (ServiceInstances) returns
        (ServiceInstanceRegisterMapping) {}

    # 还有三个方法，这里省略一下，后面会介绍
}
```

* **doServiceRegister() 接口**：将服务（Service）的名称注册到后端的 OAP 集群。参数 Services 中会携带当前服务的名称（其中还可以附加一些 KV 格式的信息）；返回的 ServiceRegisterMapping 其实是多个 KV，其中就包含了后端 OAP 服务端生成的ServiceId。
* **doServiceInstanceRegister() 接口**：将服务实例（ServiceInstance）的名称注册到后端 OAP 集群。参数 ServiceInstances 中会携带服务实例（ServiceInstance）的名称，以及 serviceId、时间戳等信息；返回的 ServiceInstanceRegisterMapping 本质也是一堆 KV，其中包含 OAP 为服务实例生成的 ServiceInstanceId。

> Service、ServiceInstance 的概念可以回顾本课程的第一课时"Skywalking 初体验"。

与 Service 注册流程相关的 BootService 实现是 ServiceAndEndpointRegisterClient。ServiceAndEndpointRegisterClient 实现了 GRPCChannelListener 接口，在其 prepare() 方法中首先会将其注册到 GRPCChannelManager 来监听网络连接，然后生成当前 ServiceInstance 的唯一标识：

```java
public void prepare() throws Throwable {
    // 查找 GRPCChannelManager实例(前面介的ServiceManager.bootedServices
    // 集合会按照类型维护BootService实例，查找也是查找该集合)，然后将 
    // ServiceAndEndpointRegisterClient注册成Listener
    ServiceManager.INSTANCE.findService(GRPCChannelManager.class)
        .addChannelListener(this); 
    // 确定INSTANCE_UUID，优先使用gent.config文件中配置的INSTANCE_UUID，
    // 若未配置则随机生成
    INSTANCE_UUID = StringUtil.isEmpty(Config.Agent.INSTANCE_UUID) ? 
         UUID.randomUUID().toString().replaceAll("-", "") : 
         Config.Agent.INSTANCE_UUID;
}
```

在网络连接建立之后，会通知其 statusChanged() 方法更新 registerBlockingStub 字段：

```java
public void statusChanged(GRPCChannelStatus status) {
    if (GRPCChannelStatus.CONNECTED.equals(status)) { 
        // 网络连接创建成功时，会依赖该连接创建两个stub客户端
        Channel channel = ServiceManager.INSTANCE.findService(
                GRPCChannelManager.class).getChannel();
        registerBlockingStub = RegisterGrpc.newBlockingStub(channel);
        serviceInstancePingStub = ServiceInstancePingGrpc
             .newBlockingStub(channel);
    } else { // 网络连接断开时，更新两个stub字段（它们都是volatile修饰）
        registerBlockingStub = null;
        serviceInstancePingStub = null;
    }
    this.status = status; // 更新status字段，记录网络状态
}
```

registerBlockingStub 是 gRPC 框架生成的一个客户端辅助类，可以帮助我们轻松的完成请求的序列化、数据发送以及响应的反序列化。gRPC 的基础使用这里不再展开。

ServiceAndEndpointRegisterClient 也同时实现了 Runnable 接口，在 boot() 方法中会启动一个定时任务，默认每 3s 执行一次其 run() 方法，该定时任务首先会通过 doServiceRegister() 接口完成 Service 注册，相关实现片段如下：

```java
while (GRPCChannelStatus.CONNECTED.equals(status) && shouldTry) {
    shouldTry = false;
    // 检测当前Agent是否已完成了Service注册
    if (RemoteDownstreamConfig.Agent.SERVICE_ID == 
            DictionaryUtil.nullValue()) {
        if (registerBlockingStub != null) { // 第二次检查网络状态
            // 通过doServiceRegister()接口进行Service注册
            ServiceRegisterMapping serviceRegisterMapping = 
              registerBlockingStub.doServiceRegister(
                Services.newBuilder().addServices(Service.newBuilder()
                 .setServiceName(Config.Agent.SERVICE_NAME)).build());
            for (KeyIntValuePair registered : 
               serviceRegisterMapping.getServicesList()) {// 遍历所有KV
                if (Config.Agent.SERVICE_NAME
                          .equals(registered.getKey())) { 
                    RemoteDownstreamConfig.Agent.SERVICE_ID = 
                           registered.getValue(); // 记录serviceId
                    // 设置shouldTry，紧跟着会执行服务实例注册
                    shouldTry = true; 
                }
            }
        }
    } else { // 后续会执行服务实例注册以及心跳操作
        ... ... 
    }
}
```

通过分析这段代码，我们可以知道：

* 如果在 agent.config 配置文件中直接配置了 serviceId 是无需进行服务注册的。
* ServiceAndEndpointRegisterClient 会根据监听 GRPCChannel 的连接状态，决定是否发送服务注册请求、服务实例注册请求以及心跳请求。

完成服务（Service）注册之后，ServiceAndEndpointRegisterClient 定时任务会立即进行服务实例（ServiceInstance）注册，具体逻辑如下，逻辑与服务注册非常类似：

```java
while (GRPCChannelStatus.CONNECTED.equals(status) && shouldTry) {
    if (RemoteDownstreamConfig.Agent.SERVICE_ID == 
            DictionaryUtil.nullValue()) {
        ... // 省略服务注册逻辑
    } else {
        if (RemoteDownstreamConfig.Agent.SERVICE_INSTANCE_ID == 
                   DictionaryUtil.nullValue()) {
            // 调用 doServiceInstanceRegister()接口，用serviceId和
            // INSTANCE_UUID换取SERVICE_INSTANCE_ID
            ServiceInstanceRegisterMapping instanceMapping =
                  registerBlockingStub.doServiceInstanceRegister(
                 ServiceInstances.newBuilder()
                .addInstances(ServiceInstance.newBuilder()
                .setServiceId(RemoteDownstreamConfig.Agent.SERVICE_ID)
                // 除了serviceId，还会传递uuid、时间戳以及系统信息之类的
                .setInstanceUUID(INSTANCE_UUID)
                .setTime(System.currentTimeMillis())
                .addAllProperties(OSUtil.buildOSInfo())).build());
            for (KeyIntValuePair serviceInstance : 
                    instanceMapping.getServiceInstancesList()) {
                if (INSTANCE_UUID.equals(serviceInstance.getKey())) {
                    // 记录serviceIntanceId
                    RemoteDownstreamConfig.Agent.SERVICE_INSTANCE_ID =
                        serviceInstance.getValue();
                }
            }
        }else{
            ... // 省略心跳的相关逻辑
        }
    }
}
```

### 心跳协议及实现

在完成服务注册以及服务实例操作之后，ServiceAndEndpointRegisterClient 会开始定期发送心跳请求，通知后端 OAP 服务当前 Agent 在线。心跳涉及一个新的 gRPC 接口如下（定义在 InstancePing.proto 文件中）：

```java
service ServiceInstancePing {
    rpc doPing (ServiceInstancePingPkg) returns (Commands) {}
}
```

ServiceAndEndpointRegisterClient 中心跳请求相关的代码片段如下，心跳请求会携带serviceInstanceId、时间戳、INSTANCE_UUID 三个信息：

```java
while (GRPCChannelStatus.CONNECTED.equals(status) && shouldTry) {
    if (Agent.SERVICE_ID == DictionaryUtil.nullValue()) {
        ... // 省略服务注册逻辑
    } else {
        if (Agent.SERVICE_INSTANCE_ID == DictionaryUtil.nullValue()) {
            ... // 省略服务实例注册逻辑
        }else{ // 并没有对心跳请求的响应做处理
            serviceInstancePingStub.doPing(ServiceInstancePingPkg
               .newBuilder().setServiceInstanceId(SERVICE_INSTANCE_ID)
               .setTime(System.currentTimeMillis())
               .setServiceInstanceUUID(INSTANCE_UUID).build());
        }
    }
}
```

### Endpoint、NetWorkAddress 同步

在前文介绍 SkyWalking 基本使用时看到，Trace 数据中包含了请求的 URL 地址、RPC 接口名称、HTTP 服务或 RPC 服务的地址、数据库的 IP 以及端口等信息，这些信息在整个服务上线稳定之后，不会经常发生变动。而在海量 Trace 中包含这些重复的字符串，会非常浪费网络带宽以及存储资源，常见的解决方案是将字符串映射成数字编号并维护一张映射表，在传输、存储时使用映射后的数字编号，在展示时根据映射表查询真正的字符串进行展示即可。这类似于编码、解码的思想。SkyWalking 也是如此处理 Trace 中重复字符串的。

SkyWalking 中有两个 DictionaryManager：

* **EndpointNameDictionary**：用于同步 Endpoint 字符串的映射关系。
* **NetworkAddressDictionary**：用于同步网络地址的映射关系。

EndpointNameDictionary 中维护了两个集合：

* **endpointDictionary**：记录已知的 Endpoint 名称映射的数字编号。
* **unRegisterEndpoints**：记录了未知的 Endpoint 名称。

EndpointNameDictionary 对外提供了两类操作，一个是查询操作（核心实现在 find0() 方法），在查询时首先去 endpointDictionary 集合查找指定 Endpoint 名称是否已存在相应的数字编号，若存在则正常返回数字编号，若不存在则记录到 unRegisterEndpoints 集合中。为了防止占用过多内存导致频繁 GC，endpointDictionary 和 unRegisterEndpoints 集合大小是有上限的（默认两者之和为 10\^7）。

另一个操作是同步操作（核心实现在 syncRemoteDictionary() 方法），在 ServiceAndEndpointRegisterClient 收到心跳响应之后，会将 unRegisterEndpoints 集合中未知的 Endpoint 名称发送到 OAP 集群，然后由 OAP 集群统一分配相应的数字编码，具体实现如下：

```java
public void syncRemoteDictionary(RegisterGrpc.RegisterBlockingStub 
          serviceNameDiscoveryServiceBlockingStub) {
    // 创建请求，每个Endpoint中都封装了 Endpoint名称以及关联的serviceId
    Endpoints.Builder builder = Endpoints.newBuilder();
    for (OperationNameKey operationNameKey : unRegisterEndpoints) {
        Endpoint endpoint = Endpoint.newBuilder()
            .setServiceId(operationNameKey.getServiceId())
            .setEndpointName(operationNameKey.getEndpointName())
            .setFrom(operationNameKey.getSpanType()) 
            .build();
        builder.addEndpoints(endpoint);
    }
    // 发送同步请求
    EndpointMapping serviceNameMappingCollection = 
       serviceNameDiscoveryServiceBlockingStub
           .doEndpointRegister(builder.build());
    for (EndpointMappingElement element : 
         serviceNameMappingCollection.getElementsList()) {
        // 将返回的映射关系，记录到 endpointDictionary集合中，并从 
        // unRegisterEndpoints集合中删除Endpoint信息
        OperationNameKey key = new OperationNameKey(
            element.getServiceId(), element.getEndpointName(),
            DetectPoint.server.equals(element.getFrom()),
            DetectPoint.client.equals(element.getFrom()));
        unRegisterEndpoints.remove(key);
        endpointDictionary.put(key, element.getEndpointId());
    }
}
```

NetworkAddressDictionary 实现与 EndpointNameDictionary 类似，就留给你自己进行分析，这里不再展开。

### 收集 JVM 监控

在前面介绍 SkyWalking Rocketbot 时看到 SkyWalking 可以监控服务实例的 CPU、堆内存使用情况以及 GC 信息，这些信息都是通过 JVMService 收集的。JVMService 也实现了 BootService 接口。JVMService 的结构大致如下图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/85/D6/Cgq2xl6OzXuAWM3MAAHZFmJeMwM515.png"/> 


在 JVMService 中会启动一个独立 collectMetric 线程请求 MXBean 来收集 JVM 的监控数据，然后将监控数据保存到 queue 队列（LinkedBlockingQueue 类型）中缓存，之后会启动另一个线程读取 queue 队列并将监控数据通过 gRPC 请求发送到后端的 OAP 集群。

在 JVMService.boot() 方法的实现中会初始化 queue 缓冲队列以及 Sender 对象，如下：

```java
public void prepare() throws Throwable {
    queue = new LinkedBlockingQueue(Config.Jvm.BUFFER_SIZE);
    sender = new Sender();
    ServiceManager.INSTANCE.findService(GRPCChannelManager.class)
         .addChannelListener(sender); // sender会监听底层的连接状态
}
```

在 Sender.run() 方法中封装了读取 queue 队列以及发送 gRPC 请求的逻辑，其中会根据底层的 GRPCChannel 连接状态、当前服务以及服务实例的注册情况决定该任务是否执行。Sender.run() 方法的核心逻辑如下（省略全部边界检查逻辑）：

```java
JVMMetricCollection.Builder builder = 
           JVMMetricCollection.newBuilder();
LinkedList<JVMMetric> buffer = new LinkedList<JVMMetric>();
// 将 queue队列中缓存的全部监控数据填充到 buffer中
queue.drainTo(buffer);
// 创建 gRPC请求参数
builder.addAllMetrics(buffer);
builder.setServiceInstanceId(Agent.SERVICE_INSTANCE_ID); // 
// 通过 gRPC调用将JVM监控数据发送到后端 OAP集群
stub.collect(builder.build());
```

简单看一下该 gRPC 接口以及参数的定义，非常简单：

```java
service JVMMetricReportService {
    rpc collect (JVMMetricCollection) returns (Commands) {}
}
```

在 JVMMetricCollection 中封装了 ServiceInstanceId 以及 JVMMetric 集合，JVMMetric 封装了一个时刻抓取到的 CPU、堆内存使用情况以及 GC 等信息，这里不再展开。

了解了发送过程之后，我们再来看收集 JVM 监控的原理。在 collectMetric 线程中会定期执行 JVMService.run() 方法，其中通过 MXBean 抓取 JVM 监控信息，然后填充到 JVMMetric 对象中并记录到 queue 缓冲队列中，大致实现如下：

```java
// 通过JMX获取CPU、Memory、GC的信息，然后组装成JVMMetric
JVMMetric.Builder jvmBuilder = JVMMetric.newBuilder();
jvmBuilder.setTime(currentTimeMillis);
// 通过 MXBean获取 CPU、内存以及GC相关的信息，并填充到 JVMMetric
jvmBuilder.setCpu(CPUProvider.INSTANCE.getCpuMetric());
jvmBuilder.addAllMemory(
     MemoryProvider.INSTANCE.getMemoryMetricList());
jvmBuilder.addAllMemoryPool(
     MemoryPoolProvider.INSTANCE.getMemoryPoolMetricsList());
jvmBuilder.addAllGc(GCProvider.INSTANCE.getGCList());
JVMMetric jvmMetric = jvmBuilder.build();
// 将JVMMetric写入到queue缓冲队列中
if (!queue.offer(jvmMetric)) { // queue缓冲队列的长度默认为600
    queue.poll(); // 如果queue队列被填满，则抛弃最老的监控信息，保留最新的
    queue.offer(jvmMetric);
}
```

这里深入介绍一下 JDK 提供的 MXBean 是如何使用的。我们以 GCProvider 为例进行分析（获取其他监控指标的方式也是类似的）。GCProvider 通过枚举方式实现了单例，在其构造方法中，会先获取 MXBean 并封装成相应的 GCMetricAccessor 实现，大致实现如下：

```java
// 获取GC相关的MXBean
beans = ManagementFactory.getGarbageCollectorMXBeans();
for (GarbageCollectorMXBean bean : beans) {
    String name = bean.getName();
    // 解析MXBean的名称即可得知当前使用的是哪种垃圾收集器，我们就可以创建相应
    // 的GCMetricAccessor实现
    GCMetricAccessor accessor = findByBeanName(name);
    if (accessor != null) {
        metricAccessor = accessor;
        break;
    }
}
```

GCMetricAccessor 接口的实现类如下图所示，针对每一种垃圾收集器都有相应的实现：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/0C/C0/Ciqah16OzXuAH1obAACj_oQjWi4810.png"/> 


GCMetricAccessor 接口中提供了一个 getGCList() 方法用于读取 MXBean 获取 GC 的信息，在抽象类 GCModule 中实现了 getGCList() 方法的核心逻辑：

```java
public List<GC> getGCList() {
    List<GC> gcList = new LinkedList<GC>();
    for (GarbageCollectorMXBean bean : beans) {
        String name = bean.getName();
        GCPhrase phrase;
        long gcCount = 0;
        long gcTime = 0;
        // 下面根据 MXBean的名称判断具体的GC信息
        if (name.equals(getNewGCName())) { // Young GC的信息
            phrase = GCPhrase.NEW;
            // 计算GC次数，从MXBean直接拿到的是GC总次数
            long collectionCount = bean.getCollectionCount();
            gcCount = collectionCount - lastYGCCount;
            lastYGCCount = collectionCount; // 更新 lastYGCCount
            // 计算GC时间，从 MXBean直接拿到的是GC总时间
            long time = bean.getCollectionTime();
            gcTime = time - lastYGCCollectionTime;
            lastYGCCollectionTime = time; // 更新lastYGCCollectionTime
        } else if (name.equals(getOldGCName())) { // Old GC的信息
            phrase = GCPhrase.OLD;
            ... ... // Old GC的计算方式与Young GC的计算方式相同，不再重复
        } 
        gcList.add( // 最后将 GC信息封装成List返回
            GC.newBuilder().setPhrase(phrase)
                .setCount(gcCount).setTime(gcTime).build()
        );
    }
    return gcList;
}
```

在不同类型的垃圾收集器中，Young GC、Old GC 的名称不太相同（例如，G1 中叫 G1 Young Generation 和 G1 Old Generation，在 CMS 中则叫 ParNew 和 ConcurrentMarkSweep），所以这里调用的 getNewGCName() 方法和 getOldGCName() 方法都是抽象方法，延迟到了 GCModule 子类中才真正实现，这是典型的模板方法模式。

### 其他

BootService 接口的剩余四个实现与 Trace 数据的收集和发送相关，在后面的课时中会详细展开分析，这里简单说一下它们的核心功能。

* ContextManager：负责管理一个 SkyWalking Agent 中所有的 Context 对象。
* ContextManagerExtendService：负责创建 Context 对象。
* TraceSegmentServiceClient：负责将 Trace 数据序列化并发送到 OAP 集群。
* SamplingService：负责实现 Trace 的采样。

### 总结

本课时深入介绍了 BootService 的三个核心实现。 GRPCChannelManager 负责管理 Agent 到 OAP 集群的网络连接，并实时的通知注册的 Listener。ServiceAndEndpointRegisterClient 的核心功能有三项。

1. 注册功能：其中包括服务注册和服务实例注册两次请求。
2. 定期发送心跳请求：与后端 OAP 集群维持定期探活，让后端 OAP 集群知道该 Agent 正常在线。
3. 定期同步 Endpoint 名称以及网络地址：维护当前 Agent 中字符串与数字编号的映射关系，减少后续 Trace 数据传输的网络压力，提高请求的有效负载。

JVMService 负责定期请求 MXBean 获取 JVM 监控信息并发送到后端的 OAP 集群。

