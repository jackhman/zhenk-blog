# 第24讲：jvm-receiver插件探秘，不仅有Trace还可以有监控

在第 11 课时中，我介绍了 Agent 中 JVMService 的核心原理，它会定期通过 JMX 获取 JVM 监控信息，然后通过 JVMMetricReportService 这个 gRPC 接口上报到后端 OAP 集群。

本节课我将深入分析 SkyWalking OAP 对 JVM 监控数据的处理。

### JVMMetricReportServiceHandler

在 SkyWalking OAP 提供了 jvm-receiver-plugin 插件用于接收 Agent 发送的 JVMMetric 。jvm-receiver-plugin 插件的 SPI 配置文件中指定的 ModuleDefine 实现是 JVMModule（名称为 receiver-jvm），ModuleProvider 实现是 JVMModuleProvider（名称为 default）。在 JVMModuleProvider 的 start() 方法中会将 JVMMetricReportServiceHandler 注册到 GRPCServer 中。JVMMetricReportServiceHandler 实现了 JVMMetric.proto 文件中定义的 JVMMetricReportService gRPC 接口，其 collect() 方法负责处理 JVMMetric 对象。

首先，会通过 TimeBucket 工具类整理对齐每个 JVMMetric 所在的时间窗口，TimeBucket 会根据指定的 DownSampling 精度生成不同格式的时间窗口，如下图所示：


<Image alt="image (5).png" src="https://s0.lgstatic.com/i/image/M00/18/79/Ciqc1F7YtnGAMAYGAAJwEbFWmzY337.png"/> 


JVMMetricReportServiceHandler 中默认使用的 DownSampling 值为 Minute。

接下来，JVMMetricReportServiceHandler 会将 JVMMetrics 交给 JVMSourceDispatcher 处理，JVMSourceDispatcher 会按照 CPU、Memory、MemoryPool、GC 四个大类对监控数据进行拆分并转发：

```java
void sendMetric(int serviceInstanceId, long minuteTimeBucket, 
      JVMMetric metrics) {
    // 获取 JVMMetric 对应的 ServiceId
    ServiceInstanceInventory serviceInstanceInventory = 
          instanceInventoryCache.get(serviceInstanceId);
    int serviceId = serviceInstanceInventory.getServiceId();
    //将 JVMMetric 分类转发
    this.sendToCpuMetricProcess(serviceId, serviceInstanceId, 
          minuteTimeBucket, metrics.getCpu());
    this.sendToMemoryMetricProcess(serviceId, serviceInstanceId, 
          minuteTimeBucket, metrics.getMemoryList());
    this.sendToMemoryPoolMetricProcess(serviceId, serviceInstanceId, 
          minuteTimeBucket, metrics.getMemoryPoolList());
    this.sendToGCMetricProcess(serviceId, serviceInstanceId, 
          minuteTimeBucket, metrics.getGcList());
}
```

这里先以 JVM GC 的监控数据为例进行分析。在 sendToGCMetricProcess() 方法中会将 GC 对象转换为 ServiceInstanceJVMGC 对象（ServiceInstanceJVMGC 中除了包含 GC 对象中的监控数据，还记录了 serviceId 以及 serviceInstanceId，也就明确了这些监控数据的归属）。然后， DispatcherManager 会将 ServiceInstanceJVMGC 转发到相应的 SourceDispatcher。

同理，JVMMetric 中关于 CPU、Memory、MemoryPool 的三类监控数据分别填充到了 ServiceInstanceJVMCPU、ServiceInstanceJVMMemory、ServiceInstanceJVMMemoryPool 对象中，继承关系如下图所示：


<Image alt="image (6).png" src="https://s0.lgstatic.com/i/image/M00/18/79/Ciqc1F7YtoOABepsAAEMFZwAVUo208.png"/> 


### Dispatcher \& DispatcherManager

