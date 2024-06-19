# 09框架升级：WebFlux比WebMVC到底好在哪里？

前面我通过几讲的内容，对响应式编程的概念和开发框架做了介绍。从这一讲开始，我们将进入实际应用阶段，即围绕一个典型的多层架构，从每一层出发构建响应式应用程序。

首先关注的是 Web 服务层。在构建响应式 Web 服务上，Spring 5 中引入了全新的编程框架，那就是 Spring WebFlux。作为一款新型的 Web 服务开发框架，它与传统的 WebMVC 相比具体有哪些优势呢？今天我们就针对这个话题展开讨论。

### Spring WebFlux 的应用场景

WebFlux 用于构建响应式 Web 服务。在详细介绍 WebFlux 之前，我们先梳理一下这个新框架的应用场景，了解应用场景才能帮助我们对所要采用的技术体系做出正确的选择。

正如你在"05 \| 顶级框架：Spring 为什么选择 Reactor 作为响应式编程框架"中所了解到的，像 Reactor 这样的响应式库可以帮助我们构建一个异步的非阻塞流，并且为开发人员屏蔽了底层的技术复杂度。而基于 Reactor 框架的 WebFlux 进一步降低了开发响应式 Web 服务的难度。

微服务架构的兴起为 WebFlux 的应用提供了一个很好的场景。我们知道在一个微服务系统中，存在数十乃至数百个独立的微服务，它们相互通信以完成复杂的业务流程。这个过程势必会涉及大量的 I/O 操作，尤其是阻塞式 I/O 操作会整体增加系统的延迟并降低吞吐量。如果能够在复杂的流程中集成非阻塞、异步通信机制，我们就可以高效处理跨服务之间的网络请求。针对这种场景，WebFlux 是一种非常有效的解决方案。

### 从 WebMVC 到 WebFlux

接下来，我们将讨论 WebMVC 与 WebFlux 之间的差别，而这些差别实际上正是体现在从 WebMVC 到 WebFlux 的演进过程中。让我们先从传统的 Spring WebMVC 技术栈开始说起。

#### Spring WebMVC技术栈

一般而言，Web 请求处理机制都会使用"管道-过滤器（Pipe-Filter）"架构模式，而 Spring WebMVC 作为一种处理 Web 请求的典型实现方案，同样使用了 Servlet 中的过滤器链（FilterChain）来对请求进行拦截，如下图所示。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image6/M01/2C/90/Cgp9HWBlYNSAQ_6xAABLuhAav9c145.png"/> 
  
图 1 Spring WebMVC 中的过滤器链

我们知道 WebMVC 运行在 Servlet 容器上，这些容器常用的包括 Tomcat、JBoss 等。当 HTTP 请求通过 Servlet 容器时就会被转换为一个 ServletRequest 对象，而最终返回一个 ServletResponse 对象，FilterChain 的定义如下所示。

```java
public interface FilterChain {
    
    public void doFilter (ServletRequest request, ServletResponse response ) throws IOException, ServletException;
 
}
```

当 ServletRequest 通过过滤器链中所包含的一系列过滤器之后，最终就会到达作为前端控制器的 DispatcherServlet。DispatcherServlet 是 WebMVC 的核心组件，扩展了 Servlet 对象，并持有一组 HandlerMapping 和 HandlerAdapter。

当 ServletRequest 请求到达时，DispatcherServlet 负责搜索 HandlerMapping 实例并使用合适的 HandlerAdapter 对其进行适配。其中，HandlerMapping 的作用是根据当前请求找到对应的处理器 Handler，它只定义了一个方法，如下所示。

```java
public interface HandlerMapping {
 
    //找到与请求对应的 Handler，封装为一个 HandlerExecutionChain 返回
	HandlerExecutionChain getHandler(HttpServletRequest request) throws Exception;
}
```

而 HandlerAdapter 根据给定的 HttpServletRequest 和 HttpServletResponse 对象真正调用给定的 Handler，核心方法如下所示。

```java
public interface HandlerAdapter {
 
    //针对给定的请求/响应对象调用目标 Handler
	ModelAndView handle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception;
}
```

在执行过程中，DispatcherServlet 会在应用上下文中搜索所有 HandlerMapping。日常开发过程中，最常用的 HandlerMapping 包含 BeanNameUrlHandlerMapping 和 RequestMappingHandlerMapping，前者负责检测所有 Controller 并根据请求 URL 的匹配规则映射到具体的 Controller 实例上，而后者基于 @RequestMapping 注解来找到目标 Controller。

如果我们使用了 RequestMappingHandlerMapping，那么对应的 HandlerAdapter 就是 RequestMappingHandlerAdapter，它负责将传入的 ServletRequest 绑定到添加了 @RequestMapping 注解的控制器方法上，从而实现对请求的正确响应。同时， HandlerAdapter 还提供请求验证和响应转换等辅助性功能，使得 Spring WebMVC 框架在日常 Web 开发中非常实用。

