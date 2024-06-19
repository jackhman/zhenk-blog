# 第22讲：深入剖析regiter-receiver-plugin插件（上）

在上一课时中，重点介绍了 SkyWalking 存储层的框架设计以及核心接口。从本节课开始，我们将深入 SkyWalking OAP 的 receiver 模块，分析其中的各类插件是如何接收 SkyWalking Agent 上报请求、处理数据以及持久化数据的。

本课时介绍的是 register-receiver-plugin 模块，它负责接收 SkyWalking Agent 发送的各类注册请求以及同步请求，处理的数据都是 RegisterSource 抽象类的子类，如下图所示。


<Image alt="image001.png" src="https://s0.lgstatic.com/i/image/M00/13/BD/Ciqc1F7PkEKAKK6lAAF6WcTGXXU722.png"/> 


在上一课时中，已经对 RegisterSource 抽象类以及其中各个字段的含义进行了详细介绍，下面来看它的四个实现类：

* **ServiceInventory** 抽象了服务注册的数据。
* **ServiceInstanceInventory** 抽象了服务实例注册的数据。
* **EndpointInventory** 抽象了 EndpointName 同步的数据。
* **NetworkAddressInventory** 抽象了 NetworkAddress 同步的数据。

### 服务注册流程

在 register-receiver-plugin 模块的 SPI 文件中指定的 ModuleDefine 实现类是 RegisterModule，其中 services() 方法返回空数组，即不提供任何 Service 实现；指定的 ModuleProvider 实现类是 RegisterModuleProvider，其 requiredModules() 方法指定该模块依赖于 CoreModule 以及 SharingServerModule。想想也合情合理，在 CoreModule 中初始化了最基础 GRPCServer 以及前面介绍的存储层相关功能，SharingServerModule 中初始化了 receiver 模块专用的 GRPCServer ，有了这两个模块才能正常处理请求。

在介绍 SkyWalking Agent 的核心 BootService 实现时看到，Agent 启动后与 OAP 集群的第一次交互就是进行服务注册，我们就以 SkyWalking OAP 对服务注册请求的处理为入口，展开分析。

在 RegisterServerModule 启动时会注册多个 GRPCHandler 和 JettyHandler，这里我们重点关注其中两个：

* **RegisterServiceHandler**：用于接收服务注册请求、服务实例注册请求以及同步请求。
* **ServiceInstancePingServiceHandler**：用于接收心跳请求。

其他 Handler 主要用于处理低版本协议，这里不再展开介绍。

RegisterServiceHandler 继承了 gRPC 为 Register 接口提供 Server 端辅助类 RegisterGrpc.RegisterImplBase（Register 的 proto 定义可以回顾前面的第 11 课时），并提供了具体实现逻辑，如下图所示：


<Image alt="image003.png" src="https://s0.lgstatic.com/i/image/M00/13/C8/CgqCHl7PkEyAGPg5AAPkW2R-quM844.png"/> 


其中 doServiceRegister() 方法负责处理服务注册请求，具体实现就是从服务注册请求（即 Register.proto 文件中定义的 messsage Services）中拿出 ServiceName，然后交给 IServiceInventoryRegister 生成对应的 ServiceId，然后返回给 Agent。核心流程如下图所示：


<Image alt="image005.png" src="https://s0.lgstatic.com/i/image/M00/13/C8/CgqCHl7PkFOAIDDLAAE21B-7DJQ258.png"/> 


IServiceInventoryRegister 接口以及实现位于 servier-core 模块中，如下图所示：


<Image alt="image007.png" src="https://s0.lgstatic.com/i/image/M00/13/C8/CgqCHl7PkFqAdvyxAAHxgz_olVE671.png"/> 


这里对于不同的 RegisterSource 实现提供了不同的 Register 接口以及实现类，如下图所示。


<Image alt="image009.png" src="https://s0.lgstatic.com/i/image/M00/13/BD/Ciqc1F7PkGOAFvRXAAFUkChUCBE068.png"/> 


在 ServiceInventoryRegister 这个实现类的 getOrCreate() 方法中，首先会通过 ServiceInventoryCache 确定 ServiceName 是否应有了对应的 ServiceId，如果有，则直接返回。

