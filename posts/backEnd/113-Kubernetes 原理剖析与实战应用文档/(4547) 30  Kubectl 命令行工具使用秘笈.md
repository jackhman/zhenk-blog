# 30Kubectl命令行工具使用秘笈

在本课程的最后一讲，我来为你介绍一些 kubectl 使用过程中的小技巧。kubectl 是我们日常操纵整个 Kubernetes 的利器，操作方便，功能强大。接下来，我会向你介绍常用的七个功能。

### 自动补全

我们可以通过如下命令进行命令行的自动补全，方便我们使用。

* 如果你使用的是 bash，可以通过如下命令：

```java
source <(kubectl completion bash) #你需要先安装 bash-completion
echo "source <(kubectl completion bash)" >> ~/.bashrc #这样就不需要每次都 source 一下了
```

* 如果你使用的是 zsh，也有可用的命令：

```java
source <(kubectl completion zsh)
echo "[[ $commands[kubectl] ]] && source <(kubectl completion zsh)" >> ~/.zshrc #这样就不需要每次都 source 一下了
```

### 命令行帮助

遇到任何关于命令行使用的问题，都可以通过"kubectl -h"命令来查看有哪些子命令、包含哪些参数、使用例子等等。

这条命令也是我使用比较多的，可以帮助你更快地熟悉和了解 kubectl 的使用。

### 集群管理

我们可以通过"kubectl cluster-info"命令查看整个集群信息，比如 apiserver 暴露的地址、dns 的地址、metrics-server 的地址。

还可以通过"kubectl version"命令查看到 kubectl 以及 apiserver 的版本。毕竟 apiserver 的版本对整个集群至关重要，决定了各个 api 的版本、feature gate、准入控制等等，

而各个 kubelet 节点的版本，你可以通过"kubectl get node"命令查看。

你可以通过这些版本号了解到整个集群的版本信息，对集群的维护和升级很有帮助。

### 资源查询

通过 kubectl 命令来查询集群中的资源是我们日常使用频率最高的。

你可以通过 kubectl get 查询到某类资源对象，代码如下：

```java
kubectl get [资源]
```

假如我们想要查看集群中的所有节点，可以在代码的"资源"处输入"nodes"，如下所示：

```java
kubectl get nodes
```

这里的资源名，我们可以使用资源名称的单数，比如 node；也可以使用其复数，比如 nodes；还可以使用其缩写名。

对于集群中定义的资源信息，比如资源名、对应的缩写、是否是 namespace 级别的资源，你可以通过"kubectl api-resources"命令获取。

如果我们想要查询某个资源对象，我们同样可以通过"kubectl get"命令，只不过要在原先的资源名后面加上"/对象名"。如下所示：

```java
kubectl get [资源]/[对象名]
```

还是以 node 为例，我想查询 node01 节点，就可以通过"kubectl get node/node01"命令完成。当然，不使用"/"也是允许的，代码如下所示：

```java
kubectl get [资源] [对象名]
```

如果你想看到关于这个对象更详细的信息，你可以"kubectl describe"一下，即：

```java
kubectl describe [资源]/[对象名]
```

对于 namesppace 级别的资源，我们只需要在上述命令后面加上"-n \[命名空间\]"或"--namespace \[命名空间\]"就可以了。代码如下所示：

```java
kubectl get [资源]/[对象名] -n [命名空间]
```

比如：

```java
kubectl get pod pod-example -n demo
```

如果你没有指定 namespace 的话，默认是名为 default 的命名空间。

此外，如果你想要查看所有命名空间下的某类资源，可以在"资源"后面加上"--all-namespaces"。代码如下：

```java
kubectl get [资源] --all-namespaces
```

比如：

```java
kubectl get pod --all-namespaces
```

### 资源创建、更改、删除

你还可以通过 kubectl create 进行资源创建，代码如下：

```java
kubectl create -f demo.yaml
```

