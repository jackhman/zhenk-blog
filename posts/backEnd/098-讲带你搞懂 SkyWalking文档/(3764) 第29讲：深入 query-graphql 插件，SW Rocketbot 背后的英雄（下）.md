# 第29讲：深入query-graphql插件，SWRocketbot背后的英雄（下）

### TopN 查询

在 aggregation.graphqls 和 top-n-records.graphqls 两个 GraphQL Schema 文件中定义了所有关于 TopN 数据的查询，如下图所示：


<Image alt="Drawing 12.png" src="https://s0.lgstatic.com/i/image/M00/26/46/CgqCHl7xuW2AVBsLAAa7U3_glbg954.png"/> 


在分析 MultiScopesSpanListener 的课时中，我们了解到 OAP 可以从存储请求的相关 Trace 中解析得到慢查询信息并转换成 TopNDatabaseStatement 存储到 ES 中。 这里定义的 getTopNRecords() 方法就是用来查询此类 TopN 数据的，为了便于理解，这里以 DB 慢查询为例分析 getTopNRecords() 方法的实现。

在对应的 TopNRecordsQuery.getTopNRecords() 方法中，多个入参被封装成了一个 TopNRecordsCondition 对象，其中包含了如下信息：

```java
private int serviceId; // 查询哪个 DB的慢查询
private String metricName; // 查询的 Index别名，即 top_n_database_statement
private int topN; // 返回 N个耗时最大的慢查询，默认20
private Order order; // 排序方式，查询 DB慢查询自然是 DES
private Duration duration; // 查询的时间范围
```

请求会经过 TopNRecordsQuery -\> TopNRecordsQueryService -\> TopNRecordsQueryEsDAO 最终形成 SearchRequest 请求发送给 ElasticSearch，在 TopNRecordsQueryEsDAO 中会设置查询条件以及排序方式，相关代码片段如下：

```java
SearchSourceBuilder sourceBuilder = SearchSourceBuilder.searchSource();
BoolQueryBuilder boolQueryBuilder = QueryBuilders.boolQuery();
// 指定查询的时间范围
boolQueryBuilder.must().add(QueryBuilders.rangeQuery(TopN.TIME_BUCKET).gte(startSecondTB).lte(endSecondTB));
// 指定查询的 DB对应的 serviceId
boolQueryBuilder.must().add(QueryBuilders.termQuery(TopN.SERVICE_ID, serviceId));
sourceBuilder.query(boolQueryBuilder);
// 按照 latency进行排序，指定返回 topN条记录
sourceBuilder.size(topN).sort(TopN.LATENCY, order.equals(Order.DES) ? SortOrder.DESC : SortOrder.ASC);
SearchResponse response = getClient().search(metricName, sourceBuilder);
```

之后会将查询到的每个 Document 中的 statement、traceId 以及 latency 字段值封装成 TopNRecord 对象返回。

除了上述 DB 慢查询的 TopN 查询之外，在 AggregationQuery 中还提供了为 Service 、ServiceInstance 以及 Endpoint 提供了其他维度的 TopN查询，如下图所示：


<Image alt="Drawing 13.png" src="https://s0.lgstatic.com/i/image/M00/26/46/CgqCHl7xuYaALcPBAAQkaAzAsZQ746.png"/> 


简单介绍下这些方法的功能：

* getServiceeTopN()/getAllServiceInstanceTopN()/getAllEndpointTopN() 方法：按照 name 参数指定监控维度对所有 Service/ServiceInstance/Endpoint 进行排序并获取 TopN。

* getServiceInstance()/getEndpointTopN() 方法：在 serviceId 参数指定 Service 中，按照 name 参数指定的监控维度对 ServiceInstance/Endpoint 进行排序并获取 TopN。

在 SkyWalking Rocketbot 中我们可以看到 Global Top Throughout 的监控，如下图所示：


<Image alt="Drawing 14.png" src="https://s0.lgstatic.com/i/image/M00/26/3B/Ciqc1F7xuZKAHD0IAAA25djPgC4804.png"/> 


其底层是通过 getServiceTopN() 方法统计指定时间段内所有 Service 的 CPM 平均值并获取 Top10 实现的。这里就以该示例为主线介绍 AggregationQuery 查询的核心流程。

