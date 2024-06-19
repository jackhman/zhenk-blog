# 第17讲：Dubbo插件核心剖析，Trace是这样跨服务传播的

今天我们进入 Dubbo 插件核心剖析的学习。

#### Dubbo 架构剖析

Dubbo 是 Alibaba 开源的分布式服务框架，在前面的课时中，我们搭建的 demo-webapp 示例就是通过 Dubbo 实现远程调用 demo-provider 项目中 HelloService 服务的。通过前面 demo 示例的演示，你可能已经大概了解 Dubbo 的架构，如下图所示：


<Image alt="image (12).png" src="https://s0.lgstatic.com/i/image/M00/02/8A/Ciqc1F6xg_2AezlaAAlvM3IJlyE080.png"/> 


这里简单说明一下上图中各个步骤与 Demo 示例之间的关系：

1. demo-provider 项目所在的 Container 容器启动，初始化其中的服务。demo-provider 启动之后，作为服务的提供方（Dubbo Provider），Dubbo 框架会将其暴露的服务地址注册到注册中心（Registry，即示例中的 Zookeeper）。
2. demo-webapp 启动之后，作为服务的消费者（Dubbo Consumer），可以在注册中心处订阅关注的服务地址。
3. 注册中心在收到订阅之后，会将 Dubbo Provider 的地址列表发送给 Dubbo Consumer，同时与 Dubbo Consumer 维持长连接。如果后续 Dubbo Provider 的地址列表发生变化，注册中心会实时将变更后的地址推送给 Dubbo Consumer。
4. 在 Dubbo Consumer 从注册中心拿到 Dubbo Provider 的地址列表之后，会根据一定的负载均衡方式，从地址列表中选择一个 Dubbo Provider，与其建立网络连接，并发起 RPC 请求，调用其暴露的服务。
5. 在 Dubbo Consumer 和 Dubbo Provider 运行的过程中，我们可以将调用时长、调用次数等监控信息定时发送到监控中心（Monitor）处进行统计，从而实现监控服务状态的能力。Monitor 在上述架构中不是必须存在的。

了解了 Dubbo 框架顶层的运行逻辑之后，我们进一步深入了解一下 Dubbo 框架架构。Dubbo 最大的特点是按照分层的方式来进行架构的，这种方式可以使各个层之间的耦合降到最低。从服务模型的角度来看，Dubbo 采用的是一种非常简单的模型，要么是提供方提供服务，要么是消费者消费服务，基于这一点可以抽象出服务提供方（Provider）和服务消费方（Consumer）两个角色。如下图所示，图左侧蓝色部分为 Dubbo Consumer 相关接口和实现类，右边绿色部分为 Dubbo Provider 相关的接口和实现类， 位于中轴线上的为双方都用到的接口：


<Image alt="image.png" src="https://s0.lgstatic.com/i/image/M00/02/8A/CgqCHl6xhB6Ac8xeAAUdCw2BNJU591.png"/> 


下面我将结合 Dubbo 官方文档，分别介绍一下 Dubbo 框架这 10 层的核心功能。