通过在 yaml 文件中定义各种资源及对象，我们通过这条命令将其在集群中创建出来。

当然，kubectl create 还提供了一些子命令，方便通过命令行直接创建资源对象。你可以通过"kubectl create -h"查看其支持的子命令。

假如我们想要在命名空间 demo 下创建一个名为 sa-demo 的 ServiceAccount 对象，我们可以通过如下命令进行：

```java
kubectl create sa sa-demo -n demo
```

通常来说，从零开始写一个 yaml 文件很难，一般我们都是找一些资源的 yaml 例子拿来自己修改下。我并不推荐自己一点点去写 yaml，效率低下，而且还会出现缩进的问题。

我推荐**通过 kubectl create 的这些命令来解决**。通过命令行参数，我们可以让 kubectl 帮我们自动生成一些 yaml 文件，比如你可以通过下面的命令拿到了一个 deployment 的 yaml 文件，然后就可以对这个文件进一步地修改以达到你的期望定义。

```java
kubectl create deploy my-deployment -n demo --image busybox --dry-run server -o yaml > my-deployment.yaml
```

这儿主要是用到了 dry-run 的能力。

你还可以通过 kubectl edit 直接修改这些资源：

```java
kubectl edit [资源]/[对象名] -n [命名空间]
```

如果是集群级别的资源对象，那么代码中就不用加"-n"了。

或者你也可以通过修改 yaml 文件，然后 apply 到集群中：

```java
kubectl apply -f demo.yaml
```

当然，这条命令还能被用来创建对象，如果对象已经存在就会对它进行更新。

对于资源对象的删除，可以直接通过 kubectl delete 进行：

```java
kubectl delete [资源]/[对象名] [-n [命名空间]]
```

比如：

```java
kubectl delete pod/pod-demo -n demo
```

如果你是通过 yaml 文件创建的某些资源对象，比如 flannel；yaml 文件中包含了很多对象，一个个删除太麻烦，也容易遗漏，你就可以通过如下命令删除：

```java
kubectl delete -f flannel.yaml
```

### 日志

如果 pod 内只有一个容器，你可以通过"kubectl logs \[pod 名\] -n \[命名空间\]"命令查看该容器的日志。

如果有多个容器，就需要在"pod 名"后插入"-c \[容器名\]"，如下所示：

```java
kubectl logs [pod 名] -c [容器名] -n [命名空间]
```

你还可以通过"-f"参数来实时查看容器最新的日志。更多参数，就需要你自己来探索了。

### 快速创建一个 Pod

我们可以通过如下命令快速创建一个 Pod，在我们做环境 debug 的时候非常方便：

```java
kubectl run [pod 名] -n [命名空间] --image [镜像] [.....]
```

比如：

```java
kubectl run pod1 -n debug-pod --image network-debug -- bash
```

其他参数，你可以通过 "kubectl run -h" 查看；也可以直接 exec 到容器里查看，代码如下：

```java
kubectl exec -it [pod 名] -n [命名空间] bash
```

同样，如果有多个容器的话，需要知道一个容器名：

```java
kubectl exec -it [pod 名] -c [容器名] -n [命名空间] bash
```

### 写在最后

kubectl 支持 JSONPath 模版，在[官方文档](https://kubernetes.io/zh/docs/reference/kubectl/jsonpath)中有详细的说明和例子，这里就不再重复了。

kubectl 能力非常强大，随着你不断地使用，你会发现更多 kubectl 中的小技巧，也会慢慢积累一些自己的使用技巧。以上我只是列举了一些常用的命令操作，你可以点击链接查看[官方的 kubectl 小抄](https://kubernetes.io/zh/docs/reference/kubectl/cheatsheet/)来学习。

本文中的例子，只使用到了部分参数，你可以通过 "-h"来查看其具体支持的各个参数。

如果你对本节课有什么想法或者疑问，欢迎在留言区留言，我们一起讨论。

