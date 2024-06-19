# 20数据面：基于Go-Micro快速实现代理模块

今天我要和你分享的内容是：如何自研 Service Mesh 中的数据面，这里我们选择用 Go-Micro 框架实现 Sidecar 中最核心的代理模块。

在本讲中，我们选用了 Go 语言实现数据面。在常见的开源数据面中，Envoy 使用 C++ 实现，Linkerd 早期版本使用 Java，新版本使用 Rust 实现，而 MOSN 和 Maesh 都使用 Go 语言实现。从这些技术选型可以看出，Go 语言在数据面的实现中占有一席之地，主要是**较高的性能和较少的内存占用**，比较适合 Sidecar 的应用场景。

为了快速实现，我们使用了 Go-micro 框架，这个框架有非常好的抽象层，支持 MUCP、gRPC、HTTP 等协议的原生代理，后期也可以根据需求扩展协议层。

本文讲解的代码地址在：<https://github.com/beck917/easymesh>，你可以配合代码阅读本文。

### 环境安装\&框架搭建

首先进入 Go 语言官网，根据环境下载合适的版本<https://golang.google.cn/dl/>，因为 Go-Micro 的旧版本依赖问题，这里我们选择 Go 1.14 版本。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image6/M00/07/7C/Cgp9HWAzh5aAdgqCAAGppXYgA2M543.png"/> 


代码中我们并没有使用最新的 v3 版本，因为 Go-Micro 框架的母公司转向云平台的开发模式，Go-Micro 的 v3 版本转移到了个人项目下，但这个版本还有诸多问题，缺少以前的很多特性，所以这里还是采用了 v1 版本。

### 代码解析

首先我们看一下 main 方法，这里创建了两个代理服务器，分别是监听 8082 端口的出流量代理和监听 8083 端口的 8083 服务：

```java
func main() {
    http.HandleFunc("/", indexHandler)
    go http.ListenAndServe(":6060", nil)
    // start the client proxy
    go proxy.Run(&proxy.ServerOptions{
        Name:     "Client Listener Proxy",
        Address:  ":8082",
        Endpoint: "http://127.0.0.1:8083",
        Protocol: "http",
    })
    time.Sleep(1 * time.Second)
    // start the server proxy
    proxy.Run(&proxy.ServerOptions{
        Name:     "Server Listener Proxy",
        Address:  ":8083",
        Endpoint: "http://127.0.0.1:6060",
        Protocol: "http",
    })
}
```

下面解释下 proxy.Run 方法的几个参数。

* Name：代理服务器唯一标识。

* Address：代理服务器监听地址。

* Endpoint：代理服务器流量转发的地址，可以看到这里 Client Proxy 将 Endpoint 设置为 http://127.0.0.1:8083，意思是将流量转发到 Server Proxy，而 Server Proxy 将流量转向了本地的 6060 端口，也就是服务端口，这样就形成了一个完成的 Mesh 链路。

* Protocol：代理的协议，这里是 HTTP。

下面我们进入 Run 方法看一下核心代码：

```java
    // new proxy
    var p proxy.Proxy
    var s server.Server
    // set endpoint
    if len(Endpoint) > 0 {
        switch {
        case strings.HasPrefix(Endpoint, "grpc://"):
            ep := strings.TrimPrefix(Endpoint, "grpc://")
            popts = append(popts, proxy.WithEndpoint(ep))
            p = grpc.NewProxy(popts...)
        case strings.HasPrefix(Endpoint, "http://"):
            // TODO: strip prefix?
            popts = append(popts, proxy.WithEndpoint(Endpoint))
            p = http.NewProxy(popts...)
            s = smucp.NewServer(
                server.WrapHandler(ratelimiter.NewHandlerWrapper(10)),
            )
        default:
            // TODO: strip prefix?
            popts = append(popts, proxy.WithEndpoint(Endpoint))
            p = mucp.NewProxy(popts...)
        }
    }
```