作为总结，我梳理了 Spring WebMVC 的整体架构，如下图所示。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M00/2C/98/CioPOWBlYOGAF_ssAACxp3BYjUM960.png"/> 
  
图 2 Spring WebMVC 整体架构图

一直以来，Spring WebMVC 是我们开发 Web 服务的主流框架。但要注意的是，尽管 Servlet 本身在新版本中提供了异步非阻塞的通信机制，但 Spring WebMVC 在实现上并不允许在整个请求生命周期中都采用非阻塞式的操作方式。因此，Spring 在尽量沿用原有的开发模式以及 API 设计上提供了支持异步非阻塞的 Spring WebFlux 框架。

#### Spring WebFlux 技术栈

介绍完 Spring WebMVC，我们来说说 Spring WebFlux。事实上，前面介绍的 HandlerMapping、HandlerAdapter 等组件在 WebFlux 里都有同名的响应式版本，这是 WebFlux 的一种设计理念，即在既有设计的基础上，提供新的实现版本，只对部分需要增强和弱化的地方做了调整。

我们先来看第一个需要调整的地方，显然，我们应该替换掉原有的 Servlet API 以便融入响应式流。因此，在 WebFlux 中，代表请求和响应的是全新的 ServerHttpRequest 和 ServerHttpResponse 对象。

同样，WebFlux 中同样提供了一个过滤器链 WebFilterChain，定义如下。

```java
public interface WebFilterChain {
    Mono<Void> filter(ServerWebExchange exchange);
}
```

这里的 ServerWebExchange 相当于一个上下文容器，保存了 ServerHttpRequest、ServerHttpResponse 以及一些框架运行时状态信息。

在 WebFlux 中，和 WebMVC 中的 DispatcherServlet 相对应的组件是 DispatcherHandler。与 DispatcherServlet 类似，DispatcherHandler 同样使用了一套响应式版本的 HandlerMapping 和 HandlerAdapter 完成对请求的处理。请注意，这两个接口是定义在 org.springframework.web.reactive 包中，而不是在原有的 org.springframework.web 包中。响应式版本的 HandlerMapping 接口定义如下，可以看到这里返回的是一个 Mono 对象，从而启用了响应式行为模式。

```java
public interface HandlerMapping {
	 
	Mono<Object> getHandler(ServerWebExchange exchange);
}
```

同样，我们找到响应式版本的 HandlerAdapter，如下所示。

*** ** * ** ***

```java
public interface HandlerAdapter {
 
    Mono<HandlerResult> handle(ServerWebExchange exchange, Object handler);
}
```

对比非响应式版本的 HandlerAdapter，这里的 ServerWebExchange 中同时包含了 ServerHttpRequest 和 ServerHttpResponse 对象，而 HandlerResult 则代表了处理结果。相比 WebMVC 中 ModelAndView 这种比较模糊的返回结果，HandlerResult 更加直接和明确。

在 WebFlux 中，同样实现了响应式版本的 RequestMappingHandlerMapping 和 RequestMappingHandlerAdapter，因此我们仍然可以采用注解的方法来构建 Controller。另一方面，WebFlux 中还提供了 RouterFunctionMapping 和 HandlerFunctionAdapter 组合，专门用来提供基于函数式编程的开发模式。这样 Spring WebFlux 的整体架构图就演变成这样。


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image6/M01/2C/90/Cgp9HWBlYO6AE2c_AABMFtMZQAU060.png"/> 
  
图 3 Spring WebFlux 整体架构图

请注意，在处理 HTTP 请求上，我们需要使用支持异步非阻塞的响应式服务器引擎，常见的包括 Netty、Undertow 以及支持 Servlet 3.1 及以上版本的 Servlet 容器。

### 对比 WebFlux 和 WebMVC 的处理模型

现在我们已经明确了 WebMVC 到 WebFlux 的演进过程，但你可能会问，新的 WebFlux 要比传统 WebMVC 好在哪里呢？从两者的处理模型上入手可以帮助你很好地理解这个问题，我们一起来看一下。

#### WebFlux 和 Web MVC 中的处理模型

通过前面的讨论你已经知道 Servlet 是阻塞式的，所以 WebMVC 建立在阻塞 I/O 之上，我们来分析这种模型下线程处理请求的过程。假设有一个工作线程会处理来自客户端的请求，所有请求构成一个请求队列，并由一个线程按顺序进行处理。针对一个请求，线程需要执行两部分工作，首先是接受请求，然后再对其进行处理，如下图所示。


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image6/M00/2C/90/Cgp9HWBlYPeAePjYAABQR4znOfo927.png"/> 
  
图 4 同步阻塞式处理过程

