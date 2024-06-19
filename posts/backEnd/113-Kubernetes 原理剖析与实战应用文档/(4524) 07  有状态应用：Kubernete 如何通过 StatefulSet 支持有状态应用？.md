# 07有状态应用：Kubernete如何通过StatefulSet支持有状态应用？

在上一节课中，我们学习了 Kubernetes 中的无状态工作负载，并上手实践了 Deployment 对象，相信现在你已经慢慢喜欢上 Kubernetes 了。

那么本节课，我们来一起看看Kubernetes 中的另外一种工作负载 StatefulSet。从名字就可以看出，这个工作负载主要用于有状态的服务发布。关于有状态服务和无状态服务，你可以参考上一节课的内容。

这节课，我们从一个具体的例子来逐渐了解、认识 StatefulSet。在 kubectl 命令行中，我们一般将 StatefulSet 简写为 sts。在部署一个 StatefulSet 的时候，有个前置依赖对象，即 Service（服务）。这个对象在 StatefulSet 中的作用，我们在下文中会一一道来。另外，关于这个对象的详细介绍和其他作用，我们会在后面的课程中单独讲解。在此，你可以先暂时略过对 Service 的感知。我们先看如下一个 Service：

```shell
$ cat nginx-svc.yaml
apiVersion: v1
kind: Service
metadata:
  name: nginx-demo
  namespace: demo
  labels:
    app: nginx
spec:
  clusterIP: None
  ports:
  - port: 80
    name: web
  selector:
    app: nginx
```

上面这段 yaml 的意思是，在 demo 这个命名空间中，创建一个名为 nginx-demo 的服务，这个服务暴露了 80 端口，可以访问带有`app=nginx`这个 label 的 Pod。

我们现在利用上面这段 yaml 在集群中创建出一个 Service：

```shell
$ kubectl create ns demo
$ kubectl create -f nginx-svc.yaml
service/nginx-demo created
$ kubectl get svc -n demo
NAME         TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
nginx-demo   ClusterIP   None             <none>        80/TCP    5s
```

创建好了这个前置依赖的 Service，下面我们就可以开始创建真正的 StatefulSet 对象，可参照如下的 yaml 文件：

```shell
$ cat web-sts.yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: web-demo
  namespace: demo
spec:
  serviceName: "nginx-demo"
  replicas: 2
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
      - name: nginx
        image: nginx:1.19.2-alpine
        ports:
        - containerPort: 80
          name: web
$ kubectl create -f web-sts.yaml
$ kubectl get sts -n demo
NAME       READY   AGE
web-demo   0/2     9s
```

可以看到，到这里我已经将名为web-demo的StatefulSet部署完成了。

下面我们来一点点探索 StatefulSet 的秘密，看看它有哪些特性，为何可以保障服务有状态的运行。

### StatefulSet 的特性

通过 kubectl 的**watch** 功能（命令行加参数`-w`），我们可以观察到 Pod 状态的一步步变化。

```shell
$ kubectl get pod -n demo -w
NAME         READY   STATUS              RESTARTS   AGE
web-demo-0   0/1     ContainerCreating   0          18s
web-demo-0   1/1     Running             0          20s
web-demo-1   0/1     Pending             0          0s
web-demo-1   0/1     Pending             0          0s
web-demo-1   0/1     ContainerCreating   0          0s
web-demo-1   1/1     Running             0          2s
```

**通过 StatefulSet 创建出来的 Pod 名字有一定的规律** ，即`$(statefulset名称)-$(序号)`，比如这个例子中的web-demo-0、web-demo-1。

这里面还有个有意思的点，web-demo-0 这个 Pod 比 web-demo-1 优先创建，而且在 web-demo-0 变为 Running 状态以后，才被创建出来。为了证实这个猜想，我们在一个终端窗口观察 StatefulSet 的 Pod：

```shell
$ kubectl get pod -n demo -w -l app=nginx
```

我们再开一个终端端口来 watch 这个 namespace 中的 event：

```shell
$ kubectl get event -n demo -w
```

现在我们试着改变这个 StatefulSet 的副本数，将它改成 5：

```shell
$ kubectl scale sts web-demo -n demo --replicas=5
statefulset.apps/web-demo scaled
```