ServiceInventoryCache 中维护了多个 Guava Cache，其中一个 Guava Cache（serviceNameCache 字段）维护了 ServiceName 到 ServiceId 的映射。在 getServiceId() 方法，如果查找缓存失败，则会委托为相应的 Cache DAO（ServiceInventoryCacheEsDAO）去查询 ElasticSearch 存储，核心实现如下：

```java
public int getServiceId(String serviceName) {
    // 查找serviceNameCache缓存
    Integer serviceId = serviceNameCache.getIfPresent(
          ServiceInventory.buildId(serviceName));
    // 缓存查找失败，则通过ServiceInventoryCacheEsDAO查找底层ES存储
    if (Objects.isNull(serviceId) || serviceId == Const.NONE) {
        serviceId = getCacheDAO().getServiceId(serviceName);
        if (serviceId != Const.NONE) { // 查询成功，写入缓存
          serviceNameCache.put(ServiceInventory.buildId(serviceName), 
              serviceId);
        }
    }
    return serviceId;
}
```

注意，这个 Cache 中的 Key，并不是直接使用 ServiceName，而是添加了一些后缀：

```java
serviceName + "_" + 0 + "_" + 0;
```

在后续的 NetworkAddress 同步也使用到 ServiceInventoryRegister，会看到 NetworkAddress 的 Key 会添加前缀。

接下来看 ServiceInventoryCacheEsDAO 查询 ElasticSearch 的逻辑，核心在 get() 方法之中，这里的参数 id 就是前面缓存的 Key，也是 Document Id：

```java
private int get(String id) { // 
     // 通过ElasticSearchClient查询根据指定的Document Id进行查询sequence
    GetResponse response = getClient().get("service_inventory", id);
    if (response.isExists()) {
        return (int)response.getSource()
          .getOrDefault(RegisterSource.SEQUENCE, 0); // 返回sequence字段
    } else {
        return Const.NONE;
    }
}
```

对于未分配 ServiceId 的服务，ServiceInventoryRegister 会将其封装成 ServiceInventory 对象，然后交给 InventoryStreamProcessor 处理，InventoryStreamProcessor 会为该服务分配 ServiceID 并将该映射关系记录到底层存储中，后续查询即可从 ServiceInventoryCache 得到该关系。
> 注意，InventoryStreamProcessor 处理流程是异步的，服务注册请求不会等待 InventoryStreamProcessor 处理结束，而是直接返回 ServiceId 为 0 的响应。  
>
> SkyWalking Agent 在收到该响应时会进行重试，重新发起新的服务注册请求，直至从 ServiceInventoryCache 中查询到为其分配的 ServiceId。

### ServiceInventory

ServiceInventory 是 RegisterSource 抽象类的实现之一，表示的是服务注册数据。在 ModelInstaller 创建 ES 索引时，会根据 ServiceInventory 中的 @Column 注解字段创建 service_inventory 索引，所以我们可以看到两者的字段是一一对应的，如下图所示：


<Image alt="image011.png" src="https://s0.lgstatic.com/i/image/M00/13/C8/CgqCHl7PkHKAch62ABCOeHi1PmI006.png"/> 


另外，ServiceInventory 还标注了 @Stream 注解，在前文中提到，OAP 会在初始化时扫描 @Stream 注解，并根据其中的信息初始化对应的 Model 对象。

在 CoreModuleProvider 中维护了一个 AnnotationScan 对象，它是 OAP 中专门用来扫描注解的工具类。AnnotationScan 中可以注册多个 Listener 监听器，每个 Listener 都关联了一个队列，在扫描过程中，发现一个类被 Listener 关注的注解标记了，就会记录到相应队列中，最后，由每个 Listener 处理相应的队列。AnnotationScan 的核心实现在 scan() 方法，如下所示：

