# 11资源节点树：通过Sentinel无侵入实现流量链生成规则

前两个课时，我们重点围绕 SkyWalking 进行了原理解析。讲完了 SkyWalking，接下来我们就进入 Sentinel。

这一讲开始，我将用两个课时围绕 Sentinel 的技术骨架展开，来带你学习它的原理。今天我们先学习 APM 系统的无侵入实现的通用设计，以及 Sentinel 的资源节点树实现原理。

### 什么叫"侵入"？什么叫"无侵入"？

在学习 Sentinel，讨论无侵入监控时，你可能会问：Sentinel 不是"无侵入"的啊，接入 Sentinel 是需要引入客户端 jar 包的？
> 其实 Sentinel 是体感"无侵入"，而代码"侵入"的，其原因我慢慢解答。

**目前很多说法是：像 SkyWalking 这种 APM 工具，通过探针实现字节码增强的方式才叫作"无侵入"，这样的理解是错误的。**

通过《09 \| Opentracing 解密：Dapper 说它是树，SkyWalking 说它是图》，我们知道 APM 工具的实现方案有两种：一种是黑盒方案，另一种是标记方案。当今开源的 APM 工具都是使用标记方案实现，所以**对应用服务是有侵入的**。

而"侵入"的意思是：APM 客户端工具会向应用服务内部织入监控代码，这一点我们可以通过对应用服务进行远程调试，或是对 Class 文件进行反解析来证实。

**那之所以有同学会有"只有 SkyWalking 这类通过探针实现的 APM 工具才是无侵入"的错觉，归根结底是使用 APM 产品时的不同"体感"所致。**

再结合前面课程，我们可以将侵入度按照不同"体感"，划分为以下两种。

* 第一种以 SkyWalking 为代表的零接入"体感"的 APM 工具。  

  它们使用探针实现字节码增强技术，解决了织入监控代码难的问题（对比其他工具，它可以在不实现监控框架暴露的拦截器或过滤器的情况下，在任意地方织入监控代码）。通过面向切面的思想，使用线程本地变量在任务线程的生命周期中完成监控标记的无侵入传递。

* 第二种以 Sentinel 为代表的低侵入"体感"的 APM 工具。  

  由于无法使用字节码增强技术，所以织入代码只能通过框架暴露的拦截器或过滤器实现监控代码的织入。但这种方式依然可以使用与第一种方式一样的通过面向切面的思想，使用线程本地变量在任务线程的生命周期中完成监控标记无侵入传递。接入监控时，显式地引入客户端 jar 包，即可完成接入。

|            |                  **零接入"体感"**                   |                   **低侵入"体感"**                    |
|:----------:|------------------------------------------------|:------------------------------------------------:|
|    代表工具    | SkyWalking                                     |                     Sentinel                     |
|   侵入度比较    | 相比更低                                           |                       相比较高                       |
| 如何实现监控代码织入 | **使用探针字节码技术** （直接解决织入监控代码难题）                   | （由于没有字节码增强技术） **只能通过框架暴露的拦截器或** **过滤器实现监控代码的织入** |
|    通用度     | 较不通用                                           |                       更通用                        |
|    核心思想    | 通过 AOP 面向切面思想，使用线程本地变量 在任务线程的生命周期中，完成监控标记无侵入传递 |                                                  |