AggregationQuery 收到的请求会经过 AggregationQuery -\> AggregationQueryService -\> AggregationQueryEsDAO，其中会格式化查询起止时间、根据 DownSampling 生成相应的 Index 别名等操作，前面已经简单介绍过这些通用操作，不再重复。

在 AggregationQueryEsDAO.getServiceTopN() 方法中会构造 SearchRequest 的查询条件，如下所示：

```java
SearchSourceBuilder sourceBuilder = SearchSourceBuilder.searchSource();
// 指定查询的起止时间，示例中起止时间分别是201901072044~201901072059
sourceBuilder.query(QueryBuilders.rangeQuery(Metrics.TIME_BUCKET).lte(endTB).gte(startTB));
boolean asc = false; // 确定排序方式，示例中查询服务的吞吐量是从高到低排序的
if (order.equals(Order.ASC)) { asc = true; }
TermsAggregationBuilder aggregationBuilder = AggregationBuilders
    .terms(Metrics.ENTITY_ID) // 按照entity_id进行聚合，在以 service_cpm 为别名的 Index中 entity_id字段记录的是 serviceId
    .field(Metrics.ENTITY_ID)
    .order(BucketOrder.aggregation(valueCName, asc)) // 按照指定字段排序，示例中以 service_cpm 为别名的 Index会按照 value字段进行排序
    .size(topN) // 返回记录的数量，Skywalking Rocketbot传递的topN参数为10
    .subAggregation( // 根据 entity_id分组后会计算 valueCName字段的平均值，生成的新字段名称也为valueCName
        AggregationBuilders.avg(valueCName).field(valueCName)
    );
sourceBuilder.aggregation(aggregationBuilder);
// 发送SearchRequest请求
SearchResponse response = getClient().search(indexName, sourceBuilder);
```

完成查询之后会从 SearchResponse 中解析得到每个 Service 的 CPM 平均值，并封装成 TopNEntity 集合返回，具体实现如下：

```java
List<TopNEntity> topNEntities = new ArrayList<>();
Terms idTerms = response.getAggregations().get(Metrics.ENTITY_ID);
for (Terms.Bucket termsBucket : idTerms.getBuckets()) {
    TopNEntity topNEntity = new TopNEntity();
    topNEntity.setId(termsBucket.getKeyAsString()); // 获取 ServiceId
    Avg value = termsBucket.getAggregations().get(valueCName); // 获取 cpm平均值
    topNEntity.setValue((long)value.getValue());
    topNEntities.add(topNEntity);
}
return topNEntities;
```

在将 TopNEntitiy 集合返回给前端展示之前，还会在 AggregationService 中查询 ServiceInventoryCache 获取对应的 serviceName 并记录到 TopNEntity.name字段中，查询 ServiceInventoryCache 的过程前面已经详细分析过，这里不再重复。

AggregationQuery 提供的其他 TopN 查询与 getServiceTopN() 方法实现基本类似，相信你看完 getServiceTopN() 方法的分析之后，完全可以读懂其他方法的实现。

### TopologyQuery

首先请你回顾一下，在分析 MultiScopesSpanListener 的课时中，可以看到 OAP 会根据 Trace 的调用关系创建相应的 Relation 指标来记录调用链上的监控信息，例如，ServiceRelationServerCpmMetrics 指标记录了一个服务调用另一个服务的 cpm 值。

在 SkyWalking Rocketbot 中有一个"拓扑图"的视图，如下所示：


<Image alt="Drawing 15.png" src="https://s0.lgstatic.com/i/image/M00/26/46/CgqCHl7xuayAIvTUAAJojFh6YyE235.png"/> 


该拓扑图中展示的拓扑关系以及调用链上的指标数据是通过 query-graphql-plugin 插件提供的三个 get\*Topology() 方法实现的，如下图所示：


<Image alt="Drawing 16.png" src="https://s0.lgstatic.com/i/image/M00/26/3B/Ciqc1F7xubKAVtfzAAC2lq_kx4o043.png"/> 


在上述拓扑图展示的时候只需要请求 getGlobalTopology() 方法即可，在 TopologyQueryService.getGlobalTopology() 方法中会通过下面两个方法完成查询。

