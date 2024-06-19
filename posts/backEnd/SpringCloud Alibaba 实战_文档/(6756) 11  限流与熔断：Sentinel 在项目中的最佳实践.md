# 11限流与熔断：Sentinel在项目中的最佳实践

上一讲我们讲解了微服务的雪崩效应与如何基于 Sentinel 实现初步微服务限流，掌握了部署 Sentinel Dashboard与配置 Sentinel Core 客户端的技巧。本讲咱们继续 Sentinel 这个话题，将更有针对性的讲解 Sentinel 底层的细节与限流、熔断的各种配置方式。

本讲咱们主要学习三方面内容：

* Sentinel 通信与降级背后的技术原理；

* Sentinel 限流降级的规则配置；

* Sentinel 熔断降级的规则配置。

下面咱们先开始第一部分。

### Sentinel Dashboard通信与降级原理

Sentinel Dashboard 是Sentinel的控制端，是新的限流与熔断规则的创建者。当内置在微服务内的 Sentinel Core（客户端）接收到新的限流、熔断规则后，微服务便会自动启用的相应的保护措施。

按执行流程，Sentinel 的执行流程分为三个阶段：

1. Sentinel Core 与 Sentinel Dashboard 建立连接；

2. Sentinel Dashboard 向 Sentinel Core 下发新的保护规则；

3. Sentinel Core 应用新的保护规则，实施限流、熔断等动作。

**第一步，建立连接。**

Sentine Core 在初始化的时候，通过 application.yml 参数中指定的 Dashboard 的 IP地址，会主动向 dashboard 发起连接的请求。

```yaml
#Sentinel Dashboard通信地址
spring: 
  cloud:
    sentinel: 
      transport:
        dashboard: 192.168.31.10:9100
```

该请求是以心跳包的方式定时向 Dashboard 发送，包含 Sentinel Core 的 AppName、IP、端口信息。这里有个重要细节：Sentinel Core为了能够持续接收到来自 Dashboard的数据，会在微服务实例设备上监听 8719 端口，在心跳包上报时也是上报这个 8719 端口，而非微服务本身的 80 端口。


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image6/M00/26/25/CioPOWBarxyAfxg4AAEytt3cAkM947.png"/> 
  
Sentinel Core 向 Dashboard 建立连接

在 Sentinel Dashboard 接收到心跳包后，来自 Sentinel Core的AppName、IP、端口信息会被封装为 MachineInfo 对象放入 ConcurrentHashMap 保存在 JVM的内存中，以备后续使用。

**第二步，推送新规则。**

如果在 Dashboard 页面中设置了新的保护规则，会先从当前的 MachineInfo 中提取符合要求的微服务实例信息，之后通过 Dashboard内置的 transport 模块将新规则打包推送到微服务实例的 Sentinel Core，Sentinel Core收 到新规则在微服务应用中对本地规则进行更新，这些新规则会保存在微服务实例的 JVM 内存中。


<Image alt="图片22.png" src="https://s0.lgstatic.com/i/image6/M00/26/28/Cgp9HWBaryuANUd3AAFKoecEXLU156.png"/> 
  
Sentinel Dashboard 向Sentinel Core推送新规则

**第三步，处理请求。**

Sentinel Core 为服务限流、熔断提供了核心拦截器 SentinelWebInterceptor，这个拦截器默认对所有请求 /\*\* 进行拦截，然后开始请求的链式处理流程，在对于每一个处理请求的节点被称为 Slot（槽），通过多个槽的连接形成处理链，在请求的流转过程中，如果有任何一个 Slot 验证未通过，都会产生 BlockException，请求处理链便会中断，并返回"Blocked by sentinel" 异常信息。


<Image alt="图片2.png" src="https://s0.lgstatic.com/i/image6/M00/26/25/CioPOWBarziAOzV2AAFkVrbLros829.png"/> 
  
SentinelWebInterceptor 实施请求拦截与保护

那这些 Slot 都有什么作用呢？我们需要了解一下，默认 Slot 有7 个，前 3 个 Slot为前置处理，用于收集、统计、分析必要的数据；后 4 个为规则校验 Slot，从Dashboard 推送的新规则保存在"规则池"中，然后对应 Slot 进行读取并校验当前请求是否允许放行，允许放行则送入下一个 Slot 直到最终被 RestController 进行业务处理，不允许放行则直接抛出 BlockException 返回响应。

以下是每一个 Slot 的具体职责：

