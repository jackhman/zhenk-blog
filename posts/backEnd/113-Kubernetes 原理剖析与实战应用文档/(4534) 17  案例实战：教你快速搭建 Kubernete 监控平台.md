# 17案例实战：教你快速搭建Kubernete监控平台

[Prometheus](https://prometheus.io/) 和 [Grafana](https://grafana.com/) 可以说是 Kubernetes 监控解决方案中最知名的两个。Prometheus 负责收集、存储、查询数据，而 Grafana 负责将 Prometheus 中的数据进行可视化展示，当然 Grafana 还支持其他平台，比如 [ElasticSearch](https://grafana.com/docs/grafana/latest/datasources/elasticsearch/)、[InfluxDB](https://grafana.com/docs/grafana/latest/datasources/influxdb/)、[Graphite](https://grafana.com/docs/grafana/latest/datasources/graphite/) 等。[CNCF 博客](https://www.cncf.io/blog/2020/04/24/prometheus-and-grafana-the-perfect-combo/)也将这两者称为黄金组合，目前一些公有云提供的托管式 Kubernetes （Managed Kubernetes） 都已经默认安装了 Prometheus 和 Grafana。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image/M00/61/14/CgqCHl-OrgyAPH_iAAFeouU_wAY811.png"/> 


我们今天就来学习如何在 Kubernetes 集群中搭建 Prometheus 和 Grafana，使之帮我们监控 Kubernetes 集群。

### 通过 Helm 一键安装 Prometheus 和 Grafana

还记得之前讲过的 Helm 吗？我们今天就通过 Helm 来安装相关的 Charts，一键式搭建 Prometheus 和 Grafana。如果对 Helm 的一些概念和术语还不太清楚，你可以回到第 12 讲复习一下。

首先我们先通过`helm repo add`添加一个 Helm repo，见如下命令：

```shell
$ helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
"prometheus-community" has been added to your repositories
```

我们从这个刚刚添加的`prometheus-community`中安装 Prometheus 的 Chart。

然后你通过`helm repo list`就可以看到当前已添加的所有 repo 列表：

```shell
$ helm repo list
NAME                    URL
prometheus-community    https://prometheus-community.github.io/helm-charts
```

如果你已经添加了这个 repo，那么可以运行`helm repo update`来更新内容：

```shell
$ helm repo update
Hang tight while we grab the latest from your chart repositories...
...Successfully got an update from the "prometheus-community" chart repository
...Successfully got an update from the "bitnami" chart repository
Update Complete. ⎈Happy Helming!⎈
```

正如我们之前讲 Helm 提到过的，Helm 的这些 repo 非常类似于我们熟悉的 YUM 源、debian 源。

回到正题上，添加了这个 helm repo 了以后，我们就可以开始安装 Prometheus 的 Chart 了。通常来说，使用 Helm 安装 Chart 的最佳实践是单独创建一个 namespace （命名空间），方便区分、隔离和管理。这里我们就创建一个名为`monitor`的 namespace:

```shell
$ kubectl create ns monitor
namespace/monitor created
```

创建好了 namespace，我们直接运行如下`helm install`命令进行安装:

```shell
$ helm install prometheus-stack prometheus-community/kube-prometheus-stack -n monitor
NAME: prometheus-stack
LAST DEPLOYED: Mon Oct 19 11:07:42 2020
NAMESPACE: monitor
STATUS: deployed
REVISION: 1
NOTES:
kube-prometheus-stack has been installed. Check its status by running:
  kubectl --namespace monitor get pods -l "release=prometheus-stack"
Visit https://github.com/prometheus-operator/kube-prometheus for instructions on how to create & configure Alertmanager and Prometheus instances using the Operator.
```

下面我来解释下上述命令中的参数含义。

其中`prometheus-stack`是这个 helm release 的名字，当然你在实际使用时候可以换成其他名字。从这个名字的后缀`stack`就可以看出来，`prometheus-community/kube-prometheus-stack`这个 Chart 其实包含了几个组件，类似于我们之前听说过的 [ELKStack](https://www.elastic.co/what-is/elk-stack) 等。除了安装 Prometheus 相关的组件外，该 Chart 的 [requirements.yaml](https://github.com/prometheus-community/helm-charts/blob/main/charts/kube-prometheus-stack/requirements.yaml) 中还定义了三个依赖组件

* [stable/kube-state-metrics](https://github.com/helm/charts/tree/master/stable/kube-state-metrics)；

* [stable/prometheus-node-exporter](https://github.com/prometheus-community/helm-charts/tree/main/charts/prometheus-node-exporter)；

* [grafana/grafana](https://github.com/grafana/helm-charts/tree/main/charts/grafana)。

从这个 YAML 文件可以看到这个 Chart 不仅一起安装了 Grafana，还安装了我们之前第 15 讲提到的`kube-state-metrics`和`prometheus-node-exporter`组件。

接着看`prometheus-community/kube-prometheus-stack`，它就是`prometheus-community`repo里面名为`kube-prometheus-stack`的 Chart。

最后看`monitor`，它是我们刚创建的新命名空间，在部署的时候使用。

当然如果你不想安装这些依赖，也可以通过[文档中的提及方法](https://github.com/prometheus-community/helm-charts/tree/main/charts/kube-prometheus-stack#multiple-releases)更改（override）这些默认设置。

现在我们运行刚才`helm install`输出结果中的命令，来查看我们相关 Pod 的状态：

```shell
$ kubectl --namespace monitor get pods -l "release=prometheus-stack"
NAME                                                   READY   STATUS    RESTARTS   AGE
prometheus-stack-kube-prom-operator-6998d5c5b7-kgv8b   2/2     Running   0          2m41s
prometheus-stack-prometheus-node-exporter-l7pr9        1/1     Running   0          2m41s
```

这里有一个名为prometheus-stack-kube-prom-operator-6998d5c5b7-kgv8b的 Pod，它是 [prometheus-operator](https://github.com/prometheus-operator/prometheus-operator) 的一个实例，主要用于为我们创建、管理和维护 Prometheus 集群，其具体架构图如下。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image/M00/61/09/Ciqc1F-OrkWAXJsQAAEHWw6G6rM837.png"/> 


（[https://github.com/prometheus-operator/prometheus-operator/blob/master/Documentation/user-guides/images/architecture.png）](https://github.com/prometheus-operator/prometheus-operator/blob/master/Documentation/user-guides/images/architecture.png%EF%BC%89)

Operator 的工作流程相对复杂一些，我会在后面单独行介绍，在此先略过。有兴趣的话可以查看[官方文档](https://coreos.com/operators/prometheus/docs/latest/user-guides/getting-started.html)简单了解下。

另外一个叫prometheus-stack-prometheus-node-exporter-l7pr9的 Pod 是一个 [node-exporter](https://github.com/prometheus/node_exporter)，主要来采集 kubelet 所在节点上的 metrics。

这两个 Pod 都运行成功，我们再来看看`monitor`这个 namespace 下面其他依赖组件的状态：

```shell
$ kubectl get all -n monitor
NAME                                                         READY   STATUS    RESTARTS   AGE
pod/alertmanager-prometheus-stack-kube-prom-alertmanager-0   2/2     Running   0          11m
pod/prometheus-prometheus-stack-kube-prom-prometheus-0       3/3     Running   1          11m
pod/prometheus-stack-grafana-5b6dd6b5fb-rtp6z                2/2     Running   0          11m
pod/prometheus-stack-kube-prom-operator-6998d5c5b7-kgv8b     2/2     Running   0          11m
pod/prometheus-stack-kube-state-metrics-c7c69c8c9-bhgjv      1/1     Running   0          11m
pod/prometheus-stack-prometheus-node-exporter-l7pr9          1/1     Running   0          11m
NAME                                                TYPE        CLUSTER-IP       EXTERNAL-IP   PORT(S)                      AGE
service/alertmanager-operated                       ClusterIP   None             <none>        9093/TCP,9094/TCP,9094/UDP   11m
service/prometheus-operated                         ClusterIP   None             <none>        9090/TCP                     11m
service/prometheus-stack-grafana                    ClusterIP   10.108.122.155   <none>        80/TCP                       11m
service/prometheus-stack-kube-prom-alertmanager     ClusterIP   10.103.37.81     <none>        9093/TCP                     11m
service/prometheus-stack-kube-prom-operator         ClusterIP   10.97.75.165     <none>        8080/TCP,443/TCP             11m
service/prometheus-stack-kube-prom-prometheus       ClusterIP   10.102.82.76     <none>        9090/TCP                     11m
service/prometheus-stack-kube-state-metrics         ClusterIP   10.109.78.8      <none>        8080/TCP                     11m
service/prometheus-stack-prometheus-node-exporter   ClusterIP   10.101.221.185   <none>        9100/TCP                     11m
NAME                                                       DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR   AGE
daemonset.apps/prometheus-stack-prometheus-node-exporter   1         1         1       1            1           <none>          11m
NAME                                                  READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/prometheus-stack-grafana              1/1     1            1           11m
deployment.apps/prometheus-stack-kube-prom-operator   1/1     1            1           11m
deployment.apps/prometheus-stack-kube-state-metrics   1/1     1            1           11m
NAME                                                             DESIRED   CURRENT   READY   AGE
replicaset.apps/prometheus-stack-grafana-5b6dd6b5fb              1         1         1       11m
replicaset.apps/prometheus-stack-kube-prom-operator-6998d5c5b7   1         1         1       11m
replicaset.apps/prometheus-stack-kube-state-metrics-c7c69c8c9    1         1         1       11m
NAME                                                                    READY   AGE
statefulset.apps/alertmanager-prometheus-stack-kube-prom-alertmanager   1/1     11m
statefulset.apps/prometheus-prometheus-stack-kube-prom-prometheus       1/1
```

可以看到全部 Pod 都已经部署成功且运行。

prometheus-operator 以 Deployment 的形式部署，并帮助我们创建了名为 prometheus-prometheus-stack-kube-prom-prometheus 的 StatefulSet，副本数设置为 1。

接下来就可以本地来访问 Prometheus 了，通过如下命令，我们在本地通过 <http://127.0.0.1:9090> 来访问 Prometheus：

```shell
kubectl port-forward -n monitor prometheus-prometheus-stack-kube-prom-prometheus-0 9090
```


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image/M00/61/14/CgqCHl-OrlyAf9PiAAW6ru2bHZI707.png"/> 


同样地，我们也可以使用如下命令，在本地通过 <http://127.0.0.1:3000> 来访问 Grafana：

```shell
kubectl port-forward -n monitor prometheus-stack-grafana-5b6dd6b5fb-rtp6z 3000
```


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image/M00/61/14/CgqCHl-OrmeAXd8PABEbqH6I_pE362.png"/> 


这里默认用户名是 admin，密码是 prom-operator。当然你也可以通过 Grafana 的配置来拿到，我们来看看如何操作。

下面是刚才 Chart 部署的 grafana Deployment 的配置：

```dart
kubectl get deploy -n monitor prometheus-stack-grafana -o yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: prometheus-stack-grafana
  namespace: monitor
  ...
spec:
  ...
  template:
    ...
    spec:
      containers:
      ...
      - env:
        - name: GF_SECURITY_ADMIN_USER
          valueFrom:
            secretKeyRef:
              key: admin-user
              name: prometheus-stack-grafana
        - name: GF_SECURITY_ADMIN_PASSWORD
          valueFrom:
            secretKeyRef:
              key: admin-password
              name: prometheus-stack-grafana
        image: grafana/grafana:7.2.0
        ...
      ...
status:
  ...
```

可以看到环境变量`GF_SECURITY_ADMIN_USER`和`GF_SECURITY_ADMIN_PASSWORD`就是 grafana 的登录用户名和密码，具体的值来自 Secret`prometheus-stack-grafana`。

我们接着看这个 Secret：

```shell
$ kubectl get secret prometheus-stack-grafana -n monitor -o jsonpath='{.data}'
map[admin-password:cHJvbS1vcGVyYXRvcg== admin-user:YWRtaW4= ldap-toml:]
```

分别通过 base64 对其进行解码就可以得到用户名和密码：

```shell
$ kubectl get secret prometheus-stack-grafana -n monitor -o jsonpath='{.data.admin-user}' | base64 --decode
admin
$ kubectl get secret prometheus-stack-grafana -n monitor -o jsonpath='{.data.admin-password}' | base64 --decode
prom-operator
```

使用上述用户名和密码登录，进来后就可以看到 grafana 的主页面了。


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image/M00/61/14/CgqCHl-OroiAZBPUABgqqawSub0949.png"/> 


按照上述图示点进来，你就可以看到已经配置好的各个 Dashboard：


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image/M00/61/14/CgqCHl-OrpKAG4VoAAs8370oK_k082.png"/> 


这些都是`prometheus-community/kube-prometheus-stack`这个 Chart 预先配置好的，基本上包括我们对 Kubernetes 的各项监控大盘，你可以随意点击几个 Dashboard 进行了解。


<Image alt="Drawing 6.png" src="https://s0.lgstatic.com/i/image/M00/61/14/CgqCHl-OrtSASkD9ABXvtUrLlxI610.png"/> 


你可以参考[官方文档](https://grafana.com/docs/grafana/latest/dashboards/)学习 Dashboard 的创建和数据展示能力。

### 生产环境中一些重要的关注指标

#### 集群状态、性能以及各个 API 对象

kube-state-metrics 可以帮助我们汇聚 Kubernetes 集群中的各大信息，比如 Pod 数量，APIServer 访问请求数，Pod 调度性能，等等。你可以通过如下命令可本地访问<http://127.0.0.1:8080/metrics>拿到相关的 metrics。

```shell
$ kubectl port-forward -n monitor prometheus-stack-kube-state-metrics-c7c69c8c9-bhgjv 8080
```


<Image alt="Drawing 7.png" src="https://s0.lgstatic.com/i/image/M00/61/14/CgqCHl-Oru-AevJ5AB_ZvYnlO60668.png"/> 


#### 各节点的监控指标

各个节点承载着 Pod 的运行，因此对各个节点的监控至关重要，比如节点的 CPU 使用率、内存使用率、平均工作负载等。你可以通过上面 Chart 预配置好的 Node dashboard 来查看：


<Image alt="Drawing 8.png" src="https://s0.lgstatic.com/i/image/M00/61/09/Ciqc1F-OrvaARKZ2ABNH_bHh8sg135.png"/> 


你可以通过切换节点来查看不同节点的状态，或者单独创建一个 Dashboard，添加一些指标，诸如：

* `kube_node_status_capacity_cpu_cores`代表节点 CPU 容量；

* `kube_node_status_capacity_memory_bytes`代表节点的 Memory容量；

* `kubelet_running_container_count`代表节点上运行的容器数量；

* ......

### 设置 Alert

除了监控指标的收集和展示以外，我们还需要设置报警（Alert）。你可以通过设置合适的 Alert rules，在触发的时候通过钉钉、邮件、Slack、PagerDuty 等多种方式通知你。


<Image alt="Drawing 9.png" src="https://s0.lgstatic.com/i/image/M00/61/14/CgqCHl-Orv6ACQ9XAAqhwgoMegs538.png"/> 


在此不做太多介绍，可以通过[官方文档](https://grafana.com/docs/grafana/latest/alerting/create-alerts/)来设置你的 Alert。

### 写在最后

在这一小节，我们介绍了快速搭建基于 Prometheus + Grafana 的 Kubernetes 监控体系。当然安装的方式有很多，今天这里只写了最方便、最快捷的方式。Chart 里预先配置了多个 Dashboard，方便你开箱即用。

如果你对本节课有什么想法或者疑问，欢迎你在留言区留言，我们一起讨论。