```java
public void scan(Runnable callBack) throws IOException {
    ClassPath classpath = ClassPath.from( // 获取ClassPath
          this.getClass().getClassLoader());
    // 获取org.apache.skywalking包下的所有类
    ImmutableSet<ClassPath.ClassInfo> classes = 
      classpath.getTopLevelClassesRecursive("org.apache.skywalking");
    // 遍历这些类，如果是被标记了Listener关注的注解，会被记录到Listener相应
    // 的Class队列中
    for (ClassPath.ClassInfo classInfo : classes) {
        Class<?> aClass = classInfo.load();
        for (AnnotationListenerCache listener : listeners) {
            if (aClass.isAnnotationPresent(listener.annotation())) {
                listener.addMatch(aClass);
            }
        }
    }
    // AnnotationListenerCache.complete()方法会调用其中封装的
    // AnnotationListener.notify()方法循环处理对应的Class集合
    listeners.forEach(AnnotationListenerCache::complete);
    ... // 省略其他代码
}
```

这种设计方式非常灵活，我们可以轻松地扩展新的注解和 AnnotationListener 实现类，无须修改已有代码。OAP 提供的 AnnotationListener 的实现类如下图所示：


<Image alt="image013.png" src="https://s0.lgstatic.com/i/image/M00/13/BD/Ciqc1F7PkHuAL-IrAADVxgjoSQM699.png"/> 


从名字就可以看出，StreamAnnotationListener 就是处理 @Stream 注解的 AnnotationListener 实现类。

@Stream 注解中有四个字段：

* **name**：对应的索引名称。这里的 ServiceInventory 指定的就是 service_inventory 索引，如果是 Metrics 等与时间相关数据，则 name 只是对应 ES 索引的前缀。
* **builder**：前面提到每个 StorageData 实现类都关联了一个 StorageBuilder 实现类（多数为 StorageData 实现的内部类），两者就是通过该字段进行关联的。StorageBuilder 负责 StorageData 对象与 Map\<String，Object\> 之间的转换。ServiceInventory 关联的就是其自身的内部类 ------ ServiceInventory.Builder。
* **processor**：含义是收到该类型的数据时会交给 processor 指定的处理器进行处理。processor 指定的处理器都是 StreamProcessor 类型的，下图展示了 StreamProcessor 接口以及全部实现类，四个不同的实现类负责处理不同类型的数据。


<Image alt="image015.png" src="https://s0.lgstatic.com/i/image/M00/13/C8/CgqCHl7PkIuAVQGmAADxp_xR4Yg365.png"/> 


* **InventoryStreamProcessor**：负责处理 RegisterSource 类型的数据。ServiceInventory 关联的就是 InventoryStreamProcessor。
* **MetricsStreamProcessor**：负责处理 Metrics 类型的数据。
* **RecordStreamProcessor**：负责处理 Record 类型的数据。
* **TopNStreamProcessor**：负责处理 TopN 类型的数据，TopN 抽象类扩展了 Record 抽象类。

StreamAnnotationListener 的核心逻辑 ------ notify() 方法，就是为各个 StorageData 关联相应的 StreamProcessor 处理器，核心代码如下：


<Image alt="image017.png" src="https://s0.lgstatic.com/i/image/M00/13/BD/Ciqc1F7PkJ-ALvUSAAFXBPgFILQ073.png"/> 


这里的 ServiceInventory 就会被分配给 InventoryStreamProcessor 处理。

### InventoryStreamProcessor

在 InventoryStreamProcessor 中的 create() 方法中，首先会根据 ServiceInventory 上 @Stream 注解信息，创建对应的 Model 对象，并注册到 StorageModels 中，相关片段如下：

```java
public void create(...) {
    ... // 检测是有已经处理过该StorageData类型
    // 查找IModelSetter实现，即StorageModels实例
    IModelSetter modelSetter = moduleDefineHolder.find(
        CoreModule.NAME).provider().getService(IModelSetter.class);
    Model model = modelSetter.putIfAbsent(inventoryClass, 
        stream.scopeId(), new Storage(stream.name(), false, false, 
            Downsampling.None));
    ...
}
```

在 StorageModels 中的 putIfAbsent() 方法中，首先会扫描 StorageData 中的 @Column 注解，明确 ES 索引中的字段名称，然后根据 @Stream 注解中的信息创建 Model 对象，并记录到 models 集合中。

