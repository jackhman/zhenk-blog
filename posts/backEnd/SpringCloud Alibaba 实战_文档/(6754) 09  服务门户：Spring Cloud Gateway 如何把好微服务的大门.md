# 09服务门户：SpringCloudGateway如何把好微服务的大门

上一讲我们学习了 Dubbo 是如何与 Nacos 协同作业。通过对比 RESTful 与 RPC，我们介绍了两种通信方式的区别，再通过实例讲解如何将 Dubbo 与 Nacos 进行整合。但你是否发现无论是基于 OpenFeign 的 RESTful 通信，还是基于 Dubbo 的 RPC 通信，它们都在强调的是微服务间的信息传递，属于微服务架构内部的事情。而对于用户端从外侧访问微服务如何有效管理，微服务又是如何将接口暴露给用户呢？这就需要通过 API 网关实现需求了，本讲咱们就针对 API 网关学习三方面知识：

1. 介绍 API 网关的用途与产品；

2. 讲解 Spring Cloud Gateway 的配置技巧；

3. 讲解 Gateway执行原理与自定义过滤器（Filter）。

### API 网关的作用

如下图所示，对于整个微服务来说如果将每一个微服务的接口直接暴露给用户是错误的做法，这里主要体现出三个问题：

* 服务将所有 API 接口对外直接暴露给用户端，这本身就是不安全和不可控的，用户可能越权访问不属于它的功能，例如普通的用户去访问管理员的高级功能。

* 后台服务可能采用不同的通信方式，如服务 A 采用 RESTful 通信，服务 B 采用 RPC 通信，不同的接入方式让用户端接入困难。尤其是 App 端接入 RPC 过程更为复杂。

* 在服务访问前很难做到统一的前置处理，如服务访问前需要对用户进行鉴权，这就必须将鉴权代码分散到每个服务模块中，随着服务数量增加代码将难以维护。


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image6/M00/23/99/Cgp9HWBXaFSANx-tAAE1dQdYjME754.png"/> 
  
用户端直接访问微服务

为了解决以上问题，API 网关应运而生，加入网关后应用架构变为下图所示。


<Image alt="微信图片_20210322095840.png" src="https://s0.lgstatic.com/i/image6/M01/23/ED/CioPOWBX-fWAHNqWAAB1dyZpFjI441.png"/> 
  
引入 API 网关后的微服务架构

当引入 API 网关后，在用户端与微服务之间建立了一道屏障，通过 API 网关为微服务访问提供了统一的访问入口，所有用户端的请求被 API 网关拦截并在此基础上可以实现额外功能，例如：

* 针对所有请求进行统一鉴权、熔断、限流、日志等前置处理，让微服务专注自己的业务。

* 统一调用风格，通常 API 网关对外提供 RESTful 风格 URL 接口。用户传入请求后，由 API 网关负责转换为后端服务需要的 RESTful、RPC、WebService 等方式，这样便大幅度简化用户的接入难度。

* 更好的安全性，在通过 API 网关鉴权后，可以控制不同角色用户访问后端服务的权利，实现了服务更细粒度的权限控制。

* API 网关是用户端访问 API 的唯一入口，从用户的角度来说只需关注 API 网关暴露哪些接口，至于后端服务的处理细节，用户是不需要知道的。从这方面讲，微服务架构通过引入 API 网关，将用户端与微服务的具体实现进行了解耦。

以上便是 API 网关的作用，那 API 网关有哪些产品呢？

#### API 网关主流产品

API 网关是微服务架构中必要的组件，具体的实现产品在软件市场上层出不穷，下面我列举三款在国内外主流的开源产品。

#### OpenResty

OpenResty 是一个强大的 Web 应用服务器，Web 开发人员可以使用 Lua 脚本语言调动 Nginx 支持的各种 C 以及 Lua 模块,更主要的是在性能方面，OpenResty可以快速构造出足以胜任 10K 以上并发连接响应的超高性能 Web 应用系统。360、UPYUN、阿里云、新浪、腾讯网、去哪儿网、酷狗音乐等都是 OpenResty 的深度用户。

OpenResty 因为性能强大在微服务架构早期深得架构师的喜爱。但 OpenResty 是一款独立的产品，与主流的注册中心存在一定兼容问题，需要架构师独立实现其服务注册、发现的功能。后来 Spring Cloud 官方极力推崇自家封装的 Zuul 或者 Spring Cloud Gateway，渐渐 OpenResty 便淡出了我们的视野。但不能否认，OpenResty 仍是一款优秀的 API 网关产品。

#### Spring Cloud Zuul

