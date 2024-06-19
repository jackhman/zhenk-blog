# 14日志采集：如何在Kubernete中做日志收集与管理？

说到日志，你应该不陌生。日志中不仅记录了代码运行的实时轨迹，往往还包含着一些关键的数据、错误信息，等等。日志方便我们进行分析统计及监控告警，尤其是在后期问题排查的时候，我们通过日志可以很方便地定位问题、现场复现及问题修复。日志也是做可观测性（Observability）必不可少的一部分。

因此在使用 Kubernetes 的过程中，对应的日志收集也是我们不得不考虑的问题。我们需要日志去了解集群内部的运行状况。

我们先来看看 Kubernetes 的日志收集和以往的日志收集有什么差别，以及为什么我们需要为 Kubernetes 的日志收集单独设计方案。

### Kubernetes 中的日志收集 VS 传统日志收集

对于传统的应用来说，它们大都都是直接运行在宿主机上的，会将日志直接写入本地的文件中或者由 systemd-journald 直接管理。在做日志收集的时候，只需要访问这些日志所在的目录即可。此类日志系统解决方案非常多，也相对比较成熟，在这里就不再过多说明。我们重点来看看 Kubernetes 的日志系统建设问题。

在 Kubernetes 中，日志采集相比传统虚拟机、物理机方式要复杂很多。

首先，日志的形式非常多样化。日志需求主要集中在如下三个部分：

* 系统各组件的日志，比如 Kubernetes 自身各大组件的日志（包括 kubelet、kube-proxy 等），容器运行时的日志（比如 Docker）；

* 以容器化方式运行的应用程序自身的日志，比如 Nginx、Tomcat 的运行日志；

* Kubernetes 内部各种 Event（事件），比如通过`kubebctl create`创建一个 Pod 后，可以通过`kubectl describe pod pod-xxx`命令查看到的这个 Pod 的 Event 信息。

其次，集群环境时刻在动态变化。我们都知道 Pod "用完即焚"，Pod 销毁后日志也会一同被删除。但是这个时候我们仍然希望可以看到具体的日志，用于查看和分析业务的运行情况，以及帮助我们发现出容器异常的原因。

同时新的 Pod 可能随时会"飘"到别的节点上重新"生长"出来，我们无法提前预知具体是哪个节点。而且 Kubernetes 的节点也会存在宕机等异常情况。所以说，Kubernetes 的日志系统在设计的时候，必须得独立于节点和 Pod 的生命周期，且保证日志数据可以实时采集到服务端，即完全独立于 Kubernetes 系统，使用自己的后端存储和查询工具。