```java
public Model putIfAbsent(Class aClass, int scopeId, Storage storage) {
    ... // 省略重复Model的检查
    List<ModelColumn> modelColumns = new LinkedList<>();
    // 扫描StorageData中的@Column注解，获取ES索引中的字段名
    retrieval(aClass, storage.getModelName(), modelColumns);
    Model model = new Model(...); // 新建Model对象
    models.add(model); // 添加到models集合中
    return model;
}
```

这样，在 ModelInstaller 中就可以根据 models 集合创建 ES 索引了。

前面看到，ServiceInventory 除了实现 StorageData 接口，还是实现了 StreamData 接口。在完成 Model 实例的创建之后，create() 方法要做的第二件事是为各个 StreamData 实现类关联全局唯一 ID。StreamData 实现类与其对应的唯一 ID 是由 StreamDataMapping 管理的，它实现了 StreamDataMappingGetter、StreamDataMappingSetter 两个接口，如下图所示：


<Image alt="image019.png" src="https://s0.lgstatic.com/i/image/M00/13/BD/Ciqc1F7PkK6AZmcSAAA7OnJZChM497.png"/> 


StreamDataMapping 底层维护了两个 Map，维护了 StreamData 与唯一 ID 之间的双向映射，也是基于这两个 Map 实现了 StreamDataMappingGetter 的双向查询接口。StreamData 映射的唯一 ID 将在后面介绍跨 OAP 节点交互时看到其具体作用。

create() 方法要做的第三件事就是为每个 StorageData 类型初始化 Worker 处理链。前面提到的四个 StreamProcessor 都是单例的，每个 StreamProcessor 中都维护了一个 entryWorkers 集合，其中的 Key 是具体的 StorageData 实现类型， Value 是相应 Worker 处理链的入口 Worker 实例。处理数据的逻辑一般会比较复杂，包含了多个有清晰边界、相对独立的步骤，Worker 链中的每个 Worker 对象都只负责实现一个步骤，将它们依次串联即可得到一个完整的处理流程。

InventoryStreamProcessor 中的 entryWorks 集合的 Key 为 RegisterSource 子类，Value 为 RegisterDistinctWorker 类型：


<Image alt="image021.png" src="https://s0.lgstatic.com/i/image/M00/13/C9/CgqCHl7PkLaAeB2tAAA05mZdfLA098.png"/> 


create() 方法中与创建 Worker 处理链的相关片段：

```java
public void create(...) {
    ... // 省略前面介绍的创建Model对象的逻辑
    // 创建多个Worker对象，并且连接成链式结构
    RegisterPersistentWorker persistentWorker =
        new RegisterPersistentWorker(moduleDefineHolder, 
            model.getName(), registerDAO, stream.scopeId());
    RegisterRemoteWorker remoteWorker = new 
        RegisterRemoteWorker(moduleDefineHolder, persistentWorker);
    RegisterDistinctWorker distinctWorker = new 
        RegisterDistinctWorker(moduleDefineHolder, remoteWorker);
    // 将Worker处理链中的第一个Worker作为入口，记录到entryWorkers集合
    entryWorkers.put(inventoryClass, distinctWorker);
}
```

这里涉及三个 Worker，它们都实现了 AbstractWorker 这个抽象类，如下图所示：


<Image alt="image023.png" src="https://s0.lgstatic.com/i/image/M00/13/C9/CgqCHl7PkL6ATU7LAAFFIIhucdY966.png"/> 


### AbstractWorker

在 CoreModuleProvider 中会初始化一个 WorkerInstancesService 服务，它负责为不同的 AbstractWorker 实例对象分配唯一 ID，并维护了一个 Map 记录两者关系，这一操作是在 AbstractWorker 构造方法中完成的。

回到 InventoryStreamProcessor，处理 ServiceInventory 的 Worker 链中包含了三个 Worker，具体的执行顺序如下图所示：


<Image alt="image025.png" src="https://s0.lgstatic.com/i/image/M00/13/C9/CgqCHl7PkMeAcbnnAADlzfEUJUs797.png"/> 


#### RegisterDistinctWorker

先来看 RegisterDistinctWorker ，它主要负责对 RegisterSource 进行去重，为什么会出现重复请求呢？以 ServiceInventory 为例：

