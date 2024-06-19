# 01前世今生：Kubernete是如何火起来的？

本课时，我们就开始正式进入 Kubernetes 的学习，或许你已经听过或简单了解过 Kubernetes，它是一款由 Google 开源的容器编排管理工具，而我们想要深入地掌握 Kubernetes 框架，就不得不先了解 Kubernetes 的前世今生，而这一切都要从"云计算"的兴起开始讲起。

### 云计算平台

说来也巧，"云计算"这个概念也是由 Google 提出的，可见这家公司对计算机技术发展的贡献有多大。自云计算 2006 年被提出后，已经逐渐成为信息技术产业发展的战略重点，你可能也会切身感受到变化。我们平时在讨论技术的时候，经常会被问到诸如"你们公司的业务是否要考虑上云"的问题，而国内相关的云计算大会近几年也如雨后春笋般地召开，可见其有多么火热。

而云计算之所以可以这么快地发展起来，主要原因还是可以为企业带来便利，同时又能降低成本，国内的各大传统型企业的基础设施纷纷向云计算转型，从阿里云、腾讯云每年的发展规模我们就可以看出来云计算市场对人才的需求有多大。


<Image alt="Lark20200824-143701.png" src="https://s0.lgstatic.com/i/image/M00/45/BC/CgqCHl9DYEuADAreAADTZgwHR7E773.png"/> 


这里，我们可以将经典的云计算架构分为三大服务层：也就是 IaaS（Infrastructure as a Service，基础设施即服务）、PaaS（Platform as a Service，平台即服务）和 SaaS（Software as a Service，软件即服务）。

* IaaS 层通过虚拟化技术提供计算、存储、网络等基础资源，可以在上面部署各种 OS 以及应用程序。开发者可以通过云厂商提供的 API 控制整个基础架构，无须对其进行物理上的维护和管理。

* PaaS 层提供软件部署平台（runtime），抽象掉了硬件和操作系统，可以无缝地扩展（scaling）。开发者只需要关注自己的业务逻辑，不需要关注底层。

* SaaS 层直接为开发者提供软件服务，将软件的开发、管理、部署等全部都交给第三方，用户不需要再关心技术问题，可以拿来即用。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image/M00/45/BD/CgqCHl9DYFeAW4ZYAAF1UiD0s0A670.png"/> 


（图片引自<https://www.aalpha.net/blog/the-difference-between-paas-iaas-and-saas/>）

这样解释起来可能会有点抽象，我们可以想象自己要去一个地方旅行，那么首先就需要解决住的问题，而 IaaS 服务就相当于直接在当地购买了一套商品房，像搭建系统、维护运行环境这种"装修"的事情就必须由我们自己来，但优点是"装修风格"可以自己定。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image/M00/45/B1/Ciqc1F9DYGiAV-pgAAcUl1vxuA4620.png"/> 


PaaS 则要简单一点，我们到了一个陌生的城市，可以选择住民宿或青旅，这样就不需要考虑装修和买家具的事情了，系统和环境都是现成的，我们只需要安装自己的运行程序就可以了。


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image/M00/45/B1/Ciqc1F9DYHOAdfWeAAcj5M-SolM624.png"/> 


而 SaaS 就更简单了，相当于直接住酒店，一切需求都由供应商搞定了，我们只需要选择自己喜欢的房间风格和户型就可以了，这时从操作系统到运行的具体软件都不再需要我们自己操心了。


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image/M00/45/B1/Ciqc1F9DYH-AHwidAAxW6hYIBhw502.png"/> 


上面，我们了解了云计算的概念，既然上云可以给我们带来这么多的便利，那么我们该如何让系统上云呢？

以前主流的做法就是申请或创建一批云服务（Elastic Compute Service），比如亚马逊的 AWS EC2、阿里云 ECS 或者 OpenStack 的虚拟机，然后通过 Ansible、Puppet 这类部署工具在机器上部署应用。

但随着应用的规模变得越来越庞大，逻辑也越来越复杂，迭代更新也越来越频繁，这时我们就逐渐发现了一些问题，比如：

* **性价比低，资源利用率低**

有时候用户只是希望运行一些简单的程序而已，比如跑一个小进程，为了不相互影响，就要建立虚拟机。这显然会浪费不少资源，毕竟 IaaS 层产品都是按照资源进行收费的。同时操作也比较复杂，花费时间也会比较长；

* **迁移成本高**

如果想要迁移整个自己的服务程序，就要迁移整个虚拟机。显然，迁移过程也会很复杂；

* **环境不一致**

在进行业务部署发布的过程中，服务之间的各种依赖，比如操作系统、开发语言及其版本、依赖的库/包等，都给业务开发和升级带来很大的制约。

如果没有 Docker 的横空出世，这些问题解决起来似乎有些困难。

### Docker

Docker 这个新的容器管理引擎大大降低了使用容器技术的门槛，轻量、可移植、跨平台、镜像一致性保障等优异的特性，一下子解放了生产力。开发者可以根据自己的喜好选择合适的编程语言和框架，然后通过微服务的方式组合起来。交付同学可以利用容器保证交付版本和交付环境的一致性，也便于各个模块的单独升级。测试人员也可以只针对单个功能模块进行测试，加快测试验证的速度。

