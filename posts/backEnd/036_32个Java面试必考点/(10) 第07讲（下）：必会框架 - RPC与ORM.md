# 第07讲（下）：必会框架-RPC与ORM

###### 详解 Netty

下面我们来看 Netty 相关的知识点，如下图所示。

<br />


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/8A/C8/CgoB5l14qRCAXHEcAAF5eJmBAIE201.png"/> 


###### 特点

如上图左侧所示，首先了解 Netty 的特点。

* Netty 是一个高性能的异步事件驱动的 NIO 框架，它对消息的处理采用串行无锁化设计，提供了对 TCP、UDP 和文件传输的支持。

* Netty 内置了多种 encoder 和 decoder 实现来解决 TCP 粘包问题。

* Netty 处理消息时使用了池化的缓冲池 ByteBufs，提高性能。

* 结合内存零 copy 机制，减少了对象的创建，降低了 GC 的压力。

###### 主要概念

需要掌握 Netty 中的一些对象概念，比如将 Socket 封装成 Channel 对象，在 Channel 读写消息时，使用 ChannelHandler 对消息进行处理，一组 Handler 顺序链接组成 ChannelPipeline 的责任链模式。一个 Channel 产生的所有事件交给一个单线程的 EventLoop 事件处理器来进行串行处理。而 Bootstrap 对象的主要作用是配置整个 Netty 程序串联起各个组件，是一个 Netty 应用的起点。

###### 零内存复制

要了解 Netty 的内存零 copy 技术。包括使用堆外内存来避免在 Socket 读写时缓冲数据在堆外与堆内进行频繁复制；使用 CompositeByteBuf 来减少多个小的 buffer 合并时产生的内存复制；使用 FileRegion 实现文件传输的零拷贝等。

###### 粘包与半包

要了解 TCP 协议下粘包与半包等产生原因，知道 Netty 提供的多个 decoder 是用什么方式解决这个问题的。例如 FixedLengthFrameDecoder 用来解决固定大小数据包的粘包问题、LineBasedFrameDecoder 适合对文本进行按行分包、DelimiterBasedFrameDecoder 适合按特殊字符作为分包标记的场景、LengthFieldBasedFrameDecoder 可以支持复杂的自定义协议分包等等。

###### Netty3 和 Netty4

简单了解一下 Netty3 和 Netty4 的区别，其中主要的就是两个版本的线程处理模型完全不同， Netty4 处理得更加优雅。其他的以 Netty4 的特点为主即可。

###### 线程模型

Netty 线程模型采用"服务端监听线程"和"IO 线程"分离的方式，如下图，左侧 Boss 线程组负责监听事件，创建 Socket 并绑定到 Worker 线程组。

<br />


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/8A/E8/CgotOV14qRCAOMXfAACEn9bOiF8679.png"/> 


Worker 线程组负责 IO 处理。线程组由 EventLoopGroup 实现，其中包含了多个 EventLoop 事件处理器，每个 EventLoop 包含一个处理线程。通常情况下在 NIO 非阻塞模式下，Netty 为每个 Channel 分配一个 EventLoop，并且它的整个生命周期中的事件都由这个 EventLoop 来处理。一个 EventLoop 可以绑定多个 Channel。

如上图右侧所示，EventLoop 的处理模型，Netty4 中 Channel 的读写事件都是由 Worker 线程来处理。请求处理中最主要的就是 ChannelPipeline，其中包含了一组 ChannelHandler。这些 Handler 组成了责任链模式，依次对 Channel 中的消息进行处理。一般接收消息时，Pipeline 处理完成会把消息提交到业务线程池进行处理，当业务线程处理完成时，会封装成 Task，提交回 Channel 对应的 EventLoop 来写回返回值。

###### 详解 RPC

RPC 是远程过程调用的简写，RPC 与 HTTP 一样都可以实现远程服务的调用，但是使用方式上有很大的区别。它能够像使用本地方法一样调用远程的方法。

###### 交互流程

如下图所示，来看 RPC 的交互流程。图中绿色的模块是 RPC 中最主要的三个角色。左边的是 Client 端，就是请求的发起方，也可以叫作 Consumer 或者 Referer。右边的模块是 Server 端，就是提供服务实现的一方，也叫作 Provider。

<br />


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/8A/C8/CgoB5l14qRCAD22_AAAwyeZIb9A096.png"/> 


为了保持较高的性能，Client 端一般都是直接请求远端的 Server 节点。因此，RPC 框架需要自动的服务注册与发现的能力，上方的绿色的注册中心就是用来动态维护可用服务节点信息的模块。

图中的箭头代表交互流程。当 Server 提供服务时，向注册中心注册服务信息，告诉注册中心可以提供哪些服务。同时与注册中心保持心跳或者维持长链接，来维持 Server 可用状态，具体方式与注册中心的实现有关，例如 ZK 使用长链接推送方式而 Consul 使用心跳方式。