1. 如果一个服务以集群形式部署，该服务集群中就会启动多个 ServiceName 相同的服务实例。这些服务实例一起通过 SkyWalking Agent 向 Skywalking OAP 集群进行服务注册时，就可能导致在短时间内收到多条服务注册请求。
2. 在 Skywalking Agent 服务注册逻辑中可以看到，当服务注册请求失败时，会进行重试，也可能导致 OAP 集群在短时间内收到多条相同的服务注册请求。

RegisterDistinctWorker 的模型如下图所示：


<Image alt="image027.png" src="https://s0.lgstatic.com/i/image/M00/13/C9/CgqCHl7PkNGAIfMBAAKLevDoMcM794.png"/> 


每个 RegisterDistinctWorker 都有一个独享的 DataCarrier（默认 channelSize 为 1，bufferSize 为 1000），但全局共享同一个名为 "REGISTER_L1" 的 BulkConsumePool。在其他类型的 Worker 中，会用到其他的全局 BulkConsumePool 对象，这些 BulkConsumePool 都会按照名称注册到 ConsumerPoolFactory 中统一管理。当有新的 Consumer 要消费 DataCarrier 的时候，会从指定的全局 BulkConsumePool 中分配的一条线程来处理（可能会出现一条线程处理多个 DataCarrier 的情况）。

下面来看 RegisterDistinctWorker 的构造方法，其中会初始化 DataCarrier、BulkConsumerPool 以及相应的 Consumer。

```java
RegisterDistinctWorker(ModuleDefineHolder moduleDefineHolder, 
        AbstractWorker<RegisterSource> nextWorker) {
    super(moduleDefineHolder); // 调用父类构造方法，分配唯一ID
    this.nextWorker = nextWorker; // 指向下一个Worker
    // 创建该RegisterDistinctWorker专属的DataCarrier缓冲队列
    this.dataCarrier = new DataCarrier<>(1, 1000);
    String name = "REGISTER_L1"; // 下面BulkConsumerPool的名称，全局唯一
    BulkConsumePool.Creator creator = 
        new BulkConsumePool.Creator(name, size, 200);
    // 只有在该name第一次注册时，才会创建BulkConsumePool对象，之后再注册直接
    // 返回false
    ConsumerPoolFactory.INSTANCE.createIfAbsent(name, creator);
    // AggregatorConsumer是消费上述DataCarrier缓冲队列的消费者，消费线程
    // 由BulkConsumerPool提供
    this.dataCarrier.consume(ConsumerPoolFactory.INSTANCE.get(name), 
      new AggregatorConsumer(this));
}
```

RegisterDistinctWorker.in() 方法直接调用 DataCarrier.produce() 方法将 ServiceInventory 对象写入 DataCarrier 缓冲队列。  

AggregatorConsumer 其实是通过 RegisterDistinctWorker.onWorker() 方法消费 DataCarrier 缓冲队列的据，其中会将相同的 ServiceInventory 对象合并成一个，然后暂存起来。这里判断 ServiceInventory 对象是否同样使用到了其重写的 equals() 方法，其中参与比较的有 name、isAddress、addressId 三个字段，正如前文介绍的那样，服务注册只使用了 name 字段记录了服务名称，在 NetworkAdress 同步时才会使用到 isAddress、addressId 两个字段。

在合并相同 ServiceInventory 对象时使用到了 combine() 方法，其中首先会调用父类 RegisterSource 的 combine() 方法更新 heartbeatTime 时间，然后更新 nodeType 以及 prop 附加信息。NetworkAddress 同步时进行的 ServiceInventory 合并中，还会更新 mappingServiceId 和 mappingLastUpdateTime，这个后面会再强调。

当从 DataCarrier 中累计消费了一定数量的数据或是当前批次的数据全部消费完了，都会将合并后的 ServiceInventory 交给下一个 Worker 继续处理。

RegisterDistinctWorker.onWorker() 方法的核心实现如下：

```java
private void onWork(RegisterSource source) {
    messageNum++; // 统计消息个数
    if (!sources.containsKey(source)) { // 第一次出现直接记入sources集合
        sources.put(source, source);
    } else { // 对重复的RegisterSource对象进行合并
        sources.get(source).combine(source);
    }
    if (messageNum >= 1000  // 消费数据量超过1000
     || source.getEndOfBatchContext().isEndOfBatch()) { // 该批次消费完成
        // 将RegisterSource传递给下一个Worker处理
        sources.values().forEach(nextWorker::in);
        sources.clear(); // 清空sources集合
        messageNum = 0; // 重置messageNum
    }
}
```