此时我们观察到另外两个终端端口的输出：

```shell
$ kubectl get pod -n demo -w
NAME         READY   STATUS    RESTARTS   AGE
web-demo-0   1/1     Running   0          20m
web-demo-1   1/1     Running   0          20m
web-demo-2   0/1     Pending   0          0s
web-demo-2   0/1     Pending   0          0s
web-demo-2   0/1     ContainerCreating   0          0s
web-demo-2   1/1     Running             0          2s
web-demo-3   0/1     Pending             0          0s
web-demo-3   0/1     Pending             0          0s
web-demo-3   0/1     ContainerCreating   0          0s
web-demo-3   1/1     Running             0          3s
web-demo-4   0/1     Pending             0          0s
web-demo-4   0/1     Pending             0          0s
web-demo-4   0/1     ContainerCreating   0          0s
web-demo-4   1/1     Running             0          3s
```

我们再一次看到了 StatefulSet 管理的 Pod 按照 2、3、4 的顺序依次创建，名称有规律，跟上一节通过 Deployment 创建的随机 Pod 名有很大的区别。

通过观察对应的 event 信息，也可以再次证实我们的猜想。

```js
$ kubectl get event -n demo -w
LAST SEEN   TYPE     REASON             OBJECT                 MESSAGE
20m         Normal   Scheduled          pod/web-demo-0         Successfully assigned demo/web-demo-0 to kraken
20m         Normal   Pulling            pod/web-demo-0         Pulling image "nginx:1.19.2-alpine"
20m         Normal   Pulled             pod/web-demo-0         Successfully pulled image "nginx:1.19.2-alpine"
20m         Normal   Created            pod/web-demo-0         Created container nginx
20m         Normal   Started            pod/web-demo-0         Started container nginx
20m         Normal   Scheduled          pod/web-demo-1         Successfully assigned demo/web-demo-1 to kraken
20m         Normal   Pulled             pod/web-demo-1         Container image "nginx:1.19.2-alpine" already present on machine
20m         Normal   Created            pod/web-demo-1         Created container nginx
20m         Normal   Started            pod/web-demo-1         Started container nginx
20m         Normal   SuccessfulCreate   statefulset/web-demo   create Pod web-demo-0 in StatefulSet web-demo successful
20m         Normal   SuccessfulCreate   statefulset/web-demo   create Pod web-demo-1 in StatefulSet web-demo successful
0s          Normal   SuccessfulCreate   statefulset/web-demo   create Pod web-demo-2 in StatefulSet web-demo successful
0s          Normal   Scheduled          pod/web-demo-2         Successfully assigned demo/web-demo-2 to kraken
0s          Normal   Pulled             pod/web-demo-2         Container image "nginx:1.19.2-alpine" already present on machine
0s          Normal   Created            pod/web-demo-2         Created container nginx
0s          Normal   Started            pod/web-demo-2         Started container nginx
0s          Normal   SuccessfulCreate   statefulset/web-demo   create Pod web-demo-3 in StatefulSet web-demo successful
0s          Normal   Scheduled          pod/web-demo-3         Successfully assigned demo/web-demo-3 to kraken
0s          Normal   Pulled             pod/web-demo-3         Container image "nginx:1.19.2-alpine" already present on machine
0s          Normal   Created            pod/web-demo-3         Created container nginx
0s          Normal   Started            pod/web-demo-3         Started container nginx
0s          Normal   SuccessfulCreate   statefulset/web-demo   create Pod web-demo-4 in StatefulSet web-demo successful
0s          Normal   Scheduled          pod/web-demo-4         Successfully assigned demo/web-demo-4 to kraken
0s          Normal   Pulled             pod/web-demo-4         Container image "nginx:1.19.2-alpine" already present on machine
0s          Normal   Created            pod/web-demo-4         Created container nginx
0s          Normal   Started            pod/web-demo-4         Started container nginx
```

现在我们试着进行一次缩容：

```shell
$ kubectl scale sts web-demo -n demo --replicas=2
statefulset.apps/web-demo scaled
```

此时观察另外两个终端窗口，分别如下：

