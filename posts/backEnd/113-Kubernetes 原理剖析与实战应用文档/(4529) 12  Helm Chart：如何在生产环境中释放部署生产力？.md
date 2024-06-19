# 12HelmChart：如何在生产环境中释放部署生产力？

通过前面的课程，相信你对 Kubernetes 中的对象有了很多了解。Kubernetes 是一个强大的容器调度系统，你可以通过一些声明式的定义，很方便地在 Kubernetes 中部署业务。

现在你一定很想尝试在 Kubernetes 中部署一个稍微复杂的系统，比如下面这个典型的三层架构：前端、后端和数据层。


<Image alt="image (7).png" src="https://s0.lgstatic.com/i/image/M00/56/EA/Ciqc1F9sPOKACHGPAADXdRLPJwo750.png"/> 
  

（<https://docs.bitnami.com/tutorials/_next/static/images/three-tier-kubernetes-architecture-28861dab09dbb6c2dd6ddb986f3a42d4.png.webp>）

也许你内心里已经开始跃跃欲试，但是转念一想，事情好像没那么简单啊。你感觉到这里面要写一堆的 YAML 文件，每一层架构都至少要写 2 个 YAML 文件，写的时候还需要理解各种对象、注意各种缩进的层级关系、还要设置一堆配置参数等。这对于刚接触 Kubernetes 的人来说是一个很高的门槛，简直无法跨越。同时，对于业务交付的同学，也将是一个大灾难，因为如果缺少任何一个 YAML 文件，都会导致整个系统无法正常工作。

看到这里，你也许会想到能不能通过一种包的方式进行管理呢，类似于 Node.js 通过 npm 来管理包，Debian 系统通过 dpkg 来管理包，而 Python 通过 pip 来管理包。

那么在 Kubernetes 中， 这个答案就是**Helm**。

Helm 降低了使用 Kubernetes 的门槛，你无须从头开始编写应用部署文件，甚至都不需要了解 Kubernetes 中的各个对象以及相应的 YAML 语义。直接通过 Helm 就可以在自己的 Kubernetes 中一键部署需要的应用。

对于开发者而言，通过 Helm 进行打包，管理应用内部的各种依赖关系，极其方便。并且可以借助于版本化的概念，方便自身的迭代和分发。除此之外，Helm 还有一些其他强大的功能，请跟我一起开始今天 Helm 的学习之旅。

作为 CNCF 社区官方的项目，Helm 在今年四月份已经宣布毕业，这进一步彰显了 Helm 的市场接受度、生产环境采用率以及技术影响力。

我们先来理解下 Helm 中几个重要的概念。

### Helm 中的几个概念

在 Helm 中，有三个非常核心的概念------ Chart、Config 和 Release。

**Chart 可以理解成应用的安装包** ，**通常包含了一组我们在 Kubernetes 要部署的 YAML 文件**。一个 Chart 就是一个目录，我们可以将这个目录进行压缩打包，比如打包成 some-chart-version.tgz 类型的压缩文件，方便传输和存储。

每个这样的 Chart 包内都必须有一个 Chart.yaml 文件，类似这样：

```yaml
apiVersion: v1
name: redis
version: 11.0.0
appVersion: 6.0.8
description: Open source, advanced key-value store. It is often referred to as a data structure server since keys can contain strings, hashes, lists, sets and sorted sets.
keywords:
  - redis
  - keyvalue
  - database
home: https://github.com/bitnami/charts/tree/master/bitnami/redis
icon: https://bitnami.com/assets/stacks/redis/img/redis-stack-220x234.png
sources:
  - https://github.com/bitnami/bitnami-docker-redis
  - http://redis.io/
maintainers:
  - name: Bitnami
    email: containers@bitnami.com
  - name: desaintmartin
    email: cedric@desaintmartin.fr
engine: gotpl
annotations:
  category: Database

```

这个 Chart.yaml 主要用来描述该 Chart 的名字、版本号，以及关键字等信息。

有了这个 Chart，我们就可以在 Kubernetes集群中部署了。每一次的安装部署，我们称为一个 Release。在同一个 Kubernetes 集群中，可以有多个 Release。你可以将 Release 理解成是 Chart 包部署后的一个 Chart（应用）实例。
> 注： 这个 Release 和我们通常概念中理解的"版本"有些差异。

同时，为了能够让 Chart 实现参数可配置，即 Config，**我们在每个 Chart 包内还有一个 values.yaml 文件** ，**用来记录可配置的参数和其默认值**。在每个 Release 中，我们也可以指定自己的 values.yaml 文件用来覆盖默认的配置。

