# 第25讲：trace-receiver插件拆解，Trace蕴含的宝贵信息（上）

在上一课时中，我介绍了 SkyWalking OAP 处理 Metrics 监控数据的完整流程。本课时将开始介绍 Trace 处理的相关内容。

### TraceModuleProvider

本课时重点内容是来看 OAP 中的 trace-receiver-plugin 如何接收 TraceSegment 数据。

目前 trace-receiver-plugin 插件同时支持处理 V1 和 V2 两个版本的 TraceSegment。本课时重点分析 V2 版本 TraceSegment，后面不进行特殊说明的情况下，都是指 V2 版本 TraceSegment。

在 trace-receiver-plugin 插件的 SPI 文件中指定的 ModuleProvider 实现是 TraceModuleProvider，在 prepare() 方法中主要初始化 SegmentParseV2 解析器，SegmentParseV2 主要负责解析 TraceSegment 数据，具体实现后面会详细分析。

TraceModuleProvider 的 start() 方法核心是将 TraceSegmentReportServiceHandler 注册到 GRPCHandlerRegister 中。TraceSegmentReportServiceHandler 负责接收 Agent 发送来的 TraceSegment 数据，并调用 SegmentParseV2.parse() 方法进行解析，如下图所示：


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image/M00/1B/D7/CgqCHl7fSYGAKb4lAAEg6Xckx78215.png"/> 


### SegmentParseV2

每处理一个 UpstreamSegment 都会创建一个相应的 SegmentParseV2 解析器对象，其核心字段如下：

```java
// 在解析过程中产生的 Segment 核心数据都会记录到 SegmentCoreInfo 中
private final SegmentCoreInfo segmentCoreInfo;
// 在解析 TraceSegment 过程中会碰到不同类型的 Span
// 会通过不同的 SpanListener 执行不同的操作
private final List<SpanListener> spanListeners;
```

SegmentCoreInfo 是一个 POJO，用于记录解析 TraceSegment 时产生的核心数据，作用类似于一个 DTO（后面会看到各个 SpanListener 都会从它这里拷贝 TraceSegment 的数据），其核心字段如下：

```java
// TraceSegment 编号，即 TraceSegment.traceSegmentId 。
private String segmentId;
private int serviceId; // Segment 所属的 Service 以及 ServiceInstance
private int serviceInstanceId;
private long startTime; // Segment 的开始时间和结束时间
private long endTime;
// 如果 TraceSegment 范围内的任意一个 Span 被标记了 Error，则该字段会被设置为true
private boolean isError;
// TraceSegment 开始时间窗口(即第一个 Span 开始时间所处的分钟级时间窗口)
private long minuteTimeBucket;
// 整个 TraceSegment 的字节数据
private byte[] dataBinary;
private boolean isV2; // 是否为 V2 版本的 TraceSegment 数据
```

这里的 SpanListener 接口分为 GlobalTraceIdsListener、FirstSpanListener、LocalSpanListener、EntrySpanListener、ExitSpanListener 五个子接口，不同类型的子接口监听 SegmentParseV2 解析过程中产生的不同数据，如下图所示：


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image/M00/1B/D7/CgqCHl7fSYqALG1gAAGuE9qIaPk072.png"/> 


而这五个子接口的真正实现类只有 SegmentSpanListener 三个，默认情况下都会添加到 spanListeners 集合中。

在 SegmentParseV2.parse() 中的第一步就是初始化 spanListeners 集合，将这三个实现类的对象添加到 spanListeners 集合中。

第二步会从 UpstreamSegment 中读取 TraceSegment 的数据，其中主要包括：

1. 与该 TraceSegment 关联的全部 TraceId 。
2. 反序列化 TraceSegment 关联的元数据以及 Span 数据，得到对应的 SegmentObject 对象。

该步骤相关代码如下：

```java
UpstreamSegment upstreamSegment = bufferData.getMessageType();
// 获取该 TraceSegment 关联的全部 TraceId
List<UniqueId> traceIds = upstreamSegment.getGlobalTraceIdsList();
// 反序列化 UpstreamSegment.segment，得到 SegmentObject 对象
SegmentObject segmentObject = parseBinarySegment(upstreamSegment));
// 将 SegmentObject 封装成 SegmentDecorator
SegmentDecorator segmentDecorator = new SegmentDecorator(segmentObject);
```