```js
web-demo-4   1/1     Terminating   0          11m
web-demo-4   0/1     Terminating   0          11m
web-demo-4   0/1     Terminating   0          11m
web-demo-4   0/1     Terminating   0          11m
web-demo-3   1/1     Terminating   0          12m
web-demo-3   0/1     Terminating   0          12m
web-demo-3   0/1     Terminating   0          12m
web-demo-3   0/1     Terminating   0          12m
web-demo-2   1/1     Terminating   0          12m
web-demo-2   0/1     Terminating   0          12m
web-demo-2   0/1     Terminating   0          12m
web-demo-2   0/1     Terminating   0          12m
```

```js
0s          Normal   SuccessfulDelete   statefulset/web-demo   delete Pod web-demo-4 in StatefulSet web-demo successful
0s          Normal   Killing            pod/web-demo-4         Stopping container nginx
0s          Normal   Killing            pod/web-demo-3         Stopping container nginx
0s          Normal   SuccessfulDelete   statefulset/web-demo   delete Pod web-demo-3 in StatefulSet web-demo successful
0s          Normal   SuccessfulDelete   statefulset/web-demo   delete Pod web-demo-2 in StatefulSet web-demo successful
0s          Normal   Killing            pod/web-demo-2         Stopping container nginx
```

可以看到，在缩容的时候，StatefulSet 关联的 Pod 按着 4、3、2 的顺序依次删除。

可见，**对于一个拥有 N 个副本的 StatefulSet 来说** ，**Pod 在部署时按照 {0 ...... N-1} 的序号顺序创建的** ，**而删除的时候按照逆序逐个删除**，这便是我想说的第一个特性。

接着我们来看，**StatefulSet 创建出来的 Pod 都具有固定的、且确切的主机名**，比如：

```shell
$ for i in 0 1; do kubectl exec web-demo-$i -n demo -- sh -c 'hostname'; done
web-demo-0
web-demo-1
```

我们再看看上面 StatefulSet 的 API 对象定义，有没有发现跟我们上一节中 Deployment 的定义极其相似，主要的差异在于`spec.serviceName`这个字段。它很重要，StatefulSet 根据这个字段，为每个 Pod 创建一个 DNS 域名，这个**域名的格式** 为`$(podname).(headless service name)`，下面我们通过例子来看一下。

当前 Pod 和 IP 之间的对应关系如下：

```shell
$ kubectl get pod -n demo -l app=nginx -o wide
NAME         READY   STATUS    RESTARTS   AGE     IP            NODE     NOMINATED NODE   READINESS GATES
web-demo-0   1/1     Running   0          3h17m   10.244.0.39   kraken   <none>           <none>
web-demo-1   1/1     Running   0          3h17m   10.244.0.40   kraken   <none>           <none>
```

Podweb-demo-0 的IP 地址是 10.244.0.39，web-demo-1的 IP 地址是 10.244.0.40。这里我们通过`kubectl run`在同一个命名空间`demo`中创建一个名为 dns-test 的 Pod，同时 attach 到容器中，类似于`docker run -it --rm`这个命令。  

我么在容器中运行 nslookup 来查询它们在集群内部的 DNS 地址，如下所示：

```shell
$ kubectl run -it --rm --image busybox:1.28 dns-test -n demo
If you don't see a command prompt, try pressing enter.
/ # nslookup web-demo-0.nginx-demo
Server:    10.96.0.10
Address 1: 10.96.0.10 kube-dns.kube-system.svc.cluster.local
Name:      web-demo-0.nginx-demo
Address 1: 10.244.0.39 web-demo-0.nginx-demo.demo.svc.cluster.local
/ # nslookup web-demo-1.nginx-demo
Server:    10.96.0.10
Address 1: 10.96.0.10 kube-dns.kube-system.svc.cluster.local
Name:      web-demo-1.nginx-demo
Address 1: 10.244.0.40 web-demo-1.nginx-demo.demo.svc.cluster.local
```