#### RegisterRemoteWorker

在 RegisterSource 对应的 Worker 链中，RegisterDistinctWorker 之后的下一个 Worker 是 RegisterRemoteWorker，其底层会通过 RemoteSenderService 与 OAP 集群中的其他节点进行通信，将 RegisterSource 数据发送到集群中的其他 OAP 节点上处理。

为什么要发到其他 OAP 节点进行处理呢？在 CoreModuleProvider 启动过程中，我们可以看到 OAP 节点的角色选择逻辑，如下所示：

```java
if (Mixed.name().equalsIgnoreCase(moduleConfig.getRole()) || 
      Aggregator.name().equalsIgnoreCase(moduleConfig.getRole())) {
    RemoteInstance gRPCServerInstance = new RemoteInstance(
        new Address(moduleConfig.getGRPCHost(), 
            moduleConfig.getGRPCPort(), true));
    // 只有Mixed、Aggregator两种角色的OAP节点才会通过Cluster模块进行注册
    this.getManager().find(ClusterModule.NAME).provider()
       .getService(ClusterRegister.class)
           .registerRemote(gRPCServerInstance);
}
```

在 application.yml 配置文件中可以配置 Mixed、Receiver、Aggregator 三种角色：

* **Receiver 节点**：负责接收 Agent 请求并进行 L1 级别的聚合处理，后续的 L2 级别的聚合操作由其他两种类型的节点处理。
* **Mixed 节点**：负责接收 Agent 请求以及其他 OAP 节点 L1 聚合结果，进行 L1 级别和 L2 级别的聚合处理。
* **Aggregator 节点和**：负责接收其他 OAP节点的 L1 聚合结果，进行 L2 级别的聚合处理。

那什么是 L1 级别的聚合呢？你可以回顾一下 RegisterDistinctWorker 中使用的全局 BulkConsumerPool 线程池，其名称为 "REGISTER_L1"，所以在 RegisterDistinctWorker 中的合并操作就是 SkyWalking 中所谓的 "L1 级别聚合"。

回到 RemoteSenderService，它提供了三种不同的发送策略：

* **HashCode 策略**：根据 Hash 值选择发送到目标 OAP 节点。MetricsRemoteWorker 默认使用该策略。
* **Rolling 策略**：轮训方式选择目标 OAP 节点。
* **ForeverFirst 策略**：始终选择第一个 OAP 节点作为目标节点。RegisterRemoteWorker 默认使用该策略。

#### 跨节点交互

SkyWalking OAP 集群中各个节点之间是通过 gRPC 交互的，具体的 proto 定义如下：

```java
service RemoteService {
    rpc call (stream RemoteMessage) returns (Empty) {
    }
}
message RemoteMessage {
    int32 nextWorkerId = 1; // Worker实例的唯一ID
    int32 streamDataId = 2; // StreamData实现类的唯一ID
    RemoteData remoteData = 3; // 真正数据
}
```

前文提到，在 CoreModuleProvider 中启动的基础 GRPCServer 实例，会添加一个 RemoteServiceHandler，来负责接收其他 OAP 发来的 RemoteMessage 请求。RemoteServiceHandler 的核心逻辑有两步：

1. 根据 streamDataId 字段，从 StreamDataMapping 中查询出对应的 StreamData 类型，并从 remoteData 中获取相应数据，反序列化得到 StreamData 对象。
2. 根据 nextWorkerid 字段，从 WorkerInstancesService 中查询出处理该 StreamData 对象的下一个 Worker，然后调用该 Worker.in() 方法继续处理 StreamData 对象。

RemoteServiceHandler 的核心逻辑如下：

