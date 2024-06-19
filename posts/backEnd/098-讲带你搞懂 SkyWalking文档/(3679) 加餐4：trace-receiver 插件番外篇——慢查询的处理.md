# 加餐4：trace-receiver插件番外篇——慢查询的处理

在这一课时，我们重点来介绍 trace-receiver-plugin 插件对慢查询相关信息的处理。

这里先来简单回顾一下，在 mysql-8.x-plugin 插件中会拦截 preparedStatement.execute() 方法创建 Database 类型的 ExitSpan，并在 execute() 方法调用完成之后结束 ExitSpan。

除了前面介绍的对 ExitSpan 的基本处理之外，multiScopesSpanListener.parseExit() 方法还会针对 Database 类型的 ExitSpan 进行特殊处理，该处理主要用于统计慢查询。这里的慢查询统计不仅是 DB 的慢查询，还包括其他常见的存储，例如：Redis、MongoDB 等等。

parseExit() 方法相关的代码片段如下，其核心是将请求存储的时间与 application.yml 配置文件中指定的慢查询阈值（slowDBAccessThreshold 配置项）进行比较，超过阈值的请求会创建相应的 DatabaseSlowStatement 对象并记录到 slowDatabaseAccesses 集合中。

```java
DatabaseSlowStatement statement = new DatabaseSlowStatement();
// 记录发生此次慢查询的 traceId
statement.setTraceId(traceId); 
// 由 TraceSegment.id 以及 Span.id 构成的唯一标识
statement.setId(segmentCoreInfo.getSegmentId() + "-" + spanDecorator.getSpanId());
// 记录存储对应的 ServiceId
statement.setDatabaseServiceId(sourceBuilder.getDestServiceId()); 
// 此次慢查询的实际耗时
statement.setLatency(sourceBuilder.getLatency()); 
// 秒级时间窗口
statement.setTimeBucket(TimeBucket.getSecondTimeBucket(segmentCoreInfo.getStartTime()));
for (KeyStringValuePair tag : spanDecorator.getAllTags()) { // 遍历ExitSpan 携带的 Tag 信息
    if (SpanTags.DB_STATEMENT.equals(tag.getKey())) {
        // 具体执行的操作，例如，访问 DB 的话，就是 SQL 语句
        statement.setStatement(tag.getValue()); 
    } else if (SpanTags.DB_TYPE.equals(tag.getKey())) {
        // 在 application.yml 配置文件中配置了不同存储的慢查询阈值上限，
        // 这里会根据 dbType（其值可以为 sql、Redis、MongoDB 等）查找其阈值
        String dbType = tag.getValue(); 
        DBLatencyThresholdsAndWatcher thresholds = config.getDbLatencyThresholdsAndWatcher();
        int threshold = thresholds.getThreshold(dbType);
        if (sourceBuilder.getLatency() > threshold) {
            isSlowDBAccess = true; // 判断此次请求存储的操作是否为慢查询
        }
    }
}
if (isSlowDBAccess) { // 将慢查询记录到 slowDatabaseAccesses 集合中
    slowDatabaseAccesses.add(statement);
}
```

在 multiScopesSpanListener.build() 方法中会将 slowDatabaseAccesses 集合中记录的全部DatabaseSlowStatement 对象交给 SourceReceiver 处理，这里 DatabaseSlowStatement 对应的 SourceDispatcher 实现是 DatabaseStatementDispatcher。在 DatabaseStatementDispatcher 中会将 DatabaseSlowStatement 转换成 TopNDatabaseStatement，并交给 TopNStreamProcessor 进行处理。  

TopNDatabaseStatement 的继承关系如下所示：


<Image alt="image" src="https://s0.lgstatic.com/i/image/M00/20/59/CgqCHl7oY-2AXRtrAAFtUKJ2T34195.png"/> 


抽象类 Record 前面介绍过其 timeBucket 字段对应 Document 中的 time_bucket 字段。抽象类 TopN 中的四个核心字段如下，正好对应 DatabaseSlowStatement 中记录的慢查询核心信息：

```java
@Getter @Setter @Column(columnName = "statement", content = true) private String statement;
@Getter @Setter @Column(columnName = "latency") private long latency;
@Getter @Setter @Column(columnName = "trace_id") private String traceId;
@Getter @Setter @Column(columnName = "service_id") private int serviceId;
```

有些场景中，超越慢查询阈值的操作可能会比较多，全部记录下来的意义不大，一般针对每个存储服务只会记录耗时最大的前几个慢查询，正如 TopN 这个抽象类的名字所示 。SkyWalking 只会记录耗时最大的 N 个慢查询，topN.compareTo() 方法会比较 latency 字段，从而实现按照耗时的排序。

TopNDatabaseStatement 是 TopN 的唯一实现类，其中需要注意的是 equals() 方法，比较的是 serviceId。TopNDatabaseStatement 对应 Index 名称的前缀是"top_n_database_statement"，Document Id 就是前面介绍的 DatabaseSlowStatement 的 Id，即 TraceSegmentId + SpanId 构成。

### TopNWorker

