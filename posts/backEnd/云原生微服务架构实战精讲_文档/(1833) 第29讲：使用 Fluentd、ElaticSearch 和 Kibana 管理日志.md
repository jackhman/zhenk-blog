# 第29讲：使用Fluentd、ElaticSearch和Kibana管理日志

当系统在运行出现问题时，进行错误排查的首要目标是系统的日志，日志在系统维护中的重要性不言而喻。与单体应用相比，微服务架构应用的每个服务都独立运行，会产生各自的日志。这就要求把来自不同服务的日志记录聚合起来，形成统一的查询视图。云原生应用运行在 Kubernetes 上，对日志记录有不同的要求。本课时将介绍微服务架构的云原生应用，如何使用 Fluentd、ElasticSearch 和 Kibana 来管理日志。

### 记录日志

**日志记录**是开发中的重要组成部分，这离不开日志库的支持。

#### 日志库

在 Java 平台上，直到 JDK 1.4 版本才在标准库中增加了日志记录的 API，也就是 java.util.logging 包（JUL）。在那之前已经有一些开源日志实现流行起来，如 Apache Log4j，这就造成了在目前的 Java 日志实现中，Java 标准库的 JUL 包的使用者较少，而Log4j 和 Logback 这样的开源实现反而比较流行。

几乎所有的应用和第三方库都需要用到日志的功能，而且可以自由选择所使用的日志实现库，每个日志库都有自己特定的配置方式。当不同的日志实现同时使用时，它们的配置没办法统一起来，还可能产生冲突，这就产生了 Java 平台上特殊的日志 API 抽象层。

日志 API 抽象层（Facade）提供了一个抽象的接口来访问日志相关的功能，不同的日志库都实现该抽象层的接口，从而允许在运行时切换不同的具体日志实现。对于共享库的代码，推荐使用日志抽象层的 API，这就保证了共享库的使用者在选择日志实现时的灵活性。