这里先帮助你回顾一下，Unique 中封装了三个 long，这三个 long 拼接起来就是一个 TraceId，这与前面介绍的 DistributedTraceId 一致。

SegmentObject 中封装了 TraceSegment 的全部信息，其中包括 TraceSegmentId、serviceId、serviceInstanceId 以及每个 Span 的数据（封装在 SpanObjectV2 中）。在 SpanObjectV2 中封装了一个 Span 的全部信息，例如：spanId、parentSpanId、startTime、endTime 等等（全部字段可以参考 apm-protocol/apm-network/src/main/proto/language-agent-v2/trace.proto 文件）。

### StandardBuilder

SegmentParseV2 解析得到的 SegmentObject 会立即封装到 SegmentDecorator 中，它是 StandardBuilder 接口的实现类，如下图所示：


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image/M00/1B/D7/CgqCHl7fSZuAcM1EAAG3Hx3xP4Y420.png"/> 


为了更清晰的说明 StandardBuilder 对象的作用，这里以 SpanDecorator 为例进行说明。在 SpanDecorator 底层封装了 SpanObjectV2 对象以及其关联的 Builder 对象，如下所示：

```java
// 底层封装的 SpanObjectV2 对象
private SpanObjectV2 spanObjectV2;
// SpanObjectV2 关联的 Builder
private SpanObjectV2.Builder spanBuilderV2;
// Builder 是否已经创建
private boolean isOrigin = true;
```

SpanDecorator 暴露出来的主要是 SpanObjectV2 相应字段的 getter/setter 方法：

1. 其 getter 方法底层调用 SpanObjectV2 或是 Builder 相应的 getter 方法读取相应字段数据；
2. 其 setter 方法底层只能通过 Builder 的 setter 方法修改相应字段的数据（通过 isOrigin 字段确定 SpanBuilderV2 是否已经初始化，若未初始化则先进行初始化）。

以 SpanDecorator 中的 setComponentId() 方法为例进行介绍，其他方法的实现与其类似：

```java
public void setComponentId(int value) {
    if (isOrigin) { // 先检查 isOrigin，确定 spanBuilderV2 字段是否已经初始化
        toBuilder(); // 初始化 spanBuilderV2 字段，即创建 SpanObjectV2 关联的 Builder 对象
    }
   // 通过 Builder 完成更新（这里省略 V1 版本的相关代码）
   spanBuilderV2.setComponentId(value);
}
```

通过 SpanDecorator 装饰器的封装，屏蔽了底层 SpanObjectV2 和 SpanObjectV.Builder 切换的实现细节，外层可以像 POJO 那样直接使用 getter/setter 修改字段值。

最后，为什么不用 SegmentDecorator 进行举例呢？因为 SegmentDecorator 只提供了 getter 方法，而没有 setter 方法，用它举例可能会造成误导。

#### preBuild

下面回到 SegmentParseV2 继续介绍解析 TraceSegment 的过程。完成 TraceSegment 数据的读取和反序列化之后，接下来就是预构建（preBuild）操作。预构建操作分为很多步，我们一步步进行分析。整个过程会涉及上面提到的三个 SpanListener 接口实现类，TraceSegment 的数据会从 SegmentCoreInfo 中拷贝多份，流向不同的处理流程。这里为了防止混乱，先以 SegmentSpanListener 为主线进行分析，等你了解 SegmentParseV2 的整个处理流程之后，再介绍另外两个 SpanListener 实现的具体实现。

预构建首先会通过 notifyGlobalsListener() 方法将该 TraceSegment 关联的全部 TraceId 交给 GlobalTraceIdsListener 进行解析。GlobalTraceIdsListener 接口只定义了一个 parseGlobalTraceId() 方法，SegmentSpanListener 、MultiScopesSpanListener 都是该接口的实现类。SegmentSpanListener 首先会对 TraceId 进行采样，采样逻辑在 TraceSegmentSampler 中实现，采样的大致逻辑是计算 TraceId 中第三部分的 long 值（即线程内递增值）与 10000 取模，小于 sampleRate 即被采样（sampleRate 是在 application.yml 文件中配置的万分比采样率），采样的代码片段如下：

```java
long sampleValue = lastLong % 10000; 
if (sampleValue < sampleRate) {
    return true;
}
return false;
```

