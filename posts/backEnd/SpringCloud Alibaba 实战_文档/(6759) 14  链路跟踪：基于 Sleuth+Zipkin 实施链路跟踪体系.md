# 14链路跟踪：基于Sleuth+Zipkin实施链路跟踪体系

在前面几讲我们主要讲解了基于 Sentinel 如何对微服务架构提供限流、熔断保护。从本讲开始，我们继续完善微服务架构，介绍如何在 Spring Cloud 架构下基于 Sleuth+Zipkin 实现微服务链路追踪。本讲咱们将学习以下三方面内容：

* 介绍微服务链路追踪的原理；

* 讲解基于 Spring Cloud Sleuth 实现链路追踪；

* 构建 Zipkin Server 实现链路追踪的可视化管理。

下面咱们先来介绍什么是微服务链路追踪。

### 微服务链路追踪

我们先看一个图，都知道在微服务架构下，系统的功能是由大量的微服务协调组成的，例如：电商创建订单业务就需要订单服务、库存服务、支付服务、短信通知服务逐级调用才能完成。而每个服务可能是由不同的团队进行开发，部署在成百上千台服务器上。


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image6/M01/2C/A5/Cgp9HWBldo6APrO6AAEGOxZjZu0392.png"/> 
  
复杂的调用链路

如此复杂的消息传递过程，当系统发生故障的时候，就需要一种机制对故障点进行快速定位，确认是哪个服务出了问题，链路追踪技术由此而生。所谓的链路追踪，就是运行时通过某种方式记录下服务之间的调用过程，在通过可视化的 UI 界面帮研发运维人员快速定位到出错点。引入链路追踪，是微服务架构运维的底层基础，没有它，运维人员就像盲人摸象一样，根本无法了解服务间通信过程。

在 Spring Cloud 标准生态下内置了 Sleuth 这个组件，它通过扩展 Logging 日志的方式实现微服务的链路追踪。说起来比较晦涩，咱们看一个实例就明白了，在标准的微服务下日志产生的格式是：

```java
2021-01-12 17:00:33.441 INFO [nio-7000-exec-2] c.netflix.config.ChainedDynamicProperty  : Flipping property: b-service.ribbon.ActiveConnectionsLimit to use NEXT property: niws.loadbalancer.availabilityFilteringRule.activeConnectionsLimit = 2147483647
```

但是当引入 Spring Cloud Sleuth 链路追踪组件后就会变成下面的格式：

```java
2021-01-12 17:00:33.441  INFO [a-service,5f70945e0eefa832,5f70945e0eefa832,true] 18404 --- [nio-7000-exec-2] c.netflix.config.ChainedDynamicProperty  : Flipping property: b-service.ribbon.ActiveConnectionsLimit to use NEXT property: niws.loadbalancer.availabilityFilteringRule.activeConnectionsLimit = 2147483647
比较后会发现，在原有日志中额外附加了下面的文本
[a-service,5f70945e0eefa832,5f70945e0eefa832,true]
```

这段文本就是 Sleuth 在微服务日志中附加的链路调用数据，它的格式是固定的，包含以下四部分：

```java
[微服务 Id,TraceId,SpanId,isExport]
```


<Image alt="图片2.png" src="https://s0.lgstatic.com/i/image6/M01/2C/AD/CioPOWBldpiAAEEzAAEIV3dI0v0620.png"/> 
  
链路追踪数据的组成

* **微服务 Id**，说明日志是由哪个微服务产生的。

* **TraceId**，轨迹编号。一次完整的业务处理过程被称为轨迹，例如：实现登录功能需要从服务 A 调用服务 B，服务B再调用服务 C，那这一次登录处理的过程就是一个轨迹，从前端应用发来请求到接收到响应，每一次完整的业务功能处理过程都对应唯一的 TraceId。

* **SpanId**，步骤编号。刚才要实现登录功能需要从服务 A 到服务 C 涉及 3 个微服务处理，按处理前后顺序，每一个微服务处理时日志都被赋予不同的 SpanId。一个 TraceId 拥有多个 SpanId，而 SpanId 只能隶属于某一个 TraceId。

* **导出标识**，当前这个日志是否被导出，该值为 true 的时候说明当前轨迹数据允许被其他链路追踪可视化服务收集展现。

下面我们看一个完整的追踪数据实例：

我模拟了**服务 A -\> 服务 B -\> 服务 C**的调用链路，下面是分别产生的日志。