```java
public void onNext(RemoteMessage message) {
    int streamDataId = message.getStreamDataId(); 
    int nextWorkerId = message.getNextWorkerId();
    RemoteData remoteData = message.getRemoteData();
    // 根据streamDataId查询对应的StreamData类型
    Class<? extends StreamData> streamDataClass = 
        streamDataMappingGetter.findClassById(streamDataId);
    // 创建StreamData实例并填充其中字段
    StreamData streamData = streamDataClass.newInstance();
    streamData.deserialize(remoteData);
    // 根据nextWorkerId查找下一个Worker来处理StreamData
    workerInstanceGetter.get(nextWorkerId).in(streamData);
}
```

在一个 OAP 节点中，会通过 RemoteClientManager 维护到其他 OAP 节点的 GRPCRemoteClient 集合，前文提到的 RemoteSenderService 发送策略，其实就是用来在该集合中选择 Client。

RemoteClientManager 维护了 clientsA 和 clientsB 两个 Client 集合，其中只有一个 Client 集合是当前正在使用的（即 usingClients 指向的），另一个处于备用空闲状态，如下图所示：


<Image alt="image029.png" src="https://s0.lgstatic.com/i/image/M00/13/BD/Ciqc1F7PkOGALBZaAADIkvKIxRk791.png"/> 


RemoteClientManager 初始化时会启动一个后台线程，定期通过 ClusterNodesQuery 拉取 OAP 集群中的节点信息，如果 OAP 集群中的节点变化，则会调用 reBuildRemoteClients() 方法更新 usingClients 集合。

这里通过一个具体的示例介绍更新逻辑，例如：OAP 集群中目前有 1、2、3、4 四个节点，此时，节点 1 的 usingClients 集合指向 clientsA，如下图所示，其中 Client 1 是 SelfRemoteClient 类型的 Client 表示节点 1 自身，Client 2、3、4 都是 GRPCRemoteClient 类型的 Client，通过网络连接对应的 OAP 节点。


<Image alt="image031.png" src="https://s0.lgstatic.com/i/image/M00/13/C9/CgqCHl7PkOiAFx85AAC1YVJi368187.png"/> 


假设某一时间点，OAP 集群发生变化，节点 2 下线，节点 5 上线，在 Zookeeper 中注册 RemoteInstance 也会随之发生变化，从而触发 usingClients 集合的更新。如下图所示，此时的Zookeeper 中包括节点 1、3、4、5 这四个节点的信息，通过与 clientsA 集合比较可知，节点 5 是新上线的，对应的 Client 5 需要进行初始化；节点 2 是要下线的，对应的 Client 2 需要关闭；其余的节点没有变化，对应的 Client 全部复用，拷贝到 clientsB 集合中。最后更新 usingClients 字段，指向 clientsB 集合即可。


<Image alt="image033.png" src="https://s0.lgstatic.com/i/image/M00/13/BD/Ciqc1F7PkO-AD6VOAAG8IcM-tew372.png"/> 


使用双 Client 集合可以保证在更新 clientsB 集合的过程中，不影响上层调用方继续使用 clientsA 集合。在 clientsB 集合更新之后，通过 volatile 修饰的 usingClients 字段切换，上层调用方就可以立即使用 clientsB 集合中的 Client 了。

#### RemoteClient

RemoteClient 接口中定义的 push() 方法表示向 OAP 节点发送数据 ，这里涉及两个实现类，如下图所示：


<Image alt="image035.png" src="https://s0.lgstatic.com/i/image/M00/13/C9/CgqCHl7PkPeAD80SAAGxevzW4-Y972.png"/> 


SelfRemoteClient 对应当前节点自身，其 push() 方法中会直接根据 nextWorkerId 参数查找下一个 Worker 实例来处理 StreamData 数据，不涉及任何网络请求。

GRPCRemoteClient 对应一个远端的 OAP 节点，其 push() 方法会将 nextWorkerId 等信息封装成 RemoteMessage 对象，然后写入 DataCarrier 缓冲区，然后由后台独立的 Consumer 线程通过 GRPCClient 将 DataCarrier 缓冲区中的 RemoteMessage 发送给远端 OAP 节点。这里的 DataCarrier 缓冲区以及 Consumer 线程都是 GRPCRemoteClient 独占的，整体的结构图如下：


<Image alt="image037.png" src="https://s0.lgstatic.com/i/image/M00/13/C9/CgqCHl7PkP-AWdpoAAI3RpMlQy4440.png"/> 


