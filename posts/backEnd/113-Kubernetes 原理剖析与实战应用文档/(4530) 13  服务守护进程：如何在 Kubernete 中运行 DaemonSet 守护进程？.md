# 13服务守护进程：如何在Kubernete中运行DaemonSet守护进程？

通过前面课程的学习，我们对 Kubernetes 中一些常见工作负载已经有所了解。比如无状态工作负载 Dployment 可以帮助我们运行指定数目的服务副本，并维护其状态，而对于有状态服务来说，我们同样可以采用 StatefulSet 来做到这一点。

但是，在实际使用的时候，有些场景，比如监控各个节点的状态，使用 Deployment 或者 StatefulSet 都无法满足我们的需求，因为这个时候我们可能会有以下这些需求。

1. 希望每个节点上都可以运行一个副本，且只运行一个副本。虽然通过调整 spec.replicas 的数值，可以使之等于节点数目，再配合一些调度策略（我们后面讲调度原理的时候会深入解释）可以实现这一点。但是如果节点数目发生了变化呢？

2. 希望在新节点上也快速拉起副本。比如集群扩容，这个时候会有一些新节点加入进来，如何立即感知到这些节点，并在上面部署新的副本。

3. 希望节点下线的时候，对应的 Pod 也可以被删除。

4. ......

Kubernetes 提供的 DaemonSet 就可以完美地解决上述问题，其主要目的就是可以在集群内的每个节点上（或者指定的一堆节点上）都只运行一个副本，即 Pod 和 Node 是一一对应的关系。DaemonSet 会结合节点的情况来帮助你管理这些 Pod，见下面的拓扑结构：


<Image alt="Lark20201009-105149.png" src="https://s0.lgstatic.com/i/image/M00/5B/9B/Ciqc1F9_0FqACmcBAABg43Rbbow934.png"/> 


今天我们就来学习一下 DaemonSet，先来看看其主要的使用场景。

### DaemonSet 的使用场景

跟 Deployment 和 StatefulSet 一样，DaemonSet 也是一种工作负载，可以管理一些 Pod。 通常来说，主要有以下的用法：

* 监控数据收集，比如可以将节点信息收集上报给 Prometheus；

* 日志的收集、轮转和清理；

* 监控节点状态，比如运行 node-problem-detector 来监测节点的状态，并上报给 APIServer；

* 负责在每个节点上网络、存储等组件的运行，比如 glusterd、ceph、flannel 等；

现在我们来尝试部署一个 DaemonSet。

### 部署你的第一个 DaemonSet

这里是一个 DaemonSet 的 YAML 文件：

```c
apiVersion: apps/v1 # 这个地方已经不是 extension/v1beta1 了，在1.16版本已经废弃了，请使用 apps/v1
kind: DaemonSet # 这个是类型名
metadata:
  name: fluentd-elasticsearch # 对象名
  namespace: kube-system # 所属的命名空间
  labels:
    k8s-app: fluentd-logging
spec:
  selector:
    matchLabels:
      name: fluentd-elasticsearch
  template:
    metadata:
      labels:
        name: fluentd-elasticsearch
    spec:
      containers:
      - name: fluentd-elasticsearch
        image: quay.io/fluentd_elasticsearch/fluentd:v2.5.2
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
          readOnly: true
      restartPolicy: Always
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
```

在这个 YAML 文件里，我们有一个地方需要特别注意，就 `restartPolicy`这个字段，它是缺省字段，默认值是 `Always`。而且如果你想显式地去设置，你也只能设置为 `Always`。

其他的配置和写法，跟我们之前了解的 Deployment 和 StatefulSet 是类似的。

我们将上面 YAML 文件保存到本地的 `fluentd-elasticsearch-ds.yaml` 中，然后用 `kubectl apply`创建出来：

```c
$ kubectl apply -f fluentd-elasticsearch-ds.yaml
daemonset.apps/fluentd-elasticsearch created
```

创建好后，我们来查看这个 DaemonSet 关联 Pod 的情况：

```java
$ kubectl get pod -n kube-system -l name=fluentd-elasticsearch
NAME                          READY   STATUS    RESTARTS   AGE
fluentd-elasticsearch-m9zjb   1/1     Running   0          85s
```

可以看到，集群中只有一个 Pod 被创建了出来。我们再来看看集群中有多少个节点：

