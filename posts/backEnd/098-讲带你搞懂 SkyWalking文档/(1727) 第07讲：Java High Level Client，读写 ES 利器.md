# 第07讲：JavaHighLevelClient，读写ES利器

通过前面搭建 SkyWalking 的运行环境我们知道，SkyWalking OAP 后端可以使用多种存储对数据进行持久化，例如 MySQL、TiDB 等，默认使用 ElasticSearch 作为持久化存储，在后面的源码分析过程中也将以 ElasticSearch 作为主要存储进行分析。

### ElasticSearch 基本概念

本课时将快速介绍一下 ElasticSearch 的基本概念，如果你没有用过 ElasticSearch ，可以通过本小节迅速了解 ElasticSearch 中涉及的基本概念。Elasticsearch 是一个基于 Apache Lucene 的开源搜索引擎，无论在开源还是专业领域，Apache Lucene 可以被认为是迄今为止最先进、性能最好、功能最全的搜索引擎库。但是，Apache Lucene 只是一个工具库，本身使用也比较复杂，直接使用 Apache Lucene 对开发人员的要求比较高，需要检索方面的知识来理解它是如何工作的。ElasticSearch 使用 Java 对 Apache Lucene 进行了封装，提供了简单易用的 RESTful API，隐藏 Apache Lucene 的复杂性，降低了全文检索的编程门槛。

ElasticSearch 中有几个比较核心的概念，为了方便你理解，我将其与数据库中的概念进行映射，如下图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/03/81/Ciqah158kASATlQvAAApiOhG1PE953.png"/> 


注意：在老版本的 ElasticSearch 中，Index 和 Document 之间还有个 Type 的概念，每个 Index 下可以建立多个 Type，Document 存储时需要指定 Index 和 Type。从 ES 6.0 版本开始单个 Index 中只能有一个 Type，ES 7.0 版本以后将不建议使用 Type，ES 8.0 以后完全不支持 Type。

Document 是构建 Index 的基本单元。例如，一条订单数据就可以是一个 Document，其中可以包含多个 Field，例如，订单的创建时间、价格、明细，等等。Document 以 JSON 格式表示，Field 则是这条 JSON 数据中的字段，如下所示：

```java
{
  "_index": "order_index",
  "_type": "1",
  "_id": "kg72dW8BOCMUWGurIFiy",
  "_version": 1,
  "_score": 1,
  "_source": {
    "create_time": "2020-02-01 17:35:00",
    "creator": "xxxxx",
    "order_status": "NEW",
    "price": 100.00,
  }
}
```

Index 是具有某些类似特征的 Document 的集合，Index 与 Document 之间的关系就类似于数据库中 Table 与 Row 之间的关系。在 Index 中可以存储任意数量的 Document。在后续介绍的示例中可以看到，对 Document 的添加、删除、更新、搜索等操作，都需要明确的指定 Index 名称。

最后，还需要了解 ElasticSearch 中一个叫作 Index Template（模板）的概念。Index Template 一般会包含 settings、mappings、index_patterns 、order、aliases 几部分:

* index_patterns 负责匹配 Index 名称，Index Template 只会应用到名称与之匹配的 Index 上，而且 ElasticSearch 只会在 Index 创建的时候应用匹配的 Index Template，后续修改 Index Template 时不会影响已有的 Index。通过 index_patterns 匹配可以让多个 Index 重用一个 Index Template。
* settings 主要用于设置 Index 中的一些相关配置信息，如分片数、副本数、refresh 间隔等信息（后面会介绍分片数和副本数的概念）；
* mappings 主要是一些说明信息，类似于定义该 Index 的 schema 信息，例如，指定每个 Field 字段的数据类型；\>
* order 主要作用于在多个 Index Template 同时匹配到一个 Index 的情况，如果此时这些Index Template 中的配置出现不一致，则以 order 的最大值为准，order 默认值为 0。另外，创建 Index 的命令中如果自带了 settings 或 mappings 配置，则其优先级最高；
* aliases 则是为匹配的 Index 创建别名。我们可以通过请求[http://localhost:9200/_alias/\*](http://localhost:9200/_alias/*)获取所有别名与 Index 之间的对应关系。

下面是 SkyWalking 使用的 segment 模板，它会匹配所有 segment-\* 索引，segment-yyyyMMdd 索引是用来存储 Trace 数据的：

```java
{
    "segment": {
        "order": 0,
        "index_patterns": [
            "segment-*"
        ],
        "settings": {
            "index": {
                "refresh_interval": "3s",
                "number_of_shards": "2",
                "number_of_replicas": "0"
                // 省略 analysis字段设置
            }
        },
        "mappings": {
            "type": {
                "properties": {
                    "segment_id": {
                        "type": "keyword"
                    },
                    "trace_id": {
                        "type": "keyword"
                    },
                    "service_id": {
                        "type": "integer"
                    },
                    // 省略其他字段的设置
                }
            }
        },
        "aliases": { // 为匹配的Index创建别名
            "segment": {}
        }
    }
}
```

### 节点角色

一个 ElasticSearch 集群是由一个或多个节点组成，这些节点共同存储了集群中的所有数据，并且 ElasticSearch 提供了跨节点的联合索引和搜索功能。集群名称是一个 ElasticSearch 集群的唯一标识，在请求 ElasticSearch 集群时都需要使用到这个集群名称。在同一个网络环境中，需要保证集群名称不重复，否则集群中的节点可能会加入到错误的集群中。

ElasticSearch 集群是去中心化的，ElasticSearch 节点的相互发现是基于 Pull-Push 版本的 Gossip 算法实现的。Zen Discovery 是 ElasticSearch 默认的发现实现，提供了广播和单播的能力，帮助一个集群内的节点完成快速的相互发现。

ElasticSearch 集群中的节点有多个可选的角色，这些角色都是通过在节点的配置文件中配置的。

* Master Eligible Node （候选主节点）：可以被选举为 Master 的候选节点；
* Master Node （主节点）：完成节点发现阶段之后，才会进入主节点选举阶段，为了防止在网络分区的场景下出现脑裂问题，一般采用 quorum 版本的 Bully 算法变体（本课时重点是帮助你快速了解 ElasticSearch 基础知识，不展开该算法的具体原理）。所以，主节点是从候选主节点中选举出来的，主要负责管理 ElasticSearch 集群，通过广播的机制与其他节点维持关系，负责集群中的 DDL 操作（创建/删除索引），管理其他节点上的分片；
* Data Node（数据节点）：存放数据的节点，负责数据的增删改查；
* Coordinating Node（协调节点）：每个节点都是一个潜在的协调节点，协调节点最大的作用就是响应客户端的请求，将各个分片里的数据汇总起来一并返回给客户端，因此 ElasticSearch 的节点需要有足够的 CPU 和内存资源去处理汇总操作；
* Ingest Node（提取节点）：能执行预处理管道，不负责数据也不负责集群相关的事务。

### 分片\&副本

在 ElasticSearch 中的一个 Index 可以存储海量的 Document，单台机器的磁盘大小是无法存储的，而且在进行数据检索的时候，单台机器也存在性能瓶颈，无法为海量数据提供高效的检索。

为了解决上述问题，ElasticSearch 将单个 Index 分割成多个分片，创建 Index 时，可以按照预估值指定任意数量的分片。虽然逻辑上每个分片都属于一个 Index，但是单个分片都是一个功能齐全且独立的 Index，一个分片可以被分配到集群中的任意节点上。

通过分片的功能，Index 就有了容量水平扩展的能力，运维人员可以通过添加节点的方式扩充整个集群的容量。在处理检索请求时，不同的分片由不同的 ElasticSearch 节点进行检索，可以实现并发操作，这样也就可以大大提高检索性能。

最后，某条 Document 数据具体存储在哪个分片，完全由 ElasticSearch 的分片机制决定。当写入一条 Document 的时候，ElasticSearch 会根据指定的 key （默认是 ElasticSearch 自动生成的 Id，用户也可以手动指定）决定其所在的分片编号，计算公式如下：

```java
分片编号 = hash(key) % 主分片数量
```

主分片的数量决定了 Document 所在的分片编号，所以在创建 Index 之后，主分片数量不能改变。

在进行搜索时，每个分片产生的部分查询结果，也是由 ElasticSearch 集群负责进行聚合的，整个过程对于 Client 来说是透明的，如同操作一个单节点 ElasticSearch 实例。

单台服务器在实际使用中可能会因为这样或那样的原因发生故障，例如意外断电、系统崩溃、磁盘寿命到期等，这些故障是无法预知的。当发生故障时，该节点负责的分片就无法对外提供服务了，此时需要有一定的容错机制，在发生故障时保证此分片可以继续对外提供服务。

ElasticSearch 提供的副本功能就可以很好的解决这一问题，在副本模式下，每个分片分为主分片和副本分片，下图中一个 Index 有两个分片，p0 和 p1 是两个主分片，r0 和 r1 则是相应的副本分片：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/7C/97/Cgq2xl58kASAIlnSAAA2g6WmR_U791.png"/> 


副本带来了两个好处：一个是在主分片出现故障的时候，可以通过副本继续提供服务（所以，分片副本一般不与主分片分配到同一个节点上）；另一个就是查询操作可以在分片副本上执行，因此可以提升整个 ElasticSearch 查询性能。

### ElasticSearch 写入流程简介

分片是 ElasticSearch 中最小的数据分配单位，即一个分片总是作为一个整体被分配到集群中的某个节点。继续深入分片的结构会发现，一个分片是由多个 Segment 构成的，如下图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/03/81/Ciqah158kASAPMPyAABiTVfbZ1w517.png"/> 


Segment 是最小的数据存储单元，ElasticSearch 每隔一段时间会产生一个新的 Segment，用于写入最新的数据。旧的 Segment 是不可改变的，只能用于数据查询，是无法继续向其中写入数据的。

在很多分布式系统中都能看到类似的设计，这种设计有下面几点好处：

* 旧 Segment 不支持修改，那么在读操作的时候就不需要加锁，省去了锁本身以及竞争锁相关的开销；
* 只有最新的 Segment 支持写入，可以实现顺序写入的效果，增加写入性能；
* 只有最新的 Segment 支持写入，可以更好的利用文件系统的 Cache 进行缓存，提高写入和查询性能。

介绍完分片内部的 Segment 结构之后，接下来简单介绍一下 ElasticSearch 集群处理一个写入请求的大致过程：

写入请求会首先发往协调节点（Coordinating Node），之前提到，协调节点可能是 Client 连接上的任意一个节点，协调节点根据 Document Id 找到对应的主分片所在的节点。

接下来，由主分片所在节点处理写入请求，先是写入 Transaction Log 【很多分布式系统都有 WAL （Write-ahead Log）的概念，可以防止数据丢失】，而后将数据写入内存中，默认情况下每隔一秒会同步到 FileSystem Cache 中，Cache 中的数据在后续查询中已经可以被查询了，默认情况下每隔 30s，会将 FileSystem cache 中的数据写入磁盘中，当然为了降低数据丢失的概率，可以将这个时间缩短，甚至设置成同步的形式，相应地，写入性能也会受到影响。

写入其他副本的方式与写入主分片的方式类似，不再重复。需要注意的是，这里可以设置三种副本写入策略：

* quorum：默认为 quorum 策略，即超过半数副本写入成功之后，相应写入请求即可返回给客户端；
* one ：one 策略是只要成功写入一个副本，即可向客户端返回；
* all：all 策略是要成功写入所有副本之后，才能向客户端返回。

ElasticSearch 的删除操作只是逻辑删除， 在每个 Segment 中都会维护一个 .del 文件，删除操作会将相应 Document 在 .del 文件中标记为已删除，查询时依然可以查到，但是会在结果中将这些"已删除"的 Document 过滤掉。

由于旧 Segment 文件无法修改，ElasticSearch 是无法直接进行修改的，而是引入了版本的概念，它会将旧版本的 Document 在 .del 文件中标记为已删除，而将新版本的 Document 索引到最新的 Segment 中。

另外，随着数据的不断写入，将产生很多小 Segment 文件，ElasticSearch 会定期进行 Segment Merge，从而减少碎片文件，降低文件打开数，提升 I/O 性能。在 Merge 过程中可以同时根据 .del 文件，将被标记的 Document 真正删除，此时才是真正的物理删除。

### ElasticSearch 查询流程简介

读操作分为两个阶段：查询阶段和聚合提取阶段。在查询阶段中，协调节点接受到读请求，并将请求分配到相应的分片上（如果没有特殊指定，请求可能落到主分片，也有可能落到副本分片，由协调节点的负载均衡算法来确定）。默认情况下，每个分片会创建一个固定大小的优先级队列（其中只包含 Document Id 以及 Score，并不包含 Document 的具体内容），并以 Score 进行排序，返回给协调节点。如下图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/7C/97/Cgq2xl58kASAVIIqAADyYyiGJl0221.png"/> 


在聚合阶段中，协调节点会将拿到的全部优先级队列进行合并排序，然后再通过 Document ID 查询对应的 Document ，并将这些 Document 组装到队列里返回给客户端。

### High Level REST Client 入门

ElasticSearch 提供了两种 Java Client，分别是 Low Level REST Client 和 High Level REST Client，两者底层都是通过 HTTP 接口与 ElasticSearch 进行交互的：

* Low Level REST Client 需要使用方自己完成请求的序列化以及响应的反序列化；
* High Level REST Client 是基于 Low Level REST Client 实现的，调用方直接使用特定的请求/响应对象即可完成数据的读写，完全屏蔽了底层协议的细节，无需再关心底层的序列化问题。另外， High Level REST Client 提供的 API 都会有同步和异步( async 开头)两个版本，其中同步方法直接返回相应的 response 对象，异步方法需要添加相应的 Listener 来监听并处理返回结果。

SkyWalking 中提供的 ElasticSearchClient 是对 High Level REST Client 的封装，本课时将简单介绍 High Level REST Client 的基本操作，你可以将本课时作为 High Level REST Client 的入门参考，更加完整的 API 使用可以参考 ElasticSearch [官方文档](https://www.elastic.co/guide/en/elasticsearch/client/java-rest/7.5/java-rest-high.html)。

使用 High Level REST Client 的第一步就是初始化 RestHighLevelClient 对象，该过程底层会初始化线程池以及网络请求所需的资源，类似于 JDBC 中的 Connection 对象，相关 API 代码如下：

```java
RestHighLevelClient client = new RestHighLevelClient(
   RestClient.builder( // 指定 ElasticSearch 集群各个节点的地址和端口号
            new HttpHost("localhost", 9200, "http"),
            new HttpHost("localhost", 9201, "http")));
```

拿到 RestHighLevelClient 对象之后，我们就可以通过它发送 CreateIndexRequest 请求创建 Index，示例代码如下：

```java
// 创建 CreateIndexRequest请求，该请求会创建一个名为"skywalking"的 Index，
// 注意，Index 的名称必须是小写
CreateIndexRequest request = new CreateIndexRequest("skywalking");
// 在 CreateIndexRequest请求中设置 Index的 setting信息
request.settings(Settings.builder()
        .put("index.number_of_shards", 3)   // 设置分片数量
        .put("index.number_of_replicas", 2)  // 设置副本数量
);
// 在 CreateIndexRequest请求中设置 Index的 Mapping信息，新建的 Index里有
// 个user和message两个字段，都为text类型，还有一个 age字段，为 integer类型
request.mapping("type", "user", "type=text", "age", "type=integer", 
   "message", "type=text");
// 设置请求的超时时间
request.timeout(TimeValue.timeValueSeconds(5));
// 发送 CreateIndex请求
CreateIndexResponse response = client.indices().create(request);
// 这里关心 CreateIndexResponse响应的 isAcknowledged字段值
// 该字段为 true则表示 ElasticSearch已处理该请求
boolean acknowledged = response.isAcknowledged();
Assert.assertTrue(acknowledged);
```

完成 Index 的创建之后，我们就可以通过 IndexRequest 请求向其中写入 Document 数据了，需要使用 RestHighLevelClient 发送 IndexRequest 实现 Document 的写入：

```java
// 创建 IndexRequest请求，这里需要指定 Index名称
IndexRequest request = new IndexRequest("skywalking"); 
request.type("type");
request.id("1");  // Document Id，不指定的话，ElasticSearch 为其自动分配
// Document的具体内容
String jsonString = "{" +
        "\"user\":\"kim\"," +
        "\"postDate\":\"2013-01-30\"," +
        "\"age\":29," +
        "\"message\":\"trying out Elasticsearch\"" +
        "}";
request.source(jsonString, XContentType.JSON);
// 发送 IndexRequest请求，不抛异常，就是创建成了
IndexResponse response = client.index(request);
System.out.println(response);
// 输出如下：
// IndexResponse[index=skywalking,type=type,id=1,version=1,
// result=created,seqNo=0,primaryTerm=1,shards=
// {"total":3,"successful":1,"failed":0}]
// -----------------------
// IndexResponse 中包含写入的 Index名称、Document Id，Document 版本，创建的
// result等重要信息
```

在明确知道 Document 的 Id 以及所属的 Index 时，我们可以通过 GetRequest 请求查询该 Document 内容，相关代码如下：

```java
try {
    // 创建 GetRequest请求，这里指定 Index、type以及 Document Id，
    // 在高版本中，type参数已经消失
    GetRequest request = new GetRequest("skywalking", "type", "1");
    // 发送 GetRequest请求
    GetResponse response = client.get(request);
    // 从 GetResponse响应中可以拿到相应的 Document以及相关信息
    String index = response.getIndex(); // 获取 Index名称
    String id = response.getId();// 获取 Document Id
    if (response.isExists()) { // 检查 Document是否存在
        long version = response.getVersion(); // Document版本
        System.out.println("version:" + version);
        // 获取不同格式的 Document内容
        String sourceAsString = response.getSourceAsString();
        System.out.println("sourceAsString:" + sourceAsString);
        Map<String, Object> sourceAsMap = response.getSourceAsMap();
        System.out.println("sourceAsMap:" + sourceAsMap);
        byte[] sourceAsBytes = response.getSourceAsBytes();
        // 按照字段进行遍历
        Map<String, DocumentField> fields = response.getFields();
        for (Map.Entry<String, DocumentField> entry : 
                 fields.entrySet()) {
            DocumentField documentField = entry.getValue();
            String name = documentField.getName();
            Object value = documentField.getValue();
            System.out.println(name + ":" + value);
        }
    } else {
        System.out.println("Document Not Exist!");
    }
} catch (ElasticsearchParseException e) { // Index不存在的异常
    if (e.status() == RestStatus.NOT_FOUND) {
        System.err.println("Can find index");
    }
}
// 输出如下：
// version:1
// sourceAsString:{"user":"kim","postDate":"2013-01-30",
// "age":29,"message":"trying out Elasticsearch"}
// sourceAsMap:{postDate=2013-01-30, message=trying out Elasticsearch, 
// user=kim, age=29}
// _seq_no:0
// _primary_term:1
```

有时候，我们只想检测某个 Document 是否存在，并不想查询其具体内容，可以通过 exists() 方法实现。该方法发送的还是 GetRequest 请求，但我们可以指明此次请求不查询 Document 的具体内容，在 Document 较大的时候可以节省带宽，具体使用方式如下：

```java
GetRequest request = new GetRequest("skywalking", "type", "1");
// 不查询 "_source"字段以及其他字段
request.fetchSourceContext(new FetchSourceContext(false));
request.storedFields("_none_");
// 通过exists()方法发送 GetRequest
boolean exists = client.exists(request);
Assert.assertTrue(exists);
```

删除一个 Document 的时候，使用的是 DeleteRequest，其中需要指定 Document Id 以及所属 Index 即可，使用方式如下：

```java
DeleteRequest request = new DeleteRequest("skywalking", "type", "1");
DeleteResponse response = client.delete(request);
System.out.println(response);
// 输出：
// DeleteResponse[index=skywalking,type=type,id=1,version=5,
// result=deleted,shards=ShardInfo{total=3, successful=1,
// failures=[]}]
```

最后来看看更新操作，使用的是 UpdateRequest，示例如下：

```java
XContentBuilder builder = XContentFactory.jsonBuilder();
builder.startObject();
{
    builder.field("age", 30);
    builder.field("message", "update Test");
}
builder.endObject();
// 创建 UpdateReques请求
UpdateRequest request = new UpdateRequest("skywalking", 
     "type","1").doc(builder);
// 发送请求
UpdateResponse updateResponse = client.update(request);
System.out.println(updateResponse);
// 输出：
// UpdateResponse[index=skywalking,type=type,id=1,version=2,seqNo=1,
// primaryTerm=1,result=updated,shards=ShardInfo{total=3, 
// successful=1, failures=[]}]
// 注意，更新之后 Document version 会增加
```

除了通过 GetRequest 请求根据 Document Id 进行查询之外，我们还可以通过 SearchRequest 请求进行检索，在检索请求里面我们可以通过 QueryBuilder 构造具体的检索条件，下面是一个简单的示例：

```java
// 创建 SearchRequest请求
SearchRequest searchRequest = new SearchRequest("skywalking");
// 通过 SearchSourceBuilder,用来构造检索条件
SearchSourceBuilder searchSourceBuilder = new SearchSourceBuilder();
// 通过id进行检索，这里查询 Id为1和2的两个Document
searchSourceBuilder.query(QueryBuilders.idsQuery().addIds("1", "2"));
searchRequest.source(searchSourceBuilder);
// 发送 SearchRequest 请求
SearchResponse searchResponse = client.search(searchRequest);
// 遍历 SearchHit
SearchHit[] searchHits = searchResponse.getHits().getHits();
for (SearchHit searchHit : searchHits) {
    System.out.println(searchHit.getId() + ":" + 
       searchHit.getSourceAsMap());
}
// 输出：
// 1:{postDate=2013-01-30, message=update Test, user=kim, age=31}
// 2:{postDate=2020-01-30, message=Test Message, user=Tom, age=51}
```

按照 Document Id 进行查询之外，ElasticSearch 还提供了一套 Query DSL 语言帮助我们构造复杂的查询条件，查询条件主要分为下面两部分：

* **Leaf 子句** ：Leaf 子句一般是针对某个字段的查询，例如：
  * **Match Query** ：最常用的 Full Text Query 。Match Query 既能处理全文字段，又能处理精确字段（可参考：[Match Query 的官方文档](https://www.elastic.co/guide/en/elasticsearch/reference/7.5/query-dsl-match-query.html)）。
  * **Term Query** ：精确匹配字段值的查询（可参考：[Term Query 的官方文档](https://www.elastic.co/guide/en/elasticsearch/reference/7.5/query-dsl-term-query.html)。
  * **Range Query** ：针对一个字段的范围查询（可参考：[Range Query 的官方文档](https://www.elastic.co/guide/en/elasticsearch/reference/7.5/query-dsl-range-query.html)。
* **Compound 子句** ：Conpound 子句是由一个或多个 Leaf 子句或 Compound 子句构成的，例如 Bool Query，包含多个返回 Boolean 值的子句（可参考：[Bool Query 的官方文档](https://www.elastic.co/guide/en/elasticsearch/reference/7.5/query-dsl-bool-query.html)）。

下面使用 ElasticSearch Query DSL 实现一个复杂查询：

```java
// 创建 SearchRequest请求，查询的Index为skywalking
SearchRequest searchRequest = new SearchRequest("skywalking");
// 通过 SearchSourceBuilder,用来构造检索条件
SearchSourceBuilder sourceBuilder = 
       SearchSourceBuilder.searchSource();
// 创建 BoolQueryBuilder
BoolQueryBuilder boolQueryBuilder = QueryBuilders.boolQuery();
// 符合条件的 Document中 age字段的值必须位于[10,40]这个范围
List<QueryBuilder> mustQueryList = boolQueryBuilder.must();
mustQueryList.add(QueryBuilders.rangeQuery("age").gte(10));
mustQueryList.add(QueryBuilders.rangeQuery("age").lte(40));
// 符合条件的 Document中 user字段的值必须为kim
boolQueryBuilder.must().add(
    QueryBuilders.termQuery("user", "kim"));
sourceBuilder.query(boolQueryBuilder);
searchRequest.source(sourceBuilder);
// 发送 SearchRequest 请求
SearchResponse searchResponse = client.search(searchRequest);
SearchHit[] searchHits = searchResponse.getHits().getHits();
for (SearchHit searchHit : searchHits) {
    System.out.println(searchHit.getId() + ":" + 
       searchHit.getSourceAsMap());
}
// 输出:
// 1:{postDate=2013-01-30, message=update Test, user=kim, age=31}
```

示例中匹配的 Document 中 age 字段的值位于\[10,40\]这个范围中，且 user 字段值为 "kim"，类似于 SQL 语句中的【age \>=10 and age \<=40 and user == "kim"】语句。

High Level REST Client 还提供了批量操作的 API ------ BulkProcessor 会将多个请求积攒成一个 bulk，然后批量发给 ElasticSearch 集群进行处理。使用 BulkProcessor 批量操作可以减少请求发送次数，提高请求消息的有效负载，降低 ElasticSearch 集群压力。

BulkProcessor 中有几个核心参数需要设置。

* setBulkActions() 方法：设置每个 BulkRequest 包含的请求数量，默认值为 1000；
* setBulkSize()：设置每个 BulkRequest 的大小，默认值为 5MB；
* setFlushInterval()：设置两次发送 BulkRequest 执行的时间间隔。没有默认值；
* setConcurrentRequests()：设置并发请求数。默认是 1，表示允许执行 1 个并发请求，积攒 BulkRequest 和发送 bulk 是异步的，其数值表示发送 bulk 的并发线程数（取值可以是任意大于 0 的数字），若设置为 0 表示二者同步；
* setBackoffPolicy()：设置最大重试次数和重试周期。默认最大重试次数为 8 次，初始延迟是 50 ms。

下面来看创建 BulkProcessor 的具体流程：

```java
// 该 Listener可以监听每个 BulkRequest请求相关事件
BulkProcessor.Listener listener = new BulkProcessor.Listener() {...}
// 创建 BulkProcessor
BulkProcessor bulkProcessor = BulkProcessor.builder(client::bulkAsync,
         listener).setBulkActions(bulkActions) 
         .setBulkSize(new ByteSizeValue(bulkSize, ByteSizeUnit.MB))
         .setFlushInterval(TimeValue.timeValueSeconds(flushInterval))
         .setConcurrentRequests(concurrentRequests)
         .setBackoffPolicy(BackoffPolicy.exponentialBackoff(
            TimeValue.timeValueMillis(100), 3)).build();
```

这里添加的 BulkProcessor.Listener 实现如下，其中提供了三个方法分别监听 BulkRequest 请求触发的不同事件：

```java
new BulkProcessor.Listener() {
   public void beforeBulk(long executionId, BulkRequest request) { 
      ... // 在 BulkRequest请求发送之前，会触发该方法
   }

   public void afterBulk(long executionId, BulkRequest request,
      BulkResponse response) { 
      ... // 在收到 BulkResponse响应时触发该方法，这里可以通过 
          // response.hasFailures()方法判断请求是否失败
   } 

   public void afterBulk(long executionId, BulkRequest request,
        Throwable failure) { 
        ... // 在 BulkRequest请求抛出异常的时候，会触发该方法
   } 
}
```

之后我们就可以通过 BulkProcessor.add() 方法向其中添加请求，这些请求最终会积攒成一个 BulkRequest 请求发出：

```java
bulkProcessor.add(new IndexRequest(...));
bulkProcessor.add(new DeleteRequest(...));
```

一般情况下，我们只需要在全局维护一个 BulkProcessor 对象即可，在应用程序关闭之前需要通过 awaitClose() 方法等待全部请求发送出去后再关闭 BulkProcessor 对象。

### 总结

本课时首先介绍了 ElasticSearch 中的核心概念，为了便于理解，将这些概念与数据库进行了对比。接下来介绍了 ElasticSearch 集群中各个节点的角色，以及 ElasticSearch 引入分片和副本功能要解决的问题。之后对 ElasticSearch 读写数据的核心流程进行概述。最后，通过示例的方式介绍了 ElasticSearch High Level REST Client 的基本使用方式。在后续课时讲解 SkyWalking OAP 实现时，你会再次看到 High Level REST Client 的身影。

