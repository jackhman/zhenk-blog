# 第02讲：链路追踪利器，快速上手SkyWalking

在上一课时中，我们介绍了 SkyWalking 的整体架构以及 Service、Endpoint、ServiceInstance 等核心概念。本课时将带领同学们搭建 SkyWalking 的环境搭建，并上手使用 SkyWalking。

### SkyWalking 环境搭建

在本课时中，我们将安装并体验 SkyWalking 的基本使用，下面是使用到的相关软件包：

* apache-skywalking-apm-6.2.0.tar.gz

下载地址：<https://archive.apache.org/dist/skywalking/6.2.0/>

* elasticsearch-6.6.1.tar.gz

下载地址：<https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-6.6.1.tar.gz>

* kibana-6.6.1-darwin-x86_64.tar.gz

下载地址：<https://artifacts.elastic.co/downloads/kibana/kibana-6.6.1-darwin-x86_64.tar.gz>

### ElasticSearch 安装

下载完 elasticsearch-6.6.1.tar.gz 包之后，使用如下命令进行解压缩：

```java
tar -zxf elasticsearch-6.6.1.tar.gz
```

解压完成之后，进入得到的 elasticsearch-6.6.1 目录中，执行如下命令后台启动 ElasticSearch 服务：

```js
./bin/elasticsearch -d
```

ElasticSearch 启动的相关日志可以通过下面的命令进行查看：

```java
tail -f logs/elasticsearch.log
```

最后，我们可以请求 localhost:9200 这地址，看到下图输出的这段 JSON 即安装成功：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/CgpOIF5nHMCAYb-sAABorqyP-yg322.png"/> 


### Kibana 安装

Kibana 是一个开源的分析和可视化平台，主要用于和 Elasticsearch 一起工作，轻松实现 ElasticSearch 的查询和管理。这里使用 ElasticSearch 作为 SkyWalking 的后端存储，在后续调试 SkyWalking 源码时，可能会直接查询 ElasticSearch 中的某些索引，所以这里一并安装 Kibana。

下载完 kibana-6.6.1-darwin-x86_64.tar.gz 安装包之后，我们使用如下命令进行解压：

```java
tar -zxf  kibana-6.6.1-darwin-x86_64.tar.gz
```

解压完成后进入 kibana-6.6.1-darwin-x86_64 目录，修改 config/kibana.yml 文件：

```java
# 指定上述 ElasticSearch监听的地址，其他配置不变
elasticsearch.hosts: ["http://localhost:9200"]
```

之后执行如下命令，启动 Kibana 服务：

```java
./bin/kibana
```

最后我们通过访问 http://localhost:5601/ 地址即可进入 Kibana 界面：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/Cgq2xl5nHMCAABXxAAEuKrTbLVw100.png"/> 


### SkyWalking 安装

下载完成 apache-skywalking-apm-6.2.0.tar.gz 包之后，执行如下命令解压缩：

```java
tar -zxf apache-skywalking-apm-6.2.0.tar.gz
```

解压完成之后进入 apache-skywalking-apm-bin 目录，编辑 config/application.yml 文件，将其中 ElasticSearch 配置项以及其子项的全部注释去掉，将 h2 配置项及其子项全部注释掉，如下图所示，这样 SkyWalking 就从默认的存储 h2 切换成了 ElasticSearch ：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/CgpOIF5nHMCAH0O5AAfpg2pNpsw425.png"/> 


接下来执行 ./bin/startup.sh 文件即可启动 SkyWalking OAP 以及 UI 界面，看到的输出如下：

```js
>./bin/startup.sh
SkyWalking OAP started successfully!
SkyWalking Web Application started successfully!
```

我们可以在 logs/skywalking-oap-server.log 以及 logs/webapp.log 两个日志文件中查看到 SkyWalking OAP 以及 UI 项目的相关日志，这里不再展开。

最后访问 http://127.0.0.1:8080/ 即可看到 SkyWalking 的 Rocketbot UI界面。

### Skywalking Agent 目录结构

SkyWalking Agent 使用了 Java Agent 技术，可以在无需手工埋点的情况下，通过 JVM 接口在运行时将监控代码段插入已有 Java 应用中，实现对 Java 应用的监控。SkyWalking Agent 会将服务运行过程中获得的监控数据通过 gRPC 发送给后端的 OAP 集群进行分析和存储。

