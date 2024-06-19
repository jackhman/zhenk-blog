# 加餐1：搭建基于K8和Docker的Jenkin可伸缩持续集成系统

根据前面用户的反馈，这里补充一个完整的动手实践的案例------搭建"基于 K8s 和 Docker 的 Jenkins 可伸缩持续集成系统"，让模块 3 所介绍的内容落地。

<br />

这部分内容比较多且非常具体，包括 4 大部分：

* Kubernetes （K8s）集群的部署，包括 kube-proxy、kubelet、docker 和 flanneld services 等安装；

* 企业级容器注册管理平台 Harbor 的安装部署，包括 Docker、Docker Compose 等安装；

* 采用 Jenkins pipeline 实现自动构建并部署至 K8s，包括建立 spring boot 示例工程、创建 Dockerfile 和 Jenkinsfile、配置 jenkins pipeline 任务和 K8s 的 kube.config 到最后测试 pipeline 任务等；

* 遇到的问题（坑）及解决方法，比如启动 Jenkins，安装插件出现"无法连接服务器"错误，运行 pipeline，出现 command not found 错误等几个问题的解决。

<br />

这些具体的操作步骤经过了真实环境上的检验，最终整个基于 K8s 、Docker、Jenkins 的 CI 系统被成功部署起来。建议你按照下面介绍的详细步骤，自己亲自动手操作一回，功力会大增。

工作流程图
=====


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/02/56/CgoCgV6VqwKAajirAAOot2kHSIM714.jpg"/> 
  

**系统配置**
========

Harbor 仓库 CentOS7、4 核 CPU、16G 内存、160G 硬盘

* 192.168.10.160 harbor

集群 3 台机器，CentOS7、4 核 CPU、16G 内存、60G 硬盘

* 192.168.10.161 k8s-master

* 192.168.10.162 k8s-node1

* 192.168.10.163 k8s-node2

**Kubernetes 集群部署**
===================

**安装前准备**
---------

（1）关闭 firewalld 改用 iptables。输入以下命令，关闭 firewalld：

<br />

```
[root@master ~]# systemctl stop firewalld.service #停止firewall 
[root@master ~]# systemctl disable firewalld.service #禁止firewall开机启动
```

<br />

（2）安装 ntp 服务：

<br />

```
[root@master ~]# yum install -y ntp wget net-tools 
[root@master ~]# systemctl start ntpd 
[root@master ~]# systemctl enable ntpd
```

**安装配置**
--------

**（1）安装 Kubernetes Master**

使用以下命令安装 kubernetes 和 etcd：

<br />

```
# yum install -y kubernetes etcd
```

<br />

编辑 /etc/etcd/etcd.conf 使 etcd 监听所有的 IP 地址，确保下列行没有注释，并修改为下面的值：

<br />

```
[root@master ~]# cat /etc/etcd/etcd.conf 
ETCD_LISTEN_CLIENT_URLS="http://0.0.0.0:2379" 
#[cluster] 
ETCD_ADVERTISE_CLIENT_URLS="http://192.168.10.161:2379"
```

<br />

编辑 Kubernetes API server 的配置文件 /etc/kubernetes/apiserver，确保下列行没有被注释，并设置合适的值：

<br />

```
[root@master ~]# cat /etc/kubernetes/apiserver
###
# kubernetes system config
#
# The following values are used to configure the kube-apiserver
#

# The address on the local server to listen to.
KUBE_API_ADDRESS="--address=0.0.0.0"

# The port on the local server to listen on.
KUBE_API_PORT="--port=8080"

# Port minions listen on
KUBELET_PORT="--kubelet_port=10250"

# Comma separated list of nodes in the etcd cluster
KUBE_ETCD_SERVERS="--etcd_servers=http://192.168.10.161:2379"

# Address range to use for services
KUBE_SERVICE_ADDRESSES="--service-cluster-ip-range=10.254.0.0/16"

# default admission control policies
KUBE_ADMISSION_CONTROL="--admission_control=NamespaceLifecycle,NamespaceExists,LimitRanger,SecurityContextDeny,ServiceAccount,ResourceQuota"

# Add your own!
KUBE_API_A
```

