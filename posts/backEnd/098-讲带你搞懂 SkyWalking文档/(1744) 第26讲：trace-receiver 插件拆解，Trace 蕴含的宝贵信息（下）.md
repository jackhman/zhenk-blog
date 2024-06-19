# 第26讲：trace-receiver插件拆解，Trace蕴含的宝贵信息（下）

### MultiScopesSpanListener

接下来重点分析 MultiScopesSpanListener 这条支线对 TraceSegment 数据的处理。MultiScopesSpanListener 继承了 GlobalTraceIdsListener、ExitSpanListener、EntrySpanListener 三个接口，如下图所示：


<Image alt="Drawing 6.png" src="https://s0.lgstatic.com/i/image/M00/1B/C8/Ciqc1F7fR2GAbKuNAABGmRcouQo855.png"/> 


从 containsPoint() 方法实现中也可能看出， MultiScopesSpanListener 能够处理 TraceSegment 中的 TraceId、Entry 类型 Span 以及 Exit 类型 Span。按照前面 SegmentParseV2 解析 TraceSegment 的流程，下面将会按照 parseGlobalTraceId() 方法、parseEntry() 方法、parseExit() 方法、build() 方法的顺序依次介绍 MultiScopesSpanListener 逻辑。

#### parseGlobalTraceId

parseGlobalTraceId() 方法比较简单，主要是将 TraceSegment 中的第一个 UniqueId

拼接成 String 记录到 traceId 字段中，这里不再展开分析。

#### parseEntry

前文介绍中提到，在 EntrySpan 的 refs 字段中记录的一个（或多个） TraceSegmentReference ，分别指向了上一个（或是多个）上游系统的 TraceSegment，SkyWalking OAP 可以通过 TraceSegmentReference 将两个系统的调用关系串联起来。

MultiScopesSpanListener.parseEntry() 方法的核心就是来解析 EntrySpan.refs 字段中记录的全部 TraceSegmentReference 对象，为每一个 TraceSegmentReference 生成一个相应的 SourceBuilder 对象并记录下来（ entrySourceBuilders 字段，List 类型）。在 build() 方法中还会继续处理这些 SourceBuilder 对象。

在 SourceBuilder 中记录了上下游两个系统的基础信息，核心字段如下所示：

```java
// 上游系统的 service 信息、serviceInstance 信息以及 Endpoint 信息
@Getter @Setter private int sourceServiceId;
@Getter @Setter private String sourceServiceName;
@Getter @Setter private int sourceServiceInstanceId;
@Getter @Setter private String sourceServiceInstanceName;
@Getter @Setter private int sourceEndpointId;
@Getter @Setter private String sourceEndpointName;
// 下游系统的 service 信息、serviceInstance 信息以及 Endpoint 信息
@Getter @Setter private int destServiceId;
@Getter @Setter private String destServiceName;
@Getter @Setter private int destServiceInstanceId;
@Getter @Setter private String destServiceInstanceName;
@Getter @Setter private int destEndpointId;
@Getter @Setter private String destEndpointName;
// 当前系统的组件类型
@Getter @Setter private int componentId;
// 在当前系统中的耗时
@Getter @Setter private int latency;
// 当前系统是否发生Error
@Getter @Setter private boolean status;
@Getter @Setter private int responseCode; // 默认为0
@Getter @Setter private RequestType type; // 请求类型
// 调用关系中的角色，是调用方(Client)、被调用方(Server)还是代理(Proxy)
@Getter @Setter private DetectPoint detectPoint; 
// TraceSegment 起始时间所在分钟级时间窗口
@Getter @Setter private long timeBucket;
```

parseEntry() 方法解析 EntrySpan 中全部 TraceSegmentReference 的核心逻辑如下：