SkyWalking 目前提供的 Agent 插件在 apache-skywalking-apm-bin/agent 目录下：

```java
agent
    ├── activations
    │   ├── apm-toolkit-log4j-1.x-activation-6.2.0.jar
    │   ├── ...
    │   └── apm-toolkit-trace-activation-6.2.0.jar
    ├── config # Agent 配置文件
    │   └── agent.config
    ├── logs # 日志文件
    ├── optional-plugins # 可选插件
    │   ├── apm-customize-enhance-plugin-6.2.0.jar
    │   ├── apm-gson-2.x-plugin-6.2.0.jar
    │   └── ... ...
    ├── plugins # 当前生效插件
    │   ├── apm-activemq-5.x-plugin-6.2.0.jar
    │   ├── tomcat-7.x-8.x-plugin-6.2.0.jar
    │   ├── spring-commons-6.2.0.jar
    │   └── ... ...
    └── skywalking-agent.jar
```

其中，agent.config 文件是 SkyWalking Agent 的唯一配置文件。plugins 目录存储了当前 Agent 生效的插件。optional-plugins 目录存储了一些可选的插件（这些插件可能会影响整个系统的性能或是有版权问题），如果需要使用这些插件，需将相应 jar 包移动到 plugins 目录下。最后的 skywalking-agent.jar 是 Agent 的核心 jar 包，由它负责读取 agent.config 配置文件，加载上述插件 jar 包，运行时收集到 的 Trace 和 Metrics 数据也是由它发送到 OAP 集群的。

### skywalking-demo 示例

下面搭建 demo-webapp、demo-provider 两个 Spring-Boot 项目，并且接入 SkyWalking Agent 进行监控，具体结构如下：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/Cgq2xl5nHMCAB9f7AAB00fhMQNk918.png"/> 


demo-webapp 会 Dubbo 远程调用 demo-provider 的接口，而 Dubbo 依赖了 Zookeeper，所以要先安装 Zookeeper。首先下载 zookeeper-3.4.14.tar.gz 包（下载地址：<https://archive.apache.org/dist/zookeeper/zookeeper-3.4.14/>）。下载完成之后执行如下命令解压缩：

```java
tar -zxf zookeeper-3.4.14.tar.gz
```

解压完成之后，进入 zookeeper-3.4.14 目录，拷贝 conf/zoo_sample.cfg 文件并重命名为 conf/zoo.cfg，之后执行如下命令启动 Zookeeper：

```java
>./bin/zkServer.sh start
# 下面为输出内容
ZooKeeper JMX enabled by default
Using config: /Users/xxx/zookeeper-3.4.14/bin/../conf/zoo.cfg # 配置文件
Starting zookeeper ... STARTED # 启动成功
```

下面在 IDEA 中创建 skywalking-demo 项目，并在其中创建 demo-api、demo-webapp、demo-provider 两个 Module，如下图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/CgpOIF5nHMCALuSFAADAqK6QHPc083.png"/> 


在 skywalking-demo 下面的 pom.xml 中，将父 pom 指向 spring-boot-starter-parent 并添加 demo-api 作为公共依赖，如下所示：

```html
<project xmlns=...">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>2.1.1.RELEASE</version>
    </parent>
    <groupId>com.xxx</groupId>
    <artifactId>skywalking-demo</artifactId>
    <packaging>pom</packaging>
    <version>1.0-SNAPSHOT</version>
    <modules>
        <module>demo-api</module>
        <module>demo-webapp</module>
        <module>demo-provider</module>
    </modules>

    <dependencyManagement>
        <dependencies>
            <dependency>
                <groupId>com.xxx</groupId>
                <artifactId>demo-api</artifactId>
                <version>1.0-SNAPSHOT</version>
            </dependency>
        </dependencies>
    </dependencyManagement>
</project>
```

在 demo-api 中只定义了 HelloService 接口，它是 Dubbo Provider 和 Dubbo Consumer 依赖的公共接口，如下：

```java
public interface HelloService {
    String say(String name) throws Exception;
}
```

### demo-provider 模块

这里的 demo-provider 扮演了 Dubbo Provider 的角色，在其 pom.xml 文件中引入了 Spring Boot 以及集成 Dubbo 相关的依赖，如下所示：