* loadServerSideServiceRelations() 方法：查询 Index 别名为 service_relation_server_side 的 Index，该类 Index 中只记录了服务端视角的调用关系，并没有记录其他指标信息。在前面示例中，该查询的结果如下图所示：


<Image alt="Drawing 17.png" src="https://s0.lgstatic.com/i/image/M00/26/46/CgqCHl7xubuAU0x0AApr3mz8Xig844.png"/> 


* loadClientSideServiceRelations() 方法：查询 Index 别名为 service_relation_client_side 的 Index，该类 Index 中只记录了客户端视角的调用关系，并没有记录其他指标信息。在前面示例中，该查询的结果如下图所示：


<Image alt="Drawing 18.png" src="https://s0.lgstatic.com/i/image/M00/26/46/CgqCHl7xucOAKVAYAAcAU9rWAdI587.png"/> 


接下来，TopologyQueryService 会将上述两个查询结果集合进行合并和整理，最终得到一个 Topology 对象。在 Topology 对象中包含两个集合。

* nodes 集合：包含了拓扑图中所有的节点信息，示例中的结果如下图所示，总共有 3 个节点，分别是 User、demo-webapp、demo-provider：


<Image alt="Drawing 19.png" src="https://s0.lgstatic.com/i/image/M00/26/3B/Ciqc1F7xucuAZ-UvAAiQRLtPrz8281.png"/> 


* calls 集合：包含了拓扑图中所有的边（即调用关系），示例中的结果如下图所示，总共有 2 条边，一条边是 User 调用 demo-webapp（即 1_2），另一条边是 demo-webapp 调用 demo-provider（即2_3）：


<Image alt="Drawing 20.png" src="https://s0.lgstatic.com/i/image/M00/26/3B/Ciqc1F7xudSAYy9DAAzv4IcETLc263.png"/> 


在侦察端面板中展示的监控图都是通过 getLinearIntValues() 方法查询相应 Index 实现的，例如上图中侦察端面板中展示的"平均响应时间"监控图，就是查询别名为 service_relation_server_resp_time 的这组 Index 实现的，其中指定了 entity_id 为 "2_3"（即 demo-webapp 调用 demo-provider 的这条调用链路的平均响应时间）。

除了查询完整的拓扑图之外，我们还可以以一个 Service 或 Endpoint 为中心进行拓扑图查询，分别对应前文提到的 getServiceTopology() 方法和 getEndpointTopology() 方法，这两个方法的查询逻辑与 getGlobalTopology() 方法基本类似，主要区别在于添加了 serviceId（或是 endpointId）的查询条件，具体实现不再展开，如果你感兴趣可以翻看一下源码。

### TraceQuery

在 SkyWalking Rocketbot 的"追踪"面板中，我们可以查询到所有收集到的 Trace 信息，如下图所示：


<Image alt="Drawing 21.png" src="https://s0.lgstatic.com/i/image/M00/26/3B/Ciqc1F7xueKAMOe1AAOBgdOJVb0240.png"/> 


该面板可以分为三个区域，在区域 1 中，我们可以选择 TraceSegment 关联的 Service、ServiceInstance 以及 Endpoint，这些下拉表中的数据是通过前文介绍的 MetadataQuery 查询到的。在区域 2 中展示了 TraceSegment 的简略信息，通过 queryBasicTraces() 方法查询得到，如下图所示。在区域 3 中展示了一条完整 Trace 的详细信息，通过 queryTrace() 方法查询得到，如下图所示。


<Image alt="Drawing 23.png" src="https://s0.lgstatic.com/i/image/M00/26/3B/Ciqc1F7xue6AFKXNAAEBPbJC8sE357.png"/> 


TraceQuery.queryBasicTraces() 方法的入参被封装成了一个 TraceQueryCondition

对象，其中包含了一些查询 Trace 简略信息的条件，如下所示：

* serviceId、serviceInstanceId、endpointId 字段：TraceSegment 关联的 Service、ServiceInstance、Endpoint。

* traceId 字段：指定 TraceSegment 的 traceId。

* queryDuration 字段：指定查询的时间跨度。