```java
$ kubectl get node
NAME             STATUS   ROLES    AGE   VERSION
docker-desktop   Ready    master   22d   v1.16.6-beta.0
```

由于目前集群中就只有一个节点，所以 Kubernetes 只为这一个节点生成了 Pod。我们来查看下该 DaemonSet 的整体状态：

```java
$ kubectl get ds -n kube-system fluentd-elasticsearch
NAME                    DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR   AGE
fluentd-elasticsearch   1         1         0       1            0           <none>          18
```

在 kubectl 使用的时候，我们常常将`DaemonSet ` 缩写成 ds。这里输出列表的含义如下：  

DESIRED 代表该 DaemonSet 期望要创建的 Pod 个数，即我们需要几个，它跟节点数目息息相关；

* `CURRENT`代表当前已经存在的 Pod 个数；

* `READY` 代表目前已就绪的 Pod 个数；

* `UP-TO-DATE` 代表最新创建的个数；

* `AVAILABLE ` 代表目前可用的 Pod个数；

* `NODE SELECTOR`表示节点选择标签，这个在 DaemonSet 中非常有用。有时候我们只希望在部分节点上运行一些 Pod，比如我们只节点上带有 app=logging-node 的节点上运行一些服务，就可以通过这个标签选择器来实现。

#### 限定 DaemonSet 运行的节点

现在我们来看看如何限定一个 DaemonSet，让其只在某些节点上运行，比如只在带有 `app=logging-node ` 的节点上运行，可以看这张图：


<Image alt="1.png" src="https://s0.lgstatic.com/i/image/M00/59/81/Ciqc1F9xnpWAKFwRAAB-Lq1l0YU648.png"/> 


此时，我们就可以通过 DaemonSet 的 selector 来实现：

```c
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: my-ds
  namespace: demo
  Labels:
    key: value
spec:
  selector: # 通过这个 selector，我们就可以让 daemonset pod 只在指定的节点上运行
    matchLabels:
      app: logging-node
  template:
    metadata:
      labels:
        name: my-daemonset-container
    ...
```

这样一个 DaemonSet 就会只匹配集群中所有带有标签 `app=logging-node` 的节点，并分别在这些节点上运行一个 Pod。

如果集群中节点的标签发生了变化，这个时候`DaemonSetsController`会立刻为新匹配上的节点创建 Pod，同时删除不匹配的节点上的 Pod。

知道了这些我们再来看如何调度。

#### DaemonSet 的 Pod 是如何被调度的

早期 Kubernetes 是通过`DaemonSetsController`（在 kube- controller-manager 组件内以 goroutine 方式运行）调度 DaemonSet 管理的 Pod，这些 Pod 在创建的时候，就在 Pod 的 spec 中提前指定了节点名称，即 `spec.nodeName`。这些 Pod 由于指定了节点，所以不会经过默认调度器进行调度，这就导致了一些问题。

* 不一致的 Pod 行为：其他的 Pod 都是通过默认调度器进行调度的，初始状态都是 Pending（等待调度），而 DaemonSet 的这些 Pod 的起始状态却不是 Pending。

* `DaemonSetsController` 并不会感知到节点的资源变化；

* 默认调度器的一些高级特性需要在 、DaemonSetsController 中二次实现。

* 多组件负责调度会导致 Pod 抢占等功能实现起来非常困难；

* ...