在 DispatchManager 中维护了一个 Map\<Integer, List \> 集合，该集合记录了各个 Source 类型对应的 Dispatcher 实现，其中 Key 是 Source 类型对应的 scope 值，Source 的不同子类对应不同的 scope 值，例如：ServiceInstanceJVMGC 对应的 scope 值为 11，ServiceInstanceJVMCPU 对应的 scope 值为 8。其中的 Value 是处理该 Source 子类的 Dispatcher 集合，例如：ServiceInstanceJVMGCDispatcher 就是负责分发 ServiceInstanceJVMGC 的 SourceDispatcher 实现，ServiceInstanceJVMGCDispatcher 的定义如下：

```java
public class ServiceInstanceJVMGCDispatcher 
     implements SourceDispatcher<ServiceInstanceJVMGC> {...}
```

在 CoreModuleProvider 启动的时候（即 start() 方法），会扫描 classpath 下全部 SourceDispatcher 实现类，并识别其处理的 Source 子类类型进行分类并填充 Map\<Integer, List \> 集合。具体的扫描逻辑在 DispatcherManager.scan() 方法中，如果你感兴趣可以翻一下代码。
> 还有需要注意的是，这些 SourceDispatcher 的部分实现是通过 OAL 脚本生成的，OAL 语言的内容在后面会展开分析，这里先专注于监控指标的处理流程上。

回到 ServiceInstanceJVMGC 的处理流程上，默认与它对应的 SourceDispatcher 实现只有 ServiceInstanceJVMGCDispatcher，其 dispatch() 方法会将 ServiceInstanceJVMGC 对象转换成相应的 Metrics 对象，实现如下：

```java
public void dispatch(ServiceInstanceJVMGC source) {
    doInstanceJvmYoungGcTime(source);
    doInstanceJvmOldGcTime(source);
    doInstanceJvmYoungGcCount(source);
    doInstanceJvmOldGcCount(source);
}
```

这里的 doInstanceJvm\*() 方法是将 ServiceInstanceJVMGC 转换成相应的 Metrics ，我们可以看到，在 ServiceInstanceJVMGC 中包含了 GCPhrase、GC 时间、 GC 次数三个维度的数据，而转换后的一个 Metrics 子类型只表示一个维度的监控数据。这里涉及的 Metrics 子类如下图所示：


<Image alt="image (7).png" src="https://s0.lgstatic.com/i/image/M00/18/79/Ciqc1F7Ytp6AYxkTAAE2IyTdv1A381.png"/> 


在前面的"SkyWalking OAP 存储体系剖析"课时中提到了 Metrics 抽象类，你可以回顾一下，Metrics 抽象类是所有监控指标的顶级抽象，其中定义了一个 TimeBucket 字段（long 类型），用于记录该监控数据所在的分钟级窗口。

下面来看上图涉及的 Metrics 子类，在 LongAvgMetrics 抽象类中增加了下面三个字段：

```java
@Column private long summation; // 总和
@Column private int count; // 次数
@Column private long value; // 平均值
```

在 combine() 方法实现中，会将传入的 LongAvgMetrics 对象的 summation 和 count 字段累加到当前 LongAvgMetrics 对象中。在 calculate() 方法中会计算 value 字段的值：

```java
this.value = this.summation / this.count;
```

下面会以 Old GC Time 监控数据继续分析，这里的 doInstanceJvmOldGcTime() 方法会将 ServiceInstanceJVMGC 转换成 InstanceJvmOldGcTimeMetrics，其中又添加了 serviceId 和 entityid（用于构造 Document Id，InstanceJvmOldGcTimeMetrics 中就是 serviceInstanceId）两个字段，用于记录该 GC 监控数据所属的服务实例：

```java
@Column(columnName = "entity_id") @IDColumn private String entityId;
@Column(columnName = "service_id")  private int serviceId;
```

SkyWalking OAP 中很多其他类型的监控数据，例如：

* **SumMetrics** 计算的是时间窗口内的总和。
* **MaxDoubleMetrics、MaxLongMetrics** 计算的是时间窗口内的最大值。
* **PercentMetrics** 计算的是时间窗口内符合条件数据所占的百分比（即 match / total）。
* **PxxMetrics** 计算的是时间窗口内的分位数，例如： P99Metrics、P95Metrics、P70Metrics等。
* **CPMMetrics** 计算的是应用的吞吐量，默认是通过分钟级别的调用次数计算的。

