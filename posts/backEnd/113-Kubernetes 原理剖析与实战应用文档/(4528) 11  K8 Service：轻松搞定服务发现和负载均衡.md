# 11K8Service：轻松搞定服务发现和负载均衡

经过前面几节课的学习，我们已经可以发布高可用的业务了，通过 PV 持久化地保存数据，通过 Deployment或Statefulset 这类工作负载来管理多实例，从而保证服务的高可用。

想一想，这个时候如果有别的应用来访问我们的服务的话，该怎么办呢？直接访问后端的 Pod IP 吗？不，这里我们还需要做服务发现（Service Discovery）。

### 为什么需要服务发现？

传统的应用部署，服务实例的网络位置是固定的，即在给定的机器上进行部署，这个时候的服务地址一般是机器的 IP 加上某个特定的端口号。

但是在 Kubernetes 中，这是完全不同的。业务都是通过 Pod 来承载的，每个 Pod 的生命周期又很短暂，用后即焚，IP 地址也都是随机分配，动态变化的。而且，我们还经常会遇到一些高并发的流量进来，这时候往往需要快速扩容，服务的实例数也会随之动态调整。因此我们在这里就不能用传统的基于 IP 的方式去访问某个服务了。这个对于所有云上的系统，以及微服务应用体系，都是一个大难题。这时我们就需要做服务发现来确定服务的访问地址。

今天我们就来聊聊 Kubernetes 中的服务发现 ------ Service。

### Kubernetes 中的 Service

在之前的课程中，我们知道 Deployment、StatefulSet 这类工作负载都是通过 labelSelector 来管理一组 Pod 的。那么 Kubernetes 中的 Service 也采用了同样的做法，如下图。


<Image alt="image (4).png" src="https://s0.lgstatic.com/i/image/M00/56/EA/Ciqc1F9sPFSAMnmPAAO5U6ZAsB0716.png"/> 
  

（<https://platform9.com/wp-content/uploads/2019/05/kubernetes-service-discovery.jpg>）

这样一个 Service 会选择集群所有 label 中带有`app=nginx`和`env=prod`的 Pod。

我们来看看这样的一个 Service 是如何定义的：

```yaml
$ cat nginx-svc.yaml
apiVersion: v1
kind: Service
metadata:  
  name: nginx-prod-svc-demo
  namespace: demo # service 是 namespace 级别的对象
spec:
  selector:       # Pod选择器
    app: nginx
    env: prod
  type: ClusterIP # service 的类型
  ports:  
  - name: http 
    port: 80       # service 的端口号
    targetPort: 80 # 对应到 Pod 上的端口号
    protocol: TCP  # 还支持 udp，http 等
```

现在我们先来看如下一个 Deployment的定义：

```yaml
$ cat nginx-deploy.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-prod-deploy
  namespace: demo
  labels:
    app: nginx
    env: prod
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
      env: prod
  template:
    metadata:
      labels:
        app: nginx
        env: prod
    spec:
      containers:
      - name: nginx
        image: nginx:1.14.2
        ports:
        - containerPort: 80
```

我们创建好这个 Deployment后，查看其 Pod 状态：

```shell
$ kubectl get deploy -n demo
NAME                READY   UP-TO-DATE   AVAILABLE   AGE
nginx-prod-deploy   3/3     3            3           5s
$ kubectl get pod -n demo -o wide
NAME                                 READY   STATUS    RESTARTS   AGE   IP          NODE             NOMINATED NODE   READINESS GATES
nginx-prod-deploy-6fb6fbb77d-h2gn4   1/1     Running   0          87s   10.1.0.31   docker-desktop   <none>           <none>
nginx-prod-deploy-6fb6fbb77d-r78k9   1/1     Running   0          87s   10.1.0.29   docker-desktop   <none>           <none>
nginx-prod-deploy-6fb6fbb77d-xm8tp   1/1     Running   0          87s   10.1.0.30   docker-desktop   <none>           <none>
```

我们再来创建下上面定义的 Service：

```shell
$ kubectl create -f nginx-svc.yaml
service/nginx-prod-svc-demo created
$ kubectl get svc -n demo
NAME                  TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
nginx-prod-svc-demo   ClusterIP   10.111.193.186   <none>        80/TCP    6s
可以看到，这个 Service 分配到了一个地址为10.111.193.186的 Cluster IP，这是一个虚拟 IP（VIP）地址，集群内所有的 Pod 和 Node 都可以通过这个虚拟 IP 地址加端口的方式来访问该 Service。这个 Service 会根据标签选择器，把匹配到的 Pod 的 IP 地址都挂载到后端。我们使用`kubectl describe`来看看这个 Service：
$ kubectl describe svc -n demo nginx-prod-svc-demo
Name:              nginx-prod-svc-demo
Namespace:         demo
Labels:            <none>
Annotations:       <none>
Selector:          app=nginx,env=prod
Type:              ClusterIP
IP:                10.111.193.186
Port:              http  80/TCP
TargetPort:        80/TCP
Endpoints:         10.1.0.29:80,10.1.0.30:80,10.1.0.31:80
Session Affinity:  None
Events:            <none>
```