如上图所示，当 Client 需要使用服务时，会先向注册中心订阅服务，获得可用的 Server 节点，并保存在 Client 本地。当 Server 节点发生变更时会通知 Client 更新本地 Server 节点信息。Client 按某种负载均衡策略直接请求 Server 使用服务。注意：注册中心只参与服务节点的注册与变更通知，并不会参与具体请求的处理。

另外一般的 RPC 框架都提供了完整的服务治理能力，因此会有额外的管理模块和信息采集模块来监控、管理服务。如图中灰色的模块所示。

###### 开源框架

来看三款比较有特色的主流 RPC 框架，如下图所示。

<br />


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/8A/E8/CgotOV14qRGALP4IAACKCkAICAg250.png"/> 


Dubbo 是阿里开源的 RPC 框架，提供完善的服务治理能力，可以快速为 Java 服务提供 RPC 能力。Dubbo 提供了随机、轮询、最少调用优先等多种负载均衡策略，提供对 ZK 等多种注册中心等支持，能够自动完成服务的注册与发现。Dubbo 提供可视化的管理后台，方便对服务状态进行监控和管理。Dubbo 的数据通信默认使用我 Netty 来实现，拥有非常不错的性能。

微博开源的轻量级服务治理框架 Motan。Motan 的特点是轻量级，提供强大灵活的扩展能力，Motan 提供了多语言支持，目前支持 Java、PHP、Lua、Golang 等多语言交互，目前 Python 和 C++ 的客户端也在研发中。Motan 通过 Agent 代理方式，实现了的跨语言 ServiceMesh 的支持。ServiceMesh 被誉为下一代微服务，在课时 10 还会重点介绍。Motan Java 版本的通信层也是通过 Netty 来实现的，基于 TCP 的私有协议进行通信。

Google 开源的 gRPC。gRPC 默认使用 Protobuf 进行消息序列化，非常适合多语言服务之间进行交互。虽然 gRPC 本身支持的服务治理能力并不强，但拥有非常灵活的插件扩展能力，可以方便的实现自定义的服务治理能力。gRPC 基于 HTTP2 协议，能够支持链接复用，并且提供了流式调用能力，也支持从服务端进行推送消息的能力。

###### 详解 MyBatis

###### 特点

下面我们来看 ORM 框架 MyBatis，它的知识结构图如下所示。首先要了解它的特点，可以和 Hibernate 来对比进行理解。

<br />


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/8A/C8/CgoB5l14qRGATSOHAAF3bP90vkw672.png"/> 


MyBatis 的优点：

1. MyBatis 是原生SQL，不像 Hibernate 的 HQL 需要额外的学习成本；

2. MyBatis 的 SQL 语句与代码进行了解耦合，这与 Hibernate 是一致的；

3. MyBatis 功能简单，学习成本比较低，使用的门槛也非常低，可以快速上手；

4. MyBatis SQL调优比较灵活，而 Hibernate，SQL 语句是自动生成的，当有复杂语句需要进行优化时就比较难处理。

<br />

MyBatis 的缺点：

1. 相比 Hibernate 这样的全自动 ORM 框架，不能自动生成 SQL 语句，编写 SQL 的工作量比较大，尤其是字段多、关联表多的情况下；

2. 另外一个缺点就是 SQL 语句依赖于具体数据库，导致数据库迁移性差，而 Hibernate 则拥有良好的数据库可移植性。

###### 缓存

MyBatis 提供了两级缓存。MyBatis 的一级缓存的存储作用域是 Session，会对同一个 Session 中执行语句的结果进行缓存，来提高再次执行时的效率。MyBatis 内部通过 HashMap 实现存储缓存，一级缓存是默认开启的。

MyBatis 的二级缓存的作用域是一个 Mapper 的 namespace，在同一个 namespace 中查询 SQL 时可以从缓存中获取数据。二级缓存能够跨 SqlSession 生效，并且可自定义存储源，比如 Ehcache。MyBatis 的二级缓存可以设置剔除策略、刷新间隔、缓存数量等参数来进行优化。

###### 应用

* MyBatis 提供 #{} 的变量占位符，来支持 SQL 预编译，防止 SQL 注入。

* 获取自增主键的 id 可以通过 keyProperty 配置和使用 selectKey 两种方式来实现。

* 要记住动态 SQL 常用的几个标签，例如 foreach、where、if、choose、trim 等等。

###### 主要对象

需要理解 MyBatis 的主要对象有哪些，它们的作用是什么，举例如下。

* SqlSessionFactory 是用来创建 SqlSession 的工厂类，一个 SqlSessionFactory 对应配置文件中的一个环境，也就是一个数据库配置。

* 对数据库的操作必须在 SqlSession 中进行，SqlSession 非线程安全，每一次操作完数据库后都要调用 Close 对其进行关闭。

* SqlSession 通过内部的 Executor 来执行增删改查操作。

* StatementHandler 用来处理 SQL 语句预编译，设置参数等。

* ParameterHandler 用来设置预编译参数。

* ResultSetHandler 用来处理结果集。

* TypeHandler 进行数据库类型和 JavaBean 类型的互相映射。