被采样的 TraceId 会记录到 SegmentSpanListener.segment 字段（Segment 类型）中：

```java
segment.setTraceId(traceIdBuilder.toString()); // 记录traceId
```

不仅是 TraceId，在后面会看到 SegmentSpanListener 将解析到的所有 TraceSegment 数据都记录到一个 Segment 对象（segment 字段）中。Segment 继承了 Source 抽象类，看到 Source 抽象类是不是很熟悉？当分析完一个 TraceSegment 之后，SegmentSpanListener 会将 Segment 传递给 SourceReceiver（sourceReceiver 字段）处理。SourceReceiver 前面也已经分析过了，其底层封装的 DispatcherManager 会根据 Source 的类型选择相应的 SourceDispatcher 进行分发。

预构建接下来的步骤叫 "exchange" ，该步骤主要实现字符串到 id 的转换。前文提到，Agent 会定期将 EndpointName、NetworkAddress 等一系列字符串同步到 OAP 生成相应 id，后续 Agent 生成的 Span 将不再携带这些字符串，而是携带相应的 id。如果在生成 Span 的时候，OAP 还未能及时为这些字符串生成相应 id，则 Agent 会继续使用字符串填充上述字段，后续由 OAP 完成字符串到 id 的转换，也就是这里的 exchange 步骤。

这里的 exchange 过程是通过 IdExchanger 接口实现的，IdExchange 接口有两个实现类，如下图所示：


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image/M00/1B/CC/Ciqc1F7fSaaAbOcSAAApWn6Htjw623.png"/> 


IdExchanger 接口只定义了一个 exchange() 方法，也是整个 exchange 过程的核心。下面先来分析 SpanIdExchanger 的实现，其核心字段如下：

```java
private final ServiceInventoryCache serviceInventoryCacheDAO;
private final IServiceInventoryRegister serviceInventoryRegister;
private final IEndpointInventoryRegister endpointInventoryRegister;
private final INetworkAddressInventoryRegister networkAddressInventoryRegister;
private final IComponentLibraryCatalogService componentLibraryCatalogService;
```

SpanIdExchanger 会依赖这些 Service 获取不同类型字符串对应的唯一 id 值。在 exchange() 方法实现主要处理了 Span 中三种数据的 id 转换：component、peer、operationName。这里以 peer 为例进行分析：

```java
// 这里的 standardBuilder 就是前面介绍的 SpanDecorator，用于读写SpanObjectV2 中的数据
int peerId = standardBuilder.getPeerId();
// 检测该 SpanObjectV2 的 peer 是否需要进行转换
if (peerId == 0 && !Strings.isNullOrEmpty(standardBuilder.getPeer())) {
    // 通过 NetworkAddressInventoryRegister 获取 peer 对应的 id
    peerId = networkAddressInventoryRegister.getOrCreate(standardBuilder.getPeer(),
            buildServiceProperties(standardBuilder));

    if (peerId == 0) { // 该 peer 字符串没有对应的id
        exchanged = false; 
    } else { // 记录 peerId，并清空 peer 字段
        standardBuilder.toBuilder();
        standardBuilder.setPeerId(peerId);
        standardBuilder.setPeer(Const.EMPTY_STRING);
    }
}
```

component 和 endpointName 的 id 转换逻辑类似，这里不再展开分析。

ReferenceIdExchanger 主要处理 TraceSegmentReference 中的 endpointName、parentEndpointName 以及 NetworkAddress 的 id 转换，具体的转换逻辑与上述逻辑类似，不再展开分析。

完成 exchange 操作之后，SegmentParseV2 会将解析到的 Segment 信息拷贝到 segmentCoreInfo 中暂存。

在预构建的最后，会根据 TraceSegment 中各个 Span 的类型，交给不同的 SpanListener 进行处理，大致实现代码如下：

```java
for (int i = 0; i < segmentDecorator.getSpansCount(); i++) {
    SpanDecorator spanDecorator = segmentDecorator.getSpans(i);
    // 针对 TraceSegment 中第一个 Span 的处理
    if (spanDecorator.getSpanId() == 0) { 
        notifyFirstListener(spanDecorator);
    }
    // 根据 SpanType 处理各个 Span
    if (SpanType.Exit.equals(spanDecorator.getSpanType())) {
        notifyExitListener(spanDecorator);
    } else if (SpanType.Entry.equals(spanDecorator.getSpanType())) {
        notifyEntryListener(spanDecorator);
    } else if (SpanType.Local.equals(spanDecorator.getSpanType())) {
        notifyLocalListener(spanDecorator);
    } 
}
```