可以看到，每个 Pod 都有一个对应的 [A 记录](https://baike.baidu.com/item/A%E8%AE%B0%E5%BD%95/1188077?fr=aladdin)。  

我们现在删除一下这些 Pod，看看会有什么变化：

```shell
$ kubectl delete pod -l app=nginx -n demo
pod "web-demo-0" deleted
pod "web-demo-1" deleted
$ kubectl get pod -l app=nginx -n demo -o wide
NAME         READY   STATUS    RESTARTS   AGE   IP            NODE     NOMINATED NODE   READINESS GATES
web-demo-0   1/1     Running   0          15s   10.244.0.50   kraken   <none>           <none>
web-demo-1   1/1     Running   0          13s   10.244.0.51   kraken   <none>           <none>
```

删除成功后，可以发现 StatefulSet 立即生成了新的 Pod，但是 Pod 名称维持不变。唯一变化的就是 IP 发生了改变。

我们再来看看 DNS 记录：

```shell
$ kubectl run -it --rm --image busybox:1.28 dns-test -n demo
If you don't see a command prompt, try pressing enter.
/ # nslookup web-demo-0.nginx-demo
Server:    10.96.0.10
Address 1: 10.96.0.10 kube-dns.kube-system.svc.cluster.local

Name:      web-demo-0.nginx-demo
Address 1: 10.244.0.50 web-demo-0.nginx-demo.demo.svc.cluster.local
/ # nslookup web-demo-1.nginx-demo
Server:    10.96.0.10
Address 1: 10.96.0.10 kube-dns.kube-system.svc.cluster.local

Name:      web-demo-1.nginx-demo
Address 1: 10.244.0.51 web-demo-1.nginx-demo.demo.svc.cluster.local
```

可以看出，**DNS 记录中 Pod 的域名没有发生变化** ，**仅仅 IP 地址发生了更换** 。因此当 Pod 所在的节点发生故障导致 Pod 飘移到其他节点上，或者 Pod 因故障被删除重建，Pod 的 IP 都会发生变化，但是 Pod 的域名不会有任何变化，这也就意味着**服务间可以通过不变的 Pod 域名来保障通信稳定** ，**而不必依赖 Pod IP**。

有了`spec.serviceName`这个字段，保证了 StatefulSet 关联的 Pod 可以有稳定的网络身份标识，即 Pod 的序号、主机名、DNS 记录名称等。

最后一个我想说的是，对于有状态的服务来说，每个副本都会用到持久化存储，且各自使用的数据是不一样的。

StatefulSet 通过 PersistentVolumeClaim（PVC）可以保证 Pod 的存储卷之间一一对应的绑定关系。同时，删除 StatefulSet 关联的 Pod 时，不会删除其关联的 PVC。

我们会在后续网络存储的章节中来专门介绍，再次先略过。

### 如何更新升级 StatefulSet

那么，如果想对一个 StatefulSet 进行升级，该怎么办呢？

在 StatefulSet 中，支持两种更新升级策略，即 RollingUpdate 和 OnDelete。

RollingUpdate策略是**默认的更新策略** 。可以实现 Pod 的滚动升级，跟我们上一节课中 Deployment 介绍的RollingUpdate策略一样。比如我们这个时候做了镜像更新操作，那么整个的升级过程大致如下，先逆序删除所有的 Pod，然后依次用新镜像创建新的 Pod 出来。这里你可以通过`kubectl get pod -n demo -w -l app=nginx`来动手观察下。

同时使用 RollingUpdate 更新策略还支持通过 partition 参数来分段更新一个 StatefulSet。所有序号大于或者等于 partition 的Pod 都将被更新。你这里也可以手动更新 StatefulSet 的配置来实验下。

当你把更新策略设置为 OnDelete 时，我们就必须手动先删除 Pod，才能触发新的 Pod 更新。

### 写在最后

现在我们就总结下 StatefulSet 的特点：

* 具备固定的网络标记，比如主机名，域名等；

* 支持持久化存储，而且最好能够跟实例一一绑定；

* 可以按照顺序来部署和扩展；

* 可以按照顺序进行终止和删除操作；

* 在进行滚动升级的时候，也会按照一定顺序。

借助 StatefulSet 的这些能力，我们就可以去部署一些有状态服务，比如 MySQL、ZooKeeper、MongoDB 等。你可以跟着这个[教程](https://kubernetes.io/zh/docs/tutorials/stateful-application/zookeeper/)在 Kubernetes 中搭建一个 ZooKeeper 集群。

到这里这节课就结束了，下节课我们就来学习配置管理。如果你对本节课有什么想法或者疑问，欢迎你在留言区留言，我们一起讨论。

