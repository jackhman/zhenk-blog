# 20资源优化：Kubernete中有GC（垃圾回收）吗？

你好，我是正范。

Garbage Collector 即垃圾回收，通常简称 GC，和你之前在其他编程语言中了解到的 GC 基本上是一样的，用来清理一些不用的资源。Kubernetes 中有各种各样的资源，当然需要 GC啦，今天我们就一起来了解下 Kubernetes 中的 GC。

你可能最先想到的就是容器的清理，即 Kubelet 侧的 GC，清理许多处于退出（Exited）状态的容器，那么就先来了解一下吧。

### Kubelet GC

GC 在 Kubelet 中非常重要，它不仅可以清理无用的容器，还可以清理未使用的镜像以达到节省空间的目的。当然 Kubelet 清理的这些容器都是 Kubernetes 自己创建的容器，你通过 Docker 手动创建的容器均不在 GC 的范围内，所以不必过于担心。

Kubelet 会对容器每分钟执行一次 GC 操作，对容器镜像每 5 分钟执行一次 GC 操作，这样可以保障 Kubelet 节点的稳定性，避免节点出现资源紧缺的情况。Kubelet 刚启动时并不会立即执行 GC 操作，而是在启动 1 分钟后开始执行第一次对容器的 GC 操作，启动 5 分钟后开始执行第一次对容器镜像的回收操作。这里建议你最好不用使用其他外部的 GC 工具，有可能会破坏 Kubelet 的 GC 逻辑。

目前 Kubelet 提供了 3 个参数，可以方便你调整容器镜像的 GC 参数：

* `--minimum-image-ttl-duration`表示一个镜像在清理前的最小存活时间；

* `--image-gc-high-threshold`表示磁盘使用率的上限阈值，默认值是 90%，即当磁盘使用率达到 90% 的时候会触发对镜像的 GC 操作；

* `--image-gc-low-threshold`表示磁盘使用率的下限阈值，默认值是 80%，即当磁盘使用率降到 80% 的时候，GC 操作结束。

对镜像的 GC 操作，就是逐个删除最久最少使用（Least Recently Used）的镜像。

对于容器的 GC 操作，Kubelet 也提供了 3 个参数供你使用调整：

* `--minimum-container-ttl-duration`表示已停止的容器在被清理之前最小的存活时间，默认值是 1 分钟，即容器停止超过 1 分钟才会被标记可被 GC 清理；

* `--maximum-dead-containers-per-container`表示一个 Pod 内可以保留的已停止的容器数量，默认值是 2。Kubernetes 是以 Pod 为单位进行容器管理的。有时候 Pod 内运行失败的容器，比如容器自身的问题，或者健康检查失败，会被 kubelet 自动重启，这将产生一些停止的容器；

* `--maximum-dead-containers`表示在本节点上可以保留的已停止容器的最大数量，默认值是240。毕竟这些容器也会消耗额外的磁盘空间，所以超过这个上限阈值后，就会触发 Kubelet 的 GC 操作，来帮你自动清理这些已停止的容器，释放磁盘空间。

当然，如果你想要关闭容器的 GC 操作，只需要将`--minimun-container-ttl-duration`设置为0，把`--maximum-dead-containers-per-container`和`--maximum-dead-containers`都设置为负数即可。

在有些场景中，容器的日志需要保留在本地，如果直接清理掉这些容器会丢失日志。所以这里我强烈建议你将`--maximum-dead-containers-per-container`设置为一个足够大的值，以便每个容器至少有一个退出的实例。这里，你就可以根据自己的场景进行配置。