如果你有兴趣，你可以看看设计文档 [Schedule DaemonSet Pods by default scheduler, not DaemonSet controller](https://github.com/kubernetes/community/blob/master/contributors/design-proposals/scheduling/schedule-DS-pod-by-scheduler.md) ，它详细介绍了`DaemonSetsController ` 调度时遇到的各种问题，并给出了详细的解决方案。

简单来说，DaemonSet Pod 依然由 `DaemonSetsController` 进行创建，但是不预先指定`spec.nodeName`了，而通过节点的亲和性，交由默认调度器进行调度。

我们回过头来看看上面`fluentd-elasticsearch`这个 DaemonSet 创建的 Pod：

```c
$ kubectl get pod -n kube-system fluentd-elasticsearch-m9zjb -o yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: "2020-09-25T12:01:31Z"
  generateName: fluentd-elasticsearch-
  labels:
    controller-revision-hash: 5b5b9c8855
    name: fluentd-elasticsearch
    pod-template-generation: "1"
  name: fluentd-elasticsearch-m9zjb
  namespace: kube-system
  ownerReferences:
  - apiVersion: apps/v1
    blockOwnerDeletion: true
    controller: true
    kind: DaemonSet
    name: fluentd-elasticsearch
    uid: 33dc29aa-60b0-4486-8645-731daa85f25d
  ...
spec:
  affinity:
    nodeAffinity: # daemonset 就是利用了 nodeAffinity 的能力
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
        - matchFields:
          - key: metadata.name
            operator: In
            values:
            - docker-desktop
  containers:
  - image: quay.io/fluentd_elasticsearch/fluentd:v2.5.2
    imagePullPolicy: IfNotPresent
    name: fluentd-elasticsearch
    ...
  ...
```

`DaemonSetsController` 创建的这个 Pod，自动添加了 `spec.affinity.nodeAffinity`指定节点的名称，替换以前`spec.nodeName` 的方式。

除了这个`nodeAffinity`之外，`DaemonSetsController`还会自动加一些 Toleration 到 Pod 中。有兴趣可以查看[这个清单](https://kubernetes.io/zh/docs/concepts/workloads/controllers/daemonset/#taint-and-toleration)。我们在后续调度器章节，将统一介绍这些 Affinity 和 Toleration 的用法。

接下来，我们看看它的升级方法。

### 如何升级一个 Daemonset

升级一个 DaemonSet 其实非常简单，你可以通过`kubectl edit` 直接编辑对应的 DaemonSet 对象：

```java
kubectl edit ds -n kube-system fluentd-elasticsearch
```

也可以直接在`fluentd-elasticsearch-ds.yaml` 中修改，然后使用`kubectl apply ` ：

    $ kubectl apply -f fluentd-elasticsearch-ds.yaml

那么修改后，DaemonSet 的这些 Pod 又是如何更新的呢？

DaemonSet 中定义了两种更新策略。

**第一种是 OnDelete** ，顾名思义，当指定这种策略时，我们只有先手动删除原有的 Pod 才会触发新的 DaemonSet Pod 的创建。否则，不论你怎么修改 DaemonSet ，都不会触发新的 Pod 生成。  
**第二种是 RollingUpdate**，这是默认的更新策略，使用这种策略可以实现滚动更新，同时你还可以更精细地控制更新的范围，比如通过 maxUnavailable 为 1 来控制更新的速度（你也可以理解为更新时设置的步长），这表示每次只会先删除 1 个 Pod，待其重新创建并Ready 后，再更新同样的方法更新其他的 Pod。在更新期间，每个节点上最多只能有 DaemonSet 的一个 Pod。

我给你举个例子，下面这个 YAML 是一个使用了`RollingUpdate`更新策略的 DaemonSet ：

```c
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: fluentd-elasticsearch
  namespace: kube-system
  labels:
    k8s-app: fluentd-logging
spec:
  selector:
    matchLabels:
      name: fluentd-elasticsearch
  updateStrategy: # 这里指定了更新策略
    type: RollingUpdate # 进行滚动更新
    rollingUpdate:
      maxUnavailable: 1 # 这是默认的值
  template:
    metadata:
      labels:
        name: fluentd-elasticsearch
    spec:
      containers:
      - name: fluentd-elasticsearch
        image: quay.io/fluentd_elasticsearch/fluentd:v2.5.2
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

从业务状态的角度来看，Kubernetes 使用 Deployment 和 StatefulSet 来分别支持无状态服务和有状态服务。而 DaemonSet 则从另外的一个角度来为集群中的所有节点提供基础服务，比如网络、存储等。

通过 DaemonSet，我们可以确保在所有满足条件的 Node 上只运行一个 Pod 实例，通常使用于日志收集、监控、网络等场景。Kubernetes 的组件 kube-prox 有时也可以借助 DaemonSet 拉起，这样每个节点上就会只运行一个 kube-proxy 的实例。Kubeadm 拉起的集群就是这样部署 kube-proxy 的。

同时 DaemonSet 也帮助我们解决了集群中节点动态变化时业务实例的部署和运维能力，比如扩容、缩容、节点宕机等场景。

好的，如果你对本节课有什么想法或者疑问，欢迎你在留言区留言，我们一起讨论。