最后，依旧以 InstanceJvmOldGcTimeMetrics 为例，看看 Metrics 实现类中定义的 ElasticSearch 索引名称以及各个字段对应的 Field 名称：


<Image alt="image (8).png" src="https://s0.lgstatic.com/i/image/M00/18/85/CgqCHl7YtreATj7GAARBmbdpdkw991.png"/> 


回到 GC 监控数据的处理流程中，在 doInstanceJvmOldGcTime() 方法完成监控数据粒度的细分之后，会将细分后的 InstanceJvmOldGcTimeMetrics 对象交给 MetricsStreamProcessor 处理。

```java
private void doInstanceJvmOldGcTime(ServiceInstanceJVMGC source) {
    // 创建 InstanceJvmOldGcTimeMetrics 对象
    InstanceJvmOldGcTimeMetrics metrics = 
          new InstanceJvmOldGcTimeMetrics();
    if (!new EqualMatch().setLeft(source.getPhrase())
            .setRight(GCPhrase.OLD).match()) {
        return;     // 只处理 Old GC
    }
    metrics.setTimeBucket(source.getTimeBucket()); // 分钟级别的时间窗口
    metrics.setEntityId(source.getEntityId()); // serviceInstanceId
    metrics.setServiceId(source.getServiceId()); // serviceId
    metrics.combine(source.getTime(), 1); // 记录 GC 时间，count 为1
    // 交给 MetricsStreamProcessor 继续后续处理
    MetricsStreamProcessor.getInstance().in(metrics);
}
```

### MetricsStreamProcessor

前面在介绍服务注册流程的时候，分析过 InventoryStreamProcessor 处理注册请求的核心逻辑，在这里，MetricsStreamProcessor 处理 Metrics 数据的流程也有异曲同工之处。

MetricsStreamProcessor 中为每个 Metrics 类型维护了一个 Worker 链，如下所示：

```java
private Map<Class<? extends Metrics>, MetricsAggregateWorker> entryWorkers = new HashMap<>();
```

MetricsStreamProcessor 初始化 entryWorkers 集合的核心逻辑也是在 create() 方法中，下图展示了 InstanceJvmOldGcTimeMetrics 对应的 Worker 链结构：


<Image alt="image (9).png" src="https://s0.lgstatic.com/i/image/M00/18/7A/Ciqc1F7Yts6AUU4bAABZiou-upc728.png"/> 


具体代码如下：

```java
// 创建 minutePersistentWorker
MetricsPersistentWorker minutePersistentWorker =   
  minutePersistentWorker(moduleDefineHolder, metricsDAO, model);
// 创建 MetricsTransWorker，后续 worker 指向 minutePersistenceWorker 对象(以及
// hour、day、monthPersistentWorker)
MetricsTransWorker transWorker = 
    new MetricsTransWorker(moduleDefineHolder, stream.name(), 
        minutePersistentWorker, hourPersistentWorker, 
            dayPersistentWorker, monthPersistentWorker);
// 创建 MetricsRemoteWorker，并将 nextWorker 指向上面的 MetricsTransWorker对象
MetricsRemoteWorker remoteWorker = new 
  MetricsRemoteWorker(moduleDefineHolder, transWorker, stream.name());
// 创建 MetricsAggregateWorker，并将 nextWorker 指向上面的
// MetricsRemoteWorker 对象
MetricsAggregateWorker aggregateWorker =
     new MetricsAggregateWorker(moduleDefineHolder, remoteWorker, 
         stream.name());
// 将上述 worker 链与指定 Metrics 类型绑定
entryWorkers.put(metricsClass, aggregateWorker);
```

其中 minutePersistentWorker 是一定会存在的，其他 DownSampling（Hour、Day、Month） 对应的 PersistentWorker 则会根据配置的创建并添加，在 CoreModuleProvider.prepare() 方法中有下面这行代码，会获取 Downsampling 配置并保存于 DownsamplingConfigService 对象中配置。后续创建上述 Worker 时，会从中获取配置的 DownSampling。

```java
this.registerServiceImplementation(DownsamplingConfigService.class, new DownsamplingConfigService(moduleConfig.getDownsampling()));
```

### MergeDataCache 缓冲区设计与实现