下面我们深入到 notify\*Listener() 方法中，分析不同 SpanListener 实现对各个类型的 Span 的处理逻辑。

#### notifyFirstListener

notifyFirstListener() 方法会调用所有 FirstSpanListener 的 parseFirst() 方法处理 TraceSegment 中的第一个 Span，这里只有 SegmentSpanListener 实现了该方法，具体实现分为三步：

1. 检测当前 TraceSegment 是否被成功采样。
2. 将 segmentCoreInfo 中记录的 TraceSegment 数据拷贝到 segment 字段中。
3. 将 endpointNameId 记录到 firstEndpointId 字段，通过前面的分析我们知道，endpointNameId 在 Spring MVC 里面对应的是 URL，在 Dubbo 里面对应的是 RPC 请求 path 与方法名称的拼接。

SegmentSpanListener.parseFirst() 方法的具体实现代码如下：

```java
public void parseFirst(SpanDecorator spanDecorator, SegmentCoreInfo segmentCoreInfo) {
    if (sampleStatus.equals(SAMPLE_STATUS.IGNORE)) { 
        return; // 检测是否采样成功
    }
    long timeBucket = TimeBucket.getSecondTimeBucket(segmentCoreInfo.getStartTime());
    // 将 segmentCoreInfo 中记录的数据全部拷贝到 Segment 中
    segment.setSegmentId(segmentCoreInfo.getSegmentId());
    segment.setServiceId(segmentCoreInfo.getServiceId());
    segment.setServiceInstanceId(segmentCoreInfo.getServiceInstanceId());
    segment.setLatency((int)(segmentCoreInfo.getEndTime() - segmentCoreInfo.getStartTime()));
    segment.setStartTime(segmentCoreInfo.getStartTime());
    segment.setEndTime(segmentCoreInfo.getEndTime());
    segment.setIsError(BooleanUtils.booleanToValue(segmentCoreInfo.isError()));
    segment.setTimeBucket(timeBucket);
    segment.setDataBinary(segmentCoreInfo.getDataBinary());
    segment.setVersion(segmentCoreInfo.isV2() ? 2 : 1);
    // 记录 endpointNameId
    firstEndpointId = spanDecorator.getOperationNameId();
}
```

#### notifyEntryListener

在 notifyEntryListener() 方法中，会调用所有 EntrySpanListener 实现的 parseEntry() 方法对于 Entry 类型的 Span 进行处理。SegmentSpanListener.parseEntry() 方法只做了一件事，就是将 endpointNameId 记录到 entryEndpointId 字段中：

```java
entryEndpointId = spanDecorator.getOperationNameId();
```

#### notifyLocalListener

上述的三个 SpanListener 实现类中，全部都没有实现 LocalSpanListener 接口，所以在 trace-receiver-plugin 插件中并不会处理 Local 类型的 Span。

#### notifyExitListener

trace-receiver-plugin 插件中，只有 MultiScopesSpanListener 实现了 ExitSpanListener 接口，后面会单独介绍 MultiScopesSpanListener 对各类 Span 的处理，这里暂不展开。

到此，预构建（preBuild）操作就到此结束了。最后需要提醒的是，preBuild() 方法的返回值是一个 boolean 值，表示 exchange 操作是否已经将全部字符串转换成 id。

#### notifyListenerToBuild

如果预构建（preBuild）中的 exchange 过程已经将全部字符串转换成了相应的 id，则会通过 notifyListenerToBuild() 方法调用所有 SpanListener 实现的 build() 方法。这里重点来看 SegmentSpanListener 的实现：

1. 首先会检测 TraceSegment 是否已被采样，它只会处理被采样的 TraceSegment。
2. 设置 Segment 的 endpointName 字段。
3. 将 Segment 交给 SourceReceiver 继续处理。

### RecordStreamProcessor

SourceReceiver 底层封装的 DispatcherManager 会根据 Segment 选择相应的 SourceDispatcher 实现 ------ SegmentDispatcher 进行分发。

