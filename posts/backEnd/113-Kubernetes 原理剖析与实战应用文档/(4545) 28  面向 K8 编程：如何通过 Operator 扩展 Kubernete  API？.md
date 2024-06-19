# 28面向K8编程：如何通过Operator扩展KuberneteAPI？

你好，我是正范。在上一讲，我们学习了如何通过一个 YAML 文件来定义一个 CRD，即扩展 API。这种扩展 API 跟 Kubernetes 内置的其他 API 同等地位，都可以通过 kubectl 或者 REST 接口访问，在使用过程中不会有任何差异。

但只是定义一个 CRD 并没有什么作用。虽说 kube-apiserver 会将其数据存放到 etcd 中，并暴露出相应的 REST 接口，然而并不涉及该对象的核心处理逻辑。

如何对这些 CRD 定义的对象进行一些逻辑处理，需要由用户自己来定义和实现，也就是通过控制器来实现。对此，我们有个专门的名字：Operator。

### 什么是 Kubernetes Operator

你可能对 Operator 这个名字比较陌生。这个名字最早由 [CoreOS](https://coreos.com/operators/) 在 2016 年提出来，我们来看看他们给出的定义：
> An operator is a method of packaging, deploying and managing a Kubernetes application. A Kubernetes application is an application that is both deployed on Kubernetes and managed using the Kubernetes APIs and kubectl tooling.
>
> To be able to make the most of Kubernetes, you need a set of cohensive APIs to extend in order to service and manage your applications that run on Kubernetes. You can think of Operators as the runtime that manages this type of application on Kubernetes.

总结一下，所谓的 Kubernetes Operator 其实就是借助 Kubernetes 的控制器模式，配合一些自定义的 API，完成对某一类应用的操作，比如资源创建、资源删除。

这里对 Kubernetes 的控制器模式做个简要说明。**Kubernetes 通过声明式 API 来定义对象，各个控制器负责实时查看对应对象的状态，确保达到定义的期望状态**。这就是 Kubernetes 的控制器模式。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image/M00/74/A3/Ciqc1F_HAmyACHLHAAHSt7ZcZoY464.png"/> 


kube-controller-manager 就是由这样一组控制器组成的。我们以 StatefulSet 为例来简单说明下控制器的具体逻辑。

假设你声明了一个 StatefulSet，并将其副本数设置为 2。kube-controller-manager 中以 goroutine 方式运行的 StatefulSet 控制器在观察 kube-apiserver 的时候，发现了这个新创建的对象，它会先创建一个 index 为 0 的 Pod ，并实时观察这个 Pod 的状态，待其状态变为 Running 后，再创建 index 为 1 的 Pod。后续该控制器会一直观察并维护这些 Pod 的状态，保证 StatefulSet 的有效副本数始终为 2。

所以我们在声明完成 CRD 之后，也需要创建一个控制器，即 Operator，来完成对应的控制逻辑。

了解了 Operator 的概念和控制器模式后，我们来看看 Operator 是如何工作的。

### Kubernetes Operator 是如何工作的

Operator 工作的时候采用上述的控制器模式，会持续地观察 Kubernetes 中的自定义对象，即 CR（Custom Resource）。我们通过 CRD 来定义一个对象，CR 则是 CRD 实例化的对象。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image/M00/74/A3/Ciqc1F_HAnWAZUN3AAGfGj4K8Gw651.png"/> 


Operator 会持续跟踪这些 CR 的变化事件，比如 ADD、UPDATE、DELETE，然后采取一系列操作，使其达到期望的状态。

那么具体的代码层面，整个逻辑又如何实现呢？

下面就是 Operator 代码层面的工作流程图：


<Image alt="image.png" src="https://s0.lgstatic.com/i/image/M00/74/ED/CgqCHl_HLoWAHjvEAAPol71Pgh8456.png"/> 


如上图所示，上半部分是一个 Informer，它的机制就是不断地 list/watch kube-apiserver 中特定的资源，比如你只关心 Pod，那么就只 list/watch Pod。Informer 主要有两个方法：一个是 ListFunc，一个是 WatchFunc。

* ListFunc 可以把某类资源的所有资源都列出来，当然你可以指定某个命名空间。

* WatchFunc 则会和 apiserver 建立一个长链接，一旦有一个对象更新或者新对象创建，apiserver 就会反向推送回来，告诉 Informer 有一个新的对象创建或者更新等操作。

当 Informer 接收到了这些操作，就会调用对应的函数（比如 AddFunc、UpdateFunc 和 DeleteFunc），并将其按照 key 值的格式放到一个先入先出的队列中。

key 值的命名规则就是 "namespace/name"，name 是对应的资源的名字，比如在 default 的 namespace 中创建一个 foo 类型的资源 example-foo，那么它的 key 值就是 "default/example-foo"。

我们一般会给 Operator 设置多个 Worker，并行地从上面的队列中拿到对象去操作处理。工作完成之后，就把这个 key 丢掉，表示已经处理完成。但如果处理过程中有错误，则可以把这个 key 重新放回到队列中，后续再重新处理。

看得出来，上述的流程其实还是有些复杂的，尤其是对初学者有一定的门槛。幸好社区提供了一些脚手架，方便我们快速地构建自己的 Operator。

### 构建一个自己的 Kubernetes Operator

目前社区有一些可以用于创建 Kubernetes Operator 的开源项目，例如：[Operator SDK](https://github.com/operator-framework/operator-sdk)、[Kubebuilder](https://github.com/kubernetes-sigs/kubebuilder)、[KUDO](https://github.com/kudobuilder/kudo)。

有了这些脚手架，我们就可以快速创建出 Operator 的框架。这里我以 kubebuilder 为例。

我们可以先通过如下命令安装 kustomize：

    curl -s "https://raw.githubusercontent.com/kubernetes-sigs/kustomize/master/hack/install_kustomize.sh" | bash
    mv kustomize /usr/local/bin/

再安装 kubebuilder。你可以选择通过源码安装：

```shell
git clone https://github.com/kubernetes-sigs/kubebuilder
cd kubebuilder
git checkout v2.3.1
make build
cp bin/kubebuilder $GOPATH/bin
```

如果你本地有些代码拉不下来，可以用 proxy：

```shell
export GOPROXY=https://goproxy.cn
```

也可以直接下载二进制文件：

```shell
os=$(go env GOOS)
arch=$(go env GOARCH)
# download kubebuilder and extract it to tmp
curl -sL https://go.kubebuilder.io/dl/2.3.1/${os}/${arch} | tar -xz -C /tmp/
sudo mv /tmp/kubebuilder_2.3.1_${os}_${arch} /usr/local/bin/kubebuilder
```

安装好以后，我们就可以通过 kubebuilder 来创建 Operator 了：

```shell
cd $GOPATH/src
mkdir -p github.com/zhangsan/operator-demo
cd github.com/zhangsan/operator-demo
kubebuilder init --domain abc.com --license apache2 --owner "zhangsan"
kubebuilder create api --group foo --version v1 --kind Bar
```

通过上面 kubebuilder 的命令，我们会在当前目录创建一个 Operator 的框架，并声明了一个 Bar 类型的 API。

你通过 make manifests 即可生成所需要的 yaml 文件，包括 CRD、RBAC等。

通过如下的命令即可安装 CRD、RBAC等对象：

```shell
make install # 安装CRD
```

然后我们就可以看到创建的CRD了：

```shell
# kubectl get crd
NAME               AGE
bars.foo.abc.com   2m
```

再来创建一个 Bar 类型的对象：

```shell
# kubectl apply -f config/samples/
# kubectl get bar 
NAME         AGE
bar-sample   25s
```

在本地开发阶段，我们可以通过 make run 命令，在本地运行。运行起来以后，你可以从输出日志中看到我们刚创建的 default 命名空间下的 bar-sample，即 key 为 "default/bar-sample"。

我们在开发的时候，只需要修改 "api/v1/bar_types.go"和"controllers/bar_controller.go"这两个文件即可。这两个文件中有注释，会告诉你新增的对象定义和具体逻辑写哪里。这里你也可以参考 kubebuilder 的文档。

你开发完成之后，就可以构建一个镜像出来，方便部署：

```shell
make docker-build docker-push IMG=zhangsan/operator-demo
make deploy
```

### 写在最后

到这里，你就完成了对扩展 Kubernetes API 的学习。这一讲的难点不在于 Operator 本身，而是要学会理解它的行为。

如果你对本节课有什么想法或者疑问，欢迎你在留言区留言，我们一起讨论。