Zuul 是 Netflix 开源的微服务网关，它的主要职责是对用户请求进行路由转发与过滤。早期Spring Cloud 与 Netfilx 合作，使用 Zuul 作为微服务架构的首选网关产品。Zuul 是基于 J2EE Servlet 实现路由转发，网络通信采用同步方式，使用简单部署方便。经过 Spring Cloud 对 Zuul 的封装，Spring Cloud Zuul 应运而生。Spring Cloud Zuul 在原有 Zuul 的基础上，增加对注册中心的支持，同时在基于 Spring Boot Starter 机制基础上，可以在极短的时间内完成 API 网关的开发部署任务。


<Image alt="图片3.png" src="https://s0.lgstatic.com/i/image6/M00/23/96/CioPOWBXaHKAXbZsAAOHtjWJwBo401.png"/> 
  
Zuul 基于 Servlet 的请求响应处理过程

但好景不长，后来 Netflix 内部产生分歧，Netflix 官方宣布 Zuul 停止维护，这让 Spring 机构也必须转型。于是 Spring Cloud 团队决定开发自己的第二代 API 网关产品：Spring Cloud Gateway。

#### Spring Cloud Gateway

与 Zuul 是"别人家的孩子"不同，Spring Cloud Gateway 是 Spring 自己开发的新一代 API 网关产品。它基于 NIO 异步处理，摒弃了 Zuul 基于 Servlet 同步通信的设计，因此拥有更好的性能。同时，Spring Cloud Gateway 对配置进行了进一步精简，比 Zuul 更加简单实用。

以下是 Spring Cloud Gateway 的关键特征：

* 基于 JDK 8+ 开发；

* 基于 Spring Framework 5 + Project Reactor + Spring Boot 2.0 构建；

* 支持动态路由，能够匹配任何请求属性上的路由；

* 支持基于 HTTP 请求的路由匹配（Path、Method、Header、Host 等）；

* 过滤器可以修改 HTTP 请求和 HTTP 响应（增加/修改 Header、增加/修改请求参数、改写请求 Path 等等）；

* ...

当下 Spring Cloud Gateway 已然是 Spring Cloud 体系上API 网关标准组件。Spring Cloud Gateway 十分优秀，Spring Cloud Alibaba 也默认选用该组件作为网关产品，下面我们就通过实例讲解 Spring Cloud Gateway 的使用办法。

### Spring Cloud Gateway的配置技巧

#### Spring Cloud Gateway使用入门

示例说明：

假设"service-a"微服务提供了三个 RESTful 接口。


<Image alt="图片4.png" src="https://s0.lgstatic.com/i/image6/M00/23/99/Cgp9HWBXaICAUVGbAACopAyWXv0370.png"/> 


假设 "service-b" 微服务提供了三个 RESTful 接口。


<Image alt="图片5.png" src="https://s0.lgstatic.com/i/image6/M00/23/96/CioPOWBXaI2APUbjAACpocL8xRE677.png"/> 


如何通过部署 Spring Cloud Gateway 实现 API 路由功能来屏蔽后端细节呢？

第一步，利用 Spring Initializr 向导创建 Gateway 工程，确保 pom.xml 引入以下依赖：

```xml
<!-- Nacos客户端 -->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
<!-- Spring Cloud Gateway Starter -->
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-gateway</artifactId>
</dependency>
<!-- 对外提供Gateway应用监控指标 -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

第二步，在 application.yml 增加如下配置。

```yaml
spring:
  application:
    name: gateway #配置微服务id
  cloud:
    nacos:
      discovery:
        server-addr: 192.168.31.101:8848 #nacos通信地址
        username: nacos
        password: nacos
    gateway: #让gateway通过nacos实现自动路由转发
      discovery:
        locator:
          enabled: true #locator.enabled是自动根据URL规则实现路由转发
server:
  port: 80 #服务端口号
management: 
  endpoints:
    web:
      exposure:
        include: '*' #对外暴露actuator所有监控指标，便于监控系统收集跟踪