```java
// 记录 TraceSegment 起始的分钟级时间窗口
this.minuteTimeBucket = segmentCoreInfo.getMinuteTimeBucket();
for (int i = 0; i < spanDecorator.getRefsCount(); i++) {
    // 获取 TraceSegmentReference对应的的ReferenceDecorator
    ReferenceDecorator reference = spanDecorator.getRefs(i);
    // 创建对应的SourceBuilder
    SourceBuilder sourceBuilder = new SourceBuilder();
    // 记录上游系统的 serviceId、serviceInstanceId 以及 endpointId
    sourceBuilder.setSourceEndpointId(reference.getParentEndpointId());
    // 这里省略了针对 MQ 组件的特殊处理，如果你感兴趣可以翻一下代码
    sourceBuilder.setSourceServiceInstanceId(reference.getParentServiceInstanceId());
    sourceBuilder.setSourceServiceId(instanceInventoryCache.get(reference.getParentServiceInstanceId()).getServiceId());
    // 记录下游(当前)系统的 serviceId、serviceInstanceId 以及 endpointId
    sourceBuilder.setDestEndpointId(spanDecorator.getOperationNameId());
    sourceBuilder.setDestServiceInstanceId(segmentCoreInfo.getServiceInstanceId());
    sourceBuilder.setDestServiceId(segmentCoreInfo.getServiceId());
    sourceBuilder.setDetectPoint(DetectPoint.SERVER);
    // 记录当前组件的类型
    sourceBuilder.setComponentId(spanDecorator.getComponentId());
    // 这里将解析 EntrySpan 和 ExitSpan 都会设置的一些公共信息封装到了setPublicAttrs中
    setPublicAttrs(sourceBuilder, spanDecorator);
    // 将 SourceBuilder 记录到 entrySourceBuilders 集合中
    entrySourceBuilders.add(sourceBuilder);
}
```

#### parseExit

接下来， parseExit() 方法主要处理 ExitSpan ，其中会为每个 ExitSpan 创建相应的 SourceBuilder 对象，并将上游（当前）系统和下游系统的基础信息记录到其中，最后会将该 SourceBuilder 对象填充到 exitSourceBuilders 集合中，等待在 build() 方法中处理。

parseExit() 方法的实现逻辑与 parseEntry() 方法非常类似，大致如下：

```java
SourceBuilder sourceBuilder = new SourceBuilder();
// 记录下游系统的 serviceId、serviceInstanceId以及endpointId
int peerId = spanDecorator.getPeerId(); 
int destServiceId = serviceInventoryCache.getServiceId(peerId);
int mappingServiceId = serviceInventoryCache.get(destServiceId).getMappingServiceId();
// 如果存在 mappingServiceId,则更新下游系统的 serviceId，mappingServiceId 相关讲解在后面介绍
sourceBuilder.setDestServiceId(mappingServiceId);
int destInstanceId = instanceInventoryCache.getServiceInstanceId(destServiceId, peerId);
sourceBuilder.setDestEndpointId(spanDecorator.getOperationNameId());
sourceBuilder.setDestServiceInstanceId(destInstanceId);
// 记录当前(上游)系统的 serviceId、serviceInstanceId 以及 endpointId
sourceBuilder.setSourceEndpointId(Const.USER_ENDPOINT_ID);
sourceBuilder.setSourceServiceInstanceId(segmentCoreInfo.getServiceInstanceId());
sourceBuilder.setSourceServiceId(segmentCoreInfo.getServiceId());
sourceBuilder.setDetectPoint(DetectPoint.CLIENT);
// Client 角色
sourceBuilder.setComponentId(spanDecorator.getComponentId());
setPublicAttrs(sourceBuilder, spanDecorator);
// 将 SourceBuilder 记录到 exitSourceBuilders 集合中
exitSourceBuilders.add(sourceBuilder);
// 这里省略了对 DB 慢查询的特殊处理
```

在 SourceBuilder 中，除了填充上述 id 字段之外，还会记录这些 id 对应的字符串，这些字符串都是在 setPublicAttrs() 这个方法进行填充的，该方法在 parseEntry() 和 parseExit() 方法中都会出现，其核心实现代码如下：