```html
<dependencies>
    <!-- 引入公共API接口 -->
    <dependency>
        <groupId>com.xxx</groupId>
        <artifactId>demo-api</artifactId>
        <version>1.0-SNAPSHOT</version>
    </dependency>
    <!-- 引入spring-boot-starter以及dubbo和curator的依赖 -->
    <dependency>
        <groupId>com.alibaba.boot</groupId>
        <artifactId>dubbo-spring-boot-starter</artifactId>
        <version>0.2.0</version>
    </dependency>
    <!-- Spring Boot相关依赖 -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter</artifactId>
    </dependency>
</dependencies>
```

demo-provider 模块中的 DefaultHelloService 实现了 HelloService 接口，如下所示：

```java
@Service
@Component
public class DefaultHelloService implements HelloService {

    public String say(String name) throws Exception{
        Thread.sleep(2000);
        return "hello" + name;
    }
}
```

在 resource/application.yml 配置文件中将 DefaultHelloService 实现注册到 Zookeeper上对外暴露为 Dubbo Provider，具体配置如下：

```js
dubbo:
  application:
    name: demo-provider # Dubbo Provider 的名字
  registry:
    # 注册中心地址，即前面启动的Zookeeper地址
    address: zookeeper://127.0.0.1:2181 
  protocol:
    name: dubbo # 指定通信协议
    port: 20880 # 通信端口，这里指的是与消费者间的通信协议与端口
  provider:
    timeout: 10000 # 配置全局调用服务超时时间，dubbo默认是1s，肯定不够用呀
    retries: 0 # 不进行重试
    delay: -1
```

在 DemoProviderApplication 中提供 Spring Boot 的启动 main() 方法，如下所示：

```java
@EnableDubbo // 添加对 Dubbo支持的注解
@SpringBootApplication
public class DemoProviderApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoProviderApplication.class, args);
    }
}
```

为了引入 Skywalking Agent 插件，还需要将 apache-skywalking-apm-bin/agent/config 目录下的 agent.config 配置文件拷贝到 demo-provider 模块的 resource 目录下，并修改其中的 agent.service_name：

```js
# The service name in UI
agent.service_name=${SW_AGENT_NAME:demo-provider}
```

很明显，agent.config 是一个 KV 结构的配置文件，类似于 properties 文件，value 部分使用 "${}" 包裹，其中使用冒号（":"）分为两部分，前半部分是可以覆盖该配置项的系统环境变量名称，后半部分为默认值。例如这里的 agent.service_name 配置项，如果系统环境变量中指定了 SW_AGENT_NAME 值（注意，全是大写），则优先使用环境变量中指定的值，如果环境变量未指定，则使用 demo-provider 这个默认值。

除了系统环境变量的覆盖方式，SkyWalking Agent 还支持另外两种覆盖默认值的方式：

* **JVM 配置覆盖**

例如这里的 agent.service_name 配置项，如果在 JVM 启动之前，明确中指定了下面的 JVM 配置：

```js
-Dskywalking.agent.service_name = demo-provider
# "skywalking."是 Skywalking环境变量的默认前缀
```

则会使用该配置值覆盖 agent.config 配置文件中默认值。

* **探针配置覆盖**

如果将 Java Agent 配置为如下：

```java
-javaagent:/path/skywalking-agent.jar=agent.service_name=demo-provider
# 默认格式是 -javaagent:agent.jar=[option1]=[value1],[option2]=[value2]
```

则会使用该 Java Agent 配置值覆盖 agent.config 配置文件中 agent.service_name 默认值。

如果四种配置同时出现，则优先级如下：

    探针配置 > JVM配置 > 系统环境变量配置 > agent.config文件默认值

编辑好 agent.config 配置文件之后，我们需要在启动 demo-provider 之前通过参数告诉 JVM SkyWalking Agent 配置文件的位置，IDEA 中的配置如下图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/Cgq2xl5nHMCAPGmdAAJd59aKb9w948.png"/> 


最后启动 DemoProviderApplication 这个入口类，可以看到如下输出：

```java
# 查找到 agent.config 配置文件
INFO 2020-02-01 12:12:07:574 main SnifferConfigInitializer :  Config file found in ... agent.config. 
# 查找到 agent目录
DEBUG 2020-02-01 12:12:07:650 main AgentPackagePath :  The beacon class location is jar:file:/Users/xxx/... 
# Dubbo Provider 注册成功
2020-02-01 12:12:16.105  INFO 58600 --- [main] c.a.d.r.zookeeper.ZookeeperRegistry      :  [DUBBO] Register: dubbo://172.17.32.91:20880/com.xxx.service.HelloService
# demo-provider 启动成功
2020-02-01 12:12:16.269  INFO 58600 --- [           main] com.xxx.DemoProviderApplication          : Started DemoProviderApplication in 4.635 seconds (JVM running for 9.005)
```