* **服务接口层（Service）**：它与实际业务逻辑相关，根据 Provider 和 Consumer 的具体业务设计相应的接口和实现。其中接口对应 demo 示例中的 HelloService 接口，Implement 实现则对应 demo 示例中 DefaultHelloService 这个实现类。
* **配置层（Config）**：用来对外配置接口，以 ServiceConfig 和 ReferenceConfig 为中心，可以直接创建配置类，也可以通过 Spring 解析配置生成配置类。在 demo-webapp 中使用的@Reference 注解（注入 HelloService 接口实现），就是依赖 ReferenceConfig 实现的；在 demo-provider 中通过 application.yml 配置文件暴露的接口，就是依赖 ServiceConfig 实现的。
* **服务代理层（Proxy）**：它是服务接口代理，这一层会生成服务的客户端 Stub 和服务器端Skeleton。Stub 和 Skeleton 可以帮助我们屏蔽下层网络相关的操作细节，这样上层就可以像调用本地方法一样，进行远程调用了。
* **服务注册层（Registry）**：用于封装服务地址的注册与发现，以服务 URL 为中心，扩展接口为 RegistryFactory、Registry 和 RegistryService。
* **集群层（Cluster）**：它主要用在 Consumer 这一侧，集群层可以封装多个负载均衡，并桥接注册中心，以 Invoker 为中心，扩展接口为 Cluster、Directory、Router 和 LoadBalance。将多个服务提供方组合为一个服务提供方，这样，就可以对 Consumer 透明，Consumer 会感觉自己只与一个 Provider 进行交互。
* **监控层（Monitor）**：用于统计 RPC 调用次数和调用时间。Dubbo 收发请求时，都会经过 Monitor 这一层，所以 Monitor 是 SkyWalking Dubbo 插件要关注的重点。
* **远程调用层（Protocol）**：这一层是对 RPC 调用的封装，封装了远程调用使用的底层协议，例如 Dubbo 协议、HTTP 协议、Thrift 协议、RMI 协议等。在 RPC 层面上，Protocol 层是核心层，只要有 Protocol + Invoker + Exporter 就可以完成非透明的 RPC 调用。
* **信息交换层（Exchange）**：这是一种封装请求-响应模式，用来完成同步与异步之间的转换。
* **网络传输层（Transport）**：它可以将底层的网路库（例如，netty、mina 等）抽象为统一接口。
* **数据序列化层（Serialize）**：包含可复用的一些工具，扩展接口为 Serialization、ObjectInput、ObjectOutput 和 ThreadPool。

了解了 Dubbo 10 层架构中每一层的核心功能之后，我们通过一次请求将 Dubbo 这 10 个层次串联起来，如下图所示：


<Image alt="image (1).png" src="https://s0.lgstatic.com/i/image/M00/02/8A/CgqCHl6xhHyATgFyAAcdl8xbycM744.png"/> 


图中底部的蓝色部分是 Consumer，上层绿色部分是 Provider。请求通过 Consumer 一侧的 Proxy 代理发出，在 Invoker 处会有 Cluster、Registry 两层参与进来，我们可以根据 Provider 地址列表以及负载均衡算法选择一个 Provider 进行调用。调用之后会经过 Filter，Dubbo 中的 Filter 可以做很多事情，例如，限流（limit）、监控（monitor），甚至可以直接创建 Mock 响应，返回给上层的 Consumer 服务。最后 Invoker 会选择合适的协议和序列化方式，通过 Client（封装了 Netty 等网络库）将请求发送出去。

在 Provider 侧接收到请求时，会通过底层的 Server（同样是依赖 Netty 等网络库实现）完成请求的接收，其中包括请求的反序列化、分配处理线程等操作。之后，在 Exporter 处选择合适的协议进行解析，经过 Filter 过滤之后交给 Invoker ，最终到达业务逻辑实现（Implement）。

#### Dubbo Filter

很多框架和组件中都有与 Filter 类似概念，例如，Java Servlet 编程中的 Filter，还有上一课时介绍的 Tomcat 中的 Valve，都是与 Filter 类似的概念。在上个课时介绍 Dubbo 请求的处理流程时，我们在 Dubbo 中也看到了 Filter 的概念，Dubbo 官方针对 Filter 做了很多的原生支持，常见的有打印访问日志（AccessLogFilter）、限流（ActiveLimitFilter、ExecuteLimitFilter、TpsLimitFilter）、监控功能（MonitorFilter）、异常处理（ExceptionFilter）等，它们都是通过 Dubbo Filter 来实现的。Filter 也是 Dubbo 用来实现功能扩展的重要机制，我们可以通过添加自定义 Filter 来增强或改变 Dubbo 的行为。

这里简单看一下 Dubbo 中与 Filter 相关的核心逻辑。首先，构建 Dubbo Filter 链表的入口是在 ProtocolFilterWrapper.buildInvokerChain() 方法处，它将加载到的 Dubbo Filter 实例串成一个 Filter 链表：