```java
private void setPublicAttrs(SourceBuilder sourceBuilder, SpanDecorator spanDecorator) {
    // 计算 latency，即当前 Span 的时间跨度，在后面计算系统延迟的时候会用到
    long latency = spanDecorator.getEndTime() - spanDecorator.getStartTime();
    sourceBuilder.setLatency((int)latency);
    // 填充上下游系统中的 serviceName、serviceInstanceName 以及 endpointName
    sourceBuilder.setSourceServiceName(serviceInventoryCache.get(sourceBuilder.getSourceServiceId()).getName());
    sourceBuilder.setSourceServiceInstanceName(instanceInventoryCache.get(sourceBuilder.getSourceServiceInstanceId()).getName());
    sourceBuilder.setSourceEndpointName(endpointInventoryCache.get(sourceBuilder.getSourceEndpointId()).getName());
    sourceBuilder.setDestServiceName(serviceInventoryCache.get(sourceBuilder.getDestServiceId()).getName());
    sourceBuilder.setDestServiceInstanceName(instanceInventoryCache.get(sourceBuilder.getDestServiceInstanceId()).getName());
    sourceBuilder.setDestEndpointName(endpointInventoryCache.get(sourceBuilder.getDestEndpointId()).getName());
}
```

另外，setPublicAttrs() 方法中还会 latency 耗时，这个比较重要，后面计算相应监控值时比较关键，会详细说明该值的作用。

### All 相关指标

MultiScopesSpanListener.build() 方法主要负责将 entrySourceBuilders 和 exitSourceBuilders 两个集合中的全部 SourceBuilder 转换成相应的 Source 对象，然后交给 SourceReceiver 走 MetricsStreamProcessor 处理。

entrySourceBuilders 集合中的每个 SourceBuilder 对象都会生成多个 Source 对象，如下图所示。


<Image alt="Drawing 7.png" src="https://s0.lgstatic.com/i/image/M00/1B/C9/Ciqc1F7fR4CAWJP2AAQ7w0mOVog425.png"/> 


AllDispatcher 会将一个 All 对象转换成多个 AllP\*Metrics 对象，如下图所示：


<Image alt="Drawing 8.png" src="https://s0.lgstatic.com/i/image/M00/1B/C9/Ciqc1F7fR4eAUSGvAAIzGoF5axs249.png"/> 


前文提到，Metrics 抽象类是所有监控类的父类，其中只记录了该监控数据所在的分钟级窗口（timeBucket 字段）， 前面介绍的 JVM 相关的监控类涉及 SumMetrics 和 LongAvgMetrics 两个抽象类，分别用于计算 sum 值和平均值，具体的分析不再展开。

这里的 AllP\*Metrics 继承了PxxMetrics 抽象类，如下图所示，而 PxxMetrics 也继承了 Metrics 抽象类。


<Image alt="Drawing 9.png" src="https://s0.lgstatic.com/i/image/M00/1B/D4/CgqCHl7fR5KAF9wYAAI4moSl37k284.png"/> 


PxxMetrics 的核心字段如下：

```java
// 监控值的精度，默认是10毫秒级的监控
@Getter @Setter @Column(columnName = "precision") private int precision;
// 记录当前监控在时间窗口内的全部数据，IntKeyLongValueArray 继承了 ArrayList，其中每个元素都是 IntKeyLongValue 类型
@Getter @Setter @Column(columnName = "detail_group") private IntKeyLongValueArray detailGroup;
// 计算之后的监控结果
@Getter @Setter @Column(columnName = "value", isValue = true, function = Function.Avg) private int value;
// 分位数，例如，P99Metrics 中该字段值为 99，P90Metrics 中该字段值为90
private final int percentileRank;
// 用于合并相同监控值，其中 key 为监控值(降精度的)，value 记录了对应的IntKeyLongValue对象
private Map<Integer, IntKeyLongValue> detailIndex;
```

在 detailIndex 和 detailGroup 两个集合中的元素都是 IntKeyLongValue 类型，IntKeyLongValue 是一个KV结构，key 是降精度的监控值，value 是该监控值在当前时间窗口中出现的次数。