在深入介绍上述 Worker 的实现之前，需要先要来介绍一下其中使用到的 MergeDataCache 缓冲区组件的设计与实现。

Window 抽象类是 MergeDataCache 缓冲区的基类，使用双缓冲队列的结构实现：

```java
private SWCollection<DATA> pointer; // 指向当前正在写入的缓冲队列
private SWCollection<DATA> windowDataA; // A、B两个缓冲队列
private SWCollection<DATA> windowDataB;
```

为了便于后面的描述，这里简单区分两个缓冲队列，其中 pointer 指向的队列称为 "current 队列"（一般是有空闲空间的队列，主要负责缓冲新写入数据），另一个队列称为 "last 队列"（一般填充了一定量的数据，会有其他线程从中读取数据进行消费）。

SWCollection 接口定义了缓冲队列的基本行为，下面是其继承关系图：


<Image alt="image (10).png" src="https://s0.lgstatic.com/i/image/M00/18/7A/Ciqc1F7YtumAfQZeAAFcY5KP8TM078.png"/> 


这里重点分析 MergeDataCollection 实现类，它底层是通过一个 HashMap 实现的，一对 KV 中的 Key 和 Value 指向的是同一个 StreamData 对象。MergeDataCollection 暴露了 Map 的基本方法，例如：put、get、containKey 等方法。另外，它还封装了两个 volatile boolean 类型的字段 ------ reading、writing，用于标记该缓冲队列的状态，也提供了这两个状态字段相应的 getter/setter 方法。简单说明一下这两个状态字段的含义：

* 当队列的 reading 被设置为 true 时，处于 reading 状态，表示可能有线程在从该队列中读取数据。
* 当队列的 writing 被设置为 true 时，处于 writing 状态，表示可能有线程在向该队列中写入数据。

通过 MergeDataCollection 类暴露方法，我们完全可以让一个队列同时处于 reading 和 writing 两个状态，但是这样会出现并发问题。所以在后面用到 MergeDataCollection 及 MergeDataCache 的地方我们也可以看到，即使一个队列偶尔同时处于两个状态，也会通过循环等待的方式，等待其中一个状态退出。

LimitSizeDateCollection 与 MergeDataCollection 的大致实现类似，区别在于 LimitSizeDateCollection 底层的 Map 类型是 HashMap\<T, LinkedList \>，Value 中的 LinkedList 都是有序队列。在 LimitSizeDateCollection.put() 方法中会限制每个 LinkedList 的长度，当超过指定的长度时，只会保留最大的 TOP N。

回到 Window 抽象类，其中还定义了一个控制 pointer 指针切换的字段，如下：

```java
private AtomicInteger windowSwitch = new AtomicInteger(0);
```

以及相应的切换检查方法，如下：

```java
// 检查 windowSwitch 字段，以及 last 队列是否处于可读状态
public boolean trySwitchPointer() {
    return windowSwitch.incrementAndGet() == 1 
              && !getLast().isReading();
    // 如果此时 last 队列处于 reading 状态，切换后，last 队列会变成current队列，
    // 就会出现两个线程(一个读线程、一个写线程)并发操作该队列的可能，所以需要进行
    // reading 状态的检测
}

// 在 trySwitchPointer()方法尝试之后，需要在 finally 代码块中恢复windowSwitch
// 字段的值，为下次检查做准备
public void trySwitchPointerFinally() {
    windowSwitch.addAndGet(-1);
}
```

在 switchPointer() 方法中实现了 pointer 字段的切换，同时也会更新 last 队列的状态：

```java
public void switchPointer() {
    if (pointer == windowDataA) { // 根据 pointer 当前的指向，进行修改
        pointer = windowDataB;
    } else {
        pointer = windowDataA;
    }
    getLast().reading(); // 修改 last 队列的状态
}
```

接下来重点看 MergeDataCache 类的实现，有两个点需要注意：

* 它将 A、B 两个队列初始化为 MergeDataCollection 队列。
* 它维护了一个 lockedMergeDataCollection 字段。在开始写入的时候，会先调用 writing() 方法将 lockedMergeDataCollection 字段指向当前的 current 队列，直至写入操作完成。即使在写入操作过程中发生了 pointer 的切换，lockedMergeDataCollection 字段的指向也不会发生变化。在写入操作完成之后，会调用 finishWriting() 方法将 lockedMergeDataCollection 字段设置为 null。