* NodeSelectorSlot 负责收集资源的路径，并将这些资源的调用路径，以树状结构存储起来，用于根据调用路径来限流降级；

* ClusterBuilderSlot 则用于存储资源的统计信息以及调用者信息，例如该资源的 RT（运行时间）, QPS, thread count（线程总数）等，这些信息将用作为多维度限流，降级的依据；

* StatistcSlot 则用于记录，统计不同维度的runtime 信息；

* SystemSlot 则通过系统的状态，例如CPU、内存的情况，来控制总的入口流量；

* AuthoritySlot 则根据黑白名单，来做黑白名单控制；

* FlowSlot 则用于根据预设的限流规则，以及前面 slot 统计的状态，来进行限流；

* DegradeSlot 则通过统计信息，以及预设的规则，来做熔断降级。

到这里我们理解了 Sentinel 通信与降级背后的执行过程，下面咱们学习如何有效配置 Sentinel 的限流策略。

### Sentinel 限流降级的规则配置

#### 滑动窗口算法

实现限流降级的核心是如何统计单位时间某个接口的访问量，常见的算法有计数器算法、令牌桶算法、漏桶算法、滑动窗口算法。Sentinel 采用滑动窗口算法来统计访问量。

滑动窗口算法并不复杂，咱们举例说明：某应用限流控制 1 分钟最多允许 600 次访问。采用滑动窗口算法是将每 1 分钟拆分为 6（变量）个等份时间段，每个时间段为 10 秒，6 个时间段为 1 组在下图用红色边框区域标出，而这个红色边框区域就是滑动窗口。当每产生 1 个访问在对应时间段的计数器自增加 1，当滑动窗口内所有时间段的计数器总和超过 600，后面新的访问将被限流直接拒绝。同时每过 10 秒，滑动窗口向右移动，前面的过期时间段计数器将被作废。

总结下，滑动窗口算法的理念是将整段时间均分后独立计数再汇总统计，滑动窗口算法被广泛应用在各种流控场景中，请你理解它的实现过程。


<Image alt="图片4.png" src="https://s0.lgstatic.com/i/image6/M00/26/25/CioPOWBar0iAFl_9AASda6g75YE021.png"/> 
  
滑动窗口算法

#### 基于 Sentinel Dashboard 的限流设置

在 Sentinel Dashboard 中"簇点链路",找到需要限流的 URI，点击"+流控"进入流控设置。小提示，sentinel-dashboard 基于懒加载模式，如果在簇点链路没有找到对应的 URI，需要先访问下这个功能的功能后对应的 URI 便会出现。


<Image alt="图片5.png" src="https://s0.lgstatic.com/i/image6/M00/26/28/Cgp9HWBar1OAG6JAAAKivJHK_-k419.png"/> 
  
流控设置界面

流控规则项目说明主要有以下几点。

* 资源名：要流控的 URI，在 Sentinel 中 URI 被称为"资源"；

* 针对来源：默认 default 代表所有来源，可以针对某个微服务或者调用者单独设置；

* 阈值类型：是按每秒访问数量（QPS）还是并发数（线程数）进行流控；

* 单机阈值：具体限流的数值是多少。


<Image alt="图片6.png" src="https://s0.lgstatic.com/i/image6/M00/26/28/Cgp9HWBar16Abbz2AAOQnjLspDY532.png"/> 
  
默认流控规则

点击对话框中的"高级选项"，就会出现更为详细的设置项。

其中流控模式是指采用什么方式进行流量控制。Sentinel支持三种模式：直接、关联、链路，下面咱们分别讲解这三种模式。

* **直接模式：**

以下图为例，当 List 接口 QPS 超过 1个时限流，浏览器会出现"Blocked by Sentinel"。


<Image alt="图片7.png" src="https://s0.lgstatic.com/i/image6/M00/26/28/Cgp9HWBar4CARQwVAAEmI2EpwUs844.png"/> 
  
流控模式-直接

* **关联模式：**

如下图所示，当同 List 接口关联的update 接口 QPS 超过 1 时，再次访问List 接口便会响应"Blocked by Sentinel"。


<Image alt="图片8.png" src="https://s0.lgstatic.com/i/image6/M00/26/25/CioPOWBar4qAaeVSAAEgPLPCgYU751.png"/> 
  
流控模式-关联

* **链路模式：**