### demo-webapp 模块

完成 demo-provider 模块的启动之后，我们继续来开发 demo-webapp 模块，其 pom.xml 与 demo-provider 中的 pom.xml 相比，多引入了 spring-boot 对 Web开发的依赖，以及 SkyWalking 提供的 apm-toolkit-trace 依赖用来获取 TraceId：

```html
  <dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter</artifactId>
</dependency>

<!-- apm-toolkit-trace 这个依赖主要用来获取 TraceId -->
<dependency>
    <groupId>org.apache.skywalking</groupId>
    <artifactId>apm-toolkit-trace</artifactId>
    <version>6.2.0</version>
</dependency>
```

首先，在 HelloWorldController 中提供了两个接口：

* **/hello/{words} 接口**：通过 Dubbo 远程调用 demo-provider 暴露的接口。
* **/err 接口**：直接抛出 RuntimeException 异常。

HelloWorldController 的具体实现如下：

```java
@RestController
@RequestMapping("/")
public class HelloWorldController {
    @Reference
    private HelloService helloService;

    @GetMapping("/hello/{words}")
    public String hello(@PathVariable("words") String words) 
            throws Exception{
        Thread.sleep(1000);
        // TraceContext 工具类定义在 apm-toolkit-trace 依赖包中
        log.info("traceId:{}", TraceContext.traceId());
        ActiveSpan.tag("hello-trace", words);
        String say = helloService.say(words);
        Thread.sleep(1000);
        return say;
    }

    @GetMapping("/err")
    public String err() {
        String traceId =  TraceContext.traceId();
        log.info("traceId:{}", traceId);
        ActiveSpan.tag("error-trace activation", "error");
        throw new RuntimeException("err");
    }
```

在 resources/application.yml 文件中会配置 demo-webapp 监听的端口、Zookeeper 地址以及 Dubbo Consumer 的名称等等，具体配置如下：

```js
server:
  port: 8000

dubbo:
  application:
    name: demo-webapp # Dubbo Consumer名字
  registry:
    address: zookeeper://127.0.0.1:2181 # 注册中心地址，即 Zookeeper地址
```

demo-webpp 模块也需要在 resource 目录下添加 agent.config 配置文件，并修改其 agent.service_name 配置项，如下所示：

```java
# The service name in UI
agent.service_name=${SW_AGENT_NAME:demo-webapp}
```

demo-webpp 模块的入口 main() 方法与 demo-provider 相同，不再赘述。

为了接入 SkyWalking Agent，启动 demo-webapp 项目之前也需要配置相应的 VM options 参数，指定 agent.config 配置文件的地址，如下图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/CgpOIF5nHMCAJ8EKAAIq6sznBy0160.png"/> 


最后，启动 demo-webapp 项目，通过浏览器访问 <http://localhost:8000/hello/xxx> 地址得到正常相应，访问 <http://localhost:8000/err> 得到 500 响应，即表示启动成功。

到此为止，SkyWalking Agent 的基本接入方式就介绍完了，在后面分析和改造 SkyWalking 源码时，还可以使用 demo-webapp 和 demo-provider 这两个应用来产生 Trace 和 Metrics 数据。

### SkyWalking Rocketbot 使用

搭建完 SkyWalking 环境以及相关示例之后，我们来看如何使用 SkyWalking 提供的 UI 界面------ Skywalking Rocketbot。在前面执行的 ./bin/startup.sh 脚本，除了启动后端 OAP 服务，同时还会启动 Skywalking Rocketbot（位于 webapp 目录下的 skywalking-webapp.jar）。

如下图所示，在 Skywalking Rocketbot 首页顶部（1）处，有四个主 Tab 页，在【仪表盘】这个 Tab 中，（2）处可以选择查询的服务（Service）、端点（Endpoint） 以及服务实例（ServiceInstance）。在（3）处可以选择展示的不同维度，下图展示了 Global 这个全局视图：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/Cgq2xl5nHMCASh6sAAFikMiwg_o077.png"/> 


其中有五个面板（（4）\~（8）），分别是：