LimitedSizeDataCache 与 MergeDataCache 的实现有些类似，但功能上有所区别，在后面介绍慢查询的处理（TopNStreamProcessor）时，会介绍 LimitedSizeDataCache 的核心实现。

### MetricsAggregateWorker

回到 InstanceJvmOldGcTimeMetrics 的处理流程上继续分析，Worker 链中的第一个是 MetricsAggregateWorker，其功能就是进行简单的聚合，模型如下图所示：


<Image alt="image (11).png" src="https://s0.lgstatic.com/i/image/M00/18/86/CgqCHl7YtwqAOhwEAAGQdRPvCuM193.png"/> 


MetricsAggregateWorker 在收到 Metrics 数据的时候，会先写到内部的 DataCarrier 中缓存，然后由 Consumer 线程（都属于名为 "METRICS_L1_AGGREGATION" 的 BulkConsumePool）消费并进行聚合，并将聚合结果写入到 MergeDataCache 中的 current 队列暂存。

同时，Consumer 会定期（默认1秒，通过 METRICS_L1_AGGREGATION_SEND_CYCLE 配置修改）触发 current 队列和 last 队列的切换，然后读取 last 队列中暂存的数据，并发送到下一个 Worker 中处理。

上图中写入 DataCarrier 的逻辑在前面已经分析过了，这里不再赘述。下面深入分析两个点：

1. Consumer 线程消费 DataCarrier 并聚合监控数据的相关实现。
2. Consumer 线程定期清理 MergeDataCache 缓冲区并发送监控数据的相关实现。

Consumer 线程在消费 DataCarrier 数据的时候，首先会进行 Metrics 聚合（即相同 Metrics 合并成一个），然后写入 MergeDataCache 中，实现如下：

```java
private void aggregate(Metrics metrics) {
    // 将 lockedMergeDataCollection 指向 current 队列，并设置其 writing标记
    mergeDataCache.writing(); 
    if (mergeDataCache.containsKey(metrics)) { 
        // 存在重复的监控数据，则进行合并，
        // 不同 Metrics子类的 combine()方法实现有所不同，
        // 这里的 InstanceJvmOldGcTimeMetrics 的实现就 summation 的累加、
        // count 加一
        mergeDataCache.get(metrics).combine(metrics);
    } else { // 该 Metrics 第一次出现，直接写入到
        mergeDataCache.put(metrics);
    }
    // 清理 current 队列的 writing 标记，之后清理 lockedMergeDataCollection 
    mergeDataCache.finishWriting();
}
```

将聚合后的 Metrics 写入 MergeDataCache 之后，Consumer 线程会每隔一秒将 MergeDataCache 中的数据发送到下一个 Worker 处理，相关实现如下：

```java
private void sendToNext() {
    // 首先进行队列切换，之后会设置 last 队列的 reading 状态
    mergeDataCache.switchPointer();
    // 此时可能其他的 Consumer 线程还在写入 last队列，需要等待写入完成
    while (mergeDataCache.getLast().isWriting()) {
        Thread.sleep(10);
    }
    // 开始读取 last 队列中的全部 Metrics 数据并发送到下一个 worker 处理
    mergeDataCache.getLast().collection().forEach(data -> {
        nextWorker.in(data);
    });
    // 读取完成后，清空 last 队列以及其 reading 状态
    mergeDataCache.finishReadingLast();
}
```

MetricsAggregateWorker 的核心逻辑到这里就分析完了。

MetricsAggregateWorker 指向的下一个 Worker 是 MetricsRemoteWorker ，其实现与 RegisterRemoteWorker 类似，底层也是通过 RemoteSenderService 将监控数据发送到远端节点，具体实现不再展开。

### MetricsTransWorker

MetricsRemoteWorker 之后的下一个 worker 是 MetricsTransWorker，其中有四个字段分别指向四个不同 Downsampling 粒度的 PersistenceWorker 对象，如下：