###### 插件机制

MyBatis 的插件机制是通过拦截器组成责任链来对 Executor、StatementHandler、ParameterHandler、ResultSetHandler 这四个作用点进行定制化处理。另外可以了解一下基于插件机制实现的 PageHelper 分页插件。

###### 处理流程

如下图所示，MyBatis 的处理流程。

<br />


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/8A/E8/CgotOV14qRGANGszAABEHrKX1zU413.png"/> 


在执行 SQL 时，首先会从 SqlSessionFactory 中创建一个新的 SqlSession。

SQL 语句是通过 SqlSession 中的 Executor 来执行，Executor 根据 SqlSession 传递的参数执行 query() 方法，然后创建一个 StatementHandler 对象，将必要的参数传递给 StatementHandler，由 StatementHandler 来完成对数据库的查询。

StatementHandler 调用 ParameterHandler 的 setParameters 方法，把用户传递的参数转换成 JDBC Statement 所需要的参数， 调用原生 JDBC 来执行语句。

最后由 ResultSetHandler 的 handleResultSets 方法将 JDBC 返回的 ResultSet 结果集转换成对象集，并逐级返回结果，完成一次 SQL 语句执行。

###### 考察点与加分项

###### 考察点

下面是需要注意的面试考察点。

1. 首先要掌握 Spring 的核心概念 IoC、AOP 以及具体的实现方式。

2. 要重点掌握 SpringContext 的初始化流程、Bean 的生命周期。

3. 以应用为主，了解常用注解的作用和使用方式。

4. 要了解一下 Spring Boot 相关的知识点，目前使用 Spring Boot 的项目越来越多，建议根据前面列出的知识点来学习。

5. 要理解 Netty 的线程模型和消息处理的pipeline机制。

6. 要理解 RPC 的交互流程及常用 RPC 框架的特点。

7. 要了解 MyBatis 或者 Hibernate 这样的 ORM 框架解决了什么问题，了解框架的实现原理。

这一节课的内容比较多，前面提到的核心机制、核心流程，建议阅读源码加深理解。提供一个小技巧，在学习时可以通过断点调试的方式，结合给出的流程图来阅读源码。

###### 加分项

还有哪些要注意的面试加分项呢？

1. 本课时涉及考察点大多是以应用能力为主的，但是如果你阅读过源码，能突出对底层实现细节的掌握能力，一定会另面试官刮目相看。

2. 除了应用之外，最好能理解框架的理念，例如理解 Spring 的控制反转与 AOP 思想。

3. 能够知道框架最新版本的实现和发展方向，保持对新技术的兴趣和敏感。例如了解 Spring 的 Web Flux 响应式编程的实现与应用，关注 Spring Cloud 的应用等等。

4. 如果能在应用的基础上有调优的经验，会让你在面试时更加突出。例如你有 Netty 的调优经验，知道要尽量减少 IO 线程占用，把可以后置的处理放到业务线程池中进行。

###### 真题汇总

最后汇总一些相关的面试真题作为参考，以及需要注意的地方，如下所示。

<br />


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/8A/C8/CgoB5l14qRGAfS0KAABYryfVTDc376.png"/> 


第 1 题，除了说出 SSH 框架是 Struct+Spring+Hibernate，SSM 是指的 Spring MVC+Spring+MyBatis，另外要重点说一下 SpringMVC 和 Struts 的区别，以及 MyBatis 和 Hibernate 的区别。

第 4 题，要答出是通过 BeanFactoryPostProcessor 后置处理器进行的占位符替换，如果自定义处理，可以扩展 PropertyPlaceholderConfigurer 或 PropertySourcesPlaceholderConfigurer 来实现。

第 5 题，大致可以分为：从 HandlerMapping 中查找 Handler、执行 Handler、执行完成给适配器返回 ModelAndView、视图解析、返回视图，这些步骤。建议通过调试来阅读源码，补充细节、增加理解。

第 6 题，可以从构造器循环依赖和 setter 循环依赖两部分来回答，构造器循环通过使用创建中 Bean 标示池，来判断是否产生了循环创建；setter 循环依赖通过引入 ObjectFactory 来解决。

<br />


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/8A/E8/CgotOV14qRGAavpoAABhTu0HeK8332.png"/> 


第 7 题，题目给出的就是执行顺序。

第 8 题，可以从 Channel、Socket、EventLoop、ChannelPipeline 等对象展开介绍。

第 9 题，可以从下面几方面回答：

* 使用方式，HTTP 使用 Client 方式进行远程调用，RPC 使用动态代理的方式实现远程调用；

* 请求模型，HTTP 一般会经过 DNS 解析、4−7 层代理等中间环节，而 RPC 一般是点对点直连；

* 服务治理能力，RPC 提供更加丰富的服务治理功能，例如熔断、负载均衡等；

* 语言友好性，HTTP 对跨语言服务之间交互更加友好。

<br />

下一课时将重点讲解 Memcache 和 Redis 相关的知识。

<br />


