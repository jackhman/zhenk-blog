# 26案例：如何通过ServiceMeh实现熔断和限流？

在前面的课时中，我们分别学习了熔断、限流在服务高可用架构中的重要性和具体使用方式。但是，在具体使用过程中，我们会发现实现熔断和限流的代码和实现业务逻辑的代码耦合在一起，对系统的可维护性产生了不良的影响。

而 Service Mesh 作为下一代的微服务架构，它将服务间的通信从基础设施中抽离出来，还可以替这些业务服务完成熔断和限流等功能，而且完全对业务代码透明，这妥妥地提高了开发效率，因为普通开发者能够更加专注于业务开发。

下面我们就来看一下如何通过Service Mesh 实现熔断和限流。

在前面的第14课时中，我们已经学习了 Service Mesh中Istio 的基础知识，以及如何使用它来进行服务注册和发现，没有学习和稍有遗忘的同学们可以回过去阅读或温习一下。下面我们就直接讲解 Istio 实现熔断和限流的优势、实现案例和相关原理。

### Service Mesh 基本原理和优缺点

本课时我们关注的是Istio 数据平面的高性能智能网络代理，它是基于 Envoy 改进的 Istio-Proxy，控制和协调了被代理服务的所有网络通信，同时也负责收集和上报相关的监控数据。也就是说，代理服务跟外界的所有网络请求都会经过该网络代理，所以网络代理可以代替代理服务实现熔断和限流等功能。


<Image alt="Istio_service_mesh.png" src="https://s0.lgstatic.com/i/image/M00/55/EE/CgqCHl9q6yiADTC_AAA05D6oqE0082.png"/> 
  
Istio 服务间网络请求示意图

如上图所示，当httpbin 服务调用 Java API 提供的网络 RESTful 接口时，其发送的网络请求会经过它们各自的网络代理 proxy，那么 httpbin的代理就可以为其提供服务**熔断**相关的机制，当调用 Java API 持续出错时，就不再将网络请求发送出去，而是直接本地返回默认数值。

而 Java API 的网络代理可以为其提供**限流**功能，当 httpbin 的请求流量过大时，Java API 的网络代理会对其中一部分请求进行限流，直接返回默认的响应，只将部分请求转发给 Java API 进行处理。

下面，我们就以熔断为例，对比一下使用Service Mesh 方式和使用 Hystrix 类通用组件的优缺点。

* **Service Mesh 是"黑盒"的熔断工具，而 Hystrix 等通用组件则可以被看成是"白盒"的熔断工具。** 具体判断标准是看二者到底是通过外部监控系统监控服务网络请求情况，还是在服务内部监控服务的请求响应情况。如下图所示，Service Mesh 是独立于服务实例之外的存在，通过代理所有服务实例的网络请求来监控响应信息实现熔断机制；而 Hystrix 等通用组件，则是在服务实例中发挥作用，作为服务实例进行网络请求的基础层之一，来监控网络请求信息。

* **Service Mesh 是无侵入地实现熔断，而 Hystrix 等通用组件则需要侵入具体服务业务代码中。** Service Mesh 通过在网络层面配置熔断策略，可以在不更改服务代码的情况下为服务实例提供熔断保护，其对服务来说几乎是无感和透明的。通过这个方法，Service Mesh 适用于任何语言或者框架开发的服务，并且开发人员也不必为每个服务单独配置或重新编程，减少了开发人员的工作量。Hystrix等通用组件需要更改服务的具体代码来引入其第三方依赖库，这些通用组件目前也只支持几类较为主流的编程语言，适用性不如 Service Mesh高。除此之外，开启或关闭熔断机制需要重新部署或者重启服务实例，这对高可用的服务系统来说代价很高。

* **Service Mesh 熔断机制能提供的回退行为较为有限，而 Hystrix 等通用组件提供了较为丰富的回退实现。** 正是因为 Service Mesh 是无侵入的，所以它只能在系统触发熔断机制时，通过 Proxy 返回 HTTP 503 错误，期望应用服务在应对503错误时进行各类回退操作。 而 Hystrix等通用组件在其 API 层面提供了多种的回退操作实现，这样可以实现各种不同类型的回退操作，比如单一的默认值、使用缓存结果或者去调用其他服务等。


<Image alt="istio_and_hystrix.png" src="https://s0.lgstatic.com/i/image/M00/55/EF/CgqCHl9q61aAEwYWAAB6vty4Sd8250.png"/> 
  
Hystrix 和 Istio 的使用区别

总体来说，Istio是使用了 Proxy 作为服务的网络层面的代理来实现熔断机制的，不依赖底层具体的代码和技术栈，而且在部署后也可以进行重新配置和部署。Hystrix等通用组件则需要在代码级别实现熔断机制，因此它需要在开发阶段时就做出具体熔断配置等决策，后期变更配置成本比较高。

### Istio 的熔断限流实践