```java
#服务 A 应用控制台日志
2021-01-12 22:16:54.394 DEBUG [a-service,e8ca7047a782568b,e8ca7047a782568b,true] 21320 --- [nio-7000-exec-1] org.apache.tomcat.util.http.Parameters   : ...
#服务 B 应用控制台日志
2021-01-12 22:16:54.402 DEBUG [b-service,e8ca7047a782568b,b6aa80fb33e71de6,true] 21968 --- [nio-8000-exec-2] org.apache.tomcat.util.http.Parameters   : ...
#服务 C 应用控制台日志
2021-01-12 22:16:54.405 DEBUG [c-service,e8ca7047a782568b,537098c59827a242,true] 17184 --- [nio-9000-exec-2] org.apache.tomcat.util.http.Parameters   : ...
```

可以发现，在 DEBUG 级别下链路追踪数据被打印出来，按调用时间先后顺序分别是 A 到 C 依次出现。因为是一次完整业务处理，TraceId 都是相同的，SpanId 却各不相同，这些日志都已经被 Sleuth 导出，可以被 ZipKin 收集展示。

Zipkin 是 推特的一个开源项目，它能收集各个服务实例上的链路追踪数据并可视化展现。刚才 ABC 服务控制台产生的日志在 ZipKin 的 UI 界面中会以链路追踪图表的形式展现。


<Image alt="图片3.png" src="https://s0.lgstatic.com/i/image6/M01/2C/A5/Cgp9HWBldqaAet1VAAEhVL4p5dM017.png"/> 
  
链路追踪图表

通过这个图表可以非常直观的了解业务处理过程中服务间的依赖关系与处理时间、处理状态等信息，是开发运维人员进行故障分析时必要的工具。

说到这，想必你对服务链路追踪与 Sleuth+Zipkin 组合已经有了初步认识，下面咱们通过实例讲解如何在微服务架构中进行链路追踪。这个过程分为两个阶段：

* 在服务中加入 Spring Cloud Sleuth 生成链路追踪日志；

* 通过 ZipKin 收集链路最终日志，生成可视化图表。

### 微服务整合 Sleuth

为了演示需要，这里创建 a-service、b-service、c-service 三个微服务工程，配置过程十分简单，我们把关键代码拿出来说明。


<Image alt="图片4.png" src="https://s0.lgstatic.com/i/image6/M01/2C/AD/CioPOWBldrOAGWTLAABgPlbPohY295.png"/> 
  
调用链路示意图

第一步，创建 a-service、b-service、c-service 三个 Spring Boot 工程，pom.xml 依赖如下：

```xml
<!--Spring Web应用 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<!--Nacos 客户端 -->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
<!--服务间通信组件OpenFeign -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
    <version>2.2.6.RELEASE</version>
</dependency>
c-service的pom.xml依赖如下：
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
```

因为调用关系是服务 A 调用服务 B，服务 B 调用服务 C，所以在 A、B 两个服务中需要额外依赖 OpenFeign 实现服务间通信。

第二步，配置 ABC 服务的 application.yml，这三个配置文件除了应用名称与服务端口不同外，其他都一样。这里设置 A 服务端口为 7000，B 服务端口 8000，C 服务端口 9000。

```yaml
server:
  port: 7000 #a:7000/b:8000/c:9000 
spring:
  cloud:
    nacos:
      discovery:
        server-addr: 192.168.31.10:8848
        username: nacos
        password: nacos
  application:
    name: a-service #a-service/b-service/c-service
logging:
  level:
    root: debug #为演示需要，开启debug级别日志
```

第三步，实现业务逻辑，代码如下：

* **c-service 工程。**

```java
SampleController，methodC方法产生响应字符串"-> Service C"，方法映射地址"/c"
@RestController
public class SampleController {
    @GetMapping("/c")
    public String methodC(){
        String result = " -> Service C";
        return result;
    }
}
```

* **b-service 工程。**

CServiceFeignClient 通过 OpenFeign 实现了 C 服务的通信客户端，方法名为 methodC。

```java
@FeignClient("c-service")
public interface CServiceFeignClient {
    @GetMapping("/c")
    public String methodC();
}
```

SampleController 通过 methodB 方法调用 methodC 的同时为响应附加的字符串"-\> Service B"，方法映射地址"/b"。

```java
@Controller
public class SampleController {
    @Resource
    private CServiceFeignClient cService;
    @GetMapping("/b")
    @ResponseBody
    public String methodB(){
        String result = cService.methodC();
        result = " -> Service B" + result;
        return result;
    }
}
```

* **a-service 工程。**

```java
BServiceFeignClient通过OpenFeign实现了B服务的通信客户端，方法名为methodB
@FeignClient("b-service")
public interface BServiceFeignClient {
    @GetMapping("/b")
    public String methodB();
}
```

SampleController 通过 methodA 方法调用 methodB 的同时，成为响应附加的字符串"-\> Service A"，方法映射地址"/a"。

```java
@RestController
public class SampleController {
    @Resource
    private BServiceFeignClient bService;
    @GetMapping("/a")
    public String methodA(){
        String result = bService.methodB();
        result = "-> Service A" + result;
        return result;
    }
}
```

