# 12技术选型：在众多ServiceMeh开源产品中选择合适自己的

今天我要跟你分享的内容是 Service Mesh 开源产品中的技术选型。在导读部分["Service Mesh：从单体服务出发，独立于业务演进的微服务架构"](https://kaiwu.lagou.com/course/courseInfo.htm?courseId=586#/detail/pc?id=5993)中，我已经简单介绍了 Service Mesh 的基本知识，下面我们简单回顾一下这部分内容。

Mesh 这个词汇我们听到的应该非常多，在家用路由器领域有 Mesh 组网，在智能家居领域有蓝牙 Mesh。之所以叫作 Mesh，是因为它们都有一个共同的特征------**去中心化**。我们这里讲到的 Service Mesh 同样具有这一特性，微服务之间通过 Sidecar 联通网络，移除了中心网关的概念。

Service Mesh，译为服务网格，简单来说就是将可以配置的代理层和服务部署在一起，作为微服务基础设施层接管服务间的流量，并提供通用的服务注册发现、负载均衡、身份验证、精准路由、服务鉴权等基础功能。

Service Mesh 的演进经历了几个阶段，分别是 Sidecar 时代，初代 Service Mesh 和新一代 Service Mesh，这些演进阶段我在导读部分详细介绍过，如果忘记的话你可以再去翻看一下。

今天我们就从为什么要引入 Service Mesh 讲起，带你分析常见的 Service Mesh 解决方案，也希望你能在学完这一讲，对 Service Mesh 的选型有更深入的体会。

### 为什么要引入 Service Mesh

我们先来看一下在微服务落地过程中，到底遇到了哪些问题，迫切需要我们转移到 Service Mesh 架构中。

#### 框架/SDK 升级维护困难

在拆分微服务的早期，我们往往会选择或者研发一套微服务框架，但此时我们并不清楚微服务框架需要哪些基本功能，以及未来需要哪些基本功能，或者不会正确的设置框架中的配置。而未来发现这些问题时，需要逐一升级，其中的困难，可想而知。

#### 无法维护多语言 SDK

虽然很多公司想要形成公司内部的统一框架，或者统一开发语言，但实际上，多语言情况在每个公司是一定存在的。每个语言适合做的事情不一样，比如算法部门使用 Python 或者 C++，业务部门使用 PHP、Golang、Java，大数据部门以 Java 为主。这些部门之间很可能会通过 RPC 进行交互，这就造成了多语言的问题。另外公司可能会收购一些项目，这些收购的项目语言就更难统一了，因此想要形成统一的服务治理解决方案通过 SDK 就更难了。

#### 老项目迁移困难

尽管老项目不一定存在语言方面的差异，但可能因为项目初期没有统一框架，或者统一框架的研发落后于业务进度等原因，导致老项目使用了不同的框架。这些遗留项目想要迁移到新框架也不是一件容易的事情，毕竟业务还需要开发，单独拿出时间修改框架，耗费人力不说，收益也不大。

#### 缺乏统一控制面

早期的框架基本上都是 Web 框架，没有考虑远程下发配置的问题，对微服务的一些配置并不能动态的更新，也没有想 Service Mesh 这样的统一控制面，可以通过下发配置修改服务间的调用行为，比如路由配置等。

基于上述种种原因，我们的架构进展到了 Service Mesh 阶段，那么在这个阶段，有哪些常见的解决方案供你选择呢？也许你最熟悉的就是 Istio。当然，还有其他方式供你选择，别着急，我们继续学习。

### 常见的 Service Mesh 解决方案

#### Istio + Envoy

现如今，Istio 几乎是 Service Mesh 的代名词了，**Istio 包含控制面 Istiod 和数据面 Envoy 两个组件**。其中 Istiod 是 Istio 的控制面，负责配置校验和下发、证书轮转等工作；Envoy 则负责数据代理和流量路由等工作。准确来说 Istio 实际上只是 Service Mesh 的控制面，而 Istio + Envoy 才组成整个 Service Mesh 体系，这有点像 GNU/Linux，通常被简单地称为 Linux。

Istio 包含负责配置下发的 Pilot、负责证书轮转的 Citadel 和负责配置校验的 Galley。在 1.5 版本去除 mixer 后， Istio 已经变得相对简单了，它的**主要工作就是配置下发**。

Envoy 是 C++ 编写的高性能边缘网关和代理程序，支持 HTTP、gRPC、Thrift、Redis、MongoDB 等多种协议代理。当然这里面支持最好的还是 HTTP，它几乎具备了 Service Mesh 数据面需要的所有功能，比如服务发现、限流熔断、多种负载均衡策略、精准流量路由等。

这里我们只介绍 Istio 和 Envoy 的基本信息，在接下来的两节里，我会详细讲解 Istio 和 Envoy 的内容。

#### Linkerd

Linkerd 是云原生软件公司 Buoyant 开源的 Service Mesh 方案，而 Service Mesh 的概念也是 Linkerd 首先提出的。Linkerd 第一个版本由 Finagle 编写，Finagle 是 Twitter 开源的、由 Java 编写的 RPC 框架，Finagle 集成了众多服务治理功能，是一个完整的微服务框架，所以**Linkerd 在 Finagle 上构建，可以快速实现 Sidecar 的功能**。

不过由于 Java 的内存占用率等原因，并不适合 Sidecar 的编写，所以 Linkerd 开发了 2.0 版本，**数据面使用 Rust 编写，控制面基于 Go 语言实现**。

下面我们来看一下 Linkerd 的功能。

* **mTLS**：Linkerd 为所有网格内的服务提供双向 TLS 加密认证的功能，保证流量传输安全。

* **可观测性**：提供了 Grafana 的图形界面以及链路追踪功能。

* **协议支持**：提供了 gRPC、HTTP、HTTP/2 等多种协议支持。

* **负载均衡**：提供了多种负载均衡功能，包括基于当前请求数的 P2C 算法、基于 EWMA 的多种策略的 P2C 算法，以及常规的 WRR 和 RR 算法。

* **动态路由功能**：支持根据 header 设置不同的路由规则，支持流量转移功能，可以在不同服务之间、相同服务不同版本之间做流量转移。

#### SOFAMesh

SOFAMesh 是蚂蚁金服开源的 Service Mesh 解决方案，**包含数据面 MOSN 和修改后的 Istio Pilot 控制面**。不过在最新版本，控制面已经停止维护，转而和社区合作，使用 Istio 作为控制面。

MOSN 是 Modular Open Smart Network 的简称，它是一款**使用 Go 语言开发**的网络代理软件，由蚂蚁集团开源，并经过几十万容器的生产级验证。 MOSN 作为云原生的网络数据平面，旨在为服务提供多协议、模块化、智能化、安全的代理能力。

MOSN 可以与任何支持 xDS API 的 Service Mesh 集成，也可以作为独立的四、七层负载均衡、API Gateway、云原生 Ingress 等使用。

下面我们看一下 MOSN 的核心能力。

* **多协议转发**：MOSN 支持最好的是蚂蚁的 SOFARPC，最近也增强了对 Dubbo 的支持，对于 HTTP 和 HTTP/2 的支持较弱。如果你的公司多是基于 HTTP 和 gRPC 协议构建的微服务，不太适合使用。

* **路由**：支持 VirtualHost 和基于 header、URL、Prefix 等多种路由方式。

* **负载均衡**：支持基本的 RoundRobin 和 Random 算法、基于当前请求数的 P2C 算法，也支持基于 host subset 分组路由算法，以实现金丝雀发布和染色等功能。

* **TLS**：对于 HTTP、HTTP/2、SOFARPC 都支持 TLS 双向加密。

* **平滑重启**：针对 Dubbo、SOFARPC 等私有 RPC 协议，支持在不断开连接的情况下平滑重启，以保证 Sidecar 在升级过程中不影响业务。

#### Kong Mesh-Kuma

早期 Kong 采用了自研的 Kong 作为数据面，Istio 作为控制面的方案，但这个方案很快被抛弃了，现在 Kong 推出了**基于 Envoy 的 Service Mesh 解决方案------Kuma**。

Kuma 最大的特点是**同时支持 Kubernetes 和 VM 虚拟机** ，这样即便公司存在多种运行环境，也可以支持。另外它也支持单一控制面同时控制多套集群，由于使用 Envoy 作为数据面，所以在核心功能支持上和 Istio 相差不大，比较特别的是支持 Kong 作为入口网关层。此外，**Kuma 采用 Go 语言编写，方便二次开发扩展**。

#### NGINX Service Mesh

Nginx 包含一个**处理东西流量的 NGINX Plus 数据面** 和一个**用作入口网关（南北向流量）的NGINX Plus**，都可以通过控制面进行控制。

控制面专门为 NGINX Plus 开发，下发配置用于控制 NGINX Plus 的数据面，主要包含以下部分。

* Grafana：用于收集 Metrics 指标的可视化展示。

* Kubernetes Ingress Controllers：管理入口和出口流量。

* SPIRE：复杂证书轮转。

* NATS：负责下发配置，比如路由信息更新等。

* Open Tracing：分布式链路追踪，同时支持 Zipkin 和 Jaeger。

* Prometheus：收集 Metrics 信息，包括请求数，连接数，SSL 握手次数等。

需要注意的是，NGINX Plus 是 Nginx 收费版本，并不是开源软件，无法进行二次开发。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image/M00/91/C1/Ciqc1GAPkTuAI9qkAAFRd_frjBQ269.png"/> 
  
NGINX Service Mesh 架构图

#### Traefik Mesh

Traefik Mesh 由 Go 语言编写的开源网关系统 Traefik 演进而来，与其他提到的 Mesh 解决方案不同，**Taeafik Mesh 将 Sidecar 部署在了 Kubernetes Node 节点上**。这样的好处是在同一个 Node 节点上的 Pod，可以共享一个 Sidecar，不用为每个 Pod 单独分配 Sidecar 资源，从而达到节省资源的目的，同时相对于在 Pod 的 Container 里部署 Sidecar，这样也方便升级维护。

但这种做法也有缺点，资源隔离性不好，容易相互影响，比如同一个 Node 节点上某个服务出现了问题，从而占用了更多的资源，其他的 Pod 可能就没有资源可用了。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image2/M01/09/B4/CgpVE2APkUeAJgTwAACV4xlXkAY740.png"/> 
  
Traefik Mesh 架构图

#### Consul Connect

Consul Connect 是 HashiCorp 公司开源的 Service Mesh 解决方案，需要和 Consul 绑定使用，同样采用 Envoy 作为数据面，Consul Connect 充当控制面的角色。


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image2/M01/09/B2/Cip5yGAPkVOAbJG1AAF-LOUj7H0281.png"/> 
  
Consul Connect 架构图

#### GCP Traffic Director

Traffic Director 是Google Cloud Platform（谷歌云平台）提供的 Service Mesh 解决方案，**同时支持虚拟机和容器环境**。它使用 Envoy 作为数据面，通过 xDS API 与数据面进行通信。

Traffic Director 通过**集中化的健康检查**代替了 Envoy 内置网格的健康检查方式，这样做的好处是减少了网格健康检查带来的服务压力，但需要注意的是集中式的健康检查无法处理网络分区故障的问题。


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image2/M01/09/B4/CgpVE2APkV2ABiA_AACPWphx1FM106.png"/> 
  
Traffic Director 架构图

### 总结

这一讲我主要介绍了 Service Mesh 中的诸多解决方案，通过今天的内容，相信你已经了解到 Istio 并不是 Service Mesh 中唯一的解决方案。另外，你需要注意的是 Istio 其实只是 Service Mesh 中的控制面实现，其数据面使用了 Envoy。其实，在诸多开源解决方案中，都使用了 Envoy 作为数据面，比如 Consul、Connnet、Kuma 等。

下面我们通过一张对比表格进一步总结上述解决方案的特点：


<Image alt="1-1.png" src="https://s0.lgstatic.com/i/image/M00/91/E3/CgqCHmAP1DiAEeobAAHFe0eUSUk269.png"/> 


本讲内容到这里就结束了，下一讲我会讲解最常用的数据面 Envoy，Envoy 特性丰富，支持多种协议代理、多种负载均衡策略，它拥有着丰富的服务治理功能，下一讲我们都会一一介绍。

结合今天学习的内容，如果让你选择，根据公司现有的情况，你会选择哪种 Service Mesh 解决方案呢。欢迎在留言区和我分享你的观点，我们下一讲再见！