```

在上面的配置中最重要的一句是：

```java
spring.cloud.gateway.discovery.locator.enabled=true
```

这是一个自动项，允许 Gateway 自动实现后端微服务路由转发， Gateway 工程启动后，在浏览器地址栏按下面格式访问后端服务。

```java
http://网关IP:端口/微服务id/URI
```

例如，网关 IP 为：192.168.31.103，我们需要通过网关执行 service-a 的 list 方法，具体写法为：

```java
http://192.168.31.103:80/service-a/list
```

访问后 Gateway 按下图流程进行请求路由转发。


<Image alt="图片6.png" src="https://s0.lgstatic.com/i/image6/M00/23/99/Cgp9HWBXaViAFTHsAAHX8DX4Vz8328.png"/> 
  
基于网关自动路由处理流程

咱们来梳理下路由转发流程：

1. Gateway、service-a 这些都是微服务实例，在启动时向 Nacos 注册登记；

2. 用户端向 Gateway 发起请求，请求地址<http://192.168.31.103:80/service-a/list>；

3. Gateway 网关实例收到请求，解析其中第二部分 service-a，即微服务 Id，第三部分 URI 为"/list"。之后向 Nacos 查询 service-a 可用实例列表；

4. Nacos 返回 120 与 121 两个可用微服务实例信息；

5. Spring Cloud Gateway 内置 Ribbon，根据默认轮询策略将请求转发至 120 实例，转发的完整 URL 将附加用户的 URI，即<http://192.168.31.120:80/list>；

6. 120 实例处理后返回 JSON 响应数据给 Gateway；

7. Gateway 返回给用户端，完成一次完整的请求路由转发过程。

讲到这，我们已理解了 Spring Cloud Gateway 的执行过程。但是真实项目中，存在着各种特殊的路由转发规则，而非自动路由能简单解决的，在 Spring Cloud Gateway 项目中内置了强大的"谓词"系统，可以满足企业应用中的各种转发规则要求，下一小节咱们就来介绍常见的谓词用法。

#### 谓词（Predicate）与过滤器（Filter）

在讲解前需要引入 Gateway 网关三个关键名词：路由（Route）、谓词（Predicate）、过滤器（Filter）。

路由（Route）是指一个完整的网关地址映射与处理过程。一个完整的路由包含两部分配置：谓词（Predicate）与过滤器（Filter）。前端应用发来的请求要被转发到哪个微服务上，是由谓词决定的；而转发过程中请求、响应数据被网关如何加工处理是由过滤器决定的。说起来有些晦涩，我们通过实例进行讲解就容易理解了。

**谓词（Predicate）**

这里我们给出一个实例，将原有 Gateway 工程的 application.yml 文件修改为下面的设置：

```yaml
spring:
  application:
    name: gateway
  cloud:
    nacos:
      discovery:
        server-addr: 192.168.31.10:8848
        username: nacos
        password: nacos
    gateway: 
      discovery:
        locator:
          enabled: false #不再需要Gateway路由转发
      routes:  #路由规则配置
        #第一个路由配置，service-a路由规则
        - id: service_a_route #路由唯一标识
          #lb开头代表基于gateway的负载均衡策略选择实例
          uri: lb://service-a 
          #谓词配置
          predicates:
            #Path路径谓词，代表用户端URI如果以/a开头便会转发到service-a实例
            - Path=/a/** 
            #After生效时间谓词，2020年10月15日后该路由才能在网关对外暴露
            - After=2020-10-05T00:00:00.000+08:00[Asia/Shanghai]
          #谓词配置
          filters:
            #忽略掉第一层前缀进行转发
          - StripPrefix=1 
            #为响应头附加X-Response=Blue
          - AddResponseHeader=X-Response,Blue 
        #第二个路由配置，service-b路由规则
        - id: service_b_route
          uri: lb://service-b
          predicates:
            - Path=/b/**
          filters:
            - StripPrefix=1
server:
  port: 80
management:
  endpoints:
    web:
      exposure:
        include: '*'
```

我来翻译下上面的配置：  

在 2020 年 10 月 15 日后，当用户端发来/a/...开头的请求时，Spring Cloud Gateway 会自动获取 service-a 可用实例，默认采用轮询方式将URI附加至实例地址后，形成新地址，service-a处理后 Gateway 网关自动在响应头附加 X-Response=Blue。至于第二个 service_b_route，比较简单，只说明当用户访问/b开头 URL 时，转发到 service-b 可用实例。

完整的路由配置格式固定如下：

```yaml
spring:
    gateway: 
      discovery:
        locator:
          enabled: false  #不再需要Gateway路由转发
      routes: 
        - id: xxx #路由规则id
          uri: lb://微服务id  #路由转发至哪个微服务
          predicates: 
         //具体的谓词
         filters:
         //具体的过滤器
```

其中 predicates 是重点，说明路由生效条件，在这里我将常见的谓词使用形式列出来。

* After 代表在指定时点后路由规则生效。

```java
predicates:
    - After=2020-10-04T00:00:00.000+08:00
```

* Before 代表在指定时点前路由规则生效。

```java
predicates:
    - Before=2020-01-20T17:42:47.789-07:00[America/Denver]
```

* Path 代表 URI 符合映射规则时生效。

```java
predicates:
    - Path=/b/**
```

* Header 代表包含指定请求头时生效。

```java
predicates:
    - Header=X-Request-Id, \d+
```

这里额外解释下，如果请求具有名为 X-Request-Id 的 Header，其值与\\d+正则表达式匹配（具有一个或多个数字的值），则该路由匹配。

* Method 代表要求 HTTP 方法符合规定时生效。

```java
predicates:
    - Method=GET
```

谓词是 Gateway 网关中最灵活的部分，刚才列举的是最常用的谓词，还有很多谓词是在文中没有提到，如果你对这部分感兴趣可以翻阅[https://spring.io/projects/spring-cloud-gateway](https://spring.io/projects/spring-cloud-gateway%E5%AE%98%E6%96%B9%E6%96%87%E6%A1%A3%E8%BF%9B%E8%A1%8C%E5%AD%A6%E4%B9%A0)进行学习。

**过滤器（Filter）**

过滤器（Filter）可以对请求或响应的数据进行额外处理，这里我们列出三个最常用的内置过滤器进行说明。

* AddRequestParameter 是对所有匹配的请求添加一个查询参数。

```java
filters:
- AddRequestParameter=foo,bar #在请求参数中追加foo=bar
```

* AddResponseHeader 会对所有匹配的请求，在返回结果给客户端之前，在 Header 中添加响应的数据。

```java
#在Response中添加Header头，key=X-Response-Foo，Value=Bar。
filters:
- AddResponseHeader=X-Response,Blue
```

* Retry 为重试过滤器，当后端服务不可用时，网关会根据配置参数来发起重试请求。

```java
filters:
#涉及过滤器参数时，采用name-args的完整写法
- name: Retry #name是内置的过滤器名
  args: #参数部分使用args说明
    retries: 3
    status: 503
```

以上片段含义为，当后端服务返回 503 状态码的响应后，Retry 过滤器会重新发起请求，最多重试 3 次。

以上是三种最常用的内置过滤器的使用案例，因为 Spring Cloud 内置过滤器将近 30 个，这里咱们就不一一列举，有兴趣的同学可以查询官方资料。

<https://docs.spring.io/spring-cloud-gateway/docs/2.2.6.RELEASE/reference/html/#gatewayfilter-factories>

### Gateway 的执行原理与自定义过滤器

#### Spring Cloud Gateway 的执行原理

在初步掌握 Spring Cloud Gateway 的配置技巧与谓词用法后，我们来关注 Gateway 底层的实现细节。

下图是 Spring Cloud Gateway 的执行流程。


<Image alt="图片7.png" src="https://s0.lgstatic.com/i/image6/M00/23/96/CioPOWBXaLWAYmNDAADePiHh5QM390.png"/> 


按执行顺序可以拆解以下几步：

1. Spring Cloud Gateway 启动时基于 Netty Server 监听指定的端口（该端口可以通过 server.port 属性自定义）。当前端应用发送一个请求到网关时，进入 Gateway Handler Mapping 处理过程，网关会根据当前 Gateway 所配置的谓词（Predicate）来决定是由哪个微服务进行处理。

2. 确定微服务后，请求向后进入 Gateway Web Handler 处理过程，该过程中 Gateway 根据过滤器（Filters）配置，将请求按前后顺序依次交给 Filter 过滤链进行前置（Pre）处理，前置处理通常是对请求进行前置检查，例如：判断是否包含某个指定请求头、检查请求的 IP 来源是否合法、请求包含的参数是否正确等。

3. 当过滤链前置（Pre）处理完毕后，请求会被 Gateway 转发到真正的微服务实例进行处理，微服务处理后会返回响应数据，这些响应数据会按原路径返回被 Gateway 配置的过滤链进行后置处理（Post），后置处理通常是对响应进行额外处理，例如：将处理过程写入日志、为响应附加额外的响应头或者流量监控等。

可以看到，在整个处理过程中谓词（Predicate）与过滤器（Filter）起到了重要作用，谓词决定了路径的匹配规则，让 Gateway 确定应用哪个微服务，而 Filter 则是对请求或响应作出实质的前置、后置处理。

在项目中功能场景多种多样，像日常的用户身份鉴权、日志记录、黑白名单、反爬虫等基础功能都可以通过自定义 Filter 为 Gateway 进行功能扩展，下面我们通过"计时过滤器"为例，讲解如何为 Gateway 绑定自定义全局过滤器。

#### 自定义全局过滤器

在 Spring Cloud Gateway 中，自定义过滤器分为两种，全局过滤器与局部过滤器。两者唯一的区别是：全局过滤器默认应用在所有路由（Route）上，而局部过滤器可以为指定的路由绑定。下面咱们通过"计时过滤器"这个案例讲解全局过滤器的配置。所谓计时过滤器是指任何从网关访问的请求，都要在日志中记录下从请求进入到响应退出的执行时间，通过这个时间运维人员便可以收集并分析哪些功能进行了慢处理，以此为依据进行进一步优化。下面是计时过滤器的代码，重要的部分我通过注释进行了说明。

```java
package com.lagou.gateway.filter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
@Component //自动实例化并被Spring IOC容器管理
//全局过滤器必须实现两个接口：GlobalFilter、Ordered
//GlobalFilter是全局过滤器接口，实现类要实现filter()方法进行功能扩展
//Ordered接口用于排序，通过实现getOrder()方法返回整数代表执行当前过滤器的前后顺序
public class ElapsedFilter implements GlobalFilter, Ordered {
    //基于slf4j.Logger实现日志输出
    private static final Logger logger = LoggerFactory.getLogger(ElapsedFilter.class);
    //起始时间属性名
    private static final String ELAPSED_TIME_BEGIN = "elapsedTimeBegin";
    /**
     * 实现filter()方法记录处理时间
     * @param exchange 用于获取与当前请求、响应相关的数据，以及设置过滤器间传递的上下文数据
     * @param chain Gateway过滤器链对象
     * @return Mono对应一个异步任务，因为Gateway是基于Netty Server异步处理的,Mono对就代表异步处理完毕的情况。
     */
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        //Pre前置处理部分
        //在请求到达时，往ServerWebExchange上下文环境中放入了一个属性elapsedTimeBegin，保存请求执行前的时间戳
        exchange.getAttributes().put(ELAPSED_TIME_BEGIN, System.currentTimeMillis());

        //chain.filter(exchange).then()对应Post后置处理部分
        //当响应产生后，记录结束与elapsedTimeBegin起始时间比对，获取RESTful API的实际执行时间
        return chain.filter(exchange).then(
                Mono.fromRunnable(() -> { //当前过滤器得到响应时，计算并打印时间
                    Long startTime = exchange.getAttribute(ELAPSED_TIME_BEGIN);
                    if (startTime != null) {
                        logger.info(exchange.getRequest().getRemoteAddress() //远程访问的用户地址
                                + " | " +  exchange.getRequest().getPath()  //Gateway URI
                                + " | cost " + (System.currentTimeMillis() - startTime) + "ms"); //处理时间
                    }
                })
        );
    }
    //设置为最高优先级，最先执行ElapsedFilter过滤器
    //return Ordered.LOWEST_PRECEDENCE; 代表设置为最低优先级
    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