Run()方法根据传入的参数 Endpoint 会选择对应的协议，这里我传入的是 HTTP 协议的Endpoint，会创建一个 HTTP 的 Proxy。

这个 HTTP 的 Proxy 跟踪你可以参照 [Go-Micro 的代码](https://github.com/asim/go-micro)，也很简单，其实所有的 Proxy 都会通过 ServeRequest(ctx context.Context, req server.Request, rsp server.Response) 这个方法，这个方法对 Server 处理过后的 HTTP 进行转发操作。

```java
        // get data
        body, err := req.Read()
        if err == io.EOF {
            return nil
        }
        if err != nil {
            return err
        }
        // get the header
        hdr := req.Header()
        // get method
        method := getMethod(hdr)
        // get endpoint
        endpoint := getEndpoint(hdr)
        // send to backend
        hreq, err := http.NewRequest(method, endpoint, bytes.NewReader(body))
        if err != nil {
            return errors.InternalServerError(req.Service(), err.Error())
        }
        // set the headers
        for k, v := range hdr {
            hreq.Header.Set(k, v)
        }
        // make the call
        hrsp, err := http.DefaultClient.Do(hreq)
        if err != nil {
            return errors.InternalServerError(req.Service(), err.Error())
        }
```

这里先读取了 Server 获取到的请求 header 和 body，然后建立了 HTTP 客户端进行流量转发。你可以看到，这里的转发相对简单，因为相对于自定义协议，**HTTP Golang 提供了现成的客户端**，这里直接使用即可。

Go-Micro 的 HTTP 的代理实现相对简单，但是你要注意：这里的代码并没有进行优化和客户端的超时处理，无法直接用于生产环境。如果想用于生产环境，还需要一些改造，比如自己建立 HTTP Client，而不是直接用 http.DefaultClient。另外，hreq 对象也要携带 context，以确保可以**控制超时**，返回 504 Gateway Timetout 的错误。

创建完 Proxy 后，下面的代码基本上和 Go-Micro 创建一个新的 Server 没有什么区别了。只是这里的 Muxer 这个 router 将会直接绕过 Server 的 router 层，直接将流量转向 Proxy 层，因为 Server 的 router 其实已经没有用了，相当于被 Proxy 劫持了，毕竟这里我们不需要路由到 Server 的具体方法。

```java
    // new service
    service := micro.NewService(srvOpts...)
    // create a new proxy muxer which includes the debug handler
    muxer := mux.New(Name, p)
    // set the router
    service.Server().Init(
        server.WithRouter(muxer),
    )
    // Run internal service
    if err := service.Run(); err != nil {
        log.Fatal(err)
    }
```

进入 mux 的代码也可以了解到，这里直接调用了proxy.ServeRequest()：

```java
func (s *Server) ServeRequest(ctx context.Context, req server.Request, rsp server.Response) error {
    if req.Service() == s.Name {
        return server.DefaultRouter.ServeRequest(ctx, req, rsp)
    }
    return s.Proxy.ServeRequest(ctx, req, rsp)
}
```

我们回顾一下，刚才在创建 Proxy 的时候，同时创建了一个 Server 对象，这个 Server 同时创建了一个 Wrapper，Wrapper 其实就是 Go-Micro 的 Middleware 层。这里我们创建了一个限流的中间件，后面在讲解控制面的时候，还要创建路由和负载均衡中间件。

我们先通过一个简单的限流中间件学习一下这部分内容：

```java
s = smucp.NewServer(
                server.WrapHandler(ratelimiter.NewHandlerWrapper(10)),
            )
```

RateLimit 中间件使用了 Uber 的库实现，达到限流值会产生阻塞，而不是返回错误。**在生产中，还是建议使用返回错误的方式实现限流器**，因为产生阻塞可能会进一步恶化并发情况。具体代码如下：

```java
// NewHandlerWrapper creates a blocking server side rate limiter
func NewHandlerWrapper(rate int) server.HandlerWrapper {
    r := ratelimit.New(rate)
    return func(h server.HandlerFunc) server.HandlerFunc {
        return func(ctx context.Context, req server.Request, rsp interface{}) error {
            r.Take()
            return h(ctx, req, rsp)
        }
    }
}
```

至此，一个简单的 Sidecar Proxy 的代码实现部分就讲解完了。下面我们编译并启动这个简单的 Sidecar ，来看一下实际的运行效果。

对代码进行编译并启动：

```java
go run -mod=vendor .\main.go
```

可以看到下面的启动信息：

```java
2021-02-20 23:49:44.486504 I | [proxy] Proxy [http] serving endpoint: http://127.0.0.1:8083
2021-02-20 23:49:44.490502 I | [proxy] Transport [http] Listening on [::]:8082
2021-02-20 23:49:44.502494 I | [proxy] Broker [http] Connected to [::]:14393
2021-02-20 23:49:44.695376 I | [proxy] Registry [mdns] Registering node: Client Listener Proxy-5512f579-7eed-4ef6-8c80-4342650afc2d
2021-02-20 23:49:45.497904 I | [proxy] Proxy [http] serving endpoint: http://127.0.0.1:6060
2021-02-20 23:49:45.498903 I | [proxy] Transport [http] Listening on [::]:8083
2021-02-20 23:49:45.585850 I | [proxy] Broker [http] Connected to [::]:14393
2021-02-20 23:49:45.758753 I | [proxy] Registry [mdns] Registering node: Server Listener Proxy-5512f579-7eed-4ef6-8c80-4342650afc2d
2021-02-20 23:49:46.606504 I | [proxy] Registry [mdns] Deregistering node: Client Listener Proxy-5512f579-7eed-4ef6-8c80-4342650afc2d
2021-02-20 23:49:46.609502 I | [proxy] Registry [mdns] Deregistering node: Server Listener Proxy-5512f579-7eed-4ef6-8c80-4342650afc2d
```

这里可以看到同时启动了两个端口 8082 和 8083，分别是 Sidecar 处理出流量和入流量的端口，同时有输出了两个 Server 代理的目的地。

我们先来请求 8083 端口，这个端口会将流量路由到本地的 6060 端口。为了调试，我们的 Sidecar 代码在 6060 端口启动了一个 HTTP 服务器，请求这个 Server 会返回 Hello World 的输出：

```java
curl 127.0.0.1:8083/ -i

StatusCode        : 200
StatusDescription : OK
Content           : hello world
RawContent        : HTTP/1.1 200 OK
                    User-Agent: Mozilla/5.0 (Windows NT; Windows NT 10.0; zh-CN) WindowsPowerShell/5.1.18362.1171
                    Content-Length: 11
                    Content-Type: text/plain; charset=utf-8
                    Date: Sun, 21 Feb 2021 18:2...
```

可以看到这里返回了正常的请求，返回的内容为 Hello World，说明 8083 端口正常处理了代理的请求。为了验证内容返回是否正常，这里我们直接请求 6060 端口，查看返回的信息：

```java
curl 127.0.0.1:6060/ -i

StatusCode        : 200
StatusDescription : OK
Content           : hello world
RawContent        : HTTP/1.1 200 OK
                    Content-Length: 11
                    Content-Type: text/plain; charset=utf-8
                    Date: Sun, 21 Feb 2021 18:27:35 GMT
                    hello world
```

可以看到输出了相同的信息，表示 Sidecar 确实进行了正确的转发。

下面我们再请求 8082 端口，模拟一下完整的 Mesh 过程。整个过程如下图所示：


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image6/M00/08/FF/CioPOWA1hs6AX1jDAAB6NkWYyhA014.png"/> 
  
完整 Mesh 过程示意图

请求8082端口：

```java
curl 127.0.0.1:8082/

StatusCode        : 200
StatusDescription : OK
Content           : hello world
RawContent        : HTTP/1.1 200 OK
                    Accept-Encoding: gzip
                    Connection: Keep-Alive
                    User-Agent: Mozilla/5.0 (Windows NT; Windows NT 10.0; zh-CN) WindowsPowerShell/5.1.18362.1171
                    Content-Length: 11
                    Content-Type: text/pl...
```

这里同样返回了正确的信息。结合上面的图片和代码解析可以发现，这里的流量经由 8082，被转发到了 8083 端口，经历了一个完整的 Mesh 代理过程。从客户端的正向代理，到服务端的反向代理，通过对出流量和入流量进行代理，完整掌控了整个微服务链路的流量。最后将流量转发到了真实的 Service，也就是 6060 端口启动的服务。

到这里，利用 Go-Micro 实现一个简单的 Sidecar 就完成了。你可以看到，Sidecar 本身就是一个代理程序，而利用 Go-Micro 实现一个 Sidecar 原型也并不复杂，但要做一个生产环境可用的 Sidecar 还有很多工作要完善，比如一些**错误的处理、多种协议的支持、支持复杂的路由和负载均衡策略** ，以及**限流熔断** 等基本的服务治理功能。另外，在复杂的线上流量环境保证**Sidecar 自身的健壮性和稳定性**，也不是一件容易的事情。

实际上，在 Go 语言中还有另外一种实现 HTTP 代理更简单、更稳定的方法，这里我们也简单做一下介绍。至于为什么没有着重介绍这种方法，而选择采用 Go-Micro 来实现，是因为 Go-Micro 方便扩展多种协议，以及统一的中间件层。

下面我们结合代码简单介绍一下 Go 原生的代理实现：

```java
package main
import (
        "log"
        "math/rand"
        "net/http"
        "net/http/httputil"
        "net/url"
)
func NewMultipleHostsReverseProxy(targets []*url.URL) *httputil.ReverseProxy {
        director := func(req *http.Request) {
                target := targets[rand.Int()%len(targets)]
                req.URL.Scheme = target.Scheme
                req.URL.Host = target.Host
                req.URL.Path = target.Path
        }
        return &httputil.ReverseProxy{Director: director}
}
func main() {
        proxy := NewMultipleHostsReverseProxy([]*url.URL{
                {
                        Scheme: "http",
                        Host:   "localhost:6060",
                },
        })
        log.Fatal(http.ListenAndServe(":9090", proxy))
}
```

可以看到，Golang 本身提供了 ReverseProxy 的对象。直接创建这个对象，并传入 HTTP Server，就可以实现一个简单的 HTTP Proxy 功能。对于 HTTP 服务来说，这个 Proxy 实现比 Go-Micro 的实现相对高效，它并没有创建 HTTP Client，而是直接利用了更底层的 HTTP Transport 进行流量的转发，有兴趣的同学也可以直接去查看 Golang 的源码（<https://github.com/golang/go/blob/master/src/net/http/httputil/reverseproxy.go>）。

整个 Sidecar 的代码实现和讲解到这里就结束了，下面我们做一个简单的总结。

### 总结

今天我们主要了解了 Sidecar 的代码实现，通过代码层的讲解，相信你已经了解 Sidecar 的底层原理和 Proxy 的实现原理。此外，我们通过手动运行 Demo 程序，清晰展示了整个 Mesh 数据面的运行过程，并利用这个最小化的运行环境，深入了解了 Mesh 数据面的架构。相信较于 Istio 的实战部分，今天的内容会帮助你对整个 Mesh 数据面有一个更清晰的认知。

本讲内容总结如下：


<Image alt="金句.png" src="https://s0.lgstatic.com/i/image6/M00/09/02/Cgp9HWA1hrWAMQuCAAGBGu1j9ok772.png"/> 


结合今天内容的讲解，如果让你研发一个 Mesh 的数据面，你会用什么语言和框架呢。欢迎在留言区和我分享你的观点。

今天的内容到这里就结束了，下一讲我们开始讲解控制面：实现 xDS 配置管理。下一讲我会实现 Service Mesh 的控制面，并将本讲实现的 Sidecar 和控制面进行通信，用于展示完整的 Service Mesh 过程。我们下一讲再见。