这样一个完整的调用链路已形成。在 3 个服务实例启动后，访问 A 实例  

访问 [http://localhost:7000/a](http://localhost:7000/a?fileGuid=xxQTRXtVcqtHK6j8) 得到运行结果。

```java
-> ServiceA -> Service B -> Service C
```

可以看到 ABC 三个服务按前后顺序依次产生结果，但目前在日志中并没有包含任何链路追踪数据，那如何引入 Sleuth 呢？

很简单，只需要打开三个服务工程的 pom.xml 文件分别引入 spring-cloud-starter-sleuth 依赖。

```xml
<!--添加Sleuth依赖 -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-sleuth</artifactId>
    <version>2.2.6.RELEASE</version>
</dependency>
```

加入依赖后，重启服务，无须做任何额外设置，Spring Cloud Sleuth 便自动为日志增加了链路追踪数据，下面是经过我整理后的追踪数据。

```java
#服务 A 应用控制台日志，已附加链路追踪数据
2021-01-12 22:16:54.394 DEBUG [a-service,e8ca7047a782568b,e8ca7047a782568b,true] 21320 --- [nio-7000-exec-1] org.apache.tomcat.util.http.Parameters   : ...
#服务 B 应用控制台日志
2021-01-12 22:16:54.402 DEBUG [b-service,e8ca7047a782568b,b6aa80fb33e71de6,true] 21968 --- [nio-8000-exec-2] org.apache.tomcat.util.http.Parameters   : ...
#服务 C 应用控制台日志
2021-01-12 22:16:54.405 DEBUG [c-service,e8ca7047a782568b,537098c59827a242,true] 17184 --- [nio-9000-exec-2] org.apache.tomcat.util.http.Parameters   : ...
```

虽然数据已产生，但如果在生产环境靠人工组织数以万计的链路日志显然不现实，我们还需要部署链路追踪数据的分析工具 ZipKin 来简化这个过程。

### 构建 Zipkin Server 实现链路追踪的可视化管理

Zipkin 是由推特开发的分布式链路追踪系统，用于对 Sleuth 产生的日志加以收集并采用可视化的数据对链路追踪进行分析与图表展示，Zipkin 是典型的 C/S（客户端与服务端）架构模式，需要独立部署 Zipkin 服务器，同时也需要在微服务内部持有Zipkin客户端才可以自动实现日志的推送与展示。


<Image alt="图片5.png" src="https://s0.lgstatic.com/i/image6/M00/2C/A6/Cgp9HWBldtqACzyVAAEeD5EF8GE518.png"/> 
  
Zipkin 的架构示意图

在部署 Zipkin 服务端后，一旦微服务产生链路追踪日志，Zipkin 客户端便会自动以异步形式将日志数据推送至 Zipkin 服务端，Zipkin 服务端对数据进行组织整理，开发运维人员便可通过 Zipkin 服务端提供的 UI 界面进行查看。下面咱们来讲解 Zipkin 服务端与客户端的部署过程。

### 部署 Zipkin 服务端

Zipkin 服务端部署非常简单，可以通过官网快速上手。

[https://zipkin.io/pages/quickstart.html](https://zipkin.io/pages/quickstart.html?fileGuid=xxQTRXtVcqtHK6j8)。


<Image alt="图片6.png" src="https://s0.lgstatic.com/i/image6/M00/2C/A6/Cgp9HWBlduaAKJDQAAHelVn9Llw043.png"/> 
  
快速部署 Zipkin 服务端

```java
curl -sSL https://zipkin.io/quickstart.sh | bash -s
java -jar zipkin.jar
```

因为 Zipkin 完全是基于 Java 开发的，在安装好 Java 环境后，只需要使用 Curl 命令下载 Zipkin 最新 Jar 包，并利用 Java 命令启动执行即可。


<Image alt="图片7.png" src="https://s0.lgstatic.com/i/image6/M00/2C/AE/CioPOWBldu-AfKZTAAVsfFaI5dg233.png"/> 
  
Zipkin 服务端启动日志

```java
Armeria server started at ports: {/0:0:0:0:0:0:0:0:9411=ServerPort(/0:0:0:0:0:0:0:0:9411, [http])}
```

这里有一点需要注意，默认 Zipkin 监听本机 9411 端口，如果是网络远程访问，请在系统防火墙放行 9411 端口，否则无法通信。  

启动成功后，访问 Zipkin 后台。

[http://localhost:9411/zipkin/](http://localhost:9411/zipkin/?fileGuid=xxQTRXtVcqtHK6j8)


<Image alt="图片8.png" src="https://s0.lgstatic.com/i/image6/M00/2C/A6/Cgp9HWBldvuAB7WhAACcYRFoBMA812.png"/> 
  
Zipkin 服务端 UI

此时映入眼帘的就是 Zipkin 内置的分析 UI 界面，当前因为没有任何服务接入，查询不到任何数据，下面咱们进行 Zipkin 客户端接入。

#### 在微服务安装 Zipkin 客户端

Zipkin 客户端是以 Maven 依赖的形式在微服务中进行安装。

第一步，打开 ABC 工程的 pom.xml 文件，引入 Zipkin 客户端。

```xml
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-zipkin</artifactId>
    <version>2.2.6.RELEASE</version>
</dependency>
```

第二步，打开 ABC 工程的 application.yml 配置 Zipkin 通信地址以及采样率。

```yaml
spring:
  ...
  sleuth:
    sampler: #采样器
      probability: 1.0 #采样率，采样率是采集Trace的比率，默认0.1
      rate: 10000 #每秒数据采集量，最多n条/秒Trace
  zipkin:
    #设置zipkin服务端地址
    base-url: http://localhost:9411
```

spring.zipkin.base-url 设置可用的 Zipkin 服务端IP端口即可。

另一个采样器的两个设置项需要重点说明：

* spring.sleuth.sampler.probability 是指采样率，假设在过去的 1 秒 a 服务实例产生了 10 个 Trace，如果采用默认采样率 0.1 则代表只有其中1条会被发送到 Zipkin 服务端进行分析整理，如果设为 1，则 10 条 Trace 都会被发送到服务端进行处理。

* spring.sleuth.sampler.rate 指每秒最多采集量，说明每条最多允许采集多少条 Trace，超出部分将直接抛弃。

将 ABC 服务都设置好后，启动应用，重新访问[http://localhost:7000/a](http://localhost:7000/a?fileGuid=xxQTRXtVcqtHK6j8)地址，然后打开 Zipkin 服务端 UI 界面[http://localhost:9411](http://localhost:9411?fileGuid=xxQTRXtVcqtHK6j8)，点击"查找"按钮，便会出现调用链路。


<Image alt="图片9.png" src="https://s0.lgstatic.com/i/image6/M00/2C/A6/Cgp9HWBldwyANV6BAAEIr9R5lAA439.png"/> 
  
查询调用链路


<Image alt="图片10.png" src="https://s0.lgstatic.com/i/image6/M00/2C/A6/Cgp9HWBldxOAUW52AACpYTg2JiM395.png"/> 
  
查询结果

点击执行之间的蓝条，便会出现对应的链路调用图。


<Image alt="图片11.png" src="https://s0.lgstatic.com/i/image6/M00/2C/A6/Cgp9HWBldxuAOUJJAADMMxuCCC4773.png"/> 
  
链路条调用图

通过这个图可以直观了解到 ABC 三个服务的执行时间、执行顺序、访问地址、访问方式以及是否执行成功。如果你点击对应的色条，还可以看到更详细的内容。


<Image alt="图片12.png" src="https://s0.lgstatic.com/i/image6/M00/2C/A6/Cgp9HWBldyKAKVZTAAFwUrk3trU141.png"/> 
  
链路调用明细

下面咱们做一个实验，将 C 服务停止，看链路图会产生什么变化。停止后再次访问 A 服务报 500 错误"java.net.SocketTimeoutException: Read timed out"。此时链路追踪图会显示错误。


<Image alt="图片13.png" src="https://s0.lgstatic.com/i/image6/M00/2C/AF/CioPOWBldymALd3wAACKH8C4Co8299.png"/> 
  
异常情况下的链路追踪

通过图表发现最后 b-service 只有 6 纳秒执行时间肯定是有问题的，点击后查看明细。


<Image alt="图片14.png" src="https://s0.lgstatic.com/i/image6/M00/2C/AF/CioPOWBldzCAFF3MAAG2T6bpl4w635.png"/> 
  
异常明细

异常信息已经非常清晰的说明 C 服务没有可用的实例导致处理失败，开发人员针对这个问题进行及时补救即可。

讲到这里，我们通过实例的形式带你搭建了基于 Sleuth+Zipkin 的链路追踪的基础架构，下面我们进行一下总结。

### 小结与总结

本讲咱们学习了三方面内容，首先介绍了链路追踪的作用并分析了 Sleuth+Zipkin 基于日志追踪的原理；其次我们掌握了 Sleuth 的部署方法，只需要引入 Sleuth 的依赖即可；最后介绍了如何引入 Zipkin 实现可视化链路追踪，并模拟了异常情况。

这里咱们留一道讨论题：在日常的开发过程中，研发人员会开发各种不同功能的 RESTful 接口，如何将这些接口的文档化以及如何对这些接口进行版本管理呢？如果你有这方面经验，不妨写在评论中和大家一起分享下。

下一讲，我们将介绍另一款国产的链路跟踪产品 SkyWalking 的使用办法。