PxxMetrics 的核心是 combine() 方法，具体实现代码如下：

```java
public final void combine(@SourceFrom int value, @Arg int precision) {
    this.precision = precision; // 确定监控精度，默认为10，即10毫秒级别
    if (detailIndex == null) { // 初始化 detailIndex这个Map
        detailIndex = new HashMap<>();
        detailGroup.forEach(element -> detailIndex.put(element.getKey(), element));
    }
    int index = value / precision;
    IntKeyLongValue element = detailIndex.get(index);
    if (element == null) { // 创建 IntKeyLongValue 对象
        element = new IntKeyLongValue();
        element.setKey(index);
        element.setValue(1);
        // 记录到 detailGroup 和 detailIndex 集合中
        detailGroup.add(element);
        detailIndex.put(element.getKey(), element);
    } else {
        element.addValue(1); // 递增 value
    }
}
```

下面通过一个示例介绍 combine() 方法的执行过程。如下图所示：


<Image alt="Drawing 10.png" src="https://s0.lgstatic.com/i/image/M00/1B/D4/CgqCHl7fR5yAewjnAADQAPU9JCQ196.png"/> 


假设此时的一个 AllP90Metrics 对象通过 combine() 方法合并另一个监控数据（latency=850ms, precision=10）时，会先进行降精度得到 index=85，然后在 detailIndex 集合中未查找到对应的元素，最后新建 IntKeyLongValue 并记录到 detailIndex 和 detailGroup 集合，如下图所示：


<Image alt="Drawing 11.png" src="https://s0.lgstatic.com/i/image/M00/1B/C9/Ciqc1F7fR6aAcH_jAALKBr8ccz8545.png"/> 


接下来又收到一个监控数据（latency=300ms, precision=10），在通过 combine() 方法合并时，detailIndex.get(300/10) 可以查找到对应的 IntKeyLongValue 元素，直接递增其 value 即可，如下图所示：


<Image alt="Drawing 12.png" src="https://s0.lgstatic.com/i/image/M00/1B/C9/Ciqc1F7fR62ANtWZAAJLuUbjfPw407.png"/> 


在开始介绍 PxxMetric 的 calculate() 方法实现之前，先来介绍一下 Pxx 这个指标的含义，这里以 P90 为例说明：计算 P90 是在一个监控序列中，找到一个最小的值，大于序列中 90% 的监控值。

PxxMetric.calculate() 方法具体实现如下：

```java
public final void calculate() {
    Collections.sort(detailGroup); // 排序detailGroup
    // 计算该窗口监控点的总个数
    int total = detailGroup.stream().mapToInt(element -> (int)element.getValue()).sum();
    // 查找指定分位数的位置
    int roof = Math.round(total * percentileRank * 1.0f / 100);
    int count = 0;
    for (IntKeyLongValue element : detailGroup) {
        // 累加监控点个数，直至到达(或超过)上面的 roof 值，此时的监控值即为指定分位数监控值
        count += element.getValue(); 
        if (count >= roof) {
            value = element.getKey() * precision;
            return;
        }
    }
}
```

这里接着上例进行分析，该 AllP90Metrics 在计算 P90 值的时候，会先根据监控值（即IntKeyLongValue 中的 key）对 detailGroup 进行排序（如下图所示），然后计算 roof 值得到 9 ，最后累加 count 找到 \>= roof 值的位置，此位置记录的监控值即为该时间窗口的 P90 值（即图中 100\*10=1000ms）。


<Image alt="Drawing 13.png" src="https://s0.lgstatic.com/i/image/M00/1B/C9/Ciqc1F7fR8GARLdiAAEbWCXQjI0237.png"/> 


PxxMetrics 的核心实现到这里就介绍完了，这也是 P*Metrics 抽象类以及 AllP*Metrics 实现类的核心逻辑。

最后，根据前文对 Model 的介绍，每个 AllP\*Metrics 在 ES 中有四个对应的 Index 名称分别是：