TopNStreamProcessor 为每个 TopN 类型（其实只有 TopNDatabaseStatement）提供的 Worker 链中只有一个 Worker ------ TopNWorker。与前文介绍的 MetricsPersistentWorker 以及 RecordPersistentWorker 类似，TopNWorker 也继承了 PersistenceWorker 抽象类，其结构如下图所示，TopNWorker 也是先将 TopNDatabaseStatement 暂存到 DataCarrier，然后由后台 Consumer 线程定期读取并调用 onWork() 方法进行处理。


<Image alt="image" src="https://s0.lgstatic.com/i/image/M00/20/4D/Ciqc1F7oZASAZ822AAEjgROFXtk196.png"/> 


在 TopNWorker.onWorker() 方法中会将 TopNDatabaseStatement 暂存到 LimitedSizeDataCache 中进行排序。LimitedSizeDataCache 使用双队列模式，继承了 Windows 抽象类，与前文介绍的 MergeDataCache 类似。LimitedSizeDataCache 底层的队列实现是 LimitedSizeDataCollection，其 data 字段（Map 类型）中维护了每个存储服务的慢查询（即 TopNDatabaseStatement）列表，每个列表都是定长的（由 limitedSize 字段指定，默认 50），在调用 limitedSizeDataCollection.put() 方法写入的时候会按照 latency 从大到小排列，并只保留最多 50 个元素，如下图所示：


<Image alt="image" src="https://s0.lgstatic.com/i/image/M00/20/4D/Ciqc1F7oZCCAdh83AAKfFxpviaQ344.png"/> 


可见，在 LimitedSizeDataCache 中缓存的慢查询是按照存储服务的维度进行分类、排序以及计算 TopN 的。

回到 TopNWorker，它覆盖了 PersistenceWorker 的 onWork() 方法，如下所示：

```java

void onWork(TopN data) {
    limitedSizeDataCache.writing();
    try {
        limitedSizeDataCache.add(data);
    } finally {
        limitedSizeDataCache.finishWriting();
    }
}
```

### PersistenceTimer

在 PersistenceWorker 的三个实现类中，MetricsPersistentWorker 和 RecordPersistentWorker 启动的 Consumer 直接使用了继承自 PersistenceWorker 的 onWork() 方法 ，该实现只会在 DataCache 缓存的数据到达一定阈值时，才会触发 ElasticSearch 的写入。如果缓存量长时间达不到阈值，就会导致监控数据和 Trace 数据写入延迟。另外，前面的介绍 TopNWorker.onWork() 实现只有写入 LimitedSizeDataCache 的逻辑，没有读取的逻辑。

为了解决上述问题，在各个模块初始化完成之后，会在 coreModuleProvider.notifyAfterCompleted() 方法中启动 PersistenceTimer（前面介绍的 GRPCServer 也是在此处启动的）。

PersistenceTimer 中会启动一个后台线程定期（初始延迟为 1s，后续间隔为 3s）将三个 PersistenceWorker 实现中缓存的数据持久化到 ElasticSearch 中，大致实现如下所示（省略 Debug 级别的日志输出以及部分 try/catch 代码）：

```java
private void extractDataAndSave(IBatchDAO batchDAO) {
    // 三个 PersistenceWorker 实现构成的列表
    List<PersistenceWorker> persistenceWorkers = new ArrayList<>();
    persistenceWorkers.addAll(MetricsStreamProcessor.getInstance().getPersistentWorkers());
    persistenceWorkers.addAll(RecordStreamProcessor.getInstance().getPersistentWorkers());
    persistenceWorkers.addAll(TopNStreamProcessor.getInstance().getPersistentWorkers());
    persistenceWorkers.forEach(worker -> {
        // 逐个 PersistenceWorker 实现的 flushAndSwitch()方法，
        // 其中主要是对 DataCache 队列的切换
        if (worker.flushAndSwitch()) {
            // 调用 PersistenceWorker.buildBatchCollection()为 DataCache中每个元素创建相应的 IndexRequest 以及 UpdateRequest 请求
            List<?> batchCollection = worker.buildBatchCollection();
            batchAllCollection.addAll(batchCollection);
        }
    });
    // 执行三个 PersistenceWorker 生成的全部 ElasticSearch 请求
    batchDAO.batchPersistence(batchAllCollection);
}
```

这里需要特别说明是：MetricsPersistentWorker 和 RecordPersistentWorker 中的 flushAndSwitch() 方法都继承自 PersistenceWorker，其主要功能是切换底层 DataCache 的 current 队列，这与 persistenceWorker.onWorker() 方法中的核心逻辑类似。

而 TopNWorker 覆盖了 flushAndSwitch() 方法，其中添加了执行频率的控制，大致实现如下：

```java
public boolean flushAndSwitch() {
    long now = System.currentTimeMillis();
    if (now - lastReportTimestamp <= reportCycle) {
        return false; // 默认 10min 执行一次
    }
    lastReportTimestamp = now; // 重置 lastReportTimestamp
    return super.flushAndSwitch(); // 调用 PersistenceWorker 实现
}
```

到此为止，trace-receiver-plugin 插件核心的工作原理及实现就介绍完了。