<br />

启动 etcd、kube-apiserver、kube-controller-manager and kube-scheduler 服务，并设置开机自启：

<br />

```
[root@master ~]# cat /script/kubenetes_service.sh

for SERVICES in etcd kube-apiserver kube-controller-manager kube-scheduler; do 
    systemctl restart $SERVICES
    systemctl enable $SERVICES
    systemctl status $SERVICES 
done
[root@master ~]# sh /script/kubenetes_service.sh
```

<br />

在 etcd 中定义 flannel network 的配置，这些配置会被 flannel service 下发到 nodes 中：

<br />

```
[root@master ~]# etcdctl mk /centos.com/network/config '{"Network":"172.17.0.0/16"}'
```

<br />

添加 iptables 规则，打开相应的端口：

<br />

```
[root@master ~]# iptables -I INPUT -p tcp --dport 2379 -j ACCEPT
[root@master ~]# iptables -I INPUT -p tcp --dport 10250 -j ACCEPT
[root@master ~]# iptables -I INPUT -p tcp --dport 8080 -j ACCEPT 
[root@master ~]# iptables-save
```

<br />

或者写入 iptables 配置文件 /etc/sysconfig/iptables。

<br />

查看节点信息（我们还没有配置节点信息，所以这里应该为空）：

<br />

```
[root@master ~]# kubectl get nodes

NAME LABELS STATUS
```

<br />

**（2）安装 Kubernetes Nodes**

注：下面这些步骤应该在 node1 和 node2 上执行（也可以添加更多的 node）。

<br />

使用 yum 安装 kubernetes 和 flannel：

<br />

```
[root@slave1 ~]# yum install -y flannel kubernetes
```

<br />

为 flannel service 配置 etcd 服务器，编辑 /etc/sysconfig/flanneld 文件中的下列行以连接到 master：

<br />

```
[root@slave1 ~]# cat /etc/sysconfig/flanneld

FLANNEL_ETCD="http://192.168.10.161:2379" #改为etcd服务器的ip
FLANNEL_ETCD_PREFIX="/centos.com/network"
```

<br />

编辑 /etc/kubernetes/config 中 kubernetes 的默认配置，以确保 KUBE_MASTER 的值连接到 Kubernetes master API server：

<br />

```
[root@slave1 ~]# cat /etc/kubernetes/config

KUBE_MASTER="--master=http://192.168.10.161:8080"
```

<br />

编辑 /etc/kubernetes/kubelet 中五个参数的值：

<br />

node1：

<br />

```
[root@slave1 ~]# cat /etc/kubernetes/kubelet

KUBELET_ADDRESS="--address=0.0.0.0"
KUBELET_PORT="--port=10250"
KUBELET_HOSTNAME="--hostname_override=192.168.10.162"
KUBELET_API_SERVER="--api_servers=http://192.168.10.161:8080"
KUBELET_ARGS=""
```

<br />

node2：

<br />

```
[root@slave2 ~]# cat /etc/kubernetes/kubelet

KUBELET_ADDRESS="--address=0.0.0.0"
KUBELET_PORT="--port=10250"
KUBELET_HOSTNAME="--hostname_override=192.168.10.163"
KUBELET_API_SERVER="--api_servers=http://192.168.10.161:8080"
KUBELET_ARGS=""
```

<br />

启动 kube-proxy、kubelet、docker 和 flanneld services 服务，并设置开机自启：

<br />

```
[root@slave1 ~]# cat /script/kubernetes_node_service.sh

for SERVICES in kube-proxy kubelet docker flanneld; do 
systemctl restart $SERVICES
systemctl enable $SERVICES
systemctl status $SERVICES 
done
```

<br />

在每个 node 节点上，你应当注意到有两块新的网卡 docker0 和 flannel0，应该得到不同的 IP 地址范围在 flannel0 上，就像下面这样：