* **Global Heatmap 面板**：热力图，从全局展示了某段时间请求的热度。
* **Global Percent Response 面板** ：展示了全局请求响应时间的 P99、P95、P75 等分位数。
* **Global Brief 面板**：展示了 SkyWalking 能感知到的 Service、Endpoint 的个数。
* **Global Top Troughput 面板**：展示了吞吐量前几名的服务。
* **Global Top Slow Endpoint 面板**：展示了耗时前几名的 Endpoint。

除了 SkyWalking Rocketbot 默认提供的这些面板，我们还可以点击（2）处左边的锁型按钮，自定义 Global 面板。另外，我们还可以通过（9）处的时间选择框选择自定义查询的时间段。

将（3）处切换到 Service 面板，可以看到针对 Service 的监控面板，如下图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/CgpOIF5nHMGACMCRAAEzi1SuLKw557.png"/> 


* **Service (Avg) ResponseTime 面板**：展示了指定服务的（平均）耗时。
* **Service (Avg) Throughput 面板**：展示了指定服务的（平均）吞吐量。
* **Service (Avg) SLA 面板**：展示了指定服务的（平均）SLA（Service Level Agreement，服务等级协议）。
* **Service Percent Response 面板**：展示了指定服务响应时间的分位数。
* **Service Slow Endpoint 面板**：展示了指定服务中耗时比较长的 Endpoint 信息。
* **Running ServiceInstance 面板**：展示了指定服务下的实例信息。

将（3）处切换到 Endpoint 面板，可以看到针对 Endpoint 的监控面板，基本功能与 Service 面板类似，这里不再展开。

将（3）处切换到 Instance 面板，可以看到针对 ServiceInstance 的监控面板，如下图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/Cgq2xl5nHMGAGZlwAAHCkizkpVs483.png"/> 
   

在 ServiceInstance 面板中展示了很多 ServiceInstance 相关的监控信息，例如，JVM 内存使用情况、GC 次数、GC 耗时、CPU 使用率、ServiceInstance SLA 等等信息，这里不再一一展开介绍。

下面我们切换到【拓扑图】这个主 Tab，如下图所示，在（1）处展示当前整个业务服务的拓扑图。点击拓扑图中的任意节点，可在（2）处看到服务相应的状态信息，其中包括响应的平均耗时、SLA 等监控信息。点击拓扑图中任意一条边，可在（3）处看到一条调用链路的监控信息，其中会分别从客户端（上游调用方）和服务端（下游接收方）来观测这条调用链路的状态，其中展示了该条链路的耗时、吞吐量、SLA 等信息：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/CgpOIF5nHMGAceZOAAHozO2Mq14310.png"/> 


下面我们切换到【追踪】这个主 Tab来查询 Trace 信息，如下图所示。在（1）、（2）处可以选择 Trace 的查询条件，其中可以指定 Trace 涉及到的 Service、ServiceInstance、Endpoint 以及Trace 的状态继续模糊查询，还可以指定 TraceId 和时间范围进行精确查询。在（3）处展示了 Trace 的简略信息，下图中 "/err" 接口这条 Trace 被显示为红色表示该 Trace 关联的请求出现了异常。在（4）和（5）处展示了 Trace 的具体信息以及所有 Span 信息，我们可以通过（6）处按钮调整 Span 的展示方式：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/Cgq2xl5nHMGAUPpGAAEyWm6Aqo8753.png"/> 


点击 Trace 中的 Span，就可以将该 Span 的具体信息展示出来，如下下图所示，点击"/err" 接口相关 Trace 中的 Span，即可看到相应的 TRuntimeException 异常信息：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/CgpOIF5nHMGAb41NAAHBIhP98Z0352.png"/> 


最后，我们将主 Tab 也切换到【告警】，这里展示了 Skywalking 发出来的告警信息，如下图所示，这里也提供了相应的查询条件和关键字搜索框。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/71/BD/Cgq2xl5nHMGAVek0AAM9HlRD-nQ059.png"/> 


### 总结

本课时搭建 SkyWalking 的运行环境，完成 ElasticSearch、Kibana、Skywalking 等的安装，并搭建了 skywalking-demo 项目作为演示示例，带同学们上手体验了 Skywalking Agent 的接入的流程。

最后介绍了 SkyWalking Rocketbot UI 界面强大的功能，包括 Service、Endpoint、ServiceInstance 等不同级别的监控，展示了整个服务的拓扑图、Trace 查询以及告警信息查询等功能。