常用的抽象层库包括早期流行的 [Apache Commons Logging](https://commons.apache.org/proper/commons-logging/) 和目前最常用的 [SLF4J](http://www.slf4j.org/)。日志实现库负责完成实际的日志记录，常用的库包括 Java 标准库提供的 JUL、[Log4j](http://logging.apache.org/log4j/2.x) 和 [Logback](http://logback.qos.ch/) 等。在一般的应用开发中，通常使用日志抽象层加上具体日志实现库的方式。

如果使用 Log4j 2 作为具体的日志实现，那么通常需要用到下表中给出的 3 个 Maven 库。

|          **分组**          | **Artifact 名称**  |          **作用**          |
|--------------------------|------------------|--------------------------|
| org.slf4j                | slf4j-api        | SLF4J 提供的日志 API          |
| org.apache.logging.log4j | log4j-slf4j-impl | Log4j 2 与 SLF4J API 的适配器 |
| org.apache.logging.log4j | log4j-core       | Log4j 2 的具体实现            |

对于 Spring Boot 应用来说，只需要选择添加下面列表中给出的依赖即可。

|    **Spring Boot 依赖名称**     | **日志实现** |
|-----------------------------|----------|
| spring-boot-starter-log4j2  | Log4j 2  |
| spring-boot-starter-logging | Logback  |

在应用开发中，可以选择使用 SLF4J 的 API 来记录日志，也可以直接使用某个具体日志实现的 API。使用 SLF4J API 的好处是避免了供应商锁定的问题，与其他第三方库一块使用时不容易产生冲突，不足之处是 SLF4J 的 API 为了保证更广泛的兼容性，其 API 只是提供了最通用的功能，无法使用具体日志实现特有的功能。

在开发共享库时，建议使用 SLF4J 的 API 以提高兼容性；在应用的开发中，一般很少会出现替换日志实现的情况，因此可以选择直接使用日志实现的 API。以 Log4j 2 为例，它提供了对 SLF4J 等其他日志 API 的适配器。即便直接使用 Log4j 2 的 API，也可以通过适配器与其他日志实现库进行交互。

#### 日志记录器

日志 API 的使用者通过记录器（Logger）来发出日志记录请求，并提供日志的内容。在记录日志时，需要指定日志的严重性级别，日志记录 API 都提供了相应的工厂方法来创建记录器对象，每个记录器对象都有名称。一般的做法是使用当前 Java 类的名称或所在包的名称来作为记录器对象的名称。记录器的名称通常是具有层次结构的，与 Java 包的层次结构相对应。

在通过日志记录器对象记录日志时，需要指定日志的严重性级别。根据每个记录器对象的不同配置，低于某个级别的日志消息可能不会被记录下来，该级别是日志 API 的使用者根据日志记录中所包含的信息来自行决定的。当通过记录器对象来记录日志时，只是发出一个日志记录请求，该请求是否会完成取决于请求和记录器对象的严重性级别。记录器使用者产生的低于记录器对象严重性级别的日志消息不会被记录下来，这样的记录请求会被忽略。一般来说，对于 DEBUG 及其以下级别的日志消息，首先需要使用类似 isDebugEnabled 这样的方法来检查日志消息是否会被记录，如下面的代码所示。

```java
if (LOGGER.isDebugEnabled()) { 
   LOGGER.debug("This is a debug message."); 
}
```

日志记录在产生之后以事件的形式来表示。**输出源（Appender）**负责把日志事件传递到不同的目的地，常用的日志目的地包括文件、控制台、数据库、HTTP 服务和 syslog 等。其中**控制台** 和**文件**是最常用的两种，控制台输出用在开发中，滚动文件（Rolling File）在生产环境中用来保存历史日志记录。

在输出日志事件到目的地之前，通常需要对事件进行格式化，这是通过布局（Layout）来完成的。布局负责把事件转换成输出源所需要的格式，常用的布局格式包括字符串、JSON、XML、CSV、HTML 和 YAML 等。

过滤器（Filter）的作用是对日志事件进行过滤，以确定日志事件是否需要被发布。过滤器可以添加在日志记录器或输出源上。

#### MDC 和 NDC

在多线程和多用户的应用中，同样的代码会处理不同用户的请求。在记录日志时，应该包含与用户相关的信息，当某个用户出现问题时，可以通过用户的标识符在日志中快速查找相关的记录，更方便定位问题。在日志记录中，**映射调试上下文** （Mapped Diagnostic Context，MDC）和**嵌套调试上下文**（Nested Diagnostic Context，NDC）解决了这个问题。正如名字里面所指出的一样，MDC 和 NDC 最早是为了错误调试的需要而引入的，不过现在一般作为通用的数据存储方式。MDC 和 NDC 在实现和作用上是相似，只不过 MDC 用的是哈希表，而 NDC 用的是栈，因此 NDC 中只能包含一个值。MDC 和 NDC 使用 ThreadLocal 来实现，与当前线程绑定。

由于 MDC 比 NDC 更灵活，实际中一般使用 MDC 较多，SLF4J 的 API 提供了对 MDC 和 NDC 的支持。同一个线程中运行的不同代码，可以通过 MDC 来共享数据。以 REST API 为例，当用户通过认证之后，可以在 Spring Security 过滤器的实现中把已认证用户的标识符保存在 MDC 中，后续的代码都可以从 MDC 中获取用户的标识符，而不用通过方法调用时的参数来传递。

MDC 类中包含了对哈希表进行操作的静态方法，如 get、put、remove 和 clear 等。大部分时候把 MDC 当成一个哈希表来使用即可，如下面的代码所示。

```java
MDC.put("value", "hello");
LOGGER.info("MDC value : {}", MDC.get("value"));
```

由于 MDC 保存在 ThreadLocal 中，如果当前线程通过 Java 中的 ExecutorService 来提交任务，任务的代码由工作线程来运行，有可能无法获取到 MDC 的值。这个时候就需要手动传递 MDC 中的值。

在下面的代码中，首先使用 MDC.getCopyOfContextMap 方法获取到当前线程的 MDC 中数据的拷贝，在任务的代码中使用 MDC.setContextMap 方法来设置 MDC 的值。通过这种方式，可以在不同线程之间传递 MDC。

```java
final ExecutorService executor = Executors.newSingleThreadExecutor();
final Map<String, String> contextMap = MDC.getCopyOfContextMap();
try {
  executor.submit(() -> {
    MDC.setContextMap(contextMap);
    new MDCGetter().display();
  }).get();
} catch (final InterruptedException | ExecutionException e) {
  e.printStackTrace();
}
executor.shutdown();
```

NDC 在使用时更加简单一些，只有 push 和 pop 两个方法，分别进行进栈和出栈操作。NDC 的 API 在 slf4j-ext 库中，其内部实现时实际上使用的是 MDC。

MDC 和 NDC 中的值，除了直接在代码中使用之外，还可以在模式布局中使用，从而出现在日志记录中。在 Log4j 2 中，模式布局支持不同的参数来引用 MDC 和 NDC 的值，如下表所示。

| **参数**  |    **说明**    |
|---------|--------------|
| %X      | MDC 中的全部值    |
| %X{key} | MDC 中特定键对应的值 |
| %x      | NDC 中的值      |

需要注意的是，由于 SLF4J 中的 NDC 实际上通过 MDC 来实现，在直接使用 SLF4J 的 API 时，%x 并不能获取到 NDC 中的值。

如果以 Log4j 2 作为日志实现，推荐的做法是直接使用 ThreadContext 类，该类同时提供了对 MDC 和 NDC 的支持。下面的代码展示了 ThreadContext 中 NDC 功能的使用方式。

```java
public class Log4jThreadContext {
  private static final Logger LOGGER = LogManager.getLogger("ThreadContext");
  public void display() {
    ThreadContext.push("user1");
    LOGGER.info("message 1");
    LOGGER.info("message 2");
    ThreadContext.pop();
    LOGGER.info("message 3"); // NDC中已经没有值
  }
}
```

MDC 通常作为任务执行时的上下文。当退出当前的执行上下文之后，MDC 中的内容应该被恢复。Log4j 2 提供了 CloseableThreadContext 类来方便对 ThreadContext 的管理。当 CloseableThreadContext 对象关闭时，对 ThreadContext 所做的修改会被自动恢复。下面代码中 ThreadContextHelper 类的 withContext 方法，可以在指定的上下文对象中，执行 Runnable 表示的代码。

```java
public class ThreadContextHelper {
  public static void withContext(final Map<String, String> context, final Runnable action) {
    try (final Instance ignored = CloseableThreadContext.putAll(context)) {
      action.run();
    }
  }
}
```

在下面的代码中，withContext 方法中的两条日志记录可以访问 userId 的值，而最后一条日志记录无法访问。

```java
ThreadContextHelper.withContext(
    ImmutableMap.of("userId", "12345"), () -> {
      LOGGER.info("message 1");
      LOGGER.info("message 2");
    });
LOGGER.info("message 3");
```

SLF4J 中的 MDC.MDCCloseable 类的作用与 CloseableThreadContext 类似，通过 MDC 的 putCloseable 方法来使用，如下面的代码所示。

```java
try (final MDC.MDCCloseable ignored = MDC.putCloseable("userId", "12345")) {
  LOGGER.info("message 1");
}
```

### 日志聚合

在单体应用中，日志通常被写入到文件中。当出现问题时，最直接的做法是在日志文件中根据错误产生的时间和错误消息进行查找，这种做法的效率很低。如果应用同时运行在多个虚拟机之上，需要对多个应用实例产生的日志记录进行聚合，并提供统一的查询视图。有很多的开源和商用解决方案提供了对日志聚合的支持，典型的是 ELK 技术栈，即 Elasticsearch、Logstash 和 Kibana 的集成。这 3 个组成部分代表了日志管理系统的 3 个重要功能，分别是日志的收集、保存与索引、查询。

对于微服务架构的云原生应用来说，日志管理的要求更高，应用被拆分成多个微服务，每个微服务在运行时的实例数量可能很多。在 Kubernetes 上，需要收集的是 Pod 中产生的日志。

在单体应用中，日志消息的主要消费者是开发人员，因此日志消息侧重的是可读性，一般是半结构化的字符串形式。通过模式布局，从日志事件中提取出感兴趣的属性，并格式化成日志消息。日志消息是半结构化的，通过正则表达式可以从中提取相关的信息。

当需要进行日志的聚合时，半结构化的日志消息变得不再适用，因为日志消息的消费者变成了日志收集程序，JSON 这样的结构化日志成了更好的选择。如果可以完全控制日志的格式，推荐使用 JSON。对于来自外部应用的日志消息，如果是纯文本格式的，仍然需要通过工具来解析并转换成 JSON。

当应用在容器中运行时，日志并不需要写到文件中，而是直接写入到标准输出流。Kubernetes 会把容器中产生的输出保存在节点的文件中，可以由工具进行收集。

### Fluentd

[Fluentd](https://www.fluentd.org/) 是一个开源的数据收集器，可以提供统一的日志管理；还可以通过灵活的插件架构，与不同的日志数据源和目的地进行集成。

Fluentd 使用 JSON 作为数据格式，同时以事件来表示每条日志记录。事件由下表中给出的 3 个部分组成。

| **属性** |    **说明**    |
|--------|--------------|
| 标签     | 事件源的标识       |
| 时间戳    | 事件的产生时间      |
| 记录     | JSON 格式的日志记录 |

Fluentd 采用插件化的架构来方便扩展，其插件分为输入、解析、过滤、输出、格式化、存储、服务发现和缓冲等 8 个类别。下表给出了这 8 个类别的说明和插件示例。

| **类别** |          **说明**           |                    **插件**                     |
|--------|---------------------------|-----------------------------------------------|
| 输入     | 从外部源中获取事件日志               | 文件、UDP、TCP、HTTP、syslog 等                      |
| 解析     | 解析事件日志的内容                 | 正则表达式、Apache 2、Nginx、CSV、JSON                 |
| 过滤     | 对事件进行修改，包括提取字段、添加新字段、删除字段 | grep、记录转换器                                    |
| 输出     | 事件日志的输出目的地                | 文件、HTTP、Elasticsearch、Kafka、MongoDB、Amazon S3 |
| 格式化    | 对事件输出进行格式化                | JSON、CSV、单个值                                  |
| 存储     | 保存插件的内部状态                 | 本地文件                                          |
| 服务发现   | 发现输出的目的地                  | 静态目标、文件                                       |
| 缓冲     | 输出插件的缓冲                   | 文件、内存                                         |

Fluentd 以流水线的方式来处理日志事件，流水线由 Fluentd 的配置文件来定义。流水线最基本的组成元素是输入、过滤器和输出，分别用下表中的 `<source>`、`<filter>` 和 `<match>` 指令来声明。事件的标签在流水线中很重要，用来选择不同的处理方式。

|   **指令**   |       **说明**        |
|------------|---------------------|
| `<source>` | 事件的输入源              |
| `<filter>` | 对事件进行处理，与事件的标签匹配    |
| `<match>`  | 对事件进行处理和输出，与事件的标签匹配 |

除了上表中的 3 个基本指令之外，下表还给出了两个内嵌指令的说明。

|   **指令**    | **说明**  |           **可能的父指令**            |
|-------------|---------|---------------------------------|
| `<parse>`   | 使用解析插件  | `<source>`、`<filter>`和`<match>` |
| ` <format>` | 使用格式化插件 | `<filter>`和`<match>`            |

在配置插件时，通过 @type 参数来指定插件的名称。下面的代码是 Fluentd 的配置文件的示例，其中定义了一个从 HTTP 输入到文件输出的处理流水线。输入源是运行在 8280 端口的 HTTP 服务；过滤操作匹配标签为 app.log 的事件，并添加 hostname 字段；输出目的地是文件，并通过格式化插件 json 转换为 JSON 格式。发送 HTTP POST 请求到 URL http://localhost:8280/app.log 可以发布新的事件，POST 请求的路径 app.log 是事件的标签。

```xml
<source>
  @type http
  port 8280
  bind 0.0.0.0
</source>
<filter app.log>
  @type record_transformer
  <record>
    hostname "#{Socket.gethostname}"
  </record>
</filter>
<match app.log>
  @type file
  path /opt/app/log
  <format>
    @type json
  </format>
</match>
```

除了 Fluentd 之外，还可以使用 [Filebeat](https://www.elastic.co/beats/filebeat) 或 [Logstash](https://www.elastic.co/logstash) 来收集日志。

### Elasticsearch 和 Kibana

当收集到来自不同源的日志事件之后，还需要进行存储和搜索。在流行的日志处理技术栈中，Elasticsearch 和 Kibana 是两个常用的选择，前者提供了日志事件的存储和搜索，而后者则提供了日志查询和结果的展示。

在 Kubernetes 上，可以使用 Helm 来安装 Elasticsearch 和 Kibana。不过更推荐的做法是使用 [Elastic Cloud on Kubernetes](https://www.elastic.co/guide/en/cloud-on-k8s/current/index.html)（ECK）。ECK 基于 Kubernetes 上的操作员模式来实现，提供了更好的可伸缩性和可维护性，类似第 28 课时介绍的 Prometheus Operator。

首先使用下面的命令安装 ECK 的自定义资源定义。

```java
kubectl apply -f https://download.elastic.co/downloads/eck/1.1.2/all-in-one.yaml
```

接着可以使用 ECK 提供的自定义资源定义来创建 Elasticsearch 集群。下面的代码创建了一个名为 default 包含一个节点的 Elasticsearch 集群。

```yaml
apiVersion: elasticsearch.k8s.elastic.co/v1
kind: Elasticsearch
metadata:
  name: default
spec:
  version: 7.8.0
  nodeSets:
  - name: default
    count: 1
    config:
      node.master: true
      node.data: true
      node.ingest: true
      node.ml: false
      xpack.ml.enabled: false
      node.store.allow_mmap: false
```

在 Elasticsearch 集群创建之后，可以使用 kubectl get elasticsearch 命令来查看集群的状态，输出结果如下面的代码所示。

```java
NAME      HEALTH   NODES   VERSION   PHASE   AGE
default   green    1       7.8.0     Ready   21m
```

Kibana 的部署方式类似于 Elasticsearch，如下面的代码所示。属性 elasticsearchRef 的值用来配置 Kibana，引用之前创建的 Elasticsearch 集群。

```yaml
apiVersion: kibana.k8s.elastic.co/v1
kind: Kibana
metadata:
  name: default
spec:
  version: 7.8.0
  count: 1
  elasticsearchRef:
    name: default
```

当 Kibana 部署完成之后，可以在本地机器上使用 kubectl port-forward 来访问 Kibana 界面，如下面的代码所示：

```java
kubectl port-forward svc/default-kb-http 5601
```

使用浏览器访问 https://localhost:5601 即可。需要注意的是，Kibana 服务器默认使用了自签名的 SSL 证书，浏览器会给出警告，在开发环境中可以忽略。Kibana 的登录用户名是 elastic，而密码需要从 Kubernetes 的 Secret 中获取，使用下面的代码可以获取到密码。

```java
kubectl get secret default-es-elastic-user -o go-template='{ {.data.elastic | base64decode}}'
```

接着需要在 Kubernetes 上运行 Fluentd。Fluentd 以守护进程集（DaemonSet）的形式来运行，确保在每个节点上都可以运行；同时它会收集容器中产生的日志，并发送到 Elasticsearch。

下面的代码是创建 Fluentd 的守护进程集的 YAML 文件。通过卷的绑定，Fluentd 可以读取节点上 /var/log 和 /var/lib/docker/containers 目录下的日志文件。

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: default
  labels:
    app.kubernetes.io/name: fluentd-logging
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: fluentd-logging
  template:
    metadata:
      labels:
        app.kubernetes.io/name: fluentd-logging
    spec:
      containers:
      - name: fluentd
        image: fluent/fluentd-kubernetes-daemonset:v1-debian-elasticsearch
        env:
          - name: FLUENTD_SYSTEMD_CONF
            value: "disabled"
          - name:  FLUENT_ELASTICSEARCH_HOST
            value: "default-es-http"
          - name:  FLUENT_ELASTICSEARCH_PORT
            value: "9200"
          - name: FLUENT_ELASTICSEARCH_SCHEME
            value: "https"
          - name: FLUENT_ELASTICSEARCH_SSL_VERIFY
            value: "false"
          - name: FLUENT_ELASTICSEARCH_USER
            value: "elastic"
          - name: FLUENT_ELASTICSEARCH_PASSWORD
            valueFrom:
              secretKeyRef:
                name: "default-es-elastic-user"
                key: "elastic" 
        resources:
          limits:
            memory: 200Mi
          requests:
            cpu: 100m
            memory: 200Mi
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
          readOnly: true
      terminationGracePeriodSeconds: 30
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
```

在首次使用 Kibana 时，需要配置索引的模式，使用 logstash-\* 作为模式即可。下图是 Kibana 查询日志的界面，可以通过标签来快速对日志消息进行过滤。


<Image alt="kibana.png" src="https://s0.lgstatic.com/i/image/M00/26/C2/Ciqc1F7y-cuAFBf_AAJiFWEnj7g432.png"/> 


### 总结

应用的开发和维护都离不开日志的支持，对于微服务架构的云原生应用来说，完整的日志聚合、分析和查询的技术栈是必不可少的。通过本课时的学习，你可以掌握 Java 应用中记录日志的方式和最佳实践，还可以了解如何基于 Fluentd、Elasticsearch 和 Kibana，在 Kubernetes 上构建自己的日志聚合、分析和查询的完整技术栈。