```java
all_p*-20200115
all_p*_hour-20200115
all_p*_day-20200115
all_p*_month-202001
```

前文提到，每个 Metrics 对象对应 Document 的 id 是由其 id() 方法生成的， AllP\*Metrics.id() 方法都是直接其所在的时间窗口：

```java
public String id() {
    return String.valueOf(getTimeBucket());
}
```

MetricsAggregateWorker 和 MetricsPersistentWorker 处理 Metrics 的时候，会根据 Map.containKey() 方法确定需要合并的 Metrics 对象，最终是通过 Metrics 实现的 hashCode() 和 equals() 方法进行比较的，多数 Metrics 实现的 equals() 方法比较的字段就是 id() 方法中用于构成 Document Id 的字段，例如：这里的 AllP\* Metrics.equals() 方法比较的是时间窗口（即 getTimeBucket() 方法的返回值），JVM 小节介绍的 InstanceJvmOldGcTimeMetrics 对应的 Document Id 是由 serviceInstanceId 和 timeBucket 两部分构成，equals() 方法也是比较这两个字段。

最后，我们以 AllP90Metrics 为例，看一下 AllP\* Metrics 在 ElasticSearch 存储的 Document 内容是什么样子：

```java
{
  "_index": "all_p90-20191209",  # Index 名称
  "_type": "type",
  "_id": "201912091056", # Document Id
  "_version": 2, 
  "_score": 1,
  "_source": { 
    "precision": 10, # 精度，10ms 精度
    "time_bucket": 201912091056, # 时间窗口
    "value": 2010,   # 计算之后的value值，即 P90 值
    "detail_group": "200,1|201,1" # 该时间窗口内的全部监控数据(10ms精度)
  }
}
```

在 AllDispatcher 中除了生成多个 AllP\*Metrics 对象之外，还会生成一个 AllHeatmapMetrics 对象。AllHeatmapMetrics 提供了热图（Heatmap）功能，热图的核心逻辑是在其父类 ThermodynamicMetrics 中实现的 ，其继承关系如下图所示：


<Image alt="Drawing 14.png" src="https://s0.lgstatic.com/i/image/M00/1B/D5/CgqCHl7fR8uAUZkXAAAyr8M-ZaI851.png"/> 


抽象类 ThermodynamicMetrics 的核心逻辑是将监控点按照 latency 分为多个区间，每个区间的跨度是 100ms，总共 20 个区间，并统计每个区间中监控点的个数。

ThermodynamicMetrics 的核心字段与前面介绍的 PxxMetrics 类似，只不过 IntKeyLongValue 中的 key 值含义变成了区间编号：

```java
@Getter @Setter @Column(columnName = STEP) private int step = 0; // 每个区间的时间跨度，默认 100ms
@Getter @Setter @Column(columnName = NUM_OF_STEPS) private int numOfSteps = 0; // 区间总数，默认20
// 用于记录每个区间中监控点的个数，IntKeyLongValue 中，key 是区间编号，value 是该区间点的个数
@Getter @Setter @Column(columnName = DETAIL_GROUP, isValue = true) private IntKeyLongValueArray detailGroup = new IntKeyLongValueArray(30);
// key 是区间编号，value 是区间对应的 IntKeyLongValue 对象，用于快速查找区间数据
private Map<Integer, IntKeyLongValue> detailIndex;
```

ThermodynamicMetrics.combine() 方法的实现与 PxxMetrics 基本类似，calculate() 方法为空实现（因为 heatmap 结果已经在 detailGroup 字段中存储了，无须单独计算）。这里不再展开分析，如果你感兴趣可以参考源码进行分析。

### Service 相关指标

MultiScopesSpanListener.entrySourceBuilders 集合中的每个 SourceBuilder 元素还会生成 一个 Service 对象，在 ServiceDispatcher 中会将一个 Service 对象转换成多个 Metrics 对象，如下图所示：


<Image alt="Drawing 15.png" src="https://s0.lgstatic.com/i/image/M00/1B/C9/Ciqc1F7fR9aAdAr3AAIOl5wa4Bo103.png"/> 