对比两种方式，虽然第二种在接入效率上有些欠缺，但它是变通的。它将企业内部所有服务接入统一的脚手架，通过脚手架基建绕过一线开发来引入 APM 工具的客户端，从而降低侵入"体感"。这与 SRE 通过在应用服务的启动命令中，增加探针参数来绕过一线开发管理 APM 客户端思想是一致的。
> 具体的实践方案可以参考[阿里云 Java 脚手架](https://start.aliyun.com/bootstrap.html?fileGuid=xxQTRXtVcqtHK6j8)，在依赖组件中添加 Sentinel，即可在新项目的脚手架基建中增加 Sentinel 的流量管控。

**再回看 APM 有关侵入的问题，我们可以清晰地将其总结为两句话：**

* **APM 工具都会侵入应用服务，只不过织入监控代码的技术方案有所不同；**

* **通过 AOP 思想，使用线程本地变量实现监控任务线程的生命周期，这种方式就是释放一线开发人员编写监控代码的无侵入方案。**

Sentinel 也是"无侵入"的 APM 工具这个问题就解开了。那根据上面总结的第一句话，你是不是又对 APM 工具织入的监控代码产生兴趣了呢？接下来，我就以"织入监控代码是如何构建资源树结构"为主题，与你详解通用框架监控方案。

### 监控示例：Sentinel 资源树构建的基本原理

正式开讲前，我们先来熟悉下**聚合搜索工具**的示例项目。聚合搜索工具的核心伪代码，如下所示：

```java
class Controller{
  public Response mergeSearch(String param){
    baidu = search("https://www.baidu.com/s?wd=" + param);
    google = search("https://www.google.com/search?q=" + param);
    return baidu + google;
  }

  private Response search(String param){
    return OkHttpClient.get(param);
  }
}
```

聚合搜索服务可以同时将多个搜索引擎的搜索数据聚合起来。比如，用户对聚合搜索服务输入关键词 APM，那聚合搜索服务会将 baidu 和 google 搜索出来的结果，聚合返回给用户。

#### 1.接入 SkyWalking

通过在启动命令中，增加 SkyWalking 探针参数，将**聚合搜索服务**接入 SkyWalking 后，我们可以观测到如下两张拓扑图和追踪链路图。

通过如下的拓扑图，我们可以清晰看到用户通过聚合搜索服务，访问量 baidu 和 google 站点。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image6/M00/3C/86/CioPOWCKhvSAA1Y4AAFSXRAbAPM344.png"/> 


通过 SkyWalking 的链路图，我们可以清晰看到聚合搜索的调用顺序。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M01/3C/7D/Cgp9HWCKhvuAerrVAAEERiqw56A771.png"/> 


#### 2.接入 Sentinel

通过在 pom 文件中，引入并配置 Sentinel 的 webmvc 和 okhttp 适配器的客户端 jar 包，将聚合服务接入 Sentinel 后，我们会得到如下的簇点链路图：


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image6/M01/3C/7D/Cgp9HWCKhwqAa6RgAAIjrJ0VPww951.png"/> 


综上可以看到，两个 APM 产品虽然接入方式不同，但一线开发人员都不需要编写任何监控代码，且两个 APM 工具的链路形态基本一致。

它们织入的监控的流程，如图中红色标识所示：


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image6/M00/3C/86/CioPOWCKhxKAbsJzAALa-MhIbU0965.png"/> 


Sentinel 的监控流程与 Spring AOP 思想一致，通过 Spring MVC 和 OkHttp 框架暴露出的拦截器，对流量进行面向切面监控。只不过在监控过程中，使用了线程本地变量存储了监控信息，当请求再次被拦截时，识别线程本地变量存储的监控信息，构建出资源树。

这就是 Sentinel 资源树构建的基本原理，总的来说，还是很好理解的。

### Sentinel 技术骨架

学习基本原理入门后，我们再回来学习 Sentinel 的技术骨架，Sentinel 对流量的管控是通过**责任链设计模式**实现的。
> 责任链设计模式是：将定义规则的对象根据指定顺序连成一条链，实现定义规则对象间的解耦，请求按照指定顺序被处理，直到有规则被匹配到为止。

Sentinel 就是使用责任链设计模式实现了**功能插槽链**（Slot chain），如下图所示：


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image6/M01/3C/7D/Cgp9HWCKhx2AYh8QAAbUg8otm8U872.png"/> 


每个被管控的资源，都会创建一系列的功能插槽链，每个功能插槽都有自己的职责，官方提供了 7 个不同职责的插槽链。今天的课程只讲解第一个功能插槽 NodeSelectorSlot，它的职责是构建资源节点树。
> 关于 Sentinel 的技术骨架的更多内容，你可回顾[《04 \| 流量卫士：Alibaba Sentinel 时刻守卫流量健康》](https://kaiwu.lagou.com/course/courseInfo.htm?courseId=729#/detail/pc?id=7053&fileGuid=xxQTRXtVcqtHK6j8)，深入了解更多设计原理。

#### NodeSelectorSlot 示例

NodeSelectorSlot 是负责收集请求所关联的资源节点的路径，将这些节点资源的调用路径，以树状结构存储起来。

我们先看下官方的接入示例代码，学习下 Sentinel 的几个核心对象，接入示例代码如下：

```java
  ContextUtil.enter("entrance1", "appA");
  Entry nodeA = SphU.entry("nodeA");
  if (nodeA != null) {
    nodeA.exit();
  }
  ContextUtil.exit();
```

上述代码中，ContextUtil.enter 会在线程本地变量中创建一个名为"entrance 1"的上下文（Context）。上下文对象维护着当前调用链的元数据，其重要的属性如下。

1. name：用于标识上下文的名称，如接入示例代码中的 entrance 1。

2. entranceNode：当前调用链路的入口节点。节点有 4 种类型，它们有着继承关系。

   * EntranceNode 继承 DefaultNode：表示一棵资源节点树的入口节点，通过此节点可以获取所有子节点。

   * DefaultNode 继承 StatisticNode：节点中，存储着指定上下文相关的统计信息，当一个上下文对象被多次调用 SphU.entry 方法时，该节点就会关联多个叶子节点。

   * ClusterNode 继承 StatisticNode：节点中，存储着资源总体运行的是统计信息，包括响应时间、线程数等，相同资源贡献一个 ClusterNode 节点。

3. curEntry：当前调用链路的当前资源节点。

4. origin：当前调用链路的调用源名称。

接入示例的第一行代码中的"appA"就是调用源标识；紧接着通过 SphU.entry 请求一个 token，如果此时方法执行成功，就代表当前流量未达到被限制的阈值，可以被放行去执行之后的业务代码；在执行完业务代码后，调用 nodeA.exit 和 ContextUtil.exit 方法去告诉 Sentinel 当前监控点可以退出。

上述示例代码会在内存中，生成如下树形结构：


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image6/M00/3C/86/CioPOWCKhyeAaqifAACbga2uEV4102.png"/> 


默认的机器节点关联着 EntranceNode 节点 Entrance 1，Entrance 1 节点关联着 DefaultNode 节点 nodeA。

当示例代码中追加了 entrance 2 上下文时，代码如下所示：

```java
ContextUtil.enter("entrance2", "appA");
  nodeA = SphU.entry("nodeA");
  if (nodeA != null) {
    nodeA.exit();
  }
  ContextUtil.exit();
```

内存中的树形结构就会变成：


<Image alt="Drawing 6.png" src="https://s0.lgstatic.com/i/image6/M00/3C/86/CioPOWCKhy2ATLj3AADDp5GzECs155.png"/> 


默认的机器节点关联着两个 EntranceNode 节点：Entrance 1 和 Entrance 2，Entrance 1 和 Entrance 2 节点又分别关联着自己的 DefaultNode 节点 nodeA。需要注意的是，DefaultNode 由资源 ID 和输入的名称来决定唯一性。

现在回到我们课程示例的聚合搜索的节点树构建过程。


<Image alt="Drawing 7.png" src="https://s0.lgstatic.com/i/image6/M01/3C/7D/Cgp9HWCKhzaAZSAzAAIVgLMIdH0640.png"/> 


当监控搜索工具接收到用户发来的请求时，在 Spring-MVC 适配器中通过 ContextUtil.enter 和 SphU.entry 方法，在内存中生成上下文对象，如下：


<Image alt="Drawing 8.png" src="https://s0.lgstatic.com/i/image6/M00/3C/86/CioPOWCKh0CAZy3ZAADRJhoYYm4469.png"/> 


上下文存储的当前节点，关联的节点树只有一个搜索入口方法的节点，且当前节点的父节点和子节点都是空。

当请求流量在聚合搜索工具项目中准备搜索 baidu 资源时，在 OkHttp 拦截器会执行 SphU.entry 方法，此时在内存中生上下文对象，如下：


<Image alt="Drawing 9.png" src="https://s0.lgstatic.com/i/image6/M01/3C/7D/Cgp9HWCKh0eALa6DAADn0KaM4g4144.png"/> 


当接收到 baidu 搜索的响应后，请求流量在聚合搜索工具项目中准备搜索 google 资源时，在 OkHttp 拦截器会同样执行 SphU.entry 方法，此时在内存中生上下文对象，如下：


<Image alt="Drawing 10.png" src="https://s0.lgstatic.com/i/image6/M01/3C/7D/Cgp9HWCKh0-AdllgAAFfk0vnIW4014.png"/> 


构造出来的资源节点树，由父节点 Spring-MVC 适配器生成，两个子节点由 OkHttp 适配器生成。在任务线程的生命周期中，开发人员不需要编写任何监控代码，Sentinel 在任务线程的生命周期，通过使用线程本地变量完成资源节点树的构建。

### 小结与思考

本节课，我首先带你学习了有关 APM 的工具的通用监控方案。

关于如何织入监控代码，一种方式是实现监控框架的拦截器类织入，另一种方式是通过探针字节码技术实现织入。前者较为通用，后者侵入度较低。但无论使用哪种方式，其核心思想都是借鉴 AOP 思想，通过在线程本地变量中记录监控标记，无侵入实现监控任务线程的生命周期。

接下来，又我通过聚合搜索工具项目，以及伪代码和流程图，讲述了监控代码的织入位置。最后又回到了 Sentinel 技术骨架，Sentinel 技术骨架使用**责任链设计模式** 实现。本节课讲述了**功能插槽 NodeSelectorSlot** 使用线程本地变量，将**流量构建资源节点树**的过程。

不难发现，线程本地变量在监控场景中是必定会用到的技术，但是在业务需求开发中，我们使用线程本地变量的情况却少之又少。那么你知道为什么吗？欢迎在评论区写下你的思考，期待与你讨论。