* minTraceDuration 和 maxTraceDuration 字段：指定 TraceSegment 耗时范围，只查询耗时在 minTraceDuration\~maxTraceDuration 之间的 Trace。

* traceState 字段：Trace 的状态信息，枚举，可选值有 ALL、SUCC、ERROR 三个值。

* queryOrder 字段：查询结果的排序方式，枚举，可选值有 BY_DURATION、BY_START_TIME 两个值。

* paging 字段：分页信息，类似于 SQL 语句中的 limit 部分，指定了此次查询的起始位置以及结果条数。

同样的，最终创建以及执行 SearchRequest 请求的逻辑在底层的 TraceQueryEsDAO 中，具体代码逻辑如下，基本与 TraceCondition 中的字段一一对应：

```java
SearchSourceBuilder sourceBuilder = SearchSourceBuilder.searchSource();
BoolQueryBuilder boolQueryBuilder = QueryBuilders.boolQuery();
sourceBuilder.query(boolQueryBuilder);
List<QueryBuilder> mustQueryList = boolQueryBuilder.must();
if (startSecondTB != 0 && endSecondTB != 0) { // 查询时间范围，即过滤 time_bucket字段
    mustQueryList.add(QueryBuilders.rangeQuery(SegmentRecord.TIME_BUCKET).gte(startSecondTB).lte(endSecondTB));
}
if (minDuration != 0 || maxDuration != 0) { // 查询TraceSegment的耗时范围，即过滤 latency字段
    RangeQueryBuilder rangeQueryBuilder = QueryBuilders.rangeQuery(SegmentRecord.LATENCY);
    if (minDuration != 0) { rangeQueryBuilder.gte(minDuration); }
    if (maxDuration != 0) { rangeQueryBuilder.lte(maxDuration); }
    boolQueryBuilder.must().add(rangeQueryBuilder);
}
if (!Strings.isNullOrEmpty(endpointName)) { // 过滤 endpoint_name字段
    String matchCName = MatchCNameBuilder.INSTANCE.build(SegmentRecord.ENDPOINT_NAME);
    mustQueryList.add(QueryBuilders.matchPhraseQuery(matchCName, endpointName));
}
if (serviceId != 0) { // 查询 TraceSegment所属的Service，即过滤 service_id字段
    boolQueryBuilder.must().add(QueryBuilders.termQuery(SegmentRecord.SERVICE_ID, serviceId));
}
if (serviceInstanceId != 0) { // 查询 TraceSegment所属的ServiceInstance，即过滤 service_instance_id字段
    boolQueryBuilder.must().add(QueryBuilders.termQuery(SegmentRecord.SERVICE_INSTANCE_ID, serviceInstanceId));
}
if (endpointId != 0) {// 查询 TraceSegment所属的 Endpoint，即过滤endpoint_id字段
    boolQueryBuilder.must().add(QueryBuilders.termQuery(SegmentRecord.ENDPOINT_ID, endpointId));
}
if (!Strings.isNullOrEmpty(traceId)) { // 查询 TraceSegment所属的 traceId，即过滤 trace_id字段
    boolQueryBuilder.must().add(QueryBuilders.termQuery(SegmentRecord.TRACE_ID, traceId));
}
switch (traceState) { // 查询 TraceSegment覆盖的逻辑是否发生异常，即过滤 is_error字段
    case ERROR:
        mustQueryList.add(QueryBuilders.matchQuery(SegmentRecord.IS_ERROR, BooleanUtils.TRUE));
        break;
    case SUCCESS:
        mustQueryList.add(QueryBuilders.matchQuery(SegmentRecord.IS_ERROR, BooleanUtils.FALSE));
        break;
}
switch (queryOrder) { // 查询得到的多个 TraceSegment的排序字段，可以按照 start_time字段或是 latency字段逆序排序
    case BY_START_TIME:
        sourceBuilder.sort(SegmentRecord.START_TIME, SortOrder.DESC);
        break;
    case BY_DURATION:
        sourceBuilder.sort(SegmentRecord.LATENCY, SortOrder.DESC);
        break;
}
sourceBuilder.size(limit); // 指定此次查询返回的Document个数
sourceBuilder.from(from); // 指定查询的起始位置
// 执行上述 SearchRequest请求，查询的是别名为 segment的Index
SearchResponse response = getClient().search(SegmentRecord.INDEX_NAME, sourceBuilder);
```