```java
private static <T> Invoker<T> buildInvokerChain(final Invoker<T> 
        invoker, String key, String group) {
    Invoker<T> last = invoker;  // 最开始的last是指向invoker参数
    // 通过SPI方式加载Filter
    List<Filter> filters = ExtensionLoader
           .getExtensionLoader(Filter.class)
             .getActivateExtension(invoker.getUrl(), key, group);
    // 遍历filters集合，将Filter封装成Invoker并串联成一个Filter链表
    for (int i = filters.size() - 1; i >= 0; i--) {
        final Filter filter = filters.get(i);
        final Invoker<T> next = last;
        last = new Invoker<T>() {
            @Override
            public Result invoke(Invocation invocation) {
                // 执行当前Filter的逻辑，在Filter中会调用下一个
                // Invoker.invoke()方法，触发下一个 Filter
                return filter.invoke(next, invocation);
            }
            // 其他方法的实现都委托给了invoker参数(略)
        };
    }
    return last;
}
```

buildInvokeChain() 方法的调用点如下图所示，其中传入的 Invoker 对象分别对应 Consumer 和 Provider：


<Image alt="使用Dubbo Filter链表的地方.png" src="https://s0.lgstatic.com/i/image/M00/02/8A/CgqCHl6xhLWAf_qVAAD_d-gi4bI785.png"/> 


在 getActivateExtension() 方法中，不是直接使用 SPI 方式加载 Filter 实现，中间还会有其他的过程，比如：

* 根据 Filter 上注解标注的 group 值确定它是工作在 Consumer 端还是 Provider 端。
* 根据用户配置开启或关闭某些特定的 Filter。
* 结合 Filter 默认优先级以及用户配置的优先级进行排序。


<Image alt="image (2).png" src="https://s0.lgstatic.com/i/image/M00/02/8A/CgqCHl6xhMiAekQOAADLuNv3QQ4506.png"/> 


getActivateExtension() 方法的代码非常长，但是逻辑并不复杂，如果你感兴趣可以翻看一下具体的代码实现。

在众多 Dubbo Filter 中，我们这里重点关注 MonitorFilter 的实现，它里面的 invoke() 方法中会记录并发线程数、请求耗时以及请求结果：

```java
public Result invoke(Invoker<?> invoker, Invocation invocation) {
    RpcContext context = RpcContext.getContext(); 
    String remoteHost = context.getRemoteHost();
    long start = System.currentTimeMillis(); // 记录请求的起始时间
    getConcurrent(invoker, invocation).incrementAndGet();//增加当前并发数
    try {
        Result result = invoker.invoke(invocation); // 执行后续Filter
        // 收集监控信息
        collect(invoker, invocation, result, remoteHost, 
            start, false);
        return result;
    } catch (RpcException e) {
        collect(invoker, invocation, null, remoteHost, start, true);
        throw e;
    } finally { // 减少当前并发数
        getConcurrent(invoker, invocation).decrementAndGet(); 
    }
}
```

collect() 方法会将上述监控信息整理成 URL 并缓存起来，具体实现如下：

```java
private void collect(Invoker<?> invoker, Invocation invocation, 
        Result result, String remoteHost, long start, boolean error) {
    URL monitorUrl = invoker.getUrl()
        .getUrlParameter(Constants.MONITOR_KEY);
    Monitor monitor = monitorFactory.getMonitor(monitorUrl);
    // 将请求的耗时时长、当前并发线程数以及请求结果等信息拼接到URL中
    URL statisticsURL = createStatisticsUrl(invoker, invocation, 
        result, remoteHost, start, error);
    monitor.collect(statisticsURL); // 在DubboMonitor中缓存该URL
}
```

DubboMonitor.collect() 方法会从 URL 中提取监控信息，并将其缓存到底层的 Map（statisticsMap 字段） 中。在进行缓存之前，该方法会对于相同 URL 的监控数据进行合并。另外，DubboMonitor 还会启动一个定时任务，定时发送 statisticsMap 字段中缓存的监控数据。在发送监控数据的时候，也会将监控数据整理成 URL 地址进行发送，这里不再展开。

#### SkyWalking Dubbo 插件

Dubbo MonitorFilter 的相关内容介绍完之后，我们开始进行对 Skywalking Dubbo 插件的分析。在 apm-dubbo-2.7.x-plugin 插件中，skywalking-plugin.def 定义的类是 DubboInstrumentation，它继承了 ClassInstanceMethodsEnhancePluginDefine 抽象类，拦截的是 MonitorFilter.invoke() 方法。具体的增强逻辑定义在 DubboInterceptor 中，其中的 beforeMethod() 方法会判断当前处于 Consumer 端还是 Provider 端：