```java
private final MetricsPersistentWorker minutePersistenceWorker;
private final MetricsPersistentWorker hourPersistenceWorker;
private final MetricsPersistentWorker dayPersistenceWorker;
private final MetricsPersistentWorker monthPersistenceWorker;
```

MetricsTransWorker.in() 方法会根据上述字段是否为空，将 Metrics 数据分别转发到不同的 PersistenceWorker 中进行处理：

```java
public void in(Metrics metrics) {
    // 检测 Hour、Day、Month 对应的 PersistenceWorker 是否为空，若不为空，
    // 则将 Metrics 数据拷贝一份并调整时间窗口粒度，交到相应的 
    // PersistenceWorker 处理，这里省略了具体逻辑
    // 最后，直接转发给 minutePersistenceWorker 进行处理
    if (Objects.nonNull(minutePersistenceWorker)) { 
        aggregationMinCounter.inc();
        minutePersistenceWorker.in(metrics);
    }
}
```

### MetricsPersistentWorker

MetricsPersistentWorker 主要负责 Metrics 数据的持久化，其核心结构如下图所示：


<Image alt="image (12).png" src="https://s0.lgstatic.com/i/image/M00/18/7A/Ciqc1F7YtziAPKFvAAFUA42eQDc822.png"/> 


与前文介绍的 MetricsAggregateWorker 处理流程类似，MetricsPersistentWorker 在接收到 Metrics 数据的时候先将其暂存到 DataCarrier 中，然后由后续 Consumer 线程消费。

<br />

Consumer 线程实际上调用的是 PersistenceWorker.onWork() 方法，PersistenceWorker是 MetricsPersistentWorker 的父类，继承关系如下图所示：


<Image alt="image (13).png" src="https://s0.lgstatic.com/i/image/M00/18/86/CgqCHl7Yt0SAW_XHAAGAflXWY6Q440.png"/> 


RecordPersistenceWorker 等子类在后面会详细分析。

PersistenceWorker.onWork() 方法的逻辑是将 Metrics 数据写入 MergeDataCache 中暂存，待其中积累的数据量到达阈值（固定值 1000）之后，会进行一次批量写入 ElasticSearch 的操作，如下所示：

```java
void onWork(INPUT input) {
    // 检测 current 队列中缓冲的数据量是否打到阈值
    if (getCache().currentCollectionSize() >= batchSize) {
        try {
            // 检测是否符合切换缓冲队列的条件，在分析 Windows 抽象类时也说过，
            // trySwitchPointer()会检测 windowSwitch 标记以及 last 队列的 reading状态
            if (getCache().trySwitchPointer()) { 
                // 切换 current 缓冲队列，同时会设置切换后的 last 队列的 reading标记
                getCache().switchPointer(); 
                // 创建一批请求并批量执行
                List<?> collection = buildBatchCollection();
                batchDAO.batchPersistence(collection);
            }
        } finally { // trySwitchPointerFinally()方法会重置 windowSwitch标记
            getCache().trySwitchPointerFinally(); 
        }
    }
    cacheData(input); // 写入缓存
}
```

下面深入 onWorker() 方法的细节实现中进行分析。先来看 cacheData() 方法，MetricsPersistentWorker 在该方法实现中提供了标准的写入 MergeDataCache 操作：

```java
public void cacheData(Metrics input) {
    // 将 lockedMergeDataCollection 指向 current 队列，并设置其 writing 标记
    mergeDataCache.writing(); 
    if (mergeDataCache.containsKey(input)) {
        // 存在重复的监控数据，则进行合并
        Metrics metrics = mergeDataCache.get(input);
        metrics.combine(input);
        // 重新计算该监控值，不同 Metrics 实现的计算方式不同，例如，
        // LongAvgMetrics.calculate()方法就是计算平均值
        metrics.calculate(); 
    } else {
        input.calculate(); // 第一次计算该监控值
        mergeDataCache.put(input);
    }
    // 更新 lockedMergeDataCollection 队列的 writing 状态，然后清空lockedMergeDataCollection
    mergeDataCache.finishWriting();
}
```

接下来看 buildBatchCollection() 方法的实现。在前面的 trySwitchPointer() 检测中只保证了 last 队列已退出 reading 状态，并未检查 current 队列是否已经退出了writing 状态，所以在切换完成后，第一件事就是先循环等待 last 队列（切换前是 current 队列）退出 writing 状态：

