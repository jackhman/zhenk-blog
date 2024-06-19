# 19资源限制：如何保障你的Kubernete集群资源不会被打爆

你好，我是正范。

前面的课时中，我们曾提到通过 HPA 控制业务的资源水位，通过 ClusterAutoscaler 自动扩充集群的资源。但如果集群资源本身就是受限的情况下，或者一时无法短时间内扩容，那么我们该如何控制集群的整体资源水位，保障集群资源不会被"打爆"？

今天我们就来看看 Kubernetes 中都有哪些能力可以帮助我们保障集群资源？

### 设置 Requests 和 Limits

Kubernetes 中对容器的资源限制实际上是通过 [CGroup](https://www.ibm.com/developerworks/cn/linux/1506_cgroup/index.html) 来实现的。CGroup 是 [Linux 内核](https://baike.baidu.com/item/Linux%E5%86%85%E6%A0%B8/10142820)的一个功能，用来限制、控制与分离一个[进程组](https://baike.baidu.com/item/%E8%BF%9B%E7%A8%8B%E7%BB%84/1910809)的资源（如 CPU、内存、磁盘输入输出等）。每一种资源比如 CPU、内存等，都有对应的 CGroup 。如果我们没有给 Pod 设置任何的 CPU 和 内存限制，这就意味着 Pod 可以消耗宿主机节点上足够多的 CPU 和 内存。

所以一般来说，我们都会对 Pod 进行资源限制， Kubernetes 通过给 Pod 设置资源请求（Requests）和资源限制（Limits）来实现这个资源限制。

* Requests 表示容器可以得到的资源，或者可以理解为 Pod 运行的最低资源要求。

* Limits 表示着容器最多可以得到的资源。Pod 运行过程中，比如 CPU 使用量会增加，那么最多能使用多少内存，这就是资源限制。

这里有一点需要注意的就是，Limits 永远不要低于 Requests，如果设置不对，Kubernetes 也会拒绝 Pod 的创建。

通过设置 Requests 和 Limits，我们既保证了 Pod 可以运行，又限制 Pod 能使用多少资源。这样能避免某些恶意的容器"吞噬"宿主机的资源，也可以避免某些容器异常导致宿主机 [OOM](https://baike.baidu.com/item/%E5%86%85%E5%AD%98%E6%BA%A2%E5%87%BA?fromtitle=out+of+memory&fromid=16247440)，从而引起该节点上的所有 Pod 异常，甚至导致整个集群"雪崩"。

我们来看看个 Requests 和 Limits 的例子：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: pod-resource-demo
  namespace: demo
spec:
  containers:
  - name: demo-container-1
    image: nginx:1.19
    resources:
    requests:
      memory: "64Mi"
      cpu: "250m"
    limits:
      memory: "128Mi"
      cpu: "500m"
  - name: demo-container-2
    image: nginx:1.19
    resources:
    requests:
      memory: "64Mi"
      cpu: "250m"
    limits:
      memory: "128Mi"
      cpu: "500m"
```

如上所示，Pod 中的每个容器都可以设置自己的 Requests 和 Limits，每个容器使用的资源都不能超过各自的限制。当 Pod 在调度时，会把这些容器的 Requests 和 Limits 进行相加，当作整个 Pod 的资源申请量。因此在上面的示例中，Pod 的总 Requests 为 500 mCPU，128 MiB 内存，总 Limits 为 1 CPU和 256 MiB。关于单位的含义，[官方文档](https://kubernetes.io/zh/docs/concepts/configuration/manage-resources-containers/#pod-%E5%92%8C-%E5%AE%B9%E5%99%A8%E7%9A%84%E8%B5%84%E6%BA%90%E8%AF%B7%E6%B1%82%E5%92%8C%E7%BA%A6%E6%9D%9F)有更详细的说明。

一旦 Pod 成功被调度后，Kubernetes 会将其调度到可以为其提供该资源的节点上。

而根据设置的 Requests 和 Limit，Kubernetes 又将其分为不同的 QoS (Quality of Service)级别。Kubernetes 中 Pod 是最小的单元，所以 QoS 是对整个 Pod 而言而非某个容器。

Kubernetes 支持了三种 QoS 级别，分别为BestEffort、Burstable 和 Guranteed，当资源紧张时 Kubernetes 会根据它们的分级决定调度和驱逐策略（这个我会在后面的课程中单独说明，在此略过），这三个分级分别代表：

* BestEffort表示 Pod 中没有一个容器设置了 Requests 或 Limits，它的优先级最低；

* Burstable表示 Pod 中每个容器至少定义了 CPU 或 Memory 的 Requests，或者 Requests 和 Limits 不相等，它属于中等优先级；

* Guranteed则表示 Pod 中每个容器 Requests 和 Limits 都相等，这类 Pod 的运行优先级最高。简单来说就是cpu.limits = cpu.requests，memory.limits = memory.requests。

你可以通过 QoS 的代码来研究下 Kubernetes 是如何确定 Pod 对应的 QoS 的。这里，我们通过一个 Burstable Pod 的例子，来直观感受下 Kubernetes 的资源限制能力。

#### 一个 Burstable Pod 的例子

这是一个 Burstable Pod 的 YAML 文件，该 Pod 内只有一个容器，且为容器的内存设置了 Requests 和 Limits，分别为 50 Mi 和 100 Mi。

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: memory-burstable-demo
  namespace: demo
spec:
  containers:
  - name: memory-demo
    image: polinux/stress
    resources:
      requests:
        memory: "50Mi"
      limits:
        memory: "100Mi"
    command: ["stress"]
    args: ["--vm", "1", "--vm-bytes", "250M", "--vm-hang", "1"]
```

我们通过`kubectl create`创建好了以后，来查看该 Pod 的状态：

```shell
$ kubectl -n demo get po
NAME                                  READY     STATUS        RESTARTS   AGE
memory-burstable-demo      0/1       OOMKilled     1          11s
```

可以看到该 Pod 被 OOM 杀掉了，因为限制使用100M，而实际使用 250M。那么如果是 CPU 使用超过了 Limits 呢？

这是一个为容器的 CPU 资源设置了 Requests 和 Limits 的 Pod YAML 文件：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: cpu-burstable-demo
  namespace: demo
spec:
  containers:
  - name: cpu-demo
    image: vish/stress
    resources:
      limits:
        cpu: "1"
      requests:
        cpu: "0.5"
    args:
    - -cpus
    - "2"
```

这里我们同样先用`kubectl create`创建，然后用`kubectl top`来查看容器 cpu-demo 的资源使用情况：

```shell
kubectl -n demo top cpu-burstable-demo cpu-demo
NAME       CPU(cores)   MEMORY(bytes)
cpu-demo   1000m        0Mi
```

可以看到 Pod 的内存使用虽然超过了 Limits，实际使用的 CPU 被限制只有 1000 m，但是不会被 OOM 掉，这是因为 CPU 不同于内存，CPU 是可压缩资源（[Compressible Resource](https://www.bmc.com/blogs/kubernetes-compute-resources/)），而内存是不可压缩资源(Incompressible Resource)。  

如果只是为了限制资源，用 Requests 和 Limits 就足够了，那么为何 Kubernetes 还要单独引入 QoS 的概念呢？要回答这个问题，我们就要来看看 QoS 的主要作用。

#### QoS 的主要作用

集群运行一段时间以后，Node 上会有很多 Running 的 Pod。当 Node 上的资源紧张时，可能由于某些BestEffort的 Pod 使用的 CPU 和 Memory 越来越多，或者宿主机某些进程（例如 Kubelet、Docker）占用了 CPU 和 Memory，这个时候Kubernetes 就会根据 QoS 的优先级来选择 Kill 掉一部分 Pod，哪些会先被 Kill 掉呢？

当然是优先级最低的，即BestEffort类型的 Pod，占用的资源越多越优先被 Kill 掉。如果所有BestEffort的 Pod 都被杀死了但是资源依旧紧张，那么接下来会选择 Kill 中等优先级的，即Burstable类型的，之后以此类推。

这里 QoS 的一个作用就是跟[oom_score](https://www.baidu.com/s?ie=utf-8&tn=baidu&wd=oom%20score)进行挂钩。Kubernetes 会根据 QoS 设置 OOM 的评分调整参数oom_score_adj，有兴趣可以阅读[详细的计算代码](https://github.com/kubernetes/kubernetes/blob/master/pkg/kubelet/qos/policy.go#L34)。当发生 OOM 时，oom_score_adj数值越高就越优先被 Kill。这里我给你展示了三个 QoS 对应的oom_score_adj计算公式。


<Image alt="image.png" src="https://s0.lgstatic.com/i/image/M00/64/34/Ciqc1F-X4kSAWDiXAABGicJIZQU816.png"/> 


除此之外，QoS 还与 Pod 驱逐有关系。当节点的内存、CPU 资源不足时，Kubelet 会开始驱逐节点上的 Pod，它会依据 QoS 的优先级确定驱逐的顺序，跟上面 OOM kill 的次序一样。我们会在后续的课程中单独讲这部分。

在实际使用的时候，我们可能会担心某些 Pod 申请了过大的资源，恶意占用，那么我们又该如何避免呢？

### 通过 LimitRange 设置资源防线

Kubernetes 提供了 LimitRange 可以帮助你限定 CPU 和 Memory 的申请范围。

这是一个完整的 LimitRange 定义，你可以根据需要按需选择进行配置。

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: mem-limit-range
  namespace: example
spec:
  limits:
  - default:  # 默认 limit
      memory: 512Mi
      cpu: 2
    defaultRequest:  # 默认 request
      memory: 256Mi
      cpu: 0.5
    max:  # 最大 limit
      memory: 800Mi
      cpu: 3
    min:  # 最小 request
      memory: 100Mi
      cpu: 0.3
    maxLimitRequestRatio:  # limit/request 的最大比率
      memory: 2
      cpu: 2
    type: Container # 支持 Container / Pod / PersistentVolumeClaim 三种类型
```

* default 字段可以设置 Pod 中容器的默认 Limits；

* defaulRequest 字段可以设置 Pod 中容器的默认 Requests；

* max 字段可以设置 Pod 中容器可以设置的最大 Limits，default 字段不能高于此值。同样，在容器上设置的 Limits 也不能高于此值。在使用的时候需要注意的是，如果设置了该字段而又没有设置 default，那么所有未显式设置这些值的容器都将使用此处的最大值作为 Limits。

* min 字段可以设置 Pod 中容器可以设置的最小 Requests。defaulRequest 字段不能低于此值。同样，在容器上设置的 Requests 也不能低于此值。同样需要注意的是，如果设置了该字段而又没有设置 defaulRequest，那么所有未显式设置这些值的容器都将使用此处的最小值作为 Requests。

LimitRange 会设置默认的申请、限制的值，它会自动在 Pod 创建时就注入 Container 中。
> 你可以参照如下几个官方文档中的详细例子学习体会一下：  
> [如何配置每个命名空间最小和最大的 CPU 约束](https://kubernetes.io/zh/docs/tasks/administer-cluster/manage-resources/cpu-constraint-namespace/)  
> [如何配置每个命名空间最小和最大的内存约束](https://kubernetes.io/zh/docs/tasks/administer-cluster/manage-resources/memory-constraint-namespace/)  
> [如何配置每个命名空间默认的 CPU 申请值和限制值](https://kubernetes.io/zh/docs/tasks/administer-cluster/manage-resources/cpu-default-namespace/)  
> [如何配置每个命名空间默认的内存申请值和限制值](https://kubernetes.io/zh/docs/tasks/administer-cluster/manage-resources/memory-default-namespace/)  
> [如何配置每个命名空间最小和最大存储使用量](https://kubernetes.io/zh/docs/tasks/administer-cluster/limit-storage-consumption/#limitrange-to-limit-requests-for-storage)

除了对单个 Pod、Container、PVC 做资源限制外，我们还可以对某个 namespace 下的资源总量进行限制。

### ResourceQuota 设置资源总量限制

我们可以使用 ResourceQuota 对 namespace 内的资源总量进行限制，比如这个例子：

```yaml
apiVersion: v1
kind: ResourceQuota 
metadata: 
  name: compute-resources
  namespace: demo                  #在demo空间下
spec: 
  hard:
    requests.cpu: "10"             #cpu预配置10
    requests.memory: 100Gi         #内存预配置100Gi
    limits.cpu: "40"               #cpu最大不超过40
    limits.memory: 200Gi           #内存最大不超过200Gi
```

你可以看到它有四个部分，每个部分都是可选的，你可以根据自己的需要进行组合。

* requests.cpu 是该命名空间中所有容器的 CPU Requests 总和。在上面的例子中，你可以拥有10 个具有 1 个 CPU 请求的容器，或者 5 个具有 2 个 CPU 请求的容器。只要命名空间 demo 中所有容器的 CPU Requests 总和小于 10 即可。

* requests.memory 是该命名空间中所有容器的 Memory Requests 总和。同 CPU 一样，只要该命名空间中内存的总请求小于100Gi 即可。

* limits.cpu 是命名空间中所有容器的 CPU Limits 的总和。和 requests.cpu 一样，只不过这里是 Limits。

* limits.memory 是命名空间中所有容器的内存 Limits 的总和。和 requests.memory 一样，这里也是指 Limits。

除了 CPU 和内存这类资源以外，ResourceQuota 还支持扩展资源，详见[官方文档的说明](https://kubernetes.io/zh/docs/concepts/policy/resource-quotas/#%E6%89%A9%E5%B1%95%E8%B5%84%E6%BA%90%E7%9A%84%E8%B5%84%E6%BA%90%E9%85%8D%E9%A2%9D)。

ResourceQuota 的功能非常强大，还可以对对象的数量进行限制。比如这个例子：

```yaml
apiVersion: v1 
kind: ResourceQuota 
metadata: 
  name: object-counts 
  namespace: demo                  #在demo命名空间下
spec: 
  hard: 
    configmaps: "10"               #最多10个configmap
    pods: "20"                     #最多20个pod
    persistentvolumeclaims: "4"    #最多10个pvc
    replicationcontrollers: "20"   #最多20个rc
    secrets: "10"                  #最多10个secrets
    services: "10"                 #最多10个service
    services.loadbalancers: "2"    #最多10个lb类型的service
    requests.nvidia.com/gpu: 4        #最多10个GPU
```

我们就可以限制该命名空间下最多可以创建 20 个 Pod，10 个 Configmap 等。

### 写在最后

对于一些重要的线上应用，我们要合理地设置 Requests 和 Limits，且最好使两者的设置相等，当节点资源不足时，Kubernetes 会优先保证这些 Pod 的正常运行。

此外，你可以用 ResourceQuota 限制命名空间中所有容器的内存请求总量、内存限制总量、CPU 请求总量、CPU 限制总量等。而如果你想对单个容器而不是所有容器进行限制，就可以使用 LimitRange。

到这里这节课就结束了，如果你对本节课有什么想法或者疑问，欢迎你在留言区留言，我们一起讨论。