提到的这些 flag，目前仍能继续使用，在未来的版本中，Kubernetes 会用新的 flag 进行替换，详见[官方文档](https://kubernetes.io/zh/docs/concepts/cluster-administration/kubelet-garbage-collection/#deprecation)。我们会在下一节课中，介绍这个新的 flag 的用法。

除了这些基本的 GC 以外，Kubernetes 内部也有很多操作对象，而且这些对象之间还存在着一定的"从属关系"，比如 Deployment 管理着 ReplicaSet。下面我们就来了解下 Kubernetes 内部对象的 GC。

### Kubernetes 内部对象的 GC

通过之前的学习，我们已经知道创建好一个 Deployment 以后，kube-controller-manager 会帮助我们创建对应的 ReplicaSet。这些 ReplicaSet 会自动跟我们创建的 Deployment 进行关联，那 Kubernetes 是怎么样维护这种从属关系的呢？

在 Kubernetes 中，每个对象都可以设置多个 OwnerReference，即该对象从属于谁。

我们先来看看 OwnerReference 的定义：

```go
// OwnerReference contains enough information to let you identify an owning
// object. An owning object must be in the same namespace as the dependent, or
// be cluster-scoped, so there is no namespace field.
type OwnerReference struct {
    // API version of the referent.
    APIVersion string `json:"apiVersion" protobuf:"bytes,5,opt,name=apiVersion"`
    // Kind of the referent.
    // More info: https://git.k8s.io/community/contributors/devel/sig-architecture/api-conventions.md#types-kinds
    Kind string `json:"kind" protobuf:"bytes,1,opt,name=kind"`
    // Name of the referent.
    // More info: http://kubernetes.io/docs/user-guide/identifiers#names
    Name string `json:"name" protobuf:"bytes,3,opt,name=name"`
    // UID of the referent.
    // More info: http://kubernetes.io/docs/user-guide/identifiers#uids
    UID types.UID `json:"uid" protobuf:"bytes,4,opt,name=uid,casttype=k8s.io/apimachinery/pkg/types.UID"`
    // If true, this reference points to the managing controller.
    // +optional
    Controller *bool `json:"controller,omitempty" protobuf:"varint,6,opt,name=controller"`
    // If true, AND if the owner has the "foregroundDeletion" finalizer, then
    // the owner cannot be deleted from the key-value store until this
    // reference is removed.
    // Defaults to false.
    // To set this field, a user needs "delete" permission of the owner,
    // otherwise 422 (Unprocessable Entity) will be returned.
    // +optional
    BlockOwnerDeletion *bool `json:"blockOwnerDeletion,omitempty" protobuf:"varint,7,opt,name=blockOwnerDeletion"`
}
```

在 OwnerReference 中，我们可以确定该对象所"从属于"的对象，从而建立两者之间的从属关系。我们通过一个例子，直观了解下这个"从属"关系：

```yaml
apiVersion: apps/v1
kind: ReplicaSet
metadata:
  annotations:
    deployment.kubernetes.io/desired-replicas: "2"
    deployment.kubernetes.io/max-replicas: "3"
    deployment.kubernetes.io/revision: "1"
  creationTimestamp: "2020-09-03T07:22:35Z"
  generation: 1
  labels:
    k8s-app: kube-dns
    pod-template-hash: 5644d7b6d9
  name: coredns-5644d7b6d9
  namespace: kube-system
  ownerReferences:
  - apiVersion: apps/v1
    blockOwnerDeletion: true
    controller: true
    kind: Deployment
    name: coredns
    uid: 37ae660a-dba8-4ff9-a152-7d6f420e624d
  resourceVersion: "1542272"
  selfLink: /apis/apps/v1/namespaces/kube-system/replicasets/coredns-5644d7b6d9
  uid: fa3d9859-43d4-484b-9716-7536243acd0f
spec:
  replicas: 2
  ...
status:
  ...
```

这里我截取了一个 ReplicaSet 中的 metadata 的部分。注意看这个 ReplicaSet 的ownerReferences字段标识了一个名为 coredns 的 Deployment 对象。

同样，我们来看看该 ReplicaSet 管理的 Pod。这里 ReplicaSet 的副本数是 2，我们任意选择其中一个 Pod：

```yaml
apiVersion: v1
kind: Pod
metadata:
  creationTimestamp: "2020-09-03T07:22:35Z"
  generateName: coredns-5644d7b6d9-
  labels:
    k8s-app: kube-dns
    pod-template-hash: 5644d7b6d9
  name: coredns-5644d7b6d9-sz4qj
  namespace: kube-system
  ownerReferences:
  - apiVersion: apps/v1
    blockOwnerDeletion: true
    controller: true
    kind: ReplicaSet
    name: coredns-5644d7b6d9
    uid: fa3d9859-43d4-484b-9716-7536243acd0f
  resourceVersion: "1542270"
  selfLink: /api/v1/namespaces/kube-system/pods/coredns-5644d7b6d9-sz4qj
  uid: c52d630b-1840-4502-88d1-b67bed2dd625
spec:
  ...
```

可以看到该 Pod 的ownerReferences指向刚才的 ReplicaSet，名字和 UID 都与之相对应。

至此通过观察这几个对象中的ownerReferences的信息，我们可以建立起如下的"从属关系"，即：

* Deployment（owner）---\> ReplicaSet (dependent)；

* ReplicaSet (owner) ---\> Pod (dependent)。

了解了如上从属关系，我们后续就可以进行 GC 了。比如当你想彻底删除一个 Deployment 的时候，这时候 Kubernetes 会自动帮你把相关联的 ReplicaSet、Pod 等也一并删除掉，那么这种删除行为也称之为级联删除（Cascading Deletion），这也是 Kubernetes 默认的删除行为。

对于级联删除，Kubernetes 提供了两种模式，分别为后台（Background）模式和前台（Foreground）模式。

我们以后台级联删除 Deployment 为例。直观的体验就是，当你使用后台模式删除时，发送完请求，Kuberentes 会立即删除主对象，比如 Deployment，之后 Kubernetes 会在后台 GC 其附属的对象，比如 ReplicaSet。

而对于[前台级联删除](https://kubernetes.io/zh/docs/concepts/workloads/controllers/garbage-collection/#%E5%89%8D%E5%8F%B0%E7%BA%A7%E8%81%94%E5%88%A0%E9%99%A4)，会先删除其所属的对象，然后再删除主对象。依然以 Deployment 为例，这时候主对象 Deployment 首先进入"删除中"的状态，虽然你依然能够通过 REST API 看到该 Deployment，但是该对象的deletionTimestamp字段被设置非空即"删除中"。

同时该对象的 metadata.finalizers 字段为 foregroundDeletion，有了这个 fianlizer 的存在，该对象就不会被删除，并会一直处于"删除中"的状态。

然后开始删除 ReplicaSet。关联的 ReplicaSet 都被删除以后，主对象 Deployment 中metadata.finalizers 字段会移除 foregroundDeletion 这个 finalizer。这时候主对象就可以被删除掉了。你也许注意到了 ownerReference 字段中的 blockOwnerDeletion，只有这个字段设置为了 true，才会组织删除主对象。

当然如果你删除对象的时候，并不想自动删除其附属对象，那么这些附属对象就"孤立"存在了，即孤立对象（Orphaned）。比如删除 Deployment 的时候，并不想删除其关联的 ReplicaSet。

我们可以通过 deleteOptions.propagationPolicy 这个字段，来控制删除的策略，取值包括上面提到的三种方式，即 Orphan、Foreground 或者 Background。

如果我们使用 kubectl 进行后台删除的时候，可以通过如下命令进行操作：

```shell
$ kubectl proxy --port=8080
$ curl -X DELETE localhost:8080/apis/apps/v1/namespaces/default/replicasets/my-replicaset \
  -d '{"kind":"DeleteOptions","apiVersion":"v1","propagationPolicy":"Background"}' \
  -H "Content-Type: application/json"
```

当然如果你使用的是 client-go 这类的库，也可以通过库中提供的函数，通过设置 DeleteOption 进行后台删除。  

同样，我们也可以通过如下命令进行前台级联删除：

```shell
$ kubectl proxy --port=8080
$ curl -X DELETE localhost:8080/apis/apps/v1/namespaces/default/replicasets/my-replicaset \
  -d '{"kind":"DeleteOptions","apiVersion":"v1","propagationPolicy":"Foreground"}' \
  -H "Content-Type: application/json"
```

这里如果你只想删除 ReplicaSet，但是并不像删除其关联的 Pod，你可以这么操作：

```shell
$ kubectl proxy --port=8080
$ curl -X DELETE localhost:8080/apis/apps/v1/namespaces/default/replicasets/my-repset \
  -d '{"kind":"DeleteOptions","apiVersion":"v1","propagationPolicy":"Orphan"}' \
  -H "Content-Type: application/json"
```

kubectl 命令行在删除操作的时候，默认是进行级联删除的，如果你不想级联删除，可以这么操作：

```shell
$ kubectl delete replicaset my-repset --cascade=false
```

### 写在最后

Kubernetes 默认开启了 GC 的能力，不管是对于内部的各种 API 对象，还是对于 kubelet 节点上的冗余镜像以及退出的容器。这些默认的配置，已经基本上满足我们绝大多数的使用需要，不需要额外配置。当然你也可以通过调整一些参数和策略，实现自己的业务场景和逻辑。

到这里这节课就结束了，如果你对本节课有什么想法或者疑问，欢迎你在留言区留言，我们一起讨论。