可以看到，这时候 Service 关联的 Endpoints 里面有三个 IP 地址，和我们上面看到的 Pod IP 地址完全吻合。

我们试着来缩容 Deployment 的副本数，再来看看 Service 关联的 Pod IP 地址有什么变化：

```shell
$ kubectl scale --replicas=2 deploy -n demo nginx-prod-deploy
deployment.apps/nginx-prod-deploy scaled
$ kubectl get pod -n demo -o wide
NAME                                 READY   STATUS    RESTARTS   AGE   IP          NODE             NOMINATED NODE   READINESS GATES
nginx-prod-deploy-6fb6fbb77d-r78k9   1/1     Running   0          11m   10.1.0.29   docker-desktop   <none>           <none>
nginx-prod-deploy-6fb6fbb77d-xm8tp   1/1     Running   0          11m   10.1.0.30   docker-desktop   <none>           <none>
$ kubectl describe svc -n demo nginx-prod-svc-demo
Name:              nginx-prod-svc-demo
Namespace:         demo
Labels:            <none>
Annotations:       <none>
Selector:          app=nginx,env=prod
Type:              ClusterIP
IP:                10.111.193.186
Port:              http  80/TCP
TargetPort:        80/TCP
Endpoints:         10.1.0.29:80,10.1.0.30:80
Session Affinity:  None
Events:            <none>
```

可见当 Pod 的生命周期发生变化时，比如缩容或者异常退出，Service 会自动把有问题的 Pod 从后端地址中摘除。这样实现的好处在于，我们可以始终通过一个虚拟的稳定 IP 地址来访问服务，而不用关心其后端真正实例的变化。  

Kubernetes 中 Service 一共有四种类型，除了上面讲的 ClusterIP，还有 NodePort、LoadBalancer 和 ExternalName。

