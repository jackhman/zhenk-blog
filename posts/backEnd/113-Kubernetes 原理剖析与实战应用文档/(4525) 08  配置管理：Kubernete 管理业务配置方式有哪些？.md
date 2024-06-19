# 08配置管理：Kubernete管理业务配置方式有哪些？

通过前面几节课的学习，我们已经对 Kubernetes 中的 Pod 以及一些业务负载有所了解。你可以根据课程中提供的示例，自己动手尝试在集群中实践起来。

在使用过程中，我们常常需要对 Pod 进行一些配置管理，比如参数配置文件怎么使用，敏感数据怎么保存传递，等等。有些人可能会觉得，为什么不把这些配置（不限于参数、配置文件、密钥等）打包到镜像中去啊？乍一听，好像有点可行，但是这种做法"硬伤"太多。

* 有些不变的配置是可以打包到镜像中的，那可变的配置呢？

* 信息泄漏，很容易引发安全风险，尤其是一些敏感信息，比如密码、密钥等。

* 每次配置更新后，都要重新打包一次，升级应用。镜像版本过多，也给镜像管理和镜像中心存储带来很大的负担。

* 定制化太严重，可扩展能力差，且不容易复用。

所以这里的一个最佳实践就是将配置信息和容器镜像进行解耦，以"不变应万变"。在 Kubernetes 中，一般有 ConfigMap 和 Secret 两种对象，可以用来做配置管理。

### ConfigMap

首先我们来讲一下 ConfigMap 这个对象，它主要用来保存一些非敏感数据，可以用作环境变量、命令行参数或者挂载到存储卷中。


<Image alt="image (2).png" src="https://s0.lgstatic.com/i/image/M00/4F/8C/Ciqc1F9gkFGAAFxaAAB80T5b-WU361.png"/> 
  

（<https://matthewpalmer.net/kubernetes-app-developer/articles/configmap-diagram.gif>）

ConfigMap 通过键值对来存储信息，是个 namespace 级别的资源。在 kubectl 使用时，我们可以简写成 cm。

我们来看一下两个 ConfigMap 的 API 定义：

```shell
$ cat cm-demo-mix.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm-demo-mix # 对象名字
  namespace: demo # 所在的命名空间
data: # 这是跟其他对象不太一样的地方，其他对象这里都是spec
  # 每一个键都映射到一个简单的值
  player_initial_lives: "3" # 注意这里的值如果数字的话，必须用字符串来表示
  ui_properties_file_name: "user-interface.properties"
  # 也可以来保存多行的文本
  game.properties: |
    enemy.types=aliens,monsters
    player.maximum-lives=5
  user-interface.properties: |
    color.good=purple
    color.bad=yellow
    allow.textmode=true
$ cat cm-demo-all-env.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cm-demo-all-env
  namespace: demo
data:
  SPECIAL_LEVEL: very
  SPECIAL_TYPE: charm
```

可见，我们通过 ConfigMap 既可以存储简单的键值对，也能存储多行的文本。

现在我们来创建这两个 ConfigMap：

```shell
$ kubectl create -f cm-demo-mix.yaml
configmap/cm-demo-mix created
$ kubectl create -f cm-demo-all-env.yaml
configmap/cm-demo-all-env created
```