<Image alt="Drawing 16.png" src="https://s0.lgstatic.com/i/image/M00/1B/C9/Ciqc1F7fR92AfwMGAAAARmu_22A208.png"/> 


ServiceP\* Metrics 与前面介绍的 AllP\* Metrics 类似，也继承了 PxxMetrics 抽象类，如下图所示：


<Image alt="Drawing 17.png" src="https://s0.lgstatic.com/i/image/M00/1B/C9/Ciqc1F7fR-eAO-uWAAJvFQm4-p0823.png"/> 


与 AllP\*Metrics 的不同之处主要有两点：

1. Index 名称。ServiceP\*Metrics 对应的 Index 名称为：

```java
service_p*-20200115
service_p*_hour-20200115
service_p*_day-20200115
service_p*_month-20200115
```

2. Document ID 结构。ServiceP\*Metrics 对应的 Document Id 由 serviceId + timeBucket 两部分构成。显然，计算的维度不同，例如，ServiceP90Metrics 会将同一时间窗口内、同一 Service 的 P90 监控数据合并到一个 Document 中存储，而 AllP90Metrics 则是将同一时间窗口内的全部 Service 的 P90 监控数据合并到一个 Document 中存储。

接下来看 ServiceCpmMetrics，它统计的是一个 Service 一分钟请求的次数，继承关系如下图所示：


<Image alt="Drawing 18.png" src="https://s0.lgstatic.com/i/image/M00/1B/C9/Ciqc1F7fR_WAHPZxAAB7CBwbRyA669.png"/> 


SkyWalking 不仅会统计 Service 级别的 cpm 监控，还会统计 ServiceInstance 、Endpoint 以及 Relation 的 cpm 监控，它们都继承了 CPMMetrics 抽象类，CPMMetrics 有两个核心字段：一个是 total 字段（long 类型）记录了请求总量，在 combine() 方法中会累加该 total 字段；另一个是 value 字段（long 类型），它记录了 total / 分钟数的结果，该计算是在 calculate() 方法中完成的。

这就是所有 CPMMetrics 实现的核心逻辑，不同之处只在于 Index 名称以及 Document Id 的构成。这里，ServiceCpmMetrics 对应的 Index 为：

```java
service_cpm-20200115
service_cpm_hour-20200115
service_cpm_day-20200115
service_cpm_month-202001
```

其中 Document Id 也是由 ServiceId 以及 timeBucket 两部分构成（后面介绍的其他 ServiceSlaMetrics、ServiceRespTimeMetrics 皆是如此）。

ServiceSlaMetrics 用于计算一个 Service 的 Sla。Sla（Service level agreement，服务等级协议）对于互联网公司来说，其实就是一个服务可用性的保证。一般用百分比表示，该值越大，表示服务可用时间越长，服务更可靠，停机时间越短，反之亦然。

SkyWalking 除了会计算 Service 的 Sla 指标，还会计算 ServiceInstance、Endpoint 等的 Sla，如下图所示，它们都继承了 PercentMetrics 抽象类，PercentMetrics 实现了计算 Sla 的核心逻辑：


<Image alt="Drawing 19.png" src="https://s0.lgstatic.com/i/image/M00/1B/D5/CgqCHl7fSACAK908AAAARmu_22A884.png"/> 



<Image alt="Drawing 20.png" src="https://s0.lgstatic.com/i/image/M00/1B/D5/CgqCHl7fSAqAI_LVAAE9CtYG6Z8919.png"/> 


在 PercentMetrics 中的 total 字段（long 类型）记录了请求总量，match 字段（long 类型）记录了正常请求（EntrySpan.isError = true）的总量，combine() 方法合并两个 PercentMetrics 时，实际上是累加这两个字段。 percentage 字段记录了 match \*10000 / total 的结果值（即 sla 值，该运算在 calculate() 方法中完成）。