SegmentDispatcher.dispatch() 方法中会将 Segment 中的数据拷贝到 SegmentRecord 对象中。

SegmentRecord 继承了 StorageData 接口，与前面介绍的 RegisterSource 以及 Metrics 的实现类似，通过注解指明了 Trace 数据存储的 index 名称的前缀（最终写入的 index 是由该前缀以及 TimeBucket 后缀两部分共同构成）以及各个字段对应的 field 名称，如下所示：

```java
// @Stream 注解的 name 属性指定了 index 的名称(index 前缀)，processor 指定了处理该类型数据的 StreamProcessor 实现
@Stream(name = "segment", processor = RecordStreamProcessor.class...)
public class SegmentRecord extends Record {
    // @Column 注解中指定了该字段在 index 中对应的 field 名称
    @Setter @Getter @Column(columnName = "segment_id") private String segmentId;
    @Setter @Getter @Column(columnName = "trace_id") private String traceId;
    @Setter @Getter @Column(columnName = "service_id") private int serviceId;
    @Setter @Getter @Column(columnName = "service_instance_id") private int serviceInstanceId;
    @Setter @Getter @Column(columnName = "endpoint_name, matchQuery = true) private String endpointName;
    @Setter @Getter @Column(columnName = "endpoint_id") private int endpointId;
    @Setter @Getter @Column(columnName = "start_time") private long startTime;
    @Setter @Getter @Column(columnName = "end_time") private long endTime;
    @Setter @Getter @Column(columnName = "latency") private int latency;
    @Setter @Getter @Column(columnName = "is_error") private int isError;
    @Setter @Getter @Column(columnName = "data_binary") private byte[] dataBinary;
    @Setter @Getter @Column(columnName = "version") private int version;
}
```

在 SegmentRecord 的父类 ------ Record 中还定义了一个 timeBucket 字段（long 类型），对应的 field 名称是 "time_bucket"。

RecordStreamProcessor 的核心功能是为每个 Record 类型创建相应的 worker 链，这与前面介绍的 InventoryStreamProcessor 以及 MetricsStreamProcessor 类似。在 RecordStreamProcessor 中，每个 Record 类型对应的 worker 链中只有一个worker 实例 ------ RecordPersistentWorker。

与前面介绍的 MetricsPersistentWorker 类型，RecordPersistentWorker 负责 SegmentRecord 数据的持久化：


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image/M00/1B/D7/CgqCHl7fSbWALRYDAAEn3HDWLfM382.png"/> 


如上图所示，RecordPersistentWorker 也继承了 PersistentWorker，写入流程大致如下图所示：


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image/M00/1B/CC/Ciqc1F7fSbuAPPvbAAG3YJeCl48222.png"/> 


RecordPersistentWorker 有两个地方与 MetricsPersistentWorker 有些区别：

1. RecordPersistentWorker 中使用的 DataCache（以及 Window）实现是 NoMergeDataCache，它与 MergeDataCache 的唯一区别就是没有提供判断数据是否存在的 containKey() 方法，这样就只提供了缓存数据的功能，调用方无法合并重复数据。
2. 当 NoMergeDataCache 中缓存的数据到达阈值之后，RecordPersistentWorker 会通过 RecordDAO 生成批量的 IndexRequest 请求，Trace 数据没有合并的情况，所以 RecordDAO 以及 IRecordDAO 接口没有定义 prepareBatchUpdate() 方法。

RecordDAO.perpareBatchInsert() 方法的具体实现如下：

```java
public IndexRequest prepareBatchInsert(Model model, Record record) throws IOException {
    XContentBuilder builder = map2builder(storageBuilder.data2Map(record));
    // 生成的是最终 Index 名称，这里的 Index 由前缀字符串(即"segment")+TimeBucket 两部分构成
    String modelName = TimeSeriesUtils.timeSeries(model, record.getTimeBucket());
    // 创建 IndexRequest 请求
    return getClient().prepareInsert(modelName, record.id(), builder);
}
```

与 MetricsPersistentWorker 一样，RecordPersistentWorker 生成的全部 IndexRequest 请求会交给全局唯一的 BatchProcessEsDAO 实例批量发送到 ES ，完成写入。

到此，以 SegmentSpanListener 为主的 TraceSegment 处理线就介绍完了。