在前面的示例中，正如你可能注意到的，工作线程的实际处理时间远小于花费在阻塞操作上的时间。这意味着工作线程会被 I/O 读取或写入数据这一操作所阻塞。从这个简单的图中，**我们可以得出结论，线程效率低下**。同时，因为所有请求是排队的，相当于一个请求队列，所以接受请求和处理请求这两部分操作实际上是可以共享等待时间的。

相比之下，WebFlux 构建在非阻塞 API 之上，这意味着没有操作需要与 I/O 阻塞线程进行交互。接受和处理请求的效率很高，如下图所示。


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image6/M00/2C/98/CioPOWBlYQSAV2szAACULiV9Rbo555.png"/> 
  
图 5 异步非阻塞式处理过程

将上图中所展示的异步非阻塞请求处理与前面的阻塞过程进行比较，我们会注意到，现在没有在读取请求数据时发生等待，工作线程高效接受新连接。然后，提供了非阻塞 I/O 机制的底层操作系统会告诉我们请求数据是否已经接收完成，并且处理器可以在不阻塞的情况下进行处理。

类似的，写入响应结果时同样不需要阻塞，操作系统会在准备好将一部分数据非阻塞地写入 I/O 时通知我们。这样，我们就拥有了最佳的 CPU 利用率。

前面的示例展示了 WebFlux 比 WebMVC 更有效地利用一个工作线程，因此可以在相同的时间内处理更多的请求。那么，如果是在多线程的场景下会发生什么呢？我们来看下面这张图。


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image6/M00/2C/90/Cgp9HWBlYQuAMuj3AABd75iFsms666.png"/> 
  
图 6 多线程处理过程示意图

从上图中可以看出，多线程模型允许更快地处理排队请求，能够同时接受、处理和响应几乎相同数量的请求。当然，我们明白多线程技术有利有弊。当处理用户请求涉及太多的线程实例时，相互之间就需要协调资源，这是由于它们之间的不一致性会导致性能下降。

#### 处理模型对性能的影响

讲到这里，你可能会问，不同的处理模型对性能会有多大程度的影响呢？这里我们就引用维护Spring 框架的 Pivotal 公司软件开发主管 Biju Kunjummen 的测试结果来对这一问题进行解答。

在 Biju Kunjummen 的测试用例中，他分别基于 WebMVC 所提供的阻塞式 RestTemplate 以及 WebFlux 所提供的非阻塞式 WebClient 工具类对远程 Web 服务发起请求。对于不同组的并发用户（300、1000、1500、3000、5000），他分别发送了一个 delay 属性设置为 300 ms 的请求，每个用户重复该场景 30 次，请求之间的延迟为 1 到 2 秒。测试用例中使用了 Gatling 这款工具来执行压测。

这里我们截取 300 和 3000 并发用户场景下的结果进行对比，如下面两张图所示。


<Image alt="Drawing 6.png" src="https://s0.lgstatic.com/i/image6/M00/2C/90/Cgp9HWBlYRSAUYUoAAK7ajk3HpQ553.png"/> 
  
图 7 300 并发用户下的测试结果


<Image alt="Drawing 7.png" src="https://s0.lgstatic.com/i/image6/M00/2C/98/CioPOWBlYRuAQxDNAAK5Dq13-Eg742.png"/> 
  
图 8 3000 并发用户下的测试结果

可以看到，在 300 并发用户的测试用例下，WebMVC 和 WebFlux 的表现比较接近，意味着在并发量不高的情况下，非阻塞式的请求处理过程并没有太多优势；而在 3000 并发用户下，情况就完全不一样了。无论是吞吐量还是响应时间，WebFlux 都具有压倒性的性能优势。（完整版的测试结果和数据，你可以参考 Biju Kunjummen 的这篇文章进行获取：[https://dzone.com/articles/raw-performance-numbers-spring-boot-2-webflux-vs-s](https://dzone.com/articles/raw-performance-numbers-spring-boot-2-webflux-vs-s?fileGuid=xxQTRXtVcqtHK6j8)）

### 小结与预告

从这一讲开始，我们将引入 Web 服务层的响应式开发框架 Spring WebFlux。而在介绍具体的开发技术之前，你有必要对这款新型的开发框架的特性有全面的理解。今天的内容关注了传统 WebMVC 和 WebFlux 之间的演进和对比过程，并分析 WebFlux 所具备的处理模型及其在性能上的优势。

这里给你留一道思考题：Spring WebFlux 和 Spring WebMVC 的整体架构有什么区别和联系？

下一讲就要开始使用 Spring WebFlux 来构建响应式的 RESTful Web 服务了，我会先为你介绍基于注解模式来实现的响应式 Controller，并完成与 ReactiveSpringCSS 的集成。
> 点击链接，获取课程相关代码↓↓↓  
> [https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git](https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git?fileGuid=xxQTRXtVcqtHK6j8)

