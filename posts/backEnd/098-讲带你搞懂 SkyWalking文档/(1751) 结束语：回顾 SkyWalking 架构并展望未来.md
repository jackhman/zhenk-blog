# 结束语：回顾SkyWalking架构并展望未来

你好，我是你的 SkyWalking 老师吴小胖，欢迎来到本课程的最后一讲，在本课时中，我们将回顾 SkyWalking 的整体架构，并简单聊一下 SkyWalking 最近的发展情况。

### SkyWalking 架构回顾

SkyWalking 架构整体上分为了 Agent 和 OAP Server 两个部分。Agent 采用微内核设计，如下图所示，负责动态增强各个开源软件和业务代码，实现 Trace 数据的埋点、收集，并作为 gRPC Client，将 Trace 数据向 SkyWalking OAP 进行传输。


<Image alt="image (3).png" src="https://s0.lgstatic.com/i/image/M00/40/28/Ciqc1F8yNUeAAUcXAAEO2o1zrPQ372.png"/> 


SkyWalking Agent 的入口是 apm-agent 模块，Agent 启动的流程如下：

1. 初始化配置信息，其中会加载 agent.config 配置文件。

2. 查找并解析 skywalking-plugin.def 插件文件。

3. AgentClassLoader 加载插件。

4. PluginFinder 对插件进行分类管理。

5. 使用 Byte Buddy 库创建 AgentBuilder。这里会根据已加载的插件动态增强目标类，插入埋点逻辑。

6. 使用 JDK SPI 加载并启动 BootService 服务。其中就包括发送 Trace 数据的 gRPC Client。

7. 添加一个 JVM 钩子，在 JVM 退出时关闭所有 BootService 服务。

除了 Tomcat 插件、Dubbo 插件，以及 MySQL 插件，还提供了 apm-toolkit-trace 工具箱来增强业务方法。

在本课程的第二部分对上述 SkyWalking Agent 的内容进行了深入的剖析，具体内容你可以回顾相应的课时。

SkyWalking OAP Server 同样采用了微内核的架构。OAP 使用 ModuleManager 管理多个 Module，一个 Module 可以对应多个 ModuleProvider，ModuleProvider 是 Module 底层真正的实现。一个 ModuleProvider 可能支撑了一个非常复杂的大功能，在一个 ModuleProvider 中，可以包含多个 Service ，一个 Service 实现了一个 ModuleProvider 中的一部分功能，通过将多个 Service 进行组装集成，可以得到 ModuleProvider 的完整功能。


<Image alt="image (4).png" src="https://s0.lgstatic.com/i/image/M00/40/34/CgqCHl8yNVGAAcqTAAIc_hSfSbE127.png"/> 


在本课程的第三部分我们深入介绍了 OAP 中的多个 Module，其中包括对 Agent 的管理、配置的管理、对集群的管理等，还深入分析了 OAP 处理和存储 Metrics、Trace 的底层原理，另外还介绍了 OAL 语言的相关内容。

了解了处理数据的相关内容，我们又一起剖析了 SkyWalking Rocketbot 查询数据相关的 query-graphql 插件模块，以及 query-graphql 插件处理查询请求的原理。最后，我们介绍了 SkyWalking 告警配置方面的知识，以及 server-alarm-plugin 插件实现的告警机制。

在课程的整个第三部分，我们对 SkyWalking OAP 进行了深入的介绍和剖析，希望你有所收获。

在课程的最后一部分，带领你上手改造 SkyWalking 源码，引入 Kafka 优化了 Trace 数据的收集流程，同时实现了针对特殊请求进行 ThreadDump 功能，增强了 SkyWalking 的功能。

### 不断奔跑的 SkyWalking

在本课程更新的过程中，SkyWalking 7.x 版本、8.x 版本陆续发布了，SkyWalking 版本迭代、Bug 修复的速度非常快，社区也非常活跃，不断有新的 Committer 加入，为开源社区的发展注入新鲜血液。另外，SkyWalking 周边的其他工具项目和扩展项目也不断涌现，整个 SkyWalking 有向着 SkyWalking 生态圈发展的趋势。

我们一起来看一下 SkyWalking 7.x、SkyWalking 8.x 版本更新的 Changelog。

* SkyWalking APM 7.0.0 于 2020-05-22 发布，其中最关键的几个 Changelog 如下：

  * Agent 最低 JDK 要求升级到 JDK1.8。

  * 支持代码级性能剖析（其本质实现与我们实践课中开发的 ThreadDump 类似，都是通过抓取线程栈的方式进行性能分析的，当然，SkyWalking 提供的实现更加优雅，更加专业，而且代码成熟度更加适用于生产。另外，我们还可以引入其他开源工具（例如 Arthas 等）进行更加强大的分析和在线功能。

  * 不再兼容支持 v5 探针协议，只支持 v6 协议。

* SkyWalking APM 8.0.0 于 2020-06-15 发布，其中最关键的几个 Changelog 如下：

  * 新的 v3 探针协议（这个需要你下载最新的代码进行了解，相信你在分析完 v2 协议之后，分析 v3 版本协议会非常轻松）。

  * 新的 UI dashboard 和新查询协议。

  * 注册机制被彻底删除。

* SkyWalking APM 8.1.0 于 2020-08-03 发布，其中最关键的几个 Changelog 如下：

  * 支持使用 MQ 传输监控数据传输监控数据（与我们第四部分的实践课有异曲同工之处）。

  * 执行新的指标系统 MeterSystem，提供原生的 metrics API，并支持 Spring Sleuth。

  * 支持 JVM 线程指标监控。

除了 Java 版本的 SkyWalking 实现，SkyWalking 社区在其他语言，以及周边工具类方面，也给大家带来了不小的惊喜：

* SkyWalking Python 0.2.0 于 2020-07-28 发布：

  * 新增插件：Kafka Plugin、Redis Plugin、Django Plugin。

  * 增加 ignore_suffix 配置, 支持忽略后缀的 endpoint。

  * 增加 SegmentRef 相等逻辑。

  * 搭建开发环境所需的脚本也更加完善。

* SkyWalking CLI 0.3.0 于 2020-07-27 发布：

  * 支持健康检查命令。

  * 支持 trace 命令。

  * 同时，还修复了一些 Bug。

### 写在最后

分析开源项目源码，剖析开源项目架构设计的过程固然艰辛，但是现在回头看看，我们现在已经完全吃透了 SkyWalking 的内容，在 SkyWalking 新版本、新协议迭代的过程中，我们也可以快速上手，并洞悉其中的原理。在遇到 APM 系统的时候，我们也能够举一反三，将其核心原理推测个八九不离十，就是深入其代码，也丝毫无所畏惧。最后，更希望你能够根据实际工作遇到的问题，扩展 SkyWalking 或是其他手头上在用的 APM 的功能，甚至贡献给开源社区，做到"沉迷于源码，又不仅仅沉迷于源码"。