* 如果处于 Consumer 端，则会将当前 TracingContext 上下文序列化成 ContextCarrier 字符串，并填充到 RpcContext 中。RpcContext 中携带的信息会在之后随 Dubbo 请求一起发送出去，相应的，还会创建 ExitSpan。
* 如果处于 Provider 端，则会从请求中反序列化 ContextCarrier 字符串，并填充当前 TracingContext 上下文。相应的，创建 EntrySpan。

DubboInterceptor.beforeMethod() 方法的具体实现如下：

```java
public void beforeMethod(EnhancedInstance objInst, Method method,
       Object[] allArguments, Class<?>[] argumentsTypes, 
            MethodInterceptResult result) throws Throwable {
    Invoker invoker = (Invoker)allArguments[0]; // invoke()方法的两个参数
    Invocation invocation = (Invocation)allArguments[1];
    // RpcConterxt是Dubbo用来记录请求上下文信息的对象
    RpcContext rpcContext = RpcContext.getContext(); 
    // 检测当前服务是Consumer端还是Provider端
    boolean isConsumer = rpcContext.isConsumerSide(); 
    URL requestURL = invoker.getUrl();
    AbstractSpan span;
    final String host = requestURL.getHost();
    final int port = requestURL.getPort();
    if (isConsumer) { // 检测是否为 Consumer
        final ContextCarrier contextCarrier = new ContextCarrier();
        // 如果当前是Consumer侧，则需要创建ExitSpan对象，其中EndpointName是
        // 由请求URL地址、服务名以及方法名拼接而成的
        span = ContextManager.createExitSpan(
            generateOperationName(requestURL, invocation), 
               contextCarrier, host + ":" + port);
        // 创建CarrierItem链表，其中会根据当前Agent支持的版本号对
        // ContextCarrier进行序列化，该过程在前文已经详细介绍过了
        CarrierItem next = contextCarrier.items(); 
        while (next.hasNext()) {
            next = next.next();
            // 将ContextCarrier字符串填充到RpcContext中，后续会随Dubbo请求一
            // 起发出
            rpcContext.getAttachments().put(next.getHeadKey(), 
                 next.getHeadValue());
        }
    } else { // 如果当前是Provider侧，则尝试从
        ContextCarrier contextCarrier = new ContextCarrier();
        CarrierItem next = contextCarrier.items();// 创建CarrierItem链表
        while (next.hasNext()) {
            next = next.next();
            // 从RpcContext中获取ContextCarrier字符串反序列化，并填充当前上
            // 面创建的空白ContextCarrier对象
            next.setHeadValue(rpcContext
                  .getAttachment(next.getHeadKey()));
        }
        // 创建 EntrySpan，这个过程在前面分析Tomcat插件的时候，详细分析过了
        span = ContextManager.createEntrySpan(generateOperationName(
            requestURL, invocation), contextCarrier);
    }
    // 设置Tags
    Tags.URL.set(span, generateRequestURL(requestURL, invocation)); 
    span.setComponent(ComponentsDefine.DUBBO);// 设置 component
    SpanLayer.asRPCFramework(span); // 设置 SpanLayer
}
```

DubboInterceptor.afterMethod() 方法的实现就比较简单了，它会检查请求结果是否有异常，如果有异常，则通过 Log 将异常的堆栈信息记录到当前 Span 中，并在当前 Span 设置异常标志（即 errorOccurred 字段设置为 true），handleMethodException() 方法也是如此处理异常的，afterMethod() 方法最后会调用 ContextManager.stopSpan() 方法关闭当前 Span（也就是 beforeMethod() 方法中创建的 EntrySpan 或 ExitSpan）。

下图展示了 Dubbo 插件的整个处理逻辑：


<Image alt="image (3).png" src="https://s0.lgstatic.com/i/image/M00/02/8B/Ciqc1F6xhReAQwqkAAKW-g53Uqc000.png"/> 


#### 总结

本课时结合了 demo 示例，介绍了 Dubbo 框架远程调用的基本运行原理，并进一步介绍了 Dubbo 框架的 10 层结构。之后，重点介绍了 Dubbo 中 Filter 的工作原理以及 MonitorFilter 的相关实现。最后，结合上述基础知识分析了 SkyWalking Dubbo 插件的核心原理及实现。