此外，我们还需要统一存放这些 Chart，即 Repository（仓库）。这个概念和我们以前的 yum repo 是一样的。本质上来说，**Repository 就是一个 Web 服务器** ，**不仅保存了一系列的 Chart 软件包让用户下载安装使用** ，**还有对应的清单文件以供查询**。

通过 Helm，我们可以同时使用和管理多个不同的 Repository，就像我们可以给 yum 配置多个源一样

掌握了这些概念，我们现在再拉远视角，整体来看一下。

### Helm 的安装及架构组成

首先，Helm 的安装非常简单，你可以通过如下的命令安装最新版本的 Helm 可执行文件：

```shell
$ curl https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3 | bash
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
100 11213  100 11213    0     0  12109      0 --:--:-- --:--:-- --:--:-- 12096
Downloading https://get.helm.sh/helm-v3.3.1-darwin-amd64.tar.gz
Verifying checksum... Done.
Preparing to install helm into /usr/local/bin
Password:
helm installed into /usr/local/bin/helm
```

当然你也可以去[官方的文档](https://helm.sh/docs/intro/install/)里选择合适自己的安装方式。  

安装完成后，我们来查看下 Helm 的版本：

```shell
$ helm version
version.BuildInfo{Version:"v3.3.1", GitCommit:"249e5215cde0c3fa72e27eb7a30e8d55c9696144", GitTreeState:"clean", GoVersion:"go1.14.7"}
```

可以看到目前我们安装的版本是`v3.3.1`，这是 Helm 3 的一个版本。  

其实在 Helm 3 之前，还有 Helm 2，目前还有不少人在继续使用 Helm 2 的版本。现在我们来简单了解下 Helm 2 和 Helm 3 。

#### Helm 2

Helm 2 于 2015 年在 KubeCon 上亮相。其架构如下图所示，是个常见的 CS 架构，由 Helm Client 和 Tiller 两部分组成。


<Image alt="image (8).png" src="https://s0.lgstatic.com/i/image/M00/56/F6/CgqCHl9sPQ2AWA7kAAKDpOtvIDk020.png"/> 
  

（<https://medium.com/dwarves-foundation/kubernetes-helm-101-78f70eeb0d1>）

Tiller 是 Helm 的服务端， 用于接收来自 Helm Client 的请求，主要负责部署 Helm Chart、管理 Release（比如升级、删除、回滚等操作），以及在 Kubernetes 集群中创建应用。TIller 通常部署在 Kubernetes 中，直接通过`helm init`就可以在 Kuberentes 集群中拉起服务。

Helm Client 主要负责跟用户进行交互，通过命令行就可以完成 Chart 的安装、升级、删除等操作。Helm Client 可以从公有或者私有的 Helm 仓库中拉取 Chart 包，通过用户指定的 Config，就可以直接传给后端的 Tiller 服务，使之在集群内进行部署。

这里，我们可以看到 Tiller 在 Helm 2 和 Kubernetes 集群中间其实起到了一个中转的作用，因此 Tiller 实际上是代替用户在 Kubernetes 集群中执行操作，所以 Tiller 在运行中往往需要一个很高的权限。这里 Tiller 存在着两大安全风险：

1. 要对外暴露自身的端口；

2. 自身运行过程中，跟 Kubernetes 交互需要很高的权限，这样才可以在 Kuberentes 中创建、删除各种各样的资源。

当然了，之所以有这种架构设计是由于在 Helm 2 开发的时候，Kubernetes 的 RBAC 体系还没有建立完成。Kubernetes 社区直到 2017 年 10 月份 v1.8 版本才默认采用了 RBAC 权限体系。随着 Kubernetes 的各项功能日益完善，主要是 RBAC 能力，Tiller 这个组件存在的必要性进一步降低，社区也在一直想着怎么去解决 TIller 的安全问题。

我们再来看看 Helm 3。

#### Helm 3

Helm 3 是在 Helm 2 之上的一次大更改，于 2019 年 11 月份正式推出。相比较于 Helm 2， Helm 3 简单了很多，移除了 Tiller，只剩下一个 Helm Client。在使用中，你只需要这一个二进制可执行文件即可，使用你当前用的 kubeconfig 文件，即可在 Kubernetes 集群中部署 Chart、管理 Release。

至此，Helm 2 开始要退出历史的舞台了。目前 Helm 社区官方也逐步开始暂停维护 Helm 2，最终的 Bugfix 修复截止到今年的 8 月份，版本号是 v2.16.10，而安全相关的 patch 会继续支持，直到 今年的 11 月份。

如果你还在使用 Helm 2，建议你尽快切换到 Helm 3 上来。Helm 社区也提供了相关的插件，帮助你从 Helm 2 迁移到 Helm 3 中，可以参考这篇 Helm 的[官方迁移文档](https://helm.sh/docs/topics/v2_v3_migration/)，这里我就不再赘述了。

通过这个版本迭代的过程，你应该也清楚了 Helm 的原理，对它更加熟悉了，接下来我们一起动手实践看看。

### 如何创建和部署 Helm Chart

创建一个 Chart 很简单，通过`helm create`的命令就可以创建一个 Chart 模板出来：

```shell
$ helm create hello-world
Creating hello-world
```

我们现在来看看这个 Chart 的目录里面有什么：

```shell
$ tree ./hello-world
./hello-world
├── Chart.yaml
├── charts
├── templates
│   ├── NOTES.txt
│   ├── _helpers.tpl
│   ├── deployment.yaml
│   ├── hpa.yaml
│   ├── ingress.yaml
│   ├── service.yaml
│   ├── serviceaccount.yaml
│   └── tests
│       └── test-connection.yaml
└── values.yaml

3 directories, 10 files
```

这里面包含了我们上面讲的 Chart.yaml 和 values.yaml。

先看看这里 Chart.yaml 的内容：

```yaml
apiVersion: v2
name: hello-world
description: A Helm chart for Kubernetes

# A chart can be either an 'application' or a 'library' chart.
#
# Application charts are a collection of templates that can be packaged into versioned archives
# to be deployed.
#
# Library charts provide useful utilities or functions for the chart developer. They're included as
# a dependency of application charts to inject those utilities and functions into the rendering
# pipeline. Library charts do not define any templates and therefore cannot be deployed.
type: application

# This is the chart version. This version number should be incremented each time you make changes
# to the chart and its templates, including the app version.
# Versions are expected to follow Semantic Versioning (https://semver.org/)
version: 0.1.0

# This is the version number of the application being deployed. This version number should be
# incremented each time you make changes to the application. Versions are not expected to
# follow Semantic Versioning. They should reflect the version the application is using.
appVersion: 1.16.0
```

可以看到，这里 Chart 的名字就是我们 Chart 所在目录的名字。你在使用的时候，就可以在这个文件里面添加 keyword，以及 annotation，方便后续查找和分类。  

values.yaml 里面包含了一些可配置的参数，你可以根据自己的需要进行添加，或者修改默认值等。

这个目录下面有个`charts`文件夹，主要用来放置一些子 Chart 包，也可以是 tar 包、 Chart 目录。你可以根据自己的场景，决定需不需要放置子 Chart 包。

这个目录里面还有个`templates`文件夹，这个文件夹里面的文件是一些模板文件，Helm 会根据`values.yaml`的参数进行渲染，然后在 Kubernetes 集群中创建出来。

你可以根据自己的需要，在这个`templates`目录下，添加和更改 yaml 文件。

你这样创建好了一个 Chart 包后，如果想要更改其中一些参数，可以将它们放到其他的文件里面，比如 myvalues.yaml 文件。

然后通过`helm install`命令，你就可以在 Kubernetes 集群里面部署 hello-world 这个 Chart 包：

```shell
helm install -f myvalues.yaml hello-world ./hello-world
```

或者，你可以通过添加 Repository 直接使用别人的 Chart，使用`helm search`来查找自己想要的 Chart：

```shell
$ helm repo add brigade https://brigadecore.github.io/charts
"brigade" has been added to your repositories
$ helm search repo brigade
NAME                          CHART VERSION APP VERSION DESCRIPTION
brigade/brigade               1.3.2         v1.2.1      Brigade provides event-driven scripting of Kube...
brigade/brigade-github-app    0.4.1         v0.2.1      The Brigade GitHub App, an advanced gateway for...
brigade/brigade-github-oauth  0.2.0         v0.20.0     The legacy OAuth GitHub Gateway for Brigade
brigade/brigade-k8s-gateway   0.1.0                     A Helm chart for Kubernetes
brigade/brigade-project       1.0.0         v1.0.0      Create a Brigade project
brigade/kashti                0.4.0         v0.4.0      A Helm chart for Kubernetes
```

更多 Helm 的使用命令，可以参考官方的[使用文档](https://helm.sh/docs/intro/using_helm/)，使用起来非常简单就不占用篇幅了。

### 写在最后

目前 Helm 是 CNCF 基金会旗下已经"毕业"的独立的项目。它简化了 Kubernetes 应用的部署和管理，大大提高了效率，越来越多的人在生产环境中使用 Helm 来部署和管理应用，所以我在这里用一个课时来专门讲解它的原理和使用，想让你在使用 Kubernetes 时如虎添翼。

如果你对本节课有什么想法或者疑问，欢迎你在留言区留言，我们一起讨论。