链路模式相对复杂，我们举例说明，现在某公司开发了一个单机的电商系统，为了满足完成"下订单"的业务，程序代码会依次执行**订单创建方法-\>减少库存方法-\>微信支付方法-\>短信发送**方法。方法像链条一样从前向后依次执行，这种执行的链条被称为调用链路，而链路模式限流就是为此而生。

以下图为例，在某个微服务中 List 接口，会被 Check 接口调用。在另一个业务，List 接口也会被 Scan 接口调用。


<Image alt="图片99.png" src="https://s0.lgstatic.com/i/image6/M00/26/28/Cgp9HWBar5qAQ8kxAAB6_MghZFM405.png"/> 
  
调用链路

但如果按下图配置，将入口资源设为"/check"，则只会针对 check 接口的调用链路生效。当访问 check 接口的QPS 超过 1 时，List 接口就会被限流。而另一条链路从 scan 接口到List 接口的链路则不会受到任何影响。链路模式与关联模式最大的区别是 check 接口与 List 接口必须是在同一个调用链路中才会限流，而关联模式是任意两个资源只要设置关联就可以进行限流。


<Image alt="图片9.png" src="https://s0.lgstatic.com/i/image6/M01/26/25/CioPOWBar6SAU6wQAAFdYOUQcEQ336.png"/> 
  
流控模式-链路

讲完了直接、关联、链路三种流控模式，下面咱们聊一聊高级选项中的"流控效果"。

流控效果是指在达到流控条件后，对当前请求如何进行处理。流控效果有三种：**快速失败** 、**Warm UP（预热）** 、**排队等待**。

* **快速失败：**

快速失败是指流浪当过限流阈值后，直接返回响应并抛出 BlockException，快速失败是最常用的处理形式。如下图所示，当 List 接口每秒 QPS 超过 1 时，可以直接抛出"Blocked By Sentinel"异常。


<Image alt="图片11.png" src="https://s0.lgstatic.com/i/image6/M01/26/29/Cgp9HWBar7CAPY7AAAGALPdbIwo406.png"/> 
  
流控效果-快速失败

* **Warm Up（预热）：**

Warm Up 用于应对瞬时大并发流量冲击。当遇到突发大流量 Warm Up 会缓慢拉升阈值限制，预防系统瞬时崩溃，这期间超出阈值的访问处于队列等待状态，并不会立即抛出 BlockException。

如下图所示，List 接口平时单机阈值 QPS 处于低水位：默认为 1000/3 (冷加载因子)≈333，当瞬时大流量进来，10 秒钟内将 QPS 阈值逐渐拉升至 1000，为系统留出缓冲时间，预防突发性系统崩溃。


<Image alt="图片12.png" src="https://s0.lgstatic.com/i/image6/M01/26/25/CioPOWBar76AYECLAAKiRTkN46w430.png"/> 
  
流控效果-Warm Up

* **排队等待：**

排队等待是采用匀速放行的方式对请求进行处理。如下所示，假设现在有100个请求瞬间进入，那么会出现以下几种情况：

1. 单机 QPS 阈值=1，代表每 1 秒只能放行 1 个请求，其他请求队列等待，共需 100 秒处理完毕；

2. 单机 QPS 阈值=4，代表 250 毫秒匀速放行 1 个请求，其他请求队列等待，共需 25 秒处理完毕；

3. 单机 QPS 阈值=200，代表 5 毫秒匀速放行一个请求，其他请求队列等待，共需 0.5 秒处理完毕；

4. 如果某一个请求在队列中处于等待状态超过 2000 毫秒，则直接抛出 BlockException。

注意，匀速队列只支持 QPS 模式，且单机阈值不得大于 1000。


<Image alt="图片13.png" src="https://s0.lgstatic.com/i/image6/M01/26/25/CioPOWBar8mAA3X_AAFbifYRYio573.png"/> 
  
流控效果-排队等待

讲到这，我为你讲解了从滑动窗口统计流量到 Sentinel Dashboard 如何进行流控配置。下面咱们再来讲解 Sentinel的熔断降级策略。

### Sentinel 熔断降级的规则配置

#### 什么是熔断？