ServiceSlaMetrics 对应的 Index 名称以及其中 Document Id 的格式与前面介绍的 ServiceCpmMetrics 类似，这里不再重复。

Service 相关的最后一个监控指标是 ServiceRespTimeMetrics ，用于统计 Service 的响应时间。ServiceRespTimeMetrics 与前面介绍的 InstanceJvmOldGcTimeMetrics 基本类似，继承了 LongAvgMetrics，其中记录了一个 Service 在一个时间窗口内的总耗时（summation 字段）以及请求个数（count，即监控点的个数），并计算平均值（value = summation / count）作为 Service 响应耗时。

ServiceRespTimeMetrics 对应的 Index 名称以及其中 Document Id 的格式与前面介绍的 ServiceCpmMetrics 类似，这里不再重复。

### ServiceInstance 相关指标

这里 ServiceInstance 相关的有 ServiceInstanceSlaMetrics、ServiceInstanceRespTimeMetrics、ServiceInstanceCpmMetrics 三个指标，它们分别从 Sla、响应时间（Response Time）以及每分钟请求数（Cpm）三个角度去衡量一个 ServiceInstance。


<Image alt="Drawing 21.png" src="https://s0.lgstatic.com/i/image/M00/1B/D5/CgqCHl7fSBSADOVYAADp1oyXZNI781.png"/> 


这三种指标的计算方式在前面的 Service 相关指标小节已经详细介绍过了，这里不再重复。需要注意的是 Index 名称的变化，以及 Document Id 的变化（由 InstanceId + timebucket 两部分构成）。

### Endpoint 相关指标

这里 Endpoint 相关的有 EndpointSlaMetrics、EndpointAvgMetrics、EndpointCpmMetrics、EndpointP\*Metrics 四类指标，它们分别从 Sla、平均响应时间、每分钟请求数（Cpm）以及多个分位数四个角度去衡量一个 Endpoint。


<Image alt="Drawing 22.png" src="https://s0.lgstatic.com/i/image/M00/1B/CA/Ciqc1F7fSCeAeOOCAADZWpkOhmE460.png"/> 


这些指标的相关实现不再展开分析，上述 Endpoint 指标对应的 Document 中，除了记录对应监控数据本身，还会记录关联的 serviceId 和 serviceInstanceId。

### Relation 指标

entrySourceBuilders 中的 SourceBuilder 对象会生成三个 Relation 类型的 Source 对象，Relation 表示的某种调用关系，例如：一个 ServiceRelation 对象记录了某两个 Service 之间的调用关系，一个 ServiceInstanceRelation 对象记录了某两个 ServiceInstance 之间的调用关系，一个 EndpointRelation 对象记录了某两个 Endpoint 之间的调用关系。

本课时将以 ServiceRelation 为例介绍 Relation 相关的指标，下图按照指标生成的位置分成了 Server 端和 Client 端两类：


<Image alt="Drawing 23.png" src="https://s0.lgstatic.com/i/image/M00/1B/CA/Ciqc1F7fSDCAdW4GAAKBRnkhCFc134.png"/> 


其中，Server 类型指标产生的位置对应被调用系统（接收请求者）的 EntrySpan，而 Client 类型指标产生位置对应调用系统（发起请求者）的 ExitSpan，大致如下图所示：


<Image alt="Drawing 24.png" src="https://s0.lgstatic.com/i/image/M00/1B/CA/Ciqc1F7fSDeAAHV4AAAARmu_22A770.png"/> 



<Image alt="Drawing 25.png" src="https://s0.lgstatic.com/i/image/M00/1B/CA/Ciqc1F7fSD6AbkzBAAEoxUOvcbE477.png"/> 


这样的话，在 entrySourceBuilders 集合中的 SourceBuilder 生成的都是 Server 端的 Relaiton 指标，而无法生成 Client 端的 Relation 指标，因为 entrySourceBuilders 集合是 EntrySpan 的处理结果。同理可知 exitSourceBuilders 集合，只会生成 Client 端的 Relation 指标。