Istio使用目标规则中的 TrafficPolicy 属性来配置熔断和限流，其中 **connectionPool 属性配置限流方式，outlierDetection 配置异常检测的熔断方式**。下面，我们来分别看一下这二者是如何配置的。

**ConnectionPool 下有 TCP 和 HTTP 两个类别的配置，二者相互协作，为服务提供有关限流的配置。**

TCP 相关的基础配置有maxConnections 和 connectTimeout。

* maxConnections 表示到目标服务最大的 HTTP1/TCP 连接数量。它只会限制基于HTTP1.1协议的连接，不会影响基于HTTP2的连接，因为 HTTP2 协议只建立一次连接。

* connectTimeout 表示建立 TCP 连接时的超时时间，默认单位是秒。超出该时间，则连接会被自动断开。

HTTP下的配置包括http1MaxPendingRequests、http2MaxRequests 和 maxRequestsPerConnection 三种。

* http1MaxPendingRequests 表示HTTP 请求处于pending状态下的最大请求数，也就是目标服务最多可以同时处理多少个 HTTP 请求，默认是1024 个。

* http2MaxRequests 表示目标服务最大的 HTTP2 请求数量，默认是1024。

* maxRequestsPerConnection 表示每个 TCP 连接可以被多少个请求复用，如果将这一参数设置为 1，则会禁止 keepalive 特性。

**OutlierDetection 下相关的配置项涉及服务的熔断机制**，具体有如下几个基础配置。

* consecutiveErrors 表示如果目标服务连续返回多少次错误码后，会将目标服务从可用服务实例列表中剔除，也就是说进行熔断，不再请求目标服务。当通过HTTP请求访问服务，返回码为502、503或504时，Istio 会将本次网络请求判断为发生错误。该属性配置的默认值是5，也就是说如果目标实例连续5个 http请求都返回了 5xx 的错误码，则该服务实例会被剔除，不再接受客户端的网络请求。

* Interval 表示服务剔除的时间间隔，即在interval 时间周期内发生1个consecutiveErrors错误，则触发服务熔断。其单位包括小时、分钟、秒和毫秒，默认值是10秒。

* baseEjectionTime 表示目标服务被剔除后，至少要维持剔除状态多长时间。这段时间内，目标服务将保持拒绝访问状态。该时间会随着被剔除次数的增加而自动增加，时间为baseEjectionTime 和驱逐次数的乘积。其单位包括小时、分钟、秒和毫秒，默认是30秒。

* maxEjectionPercent 表示可用服务实例列表中实例被移除的最大百分比，默认是10%。当超出这个比率时，即使再次发生熔断，也不会将服务剔除，这样就避免了因为瞬时错误导致大多数服务实例都被剔除的问题。

* minHealthPercent 表示健康模式的最小百分比，也就是所有服务实例中健康（未被剔除）的比率。当低于这一比率时，整个集群被认为处于非健康状态，outlierDetection配置相关的服务剔除熔断机制将被关闭，不再进行服务健康检查，所有服务实例都可以被请求访问，包含健康和不健康的主机。该属性的默认值是50%，并且minHealthPercent 和 maxEjectionPercent 的和一般都不超过100%。

下面，我们以官方提供的 httpbin 服务为例演示一下上述配置的使用。首先要部署 httpbin 服务，如果已经开启了自动注入模式，就使用如下命令：

```shell
$ kubectl apply -f section26/httpbin.yaml
```

否则，需要使用命令手动注入：

```shell
$ kubectl apply -f <(istioctl kube-inject -f section26/httpbin.yaml)
```

接着，创建一个目标规则来配置相关的限流和熔断机制，具体命令如下所示：

```dart
kubectl apply -f - <<EOF
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule    # 目标规则
metadata:
  name: httpbin
spec:
  host: httpbin          # 目标服务是 httpbin    
  trafficPolicy: 
    connectionPool:      # 限流相关的配置
      tcp:
        maxConnections: 1
      http:
        http1MaxPendingRequests: 1
        maxRequestsPerConnection: 1
    outlierDetection:    # 熔断剔除相关的配置
      consecutiveErrors: 1
      interval: 1s
      baseEjectionTime: 3m
      maxEjectionPercent: 100
EOF
```

对于限流而言，该配置表示服务最多接收一个 TCP 连接，HTTP 请求pending状态的最大请求为1，后端请求的最大数量也为1，超过上述这些数量，则 Proxy 会自动为 httpbin 限流，返回 503 异常。对于熔断而言，该配置表示每秒钟对 httpbin 的服务实例进行一次熔断剔除检查，如果处理网络请求，连续返回1次 5xx 错误码则会被认定为不健康，要从可用服务列表中剔除 3分钟。

接着，我们部署 fortio 测试客户端向 httpbin 发起请求检查一下上述配置的正确性。

```shell
$ kubectl apply -f <(istioctl kube-inject -f section26/sample-client/fortio-deploy.yaml)
```

然后使用 fortio 客户端请求<http://httpbin:8000/get>接口，可用获得正常的响应码为200的返回值。