先说现实中的股市熔断机制。2016 年 1 月 4 日，A 股遇到史上首次熔断，沪指开盘后跌幅超过 5%，直接引发熔断。三家股市交易所暂停交易15分钟，但恢复交易之后股市继续下跌，三大股市交易所暂停交易至闭市。通过现象可以看**出熔断是一种保护机制**，当事物的状态达到某种"不可接受"的情况时，便会触发"熔断"。在股市中，熔断条件就是大盘跌幅超过 5%，而熔断的措施便是强制停止交易 15 分钟，之后尝试恢复交易，如仍出现继续下跌，便会再次触发熔断直接闭市。但假设 15分钟后，大盘出现回涨，便认为事故解除继续正常交易。这是现实生活中的熔断，如果放在软件中也是一样的。

微服务的熔断是指在某个服务接口在执行过程中频繁出现故障的情况，我们便认为这种状态是"不可接受"的，立即对当前接口实施熔断。在规定的时间内，所有送达该接口的请求都将直接抛出 BlockException，在熔断期过后新的请求进入看接口是否恢复正常，恢复正常则继续运行，仍出现故障则再次熔断一段时间，以此往复直到服务接口恢复。

下图清晰的说明了 Sentinel的熔断过程：

1. 设置熔断的触发条件，当某接口超过20%的请求访问出现故障，便启动熔断；

2. 在熔断状态下，若干秒内所有该接口的请求访问都会直接抛出BlockException拒绝访问。

3. 熔断器过后，下一次请求重新访问接口，当前接口为"半开状态"，后续处理以下分两种情况。

* 当前请求被有效处理，接口恢复到正常状态。

* 当前请求访问出现故障，接口继续熔断。


<Image alt="图片14.png" src="https://s0.lgstatic.com/i/image6/M01/26/25/CioPOWBar9OAT7iIAADpMfE3-dw738.png"/> 
  
Sentinel 熔断机制

#### **基于SentinelDashboard的熔断设置**

Sentinel Dashboard可以设置三种不同的熔断模式：慢调用比例、异常比例、异常数，下面我们分别讲解：

* 慢调用比例是指当接口在1秒内"慢处理"数量超过一定比例，则触发熔断。


<Image alt="图片15.png" src="https://s0.lgstatic.com/i/image6/M01/26/25/CioPOWBar92AAT0jAAHYZ6NDKjQ113.png"/> 
  
熔断模式-慢调用比例

结合上图的设置，介绍下"慢调用比例"熔断规则。


<Image alt="图片18.png" src="https://s0.lgstatic.com/i/image6/M01/26/25/CioPOWBar-qACeUjAALQjoYzEvE265.png"/> 


* 异常比例是指 1 秒内按接口调用产生异常的比例（异常调用数/总数量）触发熔断。


<Image alt="图片16.png" src="https://s0.lgstatic.com/i/image6/M01/26/29/Cgp9HWBar_SAOTw9AAFxRASYnnE809.png"/> 
  
熔断模式-异常比例

结合上图的设置，介绍下"异常比例"熔断规则。


<Image alt="图片19.png" src="https://s0.lgstatic.com/i/image6/M01/26/26/CioPOWBar_6AXJmYAAK3pfImZs4903.png"/> 


* 异常数是指在 1 分钟内异常的数量超过阈值则触发熔断。


<Image alt="图片17.png" src="https://s0.lgstatic.com/i/image6/M01/26/29/Cgp9HWBasAmAO9LnAAFiqbTOxTs071.png"/> 
  
熔断模式-异常数

结合上图的设置，介绍下"异常数"熔断规则。


<Image alt="图片20.png" src="https://s0.lgstatic.com/i/image6/M00/26/26/CioPOWBasBOAY3wPAALTmvi2q7s202.png"/> 


以上就是三种熔断模式的介绍，熔断相对流控配置比较简单，只需要设置熔断检查开启条件与触发熔断条件即可。讲到这关于限流与熔断的配置暂时告一段落，下面对本讲内容进行下总结。

### 小结与预告

本讲咱们介绍了三部分内容，第一部分讲解了 Sentinel Dashboard 与 Sentinel Core的通信机制与执行原理，了解 Sentinel Core 是通过拦截器实现了限流与熔断；第二部分讲解了滑动窗口算法与 Dashboard 流控配置的每一种情况；第三部分讲解了熔断机制与 Dashboard 的熔断配置。

这里留一个讨论话题：假如你遇到像春运 12306 热门车次购票这种高并发场景，为了保证应用的稳定和用户的体验，我们要采取哪些措施呢？可以把你的经验写在评论中，咱们一起探讨。

下一讲，将进入生产集群保护这个话题，看 Sentinel 是如何对整个服务集群实施保护的。