创建 ConfigMap，你也可以通过`kubectl create cm`基于[目录](https://kubernetes.io/zh/docs/tasks/configure-pod-container/configure-pod-configmap/#create-configmaps-from-directories)、[文件](https://kubernetes.io/zh/docs/tasks/configure-pod-container/configure-pod-configmap/#create-configmaps-from-files)或者[字面值](https://kubernetes.io/zh/docs/tasks/configure-pod-container/configure-pod-configmap/#create-configmaps-from-literal-values)来创建，详细可参考这个[官方文档](https://kubernetes.io/zh/docs/tasks/configure-pod-container/configure-pod-configmap/#%E4%BD%BF%E7%94%A8-kubectl-create-configmap-%E5%88%9B%E5%BB%BA-configmap)。

创建成功后，我们可以通过如下方式来查看创建出来的对象。

```shell
$ kubectl get cm -n demo
NAME              DATA   AGE
cm-demo-all-env   2      30s
cm-demo-mix       4      2s
$ kubectl describe cm cm-demo-all-env -n demo
Name:         cm-demo-all-env
Namespace:    demo
Labels:       <none>
Annotations:  <none>

Data
====
SPECIAL_LEVEL:
----
very
SPECIAL_TYPE:
----
charm
Events:  <none>
$ kubectl describe cm cm-demo-mix -n demo
Name:         cm-demo-mix
Namespace:    demo
Labels:       <none>
Annotations:  <none>

Data
====
user-interface.properties:
----
color.good=purple
color.bad=yellow
allow.textmode=true

game.properties:
----
enemy.types=aliens,monsters
player.maximum-lives=5

player_initial_lives:
----
3
ui_properties_file_name:
----
user-interface.properties
Events:  <none>
```

下面我们看看怎么和 Pod 结合起来使用。在使用的时候，有几个地方需要特别注意：

* **Pod 必须和 ConfigMap 在同一个 namespace 下面；**

* **在创建 Pod 之前，请务必保证 ConfigMap 已经存在，否则 Pod 创建会报错。**

```shell
$ cat cm-demo-pod.yaml
apiVersion: v1
kind: Pod
metadata:
  name: cm-demo-pod
  namespace: demo
spec:
  containers:
    - name: demo
      image: busybox:1.28
      command:
        - "bin/sh"
        - "-c"
        - "echo PLAYER_INITIAL_LIVES=$PLAYER_INITIAL_LIVES && sleep 10000"
      env:
        # 定义环境变量
        - name: PLAYER_INITIAL_LIVES # 请注意这里和 ConfigMap 中的键名是不一样的
          valueFrom:
            configMapKeyRef:
              name: cm-demo-mix         # 这个值来自 ConfigMap
              key: player_initial_lives # 需要取值的键
        - name: UI_PROPERTIES_FILE_NAME
          valueFrom:
            configMapKeyRef:
              name: cm-demo-mix
              key: ui_properties_file_name
      envFrom:  # 可以将 configmap 中的所有键值对都通过环境变量注入容器中
        - configMapRef:
            name: cm-demo-all-env
      volumeMounts:
      - name: full-config # 这里是下面定义的 volume 名字
        mountPath: "/config" # 挂载的目标路径
        readOnly: true
      - name: part-config
        mountPath: /etc/game/
        readOnly: true
  volumes: # 您可以在 Pod 级别设置卷，然后将其挂载到 Pod 内的容器中
    - name: full-config # 这是 volume 的名字
      configMap:
        name: cm-demo-mix # 提供你想要挂载的 ConfigMap 的名字
    - name: part-config
      configMap:
        name: cm-demo-mix
        items: # 我们也可以只挂载部分的配置
        - key: game.properties
          path: properties
```

在上面的这个例子中，几乎囊括了 ConfigMap 的几大使用场景：

* 命令行参数；

* 环境变量，可以只注入部分变量，也可以全部注入；

* 挂载文件，可以是单个文件，也可以是所有键值对，用每个键值作为文件名。

我们接着来创建：

```shell
$ kubectl create -f cm-demo-pod.yaml
pod/cm-demo-pod created
```

创建成功后，我们 exec 到容器中看看：

```shell
$ kubectl exec -it cm-demo-pod -n demo sh
kubectl exec [POD] [COMMAND] is DEPRECATED and will be removed in a future version. Use kubectl kubectl exec [POD] -- [COMMAND] instead.
/ # env
KUBERNETES_SERVICE_PORT=443
KUBERNETES_PORT=tcp://10.96.0.1:443
UI_PROPERTIES_FILE_NAME=user-interface.properties
HOSTNAME=cm-demo-pod
SHLVL=1
HOME=/root
SPECIAL_LEVEL=very
TERM=xterm
KUBERNETES_PORT_443_TCP_ADDR=10.96.0.1
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
KUBERNETES_PORT_443_TCP_PORT=443
KUBERNETES_PORT_443_TCP_PROTO=tcp
KUBERNETES_SERVICE_PORT_HTTPS=443
KUBERNETES_PORT_443_TCP=tcp://10.96.0.1:443
PLAYER_INITIAL_LIVES=3
KUBERNETES_SERVICE_HOST=10.96.0.1
PWD=/
SPECIAL_TYPE=charm
/ # ls /config/
game.properties            ui_properties_file_name
player_initial_lives       user-interface.properties
/ # ls -alh /config/
total 12
drwxrwxrwx    3 root     root        4.0K Aug 27 09:54 .
drwxr-xr-x    1 root     root        4.0K Aug 27 09:54 ..
drwxr-xr-x    2 root     root        4.0K Aug 27 09:54 ..2020_08_27_09_54_31.007551221
lrwxrwxrwx    1 root     root          31 Aug 27 09:54 ..data -> ..2020_08_27_09_54_31.007551221
lrwxrwxrwx    1 root     root          22 Aug 27 09:54 game.properties -> ..data/game.properties
lrwxrwxrwx    1 root     root          27 Aug 27 09:54 player_initial_lives -> ..data/player_initial_lives
lrwxrwxrwx    1 root     root          30 Aug 27 09:54 ui_properties_file_name -> ..data/ui_properties_file_name
lrwxrwxrwx    1 root     root          32 Aug 27 09:54 user-interface.properties -> ..data/user-interface.properties
/ # cat /config/game.properties
enemy.types=aliens,monsters
player.maximum-lives=5
/ # cat /etc/game/properties
enemy.types=aliens,monsters
player.maximum-lives=5
```

可以看到，环境变量都已经正确注入，对应的文件和目录也都挂载进来了。  

在上面`ls -alh /config/`后，我们看到挂载的文件中存在软链接，都指向了`..data`目录下的文件。这样做的好处，是 kubelet 会定期同步检查已经挂载的 ConfigMap 是否是最新的，如果更新了，就是创建一个新的文件夹存放最新的内容，并同步修改`..data`指向的软链接。

一般我们只把一些非敏感的数据保存到 ConfigMap 中，敏感的数据就要保存到 Secret 中了。

### Secret

我们可以用 Secret 来保存一些敏感的数据信息，比如密码、密钥、token 等。在使用的时候， 跟 ConfigMap 的用法基本保持一致，都可以用来作为环境变量或者文件挂载。

Kubernetes 自身也有一些内置的 Secret，主要用来保存访问 APIServer 的 service account token，我们放到后面权限部分一起讲解，在此先略过。

除此之外，还可以用来保存私有镜像中心的身份信息，这样 kubelet 可以拉取到镜像。
> 注： 如果你使用的是 Docker，也可以提前在目标机器上运行`docker login yourprivateregistry.com`来保存你的有效登录信息。Docker 一般会将私有仓库的密钥保存在`$HOME/.docker/config.json`文件中，将该文件分发到所有节点即可。

我们看看如何通过 kubectl 来创建 secret，通过命令行 help 可以看到 kubectl 能够创建多种类型的 Secret。

```shell
$ kubectl create secret  -h
 Create a secret using specified subcommand.
Available Commands:
   docker-registry Create a secret for use with a Docker registry
   generic         Create a secret from a local file, directory or literal value
   tls             Create a TLS secret
Usage:
   kubectl create secret [flags] [options]
Use "kubectl  --help" for more information about a given command.
 Use "kubectl options" for a list of global command-line options (applies to all commands).
```

我们先来创建一个 Secret 来保存访问私有容器仓库的身份信息：

```shell
$ kubectl create secret -n demo docker-registry regcred \
   --docker-server=yourprivateregistry.com \
   --docker-username=allen \
   --docker-password=mypassw0rd \
--docker-email=allen@example.com
 secret/regcred created
 $ kubectl get secret -n demo regcred
 NAME      TYPE                             DATA   AGE
 regcred   kubernetes.io/dockerconfigjson   1      28s
```

这里我们可以看到，创建出来的 Secret 类型是`kubernetes.io/dockerconfigjson`：

```shell
$ kubectl describe secret -n demo regcred
Name:         regcred
Namespace:    demo
Labels:       <none>
Annotations:  <none>
Type:  kubernetes.io/dockerconfigjson
Data
====
.dockerconfigjson:  144 bytes
```

为了防止 Secret 中的内容被泄漏，`kubectl get`和`kubectl describe`会避免直接显示密码的内容。但是我们可以通过拿到完整的 Secret 对象来进一步查看其数据：

```shell
$ kubectl get secret -n demo regcred -o yaml
apiVersion: v1
data: # 跟 configmap 一样，这块用于保存数据信息
  .dockerconfigjson: eyJhdXRocyI6eyJ5b3VycHJpdmF0ZXJlZ2lzdHJ5LmNvbSI6eyJ1c2VybmFtZSI6ImFsbGVuIiwicGFzc3dvcmQiOiJteXBhc3N3MHJkIiwiZW1haWwiOiJhbGxlbkBleGFtcGxlLmNvbSIsImF1dGgiOiJZV3hzWlc0NmJYbHdZWE56ZHpCeVpBPT0ifX19
kind: Secret
metadata:
  creationTimestamp: "2020-08-27T12:18:35Z"
  managedFields:
  - apiVersion: v1
    fieldsType: FieldsV1
    fieldsV1:
      f:data:
        .: {}
        f:.dockerconfigjson: {}
      f:type: {}
    manager: kubectl
    operation: Update
    time: "2020-08-27T12:18:35Z"
  name: regcred
  namespace: demo
  resourceVersion: "1419452"
  selfLink: /api/v1/namespaces/demo/secrets/regcred
  uid: 6d34123e-4d79-406b-9556-409cfb4db2e7
type: kubernetes.io/dockerconfigjson
```

这里我们发现`.dockerconfigjson`是一段乱码，我们用 base64 解压试试看：

```shell
$ kubectl get secret regcred -n demo --output="jsonpath={.data.\.dockerconfigjson}" | base64 --decode
{"auths":{"yourprivateregistry.com":{"username":"allen","password":"mypassw0rd","email":"allen@example.com","auth":"YWxsZW46bXlwYXNzdzByZA=="}}}
```

这实际上跟我们通过 docker login 后的`~/.docker/config.json`中的内容一样。  

至此，我们发现 Secret 和 ConfigMap 在数据保存上的最大不同。**Secret 保存的数据都是通过 base64 加密后的数据**。

我们平时使用较为广泛的还有另外一种`Opaque`类型的 Secret：

```shell
$ cat secret-demo.yaml
apiVersion: v1
kind: Secret
metadata:
  name: dev-db-secret
  namespace: demo
type: Opaque
data: # 这里的值都是 base64 加密后的
  password: UyFCXCpkJHpEc2I9
  username: ZGV2dXNlcg==
```

或者我们也可以通过如下等价的 kubectl 命令来创建出来：

```shell
$ kubectl create secret generic dev-db-secret -n demo \
  --from-literal=username=devuser \
  --from-literal=password='S!B\*d$zDsb='
```

或通过文件来创建对象，比如：

```shell
$ echo -n 'username=devuser' > ./db_secret.txt
$ echo -n 'password=S!B\*d$zDsb=' >> ./db_secret.txt
$ kubectl create secret generic dev-db-secret -n demo \
  --from-file=./db_secret.txt
```

有时候为了方便，你也可以使用`stringData`，这样可以避免自己事先手动用 base64 进行加密。

```shell
$ cat secret-demo-stringdata.yaml
apiVersion: v1
kind: Secret
metadata:
  name: dev-db-secret
  namespace: demo
type: Opaque
stringData:
  password: devuser
  username: S!B\*d$zDsb=
```

下面我们在 Pod 中使用 Secret：

```shell
$ cat pod-secret.yaml
apiVersion: v1
kind: Pod
metadata:
  name: secret-test-pod
  namespace: demo
spec:
  containers:
    - name: demo-container
      image: busybox:1.28
      command: [ "/bin/sh", "-c", "env" ]
      envFrom:
      - secretRef:
          name: dev-db-secret
  restartPolicy: Never
$ kubectl create -f pod-secret.yaml
pod/secret-test-pod created
```

创建成功后，我们来查看下：

```shell
$ kubectl get pod -n demo secret-test-pod
NAME              READY   STATUS      RESTARTS   AGE
secret-test-pod   0/1     Completed   0          14s
$ kubectl logs -f -n demo secret-test-pod
KUBERNETES_SERVICE_PORT=443
KUBERNETES_PORT=tcp://10.96.0.1:443
HOSTNAME=secret-test-pod
SHLVL=1
username=devuser
HOME=/root
KUBERNETES_PORT_443_TCP_ADDR=10.96.0.1
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
KUBERNETES_PORT_443_TCP_PORT=443
password=S!B\*d$zDsb=
KUBERNETES_PORT_443_TCP_PROTO=tcp
KUBERNETES_SERVICE_PORT_HTTPS=443
KUBERNETES_PORT_443_TCP=tcp://10.96.0.1:443
KUBERNETES_SERVICE_HOST=10.96.0.1
PWD=/
```

我们可以在日志中看到命令`env`的输出，看到环境变量`username`和`password`已经正确注入。类似地，我们也可以将 Secret 作为 Volume 挂载到 Pod 内，你
~~大家~~可以课后实践一下。

### 写在最后

ConfigMap 和 Secret 是 Kubernetes 常用的保存配置数据的对象，你可以根据需要选择合适的对象存储数据。通过 Volume 方式挂载到 Pod 内的，kubelet 都会定期进行更新。但是通过环境变量注入到容器中，这样无法感知到 ConfigMap 或 Secret 的内容更新。

目前如何让 Pod 内的业务感知到 ConfigMap 或 Secret 的变化，还是一个待解决的问题。但是我们还是有一些 Workaround 的。

* 如果业务自身支持 reload 配置的话，比如`nginx -s reload`，可以通过 inotify 感知到文件更新，或者直接定期进行 reload（这里可以配合我们的 readinessProbe 一起使用）。

* 如果我们的业务没有这个能力，考虑到不可变基础设施的思想，我们是不是可以采用滚动升级的方式进行？没错，这是一个非常好的方法。目前有个开源工具[Reloader](https://github.com/stakater/Reloader)，它就是采用这种方式，通过 watch ConfigMap 和 Secret，一旦发现对象更新，就自动触发对 Deployment 或 StatefulSet 等工作负载对象进行滚动升级。具体使用方法，可以参考项目的文档说明。

对于这个问题，社区其实也一直在讨论比较好的解法，我们可以拭目以待。

好的，如果你对本节课有什么想法或者疑问，欢迎你在留言区留言，我们一起讨论。