其中 LoadBalancer 在云上用的较多，使用的时候需要跟各家云厂商做适配，比如部署对应的 cloud-controller-manager。有兴趣的话，可以查看[这个文档](https://kubernetes.io/zh/docs/concepts/services-networking/service/#loadbalancer)，看看如何在云上使用。LoadBalancer主要用于做外部的服务发现，即暴露给集群外部的访问。

ExternalName 类型的 Service 在实际中使用的频率不是特别高，但是对于某些特殊场景还是有一些用途的。比如在云上或者内部已经运行着一个应用服务，但是暂时没有运行在 Kubernetes 中，如果想让在 Kubernetes 集群中的 Pod 访问该服务，这时当然可以直接使用它的域名地址，也可以通过 ExternalName 类型的 Service 来解决。这样就可以直接访问 Kubernetes 内部的 Service 了。

这样一来方便后续服务迁移到 Kubernetes 中，二来也方便随时切换到备份的服务上，而不用更改 Pod 内的任何配置。由于使用频率并不高，我们不做重点介绍，有兴趣可以参考这篇[文档](https://kubernetes.io/zh/docs/concepts/services-networking/service/#externalname)。

我们最后来看下另外一种 NodePort 类型的 Service：

```yaml
apiVersion: v1
kind: Service
metadata:  
  name: my-nodeport-service
  namespace: demo
spec:
  selector:    
    app: my-app
  type: NodePort # 这里设置类型为 NodePort
  ports:  
  - name: http
    port: 80
    targetPort: 80
    nodePort: 30000
    protocol: TCP
```

顾名思义，这种类型的 Service 通过任一 Node 节点的 IP 地址，再加上端口号就可以访问 Service 后端负载了。我们看下面这个流量图，方便理解。


<Image alt="image (5).png" src="https://s0.lgstatic.com/i/image/M00/56/F5/CgqCHl9sPGuAbYFBAAR9dQ-LWLw022.png"/> 
  

（<https://miro.medium.com/max/1680/1>\*CdyUtG-8CfGu2oFC5s0KwA.png）

NodePort 类型的 Service 创建好了以后，Kubernetes 会在每个 Node 节点上开个端口，比如这里的 30000 端口。这个时候我们可以访问任何一个 Node 的 IP 地址，通过 30000 端口即可访问该服务。

那么如果在集群内部，该如何访问这些 Service 呢？

### 集群内如何访问 Service？

一般来说，在 Kubernetes 集群内，我们有两种方式可以访问到一个 Service。

1. 如果该 Service 有 ClusterIP，我们就可以直接用这个虚拟 IP 去访问。比如我们上面创建的 nginx-prod-svc-demo 这个 Service，我们通过`kubectl get svc nginx-prod-svc-demo -n dmeo`或`kubectl get svc nginx-prod-svc-demo -n dmeo`就可以看到其 Cluster IP 为 10.111.193.186，端口号为 80。那么我们通过 http(s)://10.111.193.186:80 就可以访问到该服务。

2. 当然我们也可以使用该 Service 的域名，依赖于集群内部的 DNS 即可访问。还是以上面的例子做说明，同 namespace 下的 Pod 可以直接通过 nginx-prod-svc-demo 这个 Service 名去访问。如果是不同 namespace 下的 Pod 则需要加上该 Service 所在的 namespace 名，即`nginx-prod-svc-demo.demo`去访问。

如果在某个 namespace 下，Service 先于 Pod 创建出来，那么 kubelet 在创建 Pod 的时候，会自动把这些 namespace 相同的 Service 访问信息当作环境变量注入 Pod 中，即`{SVCNAME}_SERVICE_HOST`和`{SVCNAME}_SERVICE_PORT`。这里`SVCNAME`对应是各个 Service 的大写名称，名字中的横线会被自动转换成下划线。比如：

```shell
# env
KUBERNETES_PORT=tcp://10.96.0.1:443
KUBERNETES_SERVICE_PORT=443
HOSTNAME=nginx-prod-deploy2-68d8fb9586-4m5hr
NGINX_PROD_SVC_DEMO_SERVICE_PORT_HTTP=80
NGINX_PROD_SVC_DEMO_SERVICE_HOST=10.111.193.186
KUBERNETES_PORT_443_TCP_ADDR=10.96.0.1
NGINX_PROD_SVC_DEMO_SERVICE_PORT=80
NGINX_PROD_SVC_DEMO_PORT=tcp://10.111.193.186:80
KUBERNETES_PORT_443_TCP_PORT=443
KUBERNETES_PORT_443_TCP_PROTO=tcp
NGINX_PROD_SVC_DEMO_PORT_80_TCP_ADDR=10.111.193.186
NGINX_PROD_SVC_DEMO_PORT_80_TCP_PORT=80
NGINX_PROD_SVC_DEMO_PORT_80_TCP_PROTO=tcp
KUBERNETES_PORT_443_TCP=tcp://10.96.0.1:443
KUBERNETES_SERVICE_PORT_HTTPS=443
KUBERNETES_SERVICE_HOST=10.96.0.1
NGINX_PROD_SVC_DEMO_PORT_80_TCP=tcp://10.111.193.186:80
...
```

知道了这两种访问方式，我们就可以在启动 Pod 的时候，通过注入环境变量、启动参数或者挂载配置文件等方式，来指定要访问的 Service 信息。如果是同 namespace 的 Pod，可以直接从自己的环境变量中知道同 namespace 下的其他 Service 的访问方式。

那么这样通过该 Service 进行访问时，Kubernetes 又是如何实现负载均衡的呢，即将流量打到后端挂载的各个 Pod 上面去？

### 集群内部的负载均衡如何实现？

这一切都是通过 kube-proxy 来实现的。所有的节点上都会运行着一个 kube-proxy的服务，主要监听 Kubernetes 中的 Service 和 Endpoints。当 Service 或 Endpoints 发生变化时，就会调用相应的接口创建对应的规则出来，常用模式主要是 iptables 模式和 IPVS 模式。iptables 模式比较简单，使用起来也方便。而 IPVS 支持更高的吞吐量以及复杂的负载均衡策略，你可以通过[官方文档](https://kubernetes.io/zh/docs/concepts/services-networking/service/#proxy-mode-ipvs)了解更多 IPVS 模式的工作原理。

目前 kube-proxy 默认的工作方式是 iptables 模式，我们来通过如下一个 iptables 模式的例子来看一下实际访问链路是什么样的。


<Image alt="image (6).png" src="https://s0.lgstatic.com/i/image/M00/56/F5/CgqCHl9sPH6AMn4jAA32mDhWECM868.png"/> 
  

（<https://d33wubrfki0l68.cloudfront.net/27b2978647a8d7bdc2a96b213f0c0d3242ef9ce0/e8c9b/images/docs/services-iptables-overview.svg>）

当你通过 Service 的域名去访问时，会先通过 CoreDNS 解析出 Service 对应的 Cluster IP，即虚拟 IP。然后请求到达宿主机的网络后，就会被kube-proxy所配置的 iptables 规则所拦截，之后请求会被转发到每一个实际的后端 Pod 上面去，这样就实现了负载均衡。

### Headless Service

如果我们在定义 Service 的时候，将spec.clusterIP设置为 None，这个时候创建出来的 Service 并不会分配到一个 Cluster IP，此时它就被称为Headless Service。

现在我们来通过一个例子来看看 Headless Service 有什么特殊的地方。我们在上面的 Service 基础上，增加了spec.clusterIP为None，并命名为nginx-prod-demo-headless-svc：

```yaml
apiVersion: v1
kind: Service
metadata:  
  name: nginx-prod-demo-headless-svc
  namespace: demo 
spec:
  clusterIP: None
  selector: 
    app: nginx
    env: prod
  type: ClusterIP
  ports:  
  - name: http 
    port: 80 
    targetPort: 80 
    protocol: TCP 
```

通过 kubectl 创建成功后，我们现在`kubectl get`一下看看：

```shell
$ kubectl get svc -n demo
NAME                           TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)   AGE
nginx-prod-demo-headless-svc   ClusterIP   None             <none>        80/TCP    4s
nginx-prod-svc-demo            ClusterIP   10.111.193.186   <none>        80/TCP    3d5h
```

可以看到这个叫 nginx-prod-demo-headless-svc 的 Service 并没有分配到一个 ClusterIP，符合预期，毕竟我们已经设置了 spec.clusterIP 为 None。

我们来创建一个 Pod，看看 DNS 记录有没有什么差别。 Pod 的 yaml 文件如下：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: headless-svc-test-pod
  namespace: demo
spec:
  containers:
  - name: dns-test
    image: busybox:1.28
    command: ['sh', '-c', 'echo The app is running! && sleep 3600']
```

该 Pod 创建出来后，我们通过`kubectl exec`进入 Pod 中，运行如下两条 nslookup 查询命令，依次查看两个 Service 对应的 DNS 记录：

```shell
$ kubectl exec -it -n demo headless-svc-test-pod sh
kubectl exec [POD] [COMMAND] is DEPRECATED and will be removed in a future version. Use kubectl kubectl exec [POD] -- [COMMAND] instead.
/ # nslookup nginx-prod-demo-headless-svc
Server:    10.96.0.10
Address 1: 10.96.0.10 kube-dns.kube-system.svc.cluster.local

Name:      nginx-prod-demo-headless-svc
Address 1: 10.1.0.32 10-1-0-32.nginx-prod-demo-headless-svc.demo.svc.cluster.local
Address 2: 10.1.0.33 10-1-0-33.nginx-prod-demo-headless-svc.demo.svc.cluster.local
/ # nslookup nginx-prod-svc-demo
Server:    10.96.0.10
Address 1: 10.96.0.10 kube-dns.kube-system.svc.cluster.local

Name:      nginx-prod-svc-demo
Address 1: 10.111.193.186 nginx-prod-svc-demo.demo.svc.cluster.local
```

我们可以看到正常 Service`nginx-prod-svc-demo`对应的 DNS 记录的是与虚拟 IP`10.111.193.166`有关的记录，而 Headless Service`nginx-prod-demo-headless-svc`则解析到所有后端的 Pod 的地址。  

总结下， Headless Service 主要有如下两种场景。

1. 用户可以自己选择要连接哪个 Pod，通过查询 Service 的 DNS 记录来获取后端真实负载的 IP 地址，自主选择要连接哪个 IP；

2. 可用于部署有状态服务。回顾下，我们在 StatefulSet 那节课也有 Headless Service 例子，每个 StatefulSet 管理的 Pod 都有一个单独的 DNS 记录，且域名保持不变，即`<PodName>.<ServiceName>.<NamespaceName>.svc.cluster.local`。这样 Statefulset 中的各个 Pod 就可以直接通过 Pod 名字解决相互间身份以及访问问题。

### 写在最后

Service 是 Kubernetes 很重要的对象，主要负责为各种工作负载暴露服务，方便各个服务之间互访。通过对一组 Pod 提供统一入口，Service 极大地方便了用户使用，用户只需要与 Service 打交道即可，而不用过多地关心后端实例的变动，比如扩缩容、容器异常、节点宕机，等等。

正是因为有了 Service 的支持，你在 Kubernetes 部署业务会非常方便，这是相比较于 Docker Swarm 以及 Mesos Marathon 巨大的技术优势，可以说，它是 Kubernetes 是运行大规模微服务的最佳载体。

好的，如果你对本节课有什么想法或者疑问，欢迎你在留言区留言，我们一起讨论。