完成查询之后会将查询得到的所有 TraceSegment 的 segmentId、traceId、耗时（latency）、起始时间（startTime）以及 isError 状态封装成 BasicTrace 集合返回给前端进行展示，相应的逻辑比较简单，这里不再展开。

在"追踪"面板的区域 2 中展示了 BasicTrace 集合（即 TraceSegment 的简略信息）之后，我们可以点击任意一个 TraceSegment，可通过 queryTrace() 方法查询其所在 Trace 的全部 TraceSegment 并展示在区域 3 中，该请求会直接委托给 TraceQueryEsDAO.queryByTraceId() 方法，使用的 SearchRequest 请求比较简单：

```java
SearchSourceBuilder sourceBuilder = SearchSourceBuilder.searchSource();
// 精确匹配 trace_id字段
sourceBuilder.query(QueryBuilders.termQuery(SegmentRecord.TRACE_ID, traceId));
// 一条Trace中TraceSegment的个数上限默认是200，application.yml文件中有相应配置项可调整
sourceBuilder.size(segmentQueryMaxSize);
// 执行 SearchRequest请求，查询的依旧是别名为 segment的Index
SearchResponse response = getClient().search(SegmentRecord.INDEX_NAME, sourceBuilder);
```

查询完成之后会为每个 Document 创建相应的 SegmentRecord 对象（前面 trace-receiver-plugin 写入 ES 的时候也是用的该对象）并将 Document 中的字段填充到 SegmentRecord 对象的字段。

接下来会创建一个 Trace 对象作为请求返回值，主要分为下面两个操作：

1、创建 Trace 返回值，收集全部 Span 对象。

TraceQueryService 会逐个反序列化上述 SegmentRecord 中的 dataBinary 字段，拿到该 TraceSegment 中的所有 Span ，然后将这些 Span 统统记录到 Trace 对象的spans 集合中。记得在 Trace 数据写入的过程中，有字符串转换到唯一 id 的过程（即 Exchange 过程），这里填充 Trace.spans 集合的时候会完成 id 到可读的字符串的逆转换，比如，serviceId 会被恢复成 serviceName、endpointId 会被恢复成 endpointName、componentId 会被恢复成 componentName 等等，这些都会伴随着一些前面介绍过的 Cache 以及 ES 查询。另外，还会反序列化每个 Span 携带的额外信息。例如 Log 信息和 Tag 信息。

Trace 类以及 Span 类对应的是 GraphQL Schema 中的 Trace 以及 Span 定义，是 Java 与前端代码交互的 DTO，而 SegmentRecord 则是 OAP 内部以及 OAP 与 ElasticSearch 交互的 Domain，虽然都表示TraceSegment、字段类似、携带的信息差不多，但是使用的位置不同，是常见的一种解耦方式。

2、 排序 Span。

TraceQueryService 会按照 parentSpanId 排序 Trace.spans 集合中 Span 对象（父 Span 在前，子 Span 在后），大致实现如下：

```java
List<Span> sortedSpans = new LinkedList<>();
// 查找该Trace中最顶层的rootSpan，即第一个 Span
List<Span> rootSpans = findRoot(trace.getSpans());
rootSpans.forEach(span -> {
    List<Span> childrenSpan = new ArrayList<>();
    childrenSpan.add(span); 
    // 这里会递归查找当前span的子Span，并添加到sortedSpans这个List中
    findChildren(trace.getSpans(), span, childrenSpan);
    sortedSpans.addAll(childrenSpan);
});
// 重新设置 Trace.spans字段
trace.getSpans().clear();
trace.getSpans().addAll(sortedSpans);
return trace;
```

下面通过一个示例描述该递归排序 Span 的大致执行逻辑：


<Image alt="Drawing 24.png" src="https://s0.lgstatic.com/i/image/M00/26/47/CgqCHl7xuheAOMFAAATOX_NF5CU262.png"/> 


query-graphql-plugin 插件的分析就到此结束了，我们下一课时见。