再次，日志规模会越来越大。很多人在 Kubernetes 中喜欢使用 hostpath 来保存 Pod 的日志，并且不做日志轮转（可以配置 Docker 的`log-opts`来[设置容器的日志轮转](https://docs.docker.com/config/containers/logging/configure/#configure-the-default-logging-driver)[](https://docs.docker.com/config/containers/logging/configure/#configure-the-default-logging-driver)），这很容易将宿主机的磁盘"打爆"。这里你是不是觉得如果做了轮转，磁盘打爆的问题就可以完美解决了？

其实虽有所缓解，并不会让你安全无忧。虽说日志轮转可以有效减少日志的文件大小，但是你会丢失掉不少日志，后续想要分析和排查问题时就无从下手了。想想看如果容器内的应用出现异常并疯狂报错，这个时候又有大量的并发请求，那么日志就会急剧增多。

配置了日志轮转，会让你丢失很多重要的上下文信息。如果没有配置日志轮转，这些日志很快就会将磁盘打爆。还有可能引发该节点的 Kubelet 异常，导致该节点上的 Pod 被驱逐。我们在一些生产实践中，就遇到过这种情况。同时当 Pod 被删除后，这些 hostpath 的文件并不会被及时删除，会继续占用很多磁盘空间。此外，随着业务逐渐增长，在这个节点上运行过的 Pod 也会变多，这就会残留大量的日志文件。

此外，日志非常分散且种类多变。单纯查找一个应用的日志，就需要查看其关联的分散在各个节点上的各个 Pod 的日志。在出现紧急情况需要排查的时候，这种方式极其低效，会严重影响到问题修复和服务恢复。如果这个应用还通过 Ingress 对外暴露服务，并使用了 Service Mesh 等，那么此时做日志收集就更复杂了。

随着在 Kubernetes 上落地越来越多的微服务，各个服务之间的依赖也越来越多。这个时候各个维度的日志关联也是一个非常困难的问题。那么，下面我们就来看看如何对 Kubernetes 做日志收集。

### 几种常见的 Kubernetes 日志收集架构

Kubernetes 集群本身其实并没有提供日志收集的解决方案，但依赖 Kubernetes 自身提供的各项能力，可以帮助我们解决日志收集的诉求。根据上面提到的三大基本日志需求，一般来说我们有如下有三种方案来做日志收集：

1. 直接在应用程序中将日志信息推送到采集后端；

2. 在节点上运行一个 Agent 来采集节点级别的日志；

3. 在应用的 Pod 内使用一个 Sidecar 容器来收集应用日志。

我们来分别看看这三种方式。

先来看**直接在应用程序中将日志信息推送到采集后端，即Pod 内的应用直接将日志写到后端的日志中心**。


<Image alt="image (2).png" src="https://s0.lgstatic.com/i/image/M00/59/F7/Ciqc1F9zCLCALLfHAAA7edHbxKE531.png"/> 


（<https://github.com/kubernetes/website/blob/master/static/images/docs/user-guide/logging/logging-from-application.png>）

通常有两种做法，一个就是应用程序通过对应的日志 SDK 进行接入，不过这种做法一般不推荐，和应用本身耦合太严重，也不方便后续对接其他的日志系统。

还有一种做法就是通过容器运行时提供的 Logging Driver 来实现。以最常用的 Docker 为例，目前已经支持了[十多种 Logging Driver](https://docs.docker.com/config/containers/logging/configure/#supported-logging-drivers)。比如你可以配置为`fluentd`，这个时候 Docker 就会将容器的标准输出日志（stdout、stderr）直接写到`fluentd`中。你也可以设置成`awslogs`，这样就会直接将日志写到 Amazon CloudWatch Logs 中。但是在和 Kubernetes 一起使用的时候，使用较多的是`json-file`，这也是 Docker 默认的 Logging Driver。

```shell
$ docker info |grep 'Logging Driver'
Logging Driver: json-file
```

你经常使用的`kubectl logs`就是基于`json-flle`这种 Logging Driver 来实现的，目前 Kubernetes 也只支持`json-flle`这一种 Logging Driver。

所以在 Kubernetes 的这套体系中，直接将日志写到后端日志采集系统中去，并不是特别好的做法。

我们来看第二种方法，**在节点上运行一个 Agent 来采集节点级别的日志** 。如下图所示，我们可以在每一个 Kubernetes Node 上都部署一个 Agent，该 Agent 负责对该节点上运行的所有容器进行日志收集，并推送到后端的日志存储系统里。这个 Agent 通常需要可以访问到宿主机上的指定目录，比如`/var/lib/docker/containers/`。


<Image alt="image (3).png" src="https://s0.lgstatic.com/i/image/M00/5A/02/CgqCHl9zCNiAEVCiAABrnSxfaQg197.png"/> 


（<https://github.com/kubernetes/website/blob/master/static/images/docs/user-guide/logging/logging-with-node-agent.png>）

由于这样的 Agent 需要在每个 Node 上都运行，因此我们都是通过 上节课讲到的`DaemonSet`的方式来部署的。对于 Kubernetes 集群来说，这种使用节点级的`DaemonSet`日志代理是最常用，也是最被推荐的方式，不仅可以节约资源，而且对于应用来说也是无侵入的。

但是这种方式也有个缺点，就是只适应于容器内应用日志是标准输出的场景，即应用把日志输出到`stdout`和`stderr`。

最后来看**通过 Sidecar 来收集容器日志** 。 在 Pod 里面，容器的输出日志可以是`stdout`、`stderr`和日志文件。那么基于这三种形式，我们可以借助于 Sidecar 容器

将基于文件的日志来帮助我们。

* 通过Sidecar 容器读取日志文件，并定向到自己的标准输出。如下图所示，这里`streaming container`就是一个 Sidecar 容器，可以将`app-container`的日志文件重新定向到自己的标准输出。同时还可以归并多个日志文件。而且这里也可以使用多个 Sidecar 容器，你可以参考这个[例子](https://github.com/kubernetes/website/blob/master/content/en/examples/admin/logging/two-files-counter-pod-streaming-sidecar.yaml)。


<Image alt="image (4).png" src="https://s0.lgstatic.com/i/image/M00/5A/02/CgqCHl9zCOWAI1-SAAB3nPjxdMA390.png"/> 


* Sidecar容器运行一个日志代理，配置该日志代理以便从应用容器收集日志。这种方式就解决了我们上面方案一的问题，将日志处理部分和应用程序本身进行了解耦，可以方便切换到其他的日志系统中。可以参考这个[使用 fluentd 的例子](https://github.com/kubernetes/website/blob/master/content/en/examples/admin/logging/two-files-counter-pod-agent-sidecar.yaml)。


<Image alt="image (5).png" src="https://s0.lgstatic.com/i/image/M00/5A/02/CgqCHl9zCOuAFQm_AABLBPDcBz4058.png"/> 


（<https://github.com/kubernetes/website/blob/master/static/images/docs/user-guide/logging/logging-with-sidecar-agent.png>）

可以看到,通过 Sidecar 的方式来收集日志，会增加额外的开销。在集群规模较小的情况下可以忽略不计,但是对于大规模集群来说，这些开销还是不可忽略的。

那么，上面的这几套方案，在实际使用的时候，又该如何选择呢？社区又有什么推荐方案呢？

### 基于 Fluentd + ElasticSearch 的日志收集方案

Kubernetes 社区官方推荐的方案是[使用 Fluentd+ElasticSearch+Kibana 进行日志的收集和管理](https://kubernetes.io/zh/docs/tasks/debug-application-cluster/logging-elasticsearch-kibana/)，通过[Fluentd](https://www.fluentd.org/)将日志导入到[Elasticsearch](https://www.elastic.co/products/elasticsearch)中，用户可以通过[Kibana](https://www.elastic.co/products/kibana)来查看到所有的日志。


<Image alt="image (6).png" src="https://s0.lgstatic.com/i/image/M00/59/F7/Ciqc1F9zCPSATIwRAAA_ddgWuO0667.png"/> 


(<https://docs.fluentd.org/container-deployment/kubernetes>)

关于 ElasticSearch 和 Kibana 如何部署，在此就不过多地介绍了，你可以通过添加 helm 的 repo即`helm repo add elastic https://helm.elastic.co`，然后通过 helm来快速地自行部署，相关的 Chart 见[https://github.com/elastic/helm-charts](https://github.com/elastic/helm-charts/blob/master/elasticsearch/README.md)。

现在我们就来看看这套方案的几个技术点。

Fluentd 提供了强大的日志统一接入能力，同时内置了插件，可以对接 ElasticSearch。这里 Fluentd 主要有如下四个配置：

* `fluent.conf`这个文件主要是用来设置一些地址，比如 ElasticSearch 的地址等；.

* `kubernetes.conf`这个文件记录了与 Kubernetes 相关的配置，比如 Kubernetes 各组件的日志配置、容器的日志收集规则，等等；

* `prometheus.conf`这个文件定义了 Prometheus 的地址，方便 Fluentd 暴露自己的统计指标；

* `systemd.conf`这个文件可以配置 Fluentd 通过 systemd-journal 来收集哪些服务的日志，比如 Docker 的日志、Kubelet 的日志等。

上面的这些配置，都默认内置到了[fluent/fluentd-kubernetes-daemonset](https://hub.docker.com/r/fluent/fluentd-kubernetes-daemonset/tags?page=1&name=elasticsearch)的镜像中，你可以使用官方的默认配置。如果你想要定制化更改一些，可以参照[这份默认示例配置](https://github.com/fluent/fluentd-kubernetes-daemonset/tree/master/docker-image/v1.11/debian-elasticsearch7/conf)。

如下的 YAML 是一段 fluentd 的 DaemonSet 定义，源自[这里](https://github.com/fluent/fluentd-kubernetes-daemonset/blob/master/fluentd-daemonset-elasticsearch.yaml)：

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd
  namespace: kube-system
  labels:
    k8s-app: fluentd-logging
    version: v1
spec:
  selector:
    matchLabels:
      k8s-app: fluentd-logging
      version: v1
  template:
    metadata:
      labels:
        k8s-app: fluentd-logging
        version: v1
    spec:
      tolerations:
      - key: node-role.kubernetes.io/master
        effect: NoSchedule
      containers:
      - name: fluentd
        image: fluent/fluentd-kubernetes-daemonset:v1-debian-elasticsearch
        env:
          - name:  FLUENT_ELASTICSEARCH_HOST
            value: "elasticsearch-logging"
          - name:  FLUENT_ELASTICSEARCH_PORT
            value: "9200"
          - name: FLUENT_ELASTICSEARCH_SCHEME
            value: "http"
          # Option to configure elasticsearch plugin with self signed certs
          # ================================================================
          - name: FLUENT_ELASTICSEARCH_SSL_VERIFY
            value: "true"
          # Option to configure elasticsearch plugin with tls
          # ================================================================
          - name: FLUENT_ELASTICSEARCH_SSL_VERSION
            value: "TLSv1_2"
          # X-Pack Authentication
          # =====================
          - name: FLUENT_ELASTICSEARCH_USER
            value: "elastic"
          - name: FLUENT_ELASTICSEARCH_PASSWORD
            value: "changeme"
          # Logz.io Authentication
          # ======================
          - name: LOGZIO_TOKEN
            value: "ThisIsASuperLongToken"
          - name: LOGZIO_LOGTYPE
            value: "kubernetes"
        resources:
          limits:
            memory: 200Mi
          requests:
            cpu: 100m
            memory: 200Mi
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
          readOnly: true
      terminationGracePeriodSeconds: 30
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
```

### 写在最后

在实际采集日志的时候，你可以根据自己的场景和集群规模选择适用的方案。或者也可以将上面的这几种方案进行合理地组合。

到这里这节课就结束了，如果你对本节课有什么想法或者疑问，欢迎你在留言区留言，我们一起讨论。