<br />

node1：

<br />

```
[root@slave1 ~]# ip a | grep docker | grep inet
inet 172.17.0.1/16 scope global docker0
```

<br />

node2：

<br />

```
[root@slave2 ~]# ip a | grep docker | grep inet
inet 172.17.60.0/16 scope global docker0
```

<br />

添加 iptables 规则：

<br />

```
[root@slave1 ~]# iptables -I INPUT -p tcp --dport 2379 -j ACCEPT
[root@slave1 ~]# iptables -I INPUT -p tcp --dport 10250 -j ACCEPT
[root@slave1 ~]# iptables -I INPUT -p tcp --dport 8080 -j ACCEPT
```

<br />

现在登录 kubernetes master 节点验证 minions 的节点状态：

<br />

```
[root@master ~]# kubectl get nodes
NAME           STATUS    AGE
192.168.10.162   Ready     2h
192.168.10.163   Ready     2h
```

<br />

至此，Kubernetes 集群已经配置并运行了，然后我们继续下面的步骤。

**Harbor 安装部署**
===============

Harbor 是 VMWare 公司开源的企业级 Docker Registry 项目，项目地址是<https://github.com/goharbor/harbor>。

**下载离线安装包**
-----------

下载地址 <https://github.com/goharbor/harbor/releases>。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/88/9A/Cgq2xl6VqwOAQO5oAAFotppxiS8332.png"/> 


<br />

机器配置要求：

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/0F/84/Ciqah16VqwOAIEKcAABK8b1J5Pk588.png"/> 


<br />

将下载的安装包上传到服务器，运行以下命令解压：

<br />

```
tar zxvf harbor-offline-installer-v1.10.1.tgz
```

**安装 Docker**
-------------

```
# 安装依赖包
yum install -y yum-utils device-mapper-persistent-data lvm2
# 添加Docker软件包源
yum-config-manager \
    --add-repo \
    https://download.docker.com/linux/centos/docker-ce.repo
# 安装Docker CE
yum install -y docker-ce
# 启动Docker服务并设置开机启动
systemctl start docker
systemctl enable docker
```

**安装 docker-compose**
---------------------

Docker Compose 是 Docker 提供的一个命令行工具，用来定义和运行由多个容器组成的应用。使用 compose，我们可以通过 YAML 文件声明式的定义应用程序的各个服务，并由单个命令完成应用的创建和启动。

<br />

执行以下命令进行安装：

<br />

```
yum install epel-release 
yum install -y python-pip 
pip install docker-compose 
yum install git
```

**Harbor 安装与配置**
----------------

修改 harbor.yml：

* hostname 这里设置本机的 IP

* harbor_admin_password web 页面的密码

运行：

<br />

```
sh ./install.sh
```

<br />