```shell
$ export FORTIO_POD=$(kubectl get pods -lapp=fortio -o 'jsonpath={.items[0].metadata.name}')
$ kubectl exec "$FORTIO_POD" -c fortio -- /usr/bin/fortio curl -quiet http://httpbin:8000/get # 返回 200 的正常请求返回值
```

再接着，为了触发 httpbin 的限流机制，我们让fortio 以两个线程模式运行，每个线程向 httpbin 发送20个请求，具体命令和返回值如下所示：

```shell
$ kubectl exec "$FORTIO_POD" -c fortio -- /usr/bin/fortio load -c 2 -qps 0 -n 20 -loglevel Warning http://httpbin:8000/get
08:14:45 I logger.go:115> Log level is now 3 Warning (was 2 Info)
Fortio 1.6.8 running at 0 queries per second, 4->4 procs, for 20 calls: http://httpbin:8000/get
Starting at max qps with 2 thread(s) [gomax 4] for exactly 20 calls (10 per thread + 0)
08:14:45 W http_client.go:698> Parsed non ok code 503 (HTTP/1.1 503)
08:14:45 W http_client.go:698> Parsed non ok code 503 (HTTP/1.1 503)
08:14:45 W http_client.go:698> Parsed non ok code 503 (HTTP/1.1 503)
08:14:45 W http_client.go:698> Parsed non ok code 503 (HTTP/1.1 503)
08:14:45 W http_client.go:698> Parsed non ok code 503 (HTTP/1.1 503)
08:14:45 W http_client.go:698> Parsed non ok code 503 (HTTP/1.1 503)
Ended after 26.459047ms : 20 calls. qps=755.89
Aggregated Function Time : count 20 avg 0.0021580284 +/- 0.001323 min 0.000221019 max 0.005158471 sum 0.043160568
# range, mid point, percentile, count
>= 0.000221019 <= 0.001 , 0.00061051 , 30.00, 6
> 0.001 <= 0.002 , 0.0015 , 35.00, 1
> 0.002 <= 0.003 , 0.0025 , 70.00, 7
> 0.003 <= 0.004 , 0.0035 , 95.00, 5
> 0.005 <= 0.00515847 , 0.00507924 , 100.00, 1
# target 50% 0.00242857
# target 75% 0.0032
# target 90% 0.0038
# target 99% 0.00512678
# target 99.9% 0.0051553
Sockets used: 7 (for perfect keepalive, would be 2)
Jitter: false
Code 200 : 14 (70.0 %)
Code 503 : 6 (30.0 %)
Response Header Sizes : count 20 avg 161 +/- 105.4 min 0 max 230 sum 3220
Response Body/Total Sizes : count 20 avg 668 +/- 279.5 min 241 max 851 sum 13360
All done 20 calls (plus 0 warmup) 2.158 ms avg, 755.9 qps
```

从上面的返回值可以看到一共20个请求，状态码为200的请求响应有14个，状态码为503，也就是触发了限流机制而直接拒绝的请求响应有6个。

最后，我们使用 fortio 来验证熔断机制。使用 fortio 调用 httpbin 的 <http://httpbin:8000/status/502> 接口，该接口会直接返回状态码为502的响应，这样就触发了上述的outlierDetection 配置，即只要返回一次 5xx 的网络响应就会被熔断剔除。

```shell
$ kubectl exec "$FORTIO_POD" -c fortio -- /usr/bin/fortio curl -quiet http://httpbin:8000/status/502
```

那接下来我们就来验证一下 httpbin 是否被熔断剔除了，使用以下命令，连续调用10次相同的接口。

```shell
$ kubectl exec "$FORTIO_POD" -c fortio -- /usr/bin/fortio load -c 1 -qps 0  -n 10  http://httpbin:8000/status/502
.... // 省略
Sockets used: 10 (for perfect keepalive, would be 1)
Jitter: false
Code 503 : 10 (100.0 %)
Response Header Sizes : count 10 avg 0 +/- 0 min 0 max 0 sum 0
Response Body/Total Sizes : count 10 avg 153 +/- 0 min 153 max 153 sum 1530
All done 10 calls (plus 0 warmup) 0.357 ms avg, 2779.6 qps
```

我们可以发现，所有的请求都是返回的 503，也就是说 httpbin 服务被熔断剔除了，所以才会接收到 503 的响应。

### 小结

本课时我们主要介绍了如何使用 Service Mesh 实现熔断和限流。使用 Service Mesh实现上述功能，可以减少对业务服务代码的入侵，并且可以对现有服务熔断和限流进行随意改造，大大提升了开发和运维效率。

通过目标规则的配置，我们可以很方便地为服务配置基于 TPC 或者 HTTP 相关指标的限流，保护服务不受外界突发大流量的影响。此外，目标规则还可以为服务配置基于某些网络异常的熔断机制，定时扫描上游服务，发现问题就移除其服务来保护业务服务不被拖垮。

关于 Service Mesh 的 Istio 组件的集成，你还有什么其他经验？欢迎你在留言区和我分享。