```

运行后通过 Gateway 访问任意微服务便会输出日志：

```java
2021-01-10 12:36:01.765  INFO 14052 --- [ctor-http-nio-4] com.lagou.gateway.filter.ElapsedFilter   : /0:0:0:0:0:0:0:1:57873 | /test-service/test | cost 821ms
```

日志包含四部分：

* 日志的基础信息包括时间、日志级别、线程、产生的类与方法等。

* /0:0:0:0:0:0:0:1:57873 代表访问者的远程 IP 端口等信息。

* /test-service/test 是通过 Gateway 访问的完整 URI，第一部分是服务名，第二部分是 RESTful 接口。

* cost 821ms 是具体的执行时间。

以上就是全局过滤器的开发方法，至于局部过滤器的配置方法与全局过滤器极为相似，有兴趣的同学通过下面的官方文档了解更详细的内容。

[https://docs.spring.io/spring-cloud-gateway/docs/2.2.7.BUILD-SNAPSHOT/reference/html/](https://docs.spring.io/spring-cloud-gateway/docs/2.2.7.BUILD-SNAPSHOT/reference/html/%E4%BA%86%E8%A7%A3%E6%9B%B4%E5%A4%9A%E7%BB%86%E8%8A%82)

### 小结与预告

这一讲咱们学了三方面内容，首先讲解了什么是 API 网关，API 网关是负责微服务请求统一路由转发的组件，用户端所有的请求都要经过 API 网关路由、加工、过滤后送达给后端微服务。其次，讲解了 Spring Cloud Gateway 网关的部署方式，了解到谓词（Predicate）与过滤器（Filter）的作用。最后，咱们通过实例介绍了 Spring Cloud Gateway 的执行原理并实现了计时功能的全局过滤器。

这里给你出一道思考题：结合你当前的项目思考下，API 网关除了路由还能额外实现哪些功能呢？

下一讲我们将开始一个新篇章，介绍在微服务环境下如何通过服务降级、熔断等机制保护我们的微服务架构，避免雪崩效应的产生。