访问页面 [http://192.168.10.160/](http://10.220.224.160/)：

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/02/56/CgoCgV6VqwOAJy7rAADUBv3omAM239.png"/> 


**Docker 主机访问 Harbor**
----------------------

在另外一个服务器（client）登录 Harbor：

<br />

```
# docker login 192.168.10.160
Username: admin
Password: 
Error response from daemon: Get https:// 192.168.10.160/v2/: dial tcp 192.168.10.160:443: connect: connection refused
```

<br />

这是因为 docker1.3.2 版本开始默认 docker registry 使用的是 https，我们设置 Harbor 默认为 http 方式，所以当执行用 docker login、pull、push 等命令操作而非 https 的 docker regsitry 的时就会报错。

**解决 https**

在 harbor 那台服务器上，其安装目录：

<br />

```
vi docker-compose.yml
```

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/88/9A/Cgq2xl6VqwSAb3T1AACLTw_peWM870.png"/> 


<br />

**修改 ports 信息**

<br />

然后我们执行：

<br />

```
docker-compose stop
./install.sh
```

<br />

然后同时编辑 harbor 和 client 的 docker 配置文件：

<br />

```
# 1.
vim /etc/docker/daemon.json
 
{
 "insecure-registries": ["192.168.10.160"]
}
 
# 2.添加ExecStart=/usr/bin/dockerd |--insecure-registry=192.168.10.160
vim /usr/lib/systemd/system/docker.service
 
# 把这行注释掉,添加下面的配置 ExecStart=/usr/bin/dockerd -H fd:// --containerd=/run/containerd/containerd.sock
ExecStart=/usr/bin/dockerd
  |--insecure-registry=192.168.10.160
```

<br />

1. 重启 docker

<br />

```
systemctl daemon-reload
systemctl restart docker
```

<br />

2.重启 harbor 的 docker-compose，命令如下：

<br />

```
docker-compose restart
```

**client 登录仓库**

```
# docker login 192.168.10.160
Username: admin
Password: 
Login Succeeded
```

**采用 jenkins pipeline 实现自动构建并部署至 K8s**
======================================

部署 jenkins
----------

这里采用 yum install 的方式部署 jenkins。

<br />

（1）安装JDK：

<br />

```
yum install -y java
```

<br />

（2）安装 jenkins

<br />

添加 Jenkins 库到 yum 库，Jenkins 将从这里下载安装。

<br />

```
wget -O /etc/yum.repos.d/jenkins.repo http://pkg.jenkins-ci.org/redhat/jenkins.repo
rpm --import https://jenkins-ci.org/redhat/jenkins-ci.org.key
yum install -y Jenkins
```

<br />

（3）配置 jenkis 的端口：

<br />

```
vi /etc/sysconfig/jenkins
```

<br />

找到修改端口号：

<br />

```
JENKINS_PORT="8085"  此端口不冲突可以不修改
```

<br />

（4）启动 jenkins：

<br />

```
service jenkins start/stop/restart
```

<br />

（5）访问 http://localhost:8085 地址，等待出现下面解锁 jenkins 界面：

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/88/9A/Cgq2xl6VqwSAQcWQAAIi7I6BGhU522.png"/> 


<br />

（6）在上图提示的密码文件中复制自动生成的密码。

（7）在解锁 jenkins 页面，粘贴密码并继续。

（8）解锁 jenkins 后，在界面中选择"安装建议的插件" 选项。

（9）最后，jenkins 要求创建管理员用户，创建新用户或使用 admin 用户，按照步骤完成后即可登录并使用 jenkis 了。

准备 java 示例工程
------------

下面新建 spring boot 示例工程，示例工程的代码地址为：<https://github.com/gemedia/docker-demo>。

### 创建 spring boot 示例工程

（1）生成 spring boot 基础工程，添加一个示例 Controller 类。

<br />

```
package com.docker.demo.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TestController {

    @GetMapping("")
    public String hello() {
        return "Hello!";
    }
```

<br />

（2）修改 application 配置文件，设置端口。

<br />

```
spring.application.name=docker-demo
server.port=40080
```

<br />

（3）编译运行，访问 [http://localhost:40080](https://links.jianshu.com/go?to=http%3A%2F%2Flocalhost%3A40080) 地址可以看到示例运行结果。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/02/56/CgoCgV6VqwSAJIY2AAAIQDo_SXo223.png"/> 


### 添加 Dockerfile

在工程根目录创建 Dockerfile，用来构建 docker 镜像，其中 ${JAR_FILE} 参数在 pipeline 执行 docker build 时，通过 build-arg 参数传入。

<br />

```
FROM openjdk:8-jdk-alpine

#构建参数
ARG JAR_FILE
ARG WORK_PATH="/opt/demo"
# 环境变量
ENV JAVA_OPTS="" \
    JAR_FILE=${JAR_FILE}

#设置时区
RUN apk update && apk add ca-certificates && \
    apk add tzdata && \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

COPY target/$JAR_FILE $WORK_PATH/

WORKDIR $WORK_PATH

ENTRYPOINT exec java $JAVA_OPTS -jar $JAR_
```

### 添加 K8s 的 Deployment 配置

在工程根目录创建 k8s-deployment.tpl 文件，此文件用来作为 K8s 的 yaml 文件模板。在 jenkens pipeline 执行时，会先将 tpl 文件中 {} 括起来的自定义参数用 sed 命令替换为实际的内容。

<br />

```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {APP_NAME}-deployment
  labels:
    app: {APP_NAME}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: {APP_NAME}
  template:
    metadata:
      labels:
        app: {APP_NAME}
    spec:
      containers:
      - name: {APP_NAME}
        image: {IMAGE_URL}:{IMAGE_TAG}
        ports:
        - containerPort: 40080
        env:
          - name: SPRING_PROFILES_ACTIVE
            value: {SPRING_PROFILE}
```

### 添加 Jenkinsfile

在工程根目录创建 Jenkinsfile，用来执行 jenkins pipeline 任务。Jenkinsfile 文件的大概内容描述如下。

<br />

environment 中变量说明：

* HARBOR_CREDS 为 harbor 镜像仓库的用户密码，数据保存为 jenkins 的"username and password"类型的凭据，用 credentials 方法从凭据中获取，使用时通过 HARBOR_CREDS_USR 获取用户名，HARBOR_CREDS_PSW 获取密码；

* K8S_CONFIG 为 K8s 中 kubectl 命令的 yaml 配置文件内容，数据保存为 jenkins 的"Secret Text"类型的凭据，用 credentials 方法从凭据中获取，这里保存的 yaml 配置文件内容以 base64 编码格式保存，在设置凭据时先要进行 base64 编码（此 base64 编码是非必须的，如果直接保存原文，下面 Jenkinsfile 中需要去掉 base64 -d 解码） ；

* GIT_TAG 变量通过执行 sh 命令获取当前 git 的 tag 值，由于后面构建 docker 镜像时使用 git 的 tag 作为镜像的标签，所以这个变量也不能为空。

<br />

parameters 中变量说明：

* **HARBOR_HOST**，harbor 镜像仓库地址；

* **DOCKER_IMAGE**，docker 镜像名，包含 harbor 项目名称；

* **APP_NAME**，K8s 中的标签名称，对应 K8s 的 yaml 模板中的 {APP_NAME}；

* **K8S_NAMESPACE**，K8s 中的 namespace 名称，执行 kubectl 命令会部署至此命名空间。

<br />

stages 说明：

* **Maven Build**，使用 docker 的方式执行 maven 命令，args 参数中将 .m2 目录映射出来，避免执行时重复从远端获取依赖；stash 步骤中将 jar 文件保存下来，供后面的 stage 使用；

* **Docker Build**，unstash 获取 jar 文件，通过 sh 依次执行 docker 命令登录 harbor、构建镜像、上传镜像、移除本地镜像，构建镜像时，会获取 jar 文件名传入 JAR_FILE 参数；

* **Deploy**，使用 docker 的方式执行 kubectl 命令，在执行前先将 K8S_CONFIG 中的内容进行 base64 解密并存为 \~/.kube/config 配置文件，然后执行 sed 命令将 k8s-deployment.tpl 文件中"{参数名}"形式参数替换为实际的参数值，最后执行 kubectl 命令部署至 K8s。

<br />

```
// 需要在jenkins的Credentials设置中配置jenkins-harbor-creds、jenkins-k8s-config参数
pipeline {
    agent any
    environment {
        HARBOR_CREDS = credentials('jenkins-harbor-creds')
        K8S_CONFIG = credentials('jenkins-k8s-config')
        GIT_TAG = sh(returnStdout: true,script: 'git describe --tags --always').trim()
    }
    parameters {
        string(name: 'HARBOR_HOST', defaultValue: '192.168.10.160', description: 'harbor仓库地址')
        string(name: 'DOCKER_IMAGE', defaultValue: 'tssp/pipeline-demo', description: 'docker镜像名')
        string(name: 'APP_NAME', defaultValue: 'pipeline-demo', description: 'k8s中标签名')
        string(name: 'K8S_NAMESPACE', defaultValue: 'demo', description: 'k8s的namespace名称')
    }
    stages {
        stage('Maven Build') {
            when { expression { env.GIT_TAG != null } }
            agent {
                docker {
                    image 'maven:3-jdk-8-alpine'
                    args '-v $HOME/.m2:/root/.m2'
                }
            }
            steps {
                sh 'mvn clean package -Dfile.encoding=UTF-8 -DskipTests=true'
                stash includes: 'target/*.jar', name: 'app'
            }

        }
        stage('Docker Build') {
            when { 
                allOf {
                    expression { env.GIT_TAG != null }
                }
            }
            agent any
            steps {
                unstash 'app'
                sh "docker login -u ${HARBOR_CREDS_USR} -p ${HARBOR_CREDS_PSW} ${params.HARBOR_HOST}"
                sh "docker build --build-arg JAR_FILE=`ls target/*.jar |cut -d '/' -f2` -t ${params.HARBOR_HOST}/${params.DOCKER_IMAGE}:${GIT_TAG} ."
                sh "docker push ${params.HARBOR_HOST}/${params.DOCKER_IMAGE}:${GIT_TAG}"
                sh "docker rmi ${params.HARBOR_HOST}/${params.DOCKER_IMAGE}:${GIT_TAG}"
            }
            
        }
        stage('Deploy') {
            when { 
                allOf {
                    expression { env.GIT_TAG != null }
                }
            }
            agent {
                docker {
                    image 'lwolf/helm-kubectl-docker'
                }
            }
            steps {
                sh "mkdir -p ~/.kube"
                sh "echo ${K8S_CONFIG} | base64 -d > ~/.kube/config"
                sh "sed -e 's#{IMAGE_URL}#${params.HARBOR_HOST}/${params.DOCKER_IMAGE}#g;s#{IMAGE_TAG}#${GIT_TAG}#g;s#{APP_NAME}#${params.APP_NAME}#g;s#{SPRING_PROFILE}#k8s-test#g' k8s-deployment.tpl > k8s-deployment.yml"
                sh "kubectl apply -f k8s-deployment.yml --namespace=${params.K8S_NAMESPACE}"
            }
            
        }
        
    }
}
```

**配置 jenkins pipeline 任务**
--------------------------

创建 jenkins pipeline 任务，并设置需要的参数。

### **新建 pipeline 任务**

单击"新建任务"按钮，输入名称并选择"流水线"（pipeline），然后单击"确定"按钮。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/88/9A/Cgq2xl6VqwWAZFSOAAHcXpy5dUQ145.png"/> 
  

### **配置 pipeline 任务**

进入任务的配置界面，在流水线（pipeline）设置部分，选择"Pipeline script from SCM"选项。SCM 选项选为"Git"，配置好工程的 git 地址以及获取代码的凭证信息；然后在"Additional Behaviours"中添加"Clean before checkout"。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/0F/84/Ciqah16VqwWAHp5dAAEiQclu3N0609.png"/> 


### **配置 harbor 账号与密码**

选择"凭据"，然后在下图所示位置单击"添加凭据"按钮。在新凭据设置界面，类型选择为"Username with password"，ID 设置为"jenkins-harbor-creds"（此处的 ID 必须与 Jenkinsfile 中的保持一致）。Username 与 Password 分别设置为 harbor 镜像私库的用户名和密码。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/02/56/CgoCgV6VqwWAPUy5AAGuJhe8aC0834.png"/> 


<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/88/9A/Cgq2xl6VqwaAOCwNAADQwtyky3E891.png"/> 


### **配置 K8s 的 kube.config** **信息**

在 K8s 中使用 kubectl 命令时需要 yaml 格式的服务器以及授权信息配置文件，这里将 kubectl 的 yaml 配置文件的内容以 base64 编码后保存在 jenkins 的凭据中。pipeline 任务执行时，先从 jenkins 凭据中获取内容，进行 base64 解码后将配置保存为 \~/.kube/config 文件。kubectl 的配置文件的内容如下：

<br />

```
apiVersion: v1
kind: Config
clusters:
- name: "test"
  cluster:
    server: "https://xxxxx"
    api-version: v1
    certificate-authority-data: "xxxxxx"

users:
- name: "user1"
  user:
    token: "xxxx"

contexts:
- name: "test"
  context:
    user: "user1"
    cluster: "test"

current-context: "tes
```

<br />

可以在 Linux 中采用下面命令将 kubectl 的 yaml 配置文件进行 base64 编码。

<br />

```
base64 kube-config.yml > kube-config.txt
```

<br />

然后类似上一步，在 jenkins 凭据中增加配置文件内容。在凭据设置界面，类型选择为"Secret text"，ID 设置为"jenkins-k8s-config"（此处的 ID 必须与 Jenkinsfile 中的保持一致），Secret 设置为上面经过 base64 编码后的配置文件内容。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/0F/84/Ciqah16VqwaAagi2AADuteUwitQ741.png"/> 


**测试 pipeline 任务**
------------------

在创建的 pipeline 任务中，单击"Build With Parameters"按钮，即可立即执行 pipeline 任务。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/02/56/CgoCgV6VqweAUtIeAAGPNqdcCX8865.png"/> 


<br />

在当前界面中查看任务的执行结果，可以看到每个阶段的运行状态。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/88/9A/Cgq2xl6VqweAQ7a8AAIM89lGIAQ017.png"/> 


<br />

执行成功后，查看 harbor 镜像仓库，docker 镜像成功上传至 harbor。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/0F/84/Ciqah16VqweADadcAAEwylSrC84442.png"/> 


<br />

在 Linux 服务器查看 deployment，运行以下命令：

<br />

```
kubectl get deployment
```

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/02/56/CgoCgV6VqwiATbn1AABaEnvkQGA790.png"/> 


<br />

查看 pod：

<br />

```
kubectl get pod
```

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/88/9A/Cgq2xl6VqwiAfRQ1AAB6C4ZT3sw648.png"/> 


**遇到的问题及解决方法**
==============

（1）启动 Jenkins，安装插件出现"无法连接服务器"错误

<br />

安装插件那个页面，就是提示你 offline 的那个页面，不要动，然后打开一个新的 tab，输入网址 http://localhost:port/pluginManager/advanced。

<br />

这里面最底下有个"Update Site"，把其中的链接改成http://mirror.esuni.jp/jenkins/updates/update-center.json。

<br />

单击 submit 按钮：

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/0F/84/Ciqah16VqwmAYg73AADiqrgm5wY712.png"/> 


<br />

然后重新启动 jenkins，这样就能正常安装插件。

<br />

（2）运行 pipeline，出现 command not found 错误

<br />

yum 安装的 Jenkins 配置文件默认位置 /etc/sysconfig/jenkins，默认 jenkins 服务以 jenkins 用户运行，这时在 jenkins 执行 ant 脚本时可能会发生没有权限删除目录、覆盖文件等情况。可以让 jenkins 以 root 用户运行来解决这个问题。

<br />

a.将 jenkins 账号分别加入到 root 组中：

<br />

```
gpasswd -a jenkins root
```

<br />

b.修改 /etc/sysconfig/jenkins 文件：

<br />

```
#user id to be invoked as (otherwise will run as root; not wise!)
JENKINS_USER=root
JENKINS_GROUP=root
```

<br />

可以修改为 root 权限运行，重启 jenkins 服务。

<br />

（3）在 docker build 阶段出现 exec: "docker-proxy": executable file not found in $PATH 错误，解决方法是，需要启动 docker-proxy：

<br />

```
cd /usr/libexec/docker/
 ln -s docker-proxy-current docker-proxy
```

<br />

（4）出现 Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running? 错误，运行如下命令：

<br />

```
systemctl daemon-reload
service docker restart
```

<br />

（5）出现 shim error: docker-runc not installed on system. 错误，经过一番排查，如下解决方案有用：

<br />

```
cd /usr/libexec/docker/
 ln -s docker-runc-current docker-runc
```