#### RegisterPersistentWorker

RegisterPersistentWorker 是处理 ServiceInventory 最后一个 Worker ，主要负责二次聚合操作以及持久化操作，属于前文介绍的" L2 级别聚合"。RegisterPersistentWorker 的核心结构与RegisterDistinctWorker 基本一致，核心结构如下图所示。首先，ServiceInventory 实例会进入一个 DataCarrier 缓存，然后由 BulkConsumerPool 中的消费线程完成聚合以及持久化操作。这里的 DataCarrier 是每个 RegisterPersistentWorker 对象独占的，BulkConsumerPool 线程池是全局共享的，注册在 ConsumerPoolFactory 中的名称为"REGISTER_L2"。


<Image alt="image039.png" src="https://s0.lgstatic.com/i/image/M00/13/C9/CgqCHl7PkQaAOsx2AAJhu4VD5Sc586.png"/> 


RegisterPersistentWorker 的消费逻辑同样封装在 onWorker() 方法中，其中实现了 DataCarrier 缓存中相同 ServiceInventory 的合并，以及内存中 ServiceInventory 与底层存储中的 ServiceInventory 的合并，大致实现如下：

```java
private void onWork(RegisterSource registerSource) {
    if (!sources.containsKey(registerSource)) {
        // 该服务第一次注册请求，直接放入sources缓存
        sources.put(registerSource, registerSource);
    } else {
        // 合并服务多次重复注册请求，combine()方法前面已经介绍过，不再重复
        sources.get(registerSource).combine(registerSource);
    }
    // 当sources缓存到达一定量或是从DataCarrier消费的这批数据结束，开始统一处理
    if (sources.size() > 1000 || 
          registerSource.getEndOfBatchContext().isEndOfBatch()) {
        sources.values().forEach(source -> {
            // 根据id(具体格式在前文介绍过，由服务名称和一个固定后缀组成)，
            // 尝试从底层存储中查询ServiceInventory
            RegisterSource dbSource = registerDAO.get(modelName, 
                source.id());
            if (Objects.nonNull(dbSource)) {
                if (dbSource.combine(source)) {
                    // 服务已经注册，并更新底层存储的时间信息
                    registerDAO.forceUpdate(modelName, dbSource);
                }
            } else {
                int sequence;
                // IRegisterLockDAO通过底层存储实现了全局锁的功能，
                // 并且会返回一个自增值，后面会展开详细介绍
                if ((sequence = registerLockDAO.getId(scopeId, 
                        source)) != Const.NONE) {
                    // 再次check，类似于Java单例中的 double check
                    dbSource = registerDAO.get(modelName, 
                          source.id());
                    if (Objects.nonNull(dbSource)) {
                        if (dbSource.combine(source)) { 
                            // 有其他并发操作已经注册了该服务，则合并后更新
                            registerDAO.forceUpdate(modelName, 
                                dbSource);
                        }
                    } else {
                        // 加锁后依旧无法查询到该服务，则该sequence即为
                        // serviceName对应的serviceId
                        source.setSequence(sequence);
                        // 初次写入,使用insert
                        registerDAO.forceInsert(modelName, source);
                    }
                }
            }
        });
        sources.clear(); // 清空缓存
    }
}
```

到此，整个 Service 注册流程就介绍完了，整个写入过程还是涉及很多东西的，希望你可以好好理解一下，也为后面分析其他请求的处理做好准备。

### 总结

本课时重点介绍了 SkyWalking OAP 如何处理 Agent 发送的服务注册请求。首先介绍了处理服务注册请求的 RegisterServiceHandler，接下来分析了相关的缓存实现。之后介绍了 ServiceInventory 对服务注册数据的抽象、@Stream 注解的工作原理。最后介绍了 InventoryStreamProcessor 处理服务注册请求的核心流程，展开分析了每个 Worker 的核心实现，涉及 RegisterDistinctWorker 实现的 "L1 级别聚合"、R egisterRemoteWorker 如何实现跨节点交互以及底层的选择策略和双队列实现、RegisterPersistentWorker 实现的 "L2 级别聚合"以及底层持久化的相关操作。