理清 Server 端和 Client 端两个分类之后，下面选取 ServiceRelationServerCpmMetrics 为例继续分析， ServiceRelationServerCpmMetrics 这个指标表示的是上游系统（sourceService）每分钟调用下游系统（destService）的次数，继承了 CPMMetrics，核心计算方式不必多说，对应的 Index 与前面介绍的格式也是类似的，关键在于其 Document Id 的格式：

```java
timebucket_sourceServiceId_destServiceId
```

通过 Document Id 可以明确知道该 Document 记录了哪个上游系统在哪一个时间段调用了哪个下游系统多少次。其他的 Relation 指标也是类似的，具体指标的计算方式在前面都介绍过了，这里不再重复。  

MultiScopesSpanListener.build() 方法对 entrySourceBuilders 集合的处理逻辑到这里就分析完了。exitSourceBuilders 集合中的 SourceBuilder 对象会生成的 Client 端的 Relation 监控指标，这里就不再展开分析了，如果你感兴趣可以参考代码进行分析。

### ServiceMappingSpanListener

在 Agent 创建 ExitSpan 的时候，只知道下游系统的 peer 信息（remotePeer 或 peerId），在 MultiScopesSpanListener.parseExit() 方法中处理 ExitSpan 的时候，会通过下面这段代码将 peerId 转换成下游系统的 ServiceId：

```java
// 获取 peerId 在 service_inventory 中对应的 id
int destServiceId = serviceInventoryCache.getServiceId(peerId);
// 在 ServiceInventory 中有一个 mappingServiceId 字段，记录了 peerId 关联的真的 Service 的Id
int mappingServiceId = serviceInventoryCache.get(destServiceId).getMappingServiceId();
```

将 peerId 与对应 Service 的 serviceId 进行关联的逻辑是在 ServiceMappingSpanListener 中实现的。ServiceMappingSpanListener 的集成关系如下图所示：


<Image alt="Drawing 26.png" src="https://s0.lgstatic.com/i/image/M00/1B/D5/CgqCHl7fSEeAUq1LAAB7wN6gSQQ910.png"/> 


在 ServiceMappingSpanListener.parseEntry() 方法中，会遍历 EntrySpan.refs 字段中记录的全部 SegmentReference。正如前面内容所示，TraceSegmentRef 指向了上一个 TraceSegment，而上一个 TraceSegment 的基本信息会被封装成 ContextCarrier 对象随着请求一起传递过来的。上游系统的 Agent 在 ExitSpan 中创建 ContextCarrier 对象的时候，会将下游系统的 peerId（或是 peer 字符串）一起带上。这样的话，从 SegmentReference 中拿到的 peerId 即为当前服务暴露的地址对应的 peerId，将该 peerId 与当前服务的 ServiceId 的绑定即可。

ServiceMappingSpanListener.parseEntry() 方法的具体实现如下：

```java
if (spanDecorator.getRefsCount() > 0) {
    for (int i = 0; i < spanDecorator.getRefsCount(); i++) {
        // 获取 peerId (即 addressId)对应的 serviceId
        int serviceId = serviceInventoryCache.getServiceId(spanDecorator.getRefs(i).getNetworkAddressId());
        // 获取 addressId 关联的 serviceId，如果发现不一致，则创建ServiceMapping 对象并记录下来，等待更新该关联关系
        int mappingServiceId = serviceInventoryCache.get(serviceId).getMappingServiceId();
        if (mappingServiceId != segmentCoreInfo.getServiceId()) {
            ServiceMapping serviceMapping = new ServiceMapping();
            serviceMapping.setServiceId(serviceId);
            // 将 peerId (即addressId)与当前 serviceId 进行关联
            serviceMapping.setMappingServiceId(segmentCoreInfo.getServiceId());
            serviceMappings.add(serviceMapping);
        }
    }
}
```

ServiceMappingSpanListener.build() 方法实现比较简单：它会根据 serviceMappings 集合的记录更新 service_inventory 索引中的映射关系，这里不再展开分析，如果你感兴趣可以参考源码进行分析。