```java
while (getCache().getLast().isWriting()) { 
    Thread.sleep(10);   // 循环检测 last 队列的 writing 状态
}
```

当 last 队列解除了 writing 状态的时候，上面的循环会退出，然后执行 prepareBatch() 方法遍历 last 队列，为每一个 Metrics 对象生成一条相应的 IndexRequest 或 UpdateRequest，具体的处理如下：

```java
// 根据id从底层存储中查询 Metrics
Metrics dbData = metricsDAO.get(model, data);
if (nonNull(dbData)) { // 已存在相应的 Document
    data.combine(dbData); // 已存在则进行合并
    data.calculate(); // 重新计算 value 值
    // 产生相应的 UpdateRequest 请求，并添加到 batchCollection 集合中
    batchCollection.add(metricsDAO.prepareBatchUpdate(model, data));
} else { 
    // 产生相应的 IndexRequest 请求，并添加到 batchCollection 集合中
    batchCollection.add(metricsDAO.prepareBatchInsert(model, data));
}
```

这里产生的 batchCollection 集合接下来会交给 BatchProcessEsDAO 批量执行，其底层是通过 ES High Level Client 提供的 BulkProcessor 实现批量操作的，该部分实现位于 BatchProcessEsDAO.batchPersistence() 方法中，如下所示：

```java
public void batchPersistence(List<?> batchCollection) {
    if (bulkProcessor == null) { 
        // 创建 BulkProcessor，创建方式与前面"ElasticSearch基础入门"小节中展示的示例相同，不再重复
        this.bulkProcessor = getClient().createBulkProcessor(bulkActions, bulkSize, flushInterval, concurrentRequests);
    }
    batchCollection.forEach(builder -> { // 遍历batchCollection，将 Request添加到BulkProcessor中
        if (builder instanceof IndexRequest) {
            this.bulkProcessor.add((IndexRequest)builder);
        }
        if (builder instanceof UpdateRequest) {
            this.bulkProcessor.add((UpdateRequest)builder);
        }
    });
    this.bulkProcessor.flush(); // 将上面添加的请求发送到 ElasticSearch 集群执行
}
```

从上面的代码中我们可以看到，在一个 OAP 实例中只会创建一个 BulkProcessor 对象，然后将其封装到 BatchProcessEsDAO 中循环使用。

### 总结

到这里，SkyWalking OAP 处理 Metrics 监控数据的整个流程就分析完了。下面通过一张图总结整个处理流程：


<Image alt="image (14).png" src="https://s0.lgstatic.com/i/image/M00/18/7B/Ciqc1F7Yt2OAJnGpAABb_jqSXp0511.png"/> 


JVMMetricReportServiceHandler 在收到 JVM Metrics 请求时，由 DispatcherManager 对 JVMMetric 进行分类（ CPU、Memory、MemoryPool、GC 四类）并转换成相应的 Source 对象，接下来根据 Source 类型查找相应的 SourceDispatcher 集合进行处理。

在 SourceDispatcher 中会将监控数据再次拆分，转换单一维度的 Metrics 对象，例如，在 ServiceInstanceJVMGCDispatcher 中会将 GC 监控拆分成 Old GC Time、Old GC Count、New GC Time、New GC Count 四类。之后，SourceDispatcher 会将 Metrics 对象传递给 MetricsStreamProcessor 中的 worker 进行处理。

MetricsAggregateWorker 通过 MergeDataCache 对 Metrics 数据进行暂存以及简单聚合。

MetricsRemoteWorker 通过底层的 RemoteSenderService 将 Metrics 数据送到 OAP 集群中的其他远端节点。

MetricsTransWorker 会将 Metrics 数据复制多份，转发到各个 DownSampling 对应的 MetricsPersistentWorker 中实现持久化。

MetricsPersistentWorker 会先将数据缓存在 MergeDataCache 中，当缓存数据量到达一定阈值，执行批量写入（或更新） ElasticSearch 操作，批量操作是通过 High Level Client 中的 BulkProcessor 实现的。