在某一段时期内，大家一提到 Docker，就和容器等价起来，认为 Docker 就是容器，容器就是Docker。其实容器是一个相当古老的概念，并不是 Docker发明的，但 Docker 却为其注入了新的灵魂------**Docker 镜像**。

Docker 镜像解决了环境打包的问题，它直接打包了应用运行所需要的整个"操作系统"，而且不会出现任何兼容性问题，它赋予了本地环境和云端环境无差别的能力，这样避免了用户通过"试错"来匹配不同环境之间差异的痛苦过程， 这便是 Docker 的精髓。

它通过简单的 Dockerfile 来描述整个环境，使开发者可以随时随地构建无差别的镜像，方便了镜像的分发和传播。相较于以往通过光盘、U盘、ISO文件等方式进行环境的拷贝复制，Docker镜像无疑把**开发者体验**提高到了前所未有的高度。这也是 Docker 风靡全球的一个重要原因。

有了 Docker，开发人员可以轻松地将其生产环境复制为可立即运行的容器应用程序，让工作更有效率。越来越多的机构在容器中运行着生产业务，而且这一使用比例也越来越高。我们来看看CNCF （Cloud Native Computing Foundation，云计算基金会）在2019年做的[调研报告](https://www.cncf.io/wp-content/uploads/2020/03/CNCF_Survey_Report.pdf)。


<Image alt="Drawing 6.png" src="https://s0.lgstatic.com/i/image/M00/45/BD/CgqCHl9DYJiAYUrzAAHq834oYlA699.png"/> 


容器使用数量低于249 个的比例自2018年开始下降了 26%，而使用容器数目高于 250 个的比例增加了 28%。可以预见的是，未来企业应用容器化会越来越常见，使用容器进行交付、生产、部署是大势所趋，也是企业进行技术改造，业务快速升级的利器。

### 我们为什么需要容器调度平台

有了容器，开发人员就只需要考虑如何恰当地扩展、部署，以及管理他们新开发的应用程序。但如果我们大规模地使用容器，就不得不考虑容器调度、部署、跨多节点访问、自动伸缩等问题。

接下来，我们来看看一个容器编排引擎到底需要哪些能力才能解决上述这些棘手的问题。


<Image alt="Drawing 7.png" src="https://s0.lgstatic.com/i/image/M00/45/B1/Ciqc1F9DYKWAW3w_AACD_6ySCwY186.png"/> 
  
一个容器调度系统到底需要什么

如表所示，首先容器调度平台可以自动生成容器实例，然后是生成的容器可以相邻或者相隔，帮助提高可用性和性能，还有健康检查、容错、可扩展、网络等功能，它几乎完美地解决了需求与资源的匹配编排问题。

既然容器调度平台功能这样强大，市场竞争必定是风云逐鹿的，其实主流的容器管理调度平台有三个，分别是Docker Swarm、Mesos Marathon和Kubernetes，它们有各自的特点。但是同时满足上面所述的八大能力的容器调度平台，其实非 Kubernetes 莫属了。


<Image alt="Drawing 8.png" src="https://s0.lgstatic.com/i/image/M00/45/BD/CgqCHl9DYMeAJMZBAALljjjSsQ8305.png"/> 


Swarm 是 Docker 公司自己的产品，会直接调度 Docker 容器，并且使用标准的 Docker API 语义，为用户提供无缝衔接的使用体验。 Swarm 更多的是面向于开发者，而且对容错性支持不够好。

Mesos 是一个分布式资源管理平台，提供了 Framework 注册机制。接入的框架必须有一个Framework Scheduler 模块负责框架内部的任务调度，还有一个 Framework Executor 负责启动运行框架内的任务。Mesos 采用了双层调度架构，首先 Mesos 将资源分配给框架，然后每个框架使用自己的调度器将资源分配给内部的各个任务使用，比如 Marathon 就是这样的一个框架，主要负责为容器工作负载提供扩展、自我修复等功能。

Kubernetes 的目标就是消除编排物理或者虚拟计算、网络和存储等基础设施负担，让应用运营商和开发工作者可以专注在以容器为核心的应用上面，同时可以优化集群的资源利用率。Kubernetes 采用了 Pod 和 Label 这样的概念，把容器组合成一个个相互依赖的逻辑单元，**相关容器被组合成 Pod 后被共同部署和调度** ，**就形成了服务**，这也是 Kuberentes 和其他两个调度管理系统最大的区别。

相对来说，Kubernetes 采用这样的方式简化了集群范围内相关容器被共同调度管理的复杂性。换种角度来说，Kubernetes 能够相对容易的支持更强大、更复杂的容器调度算法。

根据 StackRox 的统计数据表明，Kubernetes 在容器调度领域占据了 86% 的市场份额，虽说Kubernetes 的部署方式千差万别。以前绝大多数人都是采用自建的方式来管理 Kubernetes 集群的，现在已经逐渐采用公有云的 Kubernetes 服务。可见，Kubernetes 越来越成熟，也越来越受到市场的青睐。


<Image alt="Drawing 9.png" src="https://s0.lgstatic.com/i/image/M00/45/B2/Ciqc1F9DYNiARjZ5AAMhoyp7brI603.png"/> 
  

（<https://www.stackrox.com/kubernetes-adoption-and-security-trends-and-market-share-for-containers/>）

依据 Google Trends 收集的数据，自 Kubernetes出现以后，便呈黑马态势一路开挂，迅速并牢牢占据头把交椅位置，最终成为容器调度的事实标准。


<Image alt="Drawing 10.png" src="https://s0.lgstatic.com/i/image/M00/45/B2/Ciqc1F9DYOGAH5IcAAF8ZEwwV5s160.png"/> 


### Kubernetes 成为事实标准

2014 年 6 月 7 日的[第一个 commit](https://github.com/kubernetes/kubernetes/commit/2c4b3a562ce34cddc3f8218a2c4d11c7310e6d56) 拉开了 Kubernetes 的序幕。它基于 Google 内部超过 15 年历史的大规模集群管理系统 Borg ，集结其精华，可以对容器进行编排管理、自动部署、弹性伸缩等操作，它于 2015 年 7 月 21 日正式对外发布第一版本，走进了大众视线。

其实，Kubernetes 这个词由 Joe Beda，Brendan Burns和 Craig McLuckie 所创建，源于希腊语的"舵手"或者"领航员"，简称"K8s"，用 8 代替 8 个字符"ubernete"而成的缩写。

经过 6 年的时间，Kubernetes 成为云厂商的"宠儿"，而且国内的诸多大厂已经在生产环境中大规模使用 Kubernetes，用于运行自己的核心业务系统，无数中小企业也都在进行业务容器化探索以及云原生化改造，比如阿里的蚂蚁金服已经有线上业务在使用了。


<Image alt="Drawing 11.png" src="https://s0.lgstatic.com/i/image/M00/45/B2/Ciqc1F9DYQOAIffnAAnOzS-nfj0022.png"/> 
  
各大云厂商对Kubernetes的支持力度

<br />

<br />

（图片来自<https://www.datadoghq.com/container-report/>）

我们来看看 Kubernetes 是如何凭借自身的优势走红的。

首先，**Kubernetes 的成功离不开 Borg**。目前Google 内部依然大规模运行着 Borg，上面跑着我们熟悉的 Google 搜索、Gmail、Youtube 等业务。正是因为从 Borg 当中借鉴了相当多优秀的设计经验，并改进了很多不合理的设计。这些无疑都是促成 Kubernetes 迈向成功的先决条件。Kubernetes 提供了很多方便使用的抽象定义帮助我们对容器进行一些操作，同时可扩展能力强，便于用户定制开发。我们将在后面的课程里慢慢了解到 Kubernetes 这些设计理念和实现方式。

其次，**Kubernetes 并不会跟任何平台绑定** ，**它可以跑在任何环境里**，包括公有云、私有云、物理机，甚至笔记本和树莓派都可以运行，避免了用户对于厂商锁定 (vendor-lockin) 的担忧。

接着，**Kubernetes 的上手门槛很低** 。通过 [minikube](https://kubernetes.io/zh/docs/setup/learning-environment/minikube/) 这类工具，就可以在你的笔记本上快速搭建一套 Kubernetes 集群出来。我会在后面的课程里，教你更多集群的搭建方法，毕竟搭建生产使用的集群还是需要花费一些功夫的。这相比较于 mesos + marathon 方便了很多，你可以更快更直接地上手 Kubernetes。

再次，**Kubernetes 使用了声明式API** ，这也是从 Borg 中借鉴来的设计。所谓声明式，就是指你只需要提交一个定义好的 API 对象来声明你所期望的对象是什么样子即可，而无须过多关注如何达到最终的状态。Kubernetes 可以在无外界干预的情况下，完成对**实际状态** 和**期望状态**的调和（Reconcile）工作。

在Kubernetes中，你可以直接通过 YAML 或者 JSON 进行声明，然后通过 PATCH 的方式就可以完成对 API 对象的多次修改，而无须关心原始 YAML 或 JSON 文件的内容。可以说声明式 API 也是 Kubernetes 项目能够成为事实标准的一个核心所在。

最后，**围绕着 Kubernetes 的相关生态异常活跃**，它有自己的开发者社区，为开发者提供了交流各种方案的平台，社区开放包容，而且协作程度高。目前 CNCF 也吸引着诸多孵化中的新项目。

可以预见的是，未来Kubernetes的使用会更加普遍，围绕着Kubernetes构建的生态也会越来越好。

### 写在最后

Kubernetes 是为数不多的能够成长为基础技术的技术之一，就像 Linux、OS 虚拟化和 Git一样成为各自领域的佼佼者。简单来说，Kubernetes是如今所有云应用程序开发机构能做出的最安全的投资，如果运用得当，它可以帮助大幅提升开发和交付的速度以及质量。

下节课，我们一起来了解 Kubernetes 的架构。如果你有什么想法或疑问，欢迎你在留言区留言，我们一起讨论。

