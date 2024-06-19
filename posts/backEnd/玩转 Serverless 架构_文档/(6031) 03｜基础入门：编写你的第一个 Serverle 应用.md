# 03｜基础入门：编写你的第一个Serverle应用

从今天开始，我们正式进入 Serverless 的开发阶段。

学习一门新技术，除了了解其基础概念，更重要的是把理论转化为实践，所以学会开发 Serverless 应用尤为重要。考虑到很多刚开始接触 Serverless 开发的同学在短时间很难适应 Serverless 的开发思想，知识也不够体系化，所以我除了带你实现一个 Serverless 应用之外，还会介绍应用开发时涉及的重要知识点，让你更深刻地理解 Serverless，建立属于自己的知识体系。

### 选择适合的 FaaS 平台

在开发 Serverless 应用之前，你需要了解并选择一个 Serverless FaaS 平台，因为你要用 FaaS 运行代码。

目前主流的 FaaS 产品有 AWS Lambda、阿里云函数计算等。不同 FaaS 支持的编程语言和触发器不尽相同，为了让你更快地了解它们异同点，我提供给你一个简单的对比图：


<Image alt="Lark20201228-185348.jpeg" src="https://s0.lgstatic.com/i/image2/M01/04/20/Cip5yF_puUaAJfw3AANPRrI1kS820.jpeg"/> 


从表格中，你可以总结出这样几点信息。

* FaaS 平台都支持 Node.js、Python 、Java 等编程语言；

* FaaS 平台都支持 HTTP 和定时触发器（这两个触发器最常用）。此外各厂商的 FaaS 支持与自己云产品相关的触发器，函数计算支持阿里云表格存储等触发器；

* FaaS 的计费都差不多，且每个月都提供一定的免费额度。其中 GB-s 是指函数每秒消耗的内存大小，比如1G-s 的含义就是函数以 1G 内存执行 1 秒钟。超出免费额度后，费用基本都是 0.0133元/万次，0.00003167元/GB-s。所以，用 FaaS 整体费用非常便宜，对一个小应用来说，几乎是免费的。

总的来说，国外开发者经常用 Lambda，相关的第三方产品和社区更完善，国内经常用函数计算，因为函数计算使用方式更符合国内开发者的习惯。

了解了主流 FaaS 的基本信息之后，**怎么用 FaaS 去开发 Serverless 应用呢？** 为了让你对不同 FaaS 有更多了解，方便以后进行技术选型，这一讲我主要用函数计算做演示，同时也会讲述基于 Lambda 的实现。

### 开发 Serverless 应用的步骤

**这个 Serverless 应用的功能是：** 提供一个所有人都可访问的 "Hello World!" 接口，并且能够根据请求参数进行响应（比如请求 http://example.com/?name=Serverless 返回 Hello, Serverless ）。

在学这一讲之前，你可能直接用 Node.js 中的 Express.js 框架定义一个路由，接收 HTTP 请求，然后处理请求参数并返回结果，代码如下：

```javascript
// index.js
const express = require('express')
const app = express()
const port = 3000
// 定义路由
app.get('/hello', (req, res) => {
  const { name } = req.request.query;
  res.send(`Hello ${name}!`);
});
// 启动服务
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
});
```

**那怎么把接口分享给别人呢？** （我在"[02 \| 概念新知：到底什么是 Serverless?](https://kaiwu.lagou.com/course/courseInfo.htm?courseId=589#/detail/pc?id=6030)"的时候提到了这部分内容，你可以回顾一下，我就不多说了）。当然如果你对域名解析、Nginx 配置等流程不熟悉，那就需要耗费很多时间和精力了。**可能代码开发几分钟，部署上线几小时。**


<Image alt="1.png" src="https://s0.lgstatic.com/i/image2/M01/04/28/Cip5yF_qmTqAJI5SAAGC15t2JGc253.png"/> 
  
传统应用开发流程

而基于 Serverless FaaS 平台进行开发就很简单了，你开发完的函数代码部署到 FaaS 平台并为函数配置 HTTP 触发器，FaaS 会自动帮你初始化运行环境，并且 HTTP 触发器会自动为你提供一个测试域名。


<Image alt="2.png" src="https://s0.lgstatic.com/i/image/M00/8C/50/CgqCHl_qmUWAbbsDAADn5znl1KY310.png"/> 
  
Serverless 应用开发流程

**以函数计算为例，** 你可以直接点击[新建函数](https://fc.console.aliyun.com/fc/service/cn-hangzhou/function/create)的链接进入函数计算控制台，新建一个函数。**请注意，你会用到 HTTP 触发器，函数计算的 HTTP 触发器要在创建函数时就指定。**


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image2/M01/03/D5/CgpVE1_jBXmAb9TJAAPuNbsOSKo931.png"/> 


函数创建成功后，就会进入到代码编辑页面，在编辑器中写入如下代码：

```javascript
// 函数计算
exports.handler = (request, response, context) => {
    // 从 request 中获取
    const { name } = request.queries;
    // 设置 HTTP 响应
    response.setStatusCode(200);
    response.setHeader("Content-Type", "application/json");
    response.send(JSON.stringify({ message: `Hello, ${name}` }));
 }
```

这段代码就是 Serverless 应用的全部代码了，它本质上是一个函数，函数有三个参数。

* request 是请求信息，你可以从中获取到请求参数；

* response 是响应对象，你可以用它来设置 HTTP 响应数据；

* context 是函数上下文，后面会讲到。

由此可见，相比 Express.js 框架，基于 FaaS 的 Serverless 应用的代码更简单，就像写一个普通函数，接收参数并处理，然后返回。写完代码后，你就可以在"触发器"标签下看到函数计算为你默认创建的 API Endpoint：


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image/M00/8B/F1/Ciqc1F_jBYOAFmttAAJZChiCxxw894.png"/> 


然后你可以用该 API Endpoint 对函数进行测试。我们通过 curl 命令测试一下：

```shell
$ curl https://1457216987974698.cn-hangzhou.fc.aliyuncs.com/2016-08-15/proxy/serverless/hello-world/\?name\=Serverless
Hello Serverless!
```

接口也按照预期返回了 Hello Serverless! 。  
**需要注意的是，** 如果你直接用浏览器访问函数计算默认提供的 API Endpoint ，函数计算 HTTP 触发器会默认在 response headers 中强制添加 content-disposition: attachment 字段，这会让返回结果在浏览器中以附件的方式下载，**解决的方法就是使用自定义域名。** 所以如果应用是一个线上服务，还是建议你购买自定义域名绑定到你的函数上。

至此你就基于函数计算完成了 Serverless 应用的开发、部署和测试。

**如果你用的是 Lambda，** 需要在[Lambda 控制台](https://console.aws.amazon.com/lambda/home?region=us-east-1#/functions)先创建一个函数，然后为函数添加 API 网关触发器。Lambda 没有直接提供 HTTP 触发器，但可以用 API 网关触发器来实现通过 HTTP 请求触发函数执行。同样 Lambda 也会默认提供给你一个测试域名，代码如下：

```javascript
// Lambda
exports.handler = (event, context, callback) => {
    // 从 event 中获取 URL query 参数
    const { name } = event.queryStringParameters;
    // 定义 HTTP Response
    const response = {
        statusCode: 200,
        headers: {
            "Content-Type": "application/json"
            },
        body: JSON.stringify({ message: `Hello ${name}!`} ),
    };
    callback(null, response);
};
```

与 HTTP 触发器不同的是，API 网关触发器入参是 event ，event 对象就是 HTTP 请求信息。相比而言，函数计算的 HTTP 触发器请求处理方式，和你用 Express.js 框架来处理请求更类似，而 API 网关触发器则是普通函数。**这也是我更喜欢函数计算的一个原因。**

总的来说，开发一个 Serverless 应用可以分为三个步骤：代码开发、函数部署、触发器创建。那在这个过程中，你有没有思考过这样几个问题：为什么函数名是 handler？函数的参数又是怎么定义的呢？要弄清楚这些问题，你需要学习背后的基础知识。

### 开发 Serverless 应用的基础知识

#### 入口函数

我们开发传统应用时，编写的第一行代码一般都是入口函数，比如 Java 的 main 函数，而 Serverless 应用是由一个个函数组成的，与 main 函数对应的就是 FaaS 中的入口函数。

在你创建 FaaS 时，会填写一个 "函数入口"，默认是 index.handler 含义为：运行 index 文件中的 handler 函数，handler 函数就是 "入口函数"。 FaaS 运行函数时，会根据"函数入口"加载代码中的"入口函数"。**这也就是为什么例子中的函数名是 handler。**

在开发 "Hello World" 应用时，你只编写了一个 index.js 文件，文件中也只有一个 handler 方法，函数入口就是 index.handler 。

当然，FaaS 函数可以包含多个源文件，然后按照编程语言的模块机制相互引入，这和传统的编程没有区别。比如 Hello World 应用可以拆分一个 sayHello 函数到 hello.js 文件中，然后在 index.js 中引入 hello.js ，函数的入口还是 index.hanlder 。

```javascript
// logic.js
exports.sayHello = function (name) {
  return `Hello, ${name}!`;
}
```

    // index.js
    const logic = require('./logic');
    exports.handler = (request, response, context) => {
      // 从 request 中获取
      const { name } = request.queries;

      // 处理业务逻辑
      const message = logic.sayHello(name)

      // 设置 HTTP 响应
      response.setStatusCode(200);
      response.setHeader("Content-Type", "application/json");
      response.send(JSON.stringify({ message })); 
    }

**这也是我的建议：把业务逻辑拆分到入口函数之外**。另外，你也可以用一份源文件去创建多个函数。因为应用通常是由多个函数组成，为了方便管理，你可能会在一个源文件中编写所有的入口函数。


<Image alt="3.png" src="https://s0.lgstatic.com/i/image/M00/8C/50/CgqCHl_qmV-AKjTHAAGR7LVSJSs782.png"/> 
  
使用一份源文件创建多个函数

既然你知道了函数名 handler 的由来， 那handler 函数具体是怎么定义的呢？

#### 函数定义

你能发现，在 HTTP 触发器中函数定义是 function(request, response, context)，在 API 网关触发器中，函数定义是 function(event, context) ，**所以，函数定义本质上是由触发器和编程语言决定的。**

标准的函数定义是 function(event, context)。event 是事件对象。在 Serverless 中，触发器被称为"事件源"，英文是 event，这解释了为什么函数参数名是 event。

触发器不同，event 的值可能不同。部分特殊触发器的函数定义可能和标准函数定义不一样，比如 HTTP 触发器，它其实是对标准函数的进一步封装，主要是为了方便对 HTTP 请求进行处理。这也是为什么在函数计算中，HTTP 触发器必须在创建函数时就指定，并且一旦创建后就不能修改（关于 event 的属性，后面我会详细讲）。

第二个参数 context 是函数上下文，包含了函数运行时的一些信息（比如函数名称、运行函数的账号信息等）。同一 FaaS 平台中所有触发器的 context 对象都类似，来看一个例子：

```javascript
{
  requestId: 'cd234b13-a145-468a-b640-17a8bf5e2ef2',
  credentials: {
    accessKeyId: '***',
    accessKeySecret: '***',
    securityToken: '***'
  },
  function: {
    name: 'hello-world',
    handler: 'index.handler',
    memory: 512,
    timeout: 60,
    initializer: undefined,
    initializationTimeout: NaN
  },
  service: {
    name: 'serverless',
    logProject: 'aliyun-fc-cn-hangzhou-***',
    logStore: 'function-log',
    qualifier: 'LATEST',
    versionId: ''
  },
  region: 'cn-hangzhou',
  accountId: '145***',
  retryCount: 0
}
```

为了让你更形象地了解函数定义，我列举了几种不同编程语言的入口函数示例：

```javascript
// Node.js 异步函数
exports.handler = function (event, context, callback) {
    callback(null, "Hello World!");
}
```

```javascript
// Node.js 同步函数，目前仅 Lambda 支持
exports.handler = async function (event, context) {
    return "Hello World!"
}
```

```javascript
// Python
def handler(event, context):
  return "Hello World!"
```

```javascript
// Java
package example;
import com.aliyun.fc.runtime.Context;
import com.aliyun.fc.runtime.StreamRequestHandler;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
public class HelloWorld implements StreamRequestHandler {
    @Override
    public void handleRequest(
            InputStream inputStream, OutputStream outputStream, Context context) throws IOException {
        outputStream.write(new String("hello world").getBytes());
    }
}
```

由此可见，Node.js 和 Python 的代码是最简洁的。 Node.js 编写简单，开发人员众多，前后端同学都很容易上手，所以它在 Serverless 中最受欢迎。

不过在 Node.js 中，目前仅 Lambda 的入口函数支持支持异步 async 写法，其他 FaaS 平台入口函数只能是同步写法，对于异步操作只能使用回调函数实现，所以入口函数有第三个参数 callback 。callback 就是你平时写 JavaScript 代码中的回调函数，第一个参数是错误信息，第二个参数是返回值。如果函数运行正常没有报错，则 callback 第一个参数传入null。当然，除了入口函数，其他代码支持异步，这由 Node.js 的版本决定。举个例子，下面的代码入口函数 handler 是回调函数，而 sayHello 函数都是 async 函数：

```javascript
async function sayHello() {
  return 'hello world';
}
exports.handler = (event, context, callback) => {
  sayHello()
    .then(res => callback(null, res))
    .catch(error => callback(error));
}
```

#### 触发器及事件对象

前面我提到，FaaS 接收到触发器产生的事件后，会根据触发器信息生成 event 对象，然后以 event 为参数调用函数。接下来我就带你了解常见的触发器，及其 event 对象属性。

* **HTTP 触发器**

在众多 FaaS 平台中，函数计算直接提供了 HTTP 触发器，HTTP 触发器通过发送 HTTP 请求来触发函数执行，一般都会支持 POST、GET、PUT、HEAD 等方法。所以你可以用 HTTP 触发器来构建 Restful 接口或 Web 系统。


<Image alt="4.png" src="https://s0.lgstatic.com/i/image/M00/8C/50/CgqCHl_qmXCARXH9AAF-_DuU4lw021.png"/> 
  
HTTP 触发器

HTTP 触发器会根据 HTTP 请求和请求参数生成事件，然后以参数形式传递给函数。那么 HTTP 触发器的入口函数参数中的 request 和 response 参数具体有哪些属性呢？

其实， request 和 response 参数本质上与 Express.js 框架的 request 和 response 类似，具体可以参考其文档。下面是 request 参数的示例：

```javascript
// HTTP 触发器 request 参数
{
    "method": "GET",
    "clientIP": "42.120.75.133",
    "url": "/2016-08-15/proxy/serverless/hello-world/",
    "path": "/",
    "queries": { "name": "World" },
    "headers": {
    "accept": "*/*",
        "content-length": "0",
        "content-type": "application/x-www-form-urlencoded",
        "host": "1457216987974698.cn-hangzhou.fc.aliyuncs.com",
        "user-agent": "curl/7.64.1",
        "x-forwarded-proto": "https"
  }
  // ...
}
```

如果你用 POST 请求，直接从 request 中取 body 参数比较麻烦，所以你可以用 raw-body 这个包来处理请求参数，代码示例如下：

```javascript
var getRawBody = require('raw-body')
exports.handler = function (request, response, context) {
    // 获取请求参数
    getRawBody(request, function (err, data) {
        var params = {
            path: request.path,
            queries: request.queries, // HTTP 请求 query 参数
            headers: request.headers,
            method: request.method,
            body: data, // data 就是 HTTP 请求 body 参数
            url: request.url,
            clientIP: request.clientIP,
        }
        // 设置 HTTP 返回值
        var respBody = new Buffer.from(JSON.stringify(params));
        response.setStatusCode(200)
        response.setHeader('content-type', 'application/json')
        response.send(respBody)
    })
};
```

* **API 网关触发器**

API 网关触发器与 HTTP 触发器类似，它主要用于构建 Web 系统。本质是利用 API 网关接收 HTTP 请求，然后再产生事件，将事件传递给 FaaS。FaaS 将函数执行完毕后将函数返回值传递给 API 网关，API 网关再将返回值包装为 HTTP 响应返回给用户。


<Image alt="5.png" src="https://s0.lgstatic.com/i/image/M00/8C/50/CgqCHl_qmXuAZBHIAAGGcHsdzWI696.png"/> 
  
API 网关触发器

下面是 Lambda 的 API 网关触发器 event 参数示例：

```javascript
// Lambda API 网关触发器 event 参数示例
{
    "version": "2.0",
    "routeKey": "ANY /hello-world",
    "rawPath": "/default/hello-world",
    "rawQueryString": "name=1",
    "headers": {
        "accept": "*/*",
        "content-length": "0",
        "host": "gwfk38f70e.execute-api.us-east-1.amazonaws.com",
        "user-agent": "curl/7.64.1",
        "x-amzn-trace-id": "Root=1-5fb47a82-5cf8a8f3573b039d538fdea2",
        "x-forwarded-for": "42.120.75.133",
        "x-forwarded-port": "443",
        "x-forwarded-proto": "https"
    },
    "queryStringParameters": {
        "name": "1"
    },
    "requestContext": {},
    "isBase64Encoded": false
}
```

相比而言，HTTP 触发器用起来更简单， API 网关触发器功能更丰富，比如可以实现 IP 黑名单、流量控制等高级功能。所以，如果你只是实现简单的 Web 接口，可以使用 HTTP 触发器，如果你需要一些高级功能，可以用 API 网关触发器。

* **定时触发器**

定时触发器就是定时执行函数，它经常用来做一些周期任务，比如每天定时查询天气并给自己发送通知、每小时定时处理分析日志等等。


<Image alt="6.png" src="https://s0.lgstatic.com/i/image/M00/8C/45/Ciqc1F_qmYWAE9fxAAD1A7kgncU172.png"/> 
  
定时触发器

定时触发器的`event`对象很简单：

```json
// 函数计算定时触发器 event 参数示例
{
  "triggerTime": "2020-11-22T17:42:20Z",
  "triggerName": "timer",
  "payload": ""
}
```

除了这三种触发器，各个云厂商也都实现了与自己云产品相关的触发器，比如，文件存储触发器、消息触发器、数据库触发器。

总的来说，触发器决定了一个 Serverless 应用如何提供服务，也决定了代码应该如何编写。丰富的触发器，可以让应用功能更强大，但不同触发器的 event 属性不同，也为编程带来了麻烦。**记得我的建议吗？将业务逻辑拆分到入口函数之外。** 保持入口函数的简洁，这样业务代码就与触发器无关了。

#### 日志输出

无论你用什么编写语言开发 Serverless 应用，你都要在合适的时候输出合适的日志信息，方便调试应用、排查问题。在 Serverless 中，日志输出和传统应用的日志输出没有太大区别，**只是日志的存储和查询方式变了。**

以函数计算为例，如果你在控制台创建函数，则函数计算默认会使用日志服务来为你存储日志。在 "日志查询" 标签下可以查看函数调用日志。日志服务是一个日志采集、分析产品，所以如果你要实现业务监控，则可以将日志输出到日志服务，然后在日志服务中对日志进行分析，并设置报警项。


<Image alt="Drawing 8.png" src="https://s0.lgstatic.com/i/image/M00/8B/F2/Ciqc1F_jBdKAQddrAANmkQx2nJs904.png"/> 
  
函数调用日志

基本上，各个云厂商的 FaaS 会选择自己的日志服务来存储函数日志， FaaS 平台也提供了基本的函数监控，包括函数的运行时长、内存使用等。国外也有很多第三方的 SaaS 产品帮你实现 Serverless 应用的日志存储分析、系统监控报警，比如 [dashbird](https://dashbird.io/)、[thundra](https://www.thundra.io/)。**国内这方面的产品非常少，我觉得这对你我来说是一个机会。**

#### 异常处理

函数在运行过程中，会出现异常情况。当函数执行异常或主动抛出异常时，FaaS 平台会捕捉到异常信息，记录异常日志，并将异常信息以 JSON 对象返回。下面是一个 Node.js 代码抛出异常的示例，在这个例子中，我使用 throw new Error() 主动抛出一个异常的日志：


<Image alt="Drawing 9.png" src="https://s0.lgstatic.com/i/image/M00/8B/FD/CgqCHl_jBd6AdHX_AAKNGxRYIKQ705.png"/> 


其中 Response 就是函数返回值，Function Logs 就是调用日志。

在传统应用中，一个函数的异常可能会让整个应用崩溃，但在 Serverless 应用中，一个函数异常，只会影响这一次函数的执行。这也是为什么 Serverless 能够提升应用的整体稳定性。**但我还是建议你编写代码时，充分考虑程序的异常，保证代码的健壮性，进一步提升系统稳定性。**

### 总结

这一讲我从宏观上带你学习了如何开发一个 Serverless 应用，以及开发过程中涉及的基础知识。相信通过今天的学习，你可以体会到 Serverless 应用开发与传统开发的区别，比如代码编辑可以在云端进行，而不仅是在本地进行，应用的组成是单个独立的函数，而不是所有功能的集合体。

此外我觉得，对一个 Serverless FaaS 平台来说，除了要具备基本的函数执行能力外，还要提供便利的开发工具、丰富的触发器、完善的日志监控以及与其他服务集成等各方面能力。你在进行技术选型时，也需要考虑这些方面。这一讲我强调这样几个重点：


<Image alt="7.png" src="https://s0.lgstatic.com/i/image/M00/8C/50/CgqCHl_qmZCAdIFmAAFS6TtGLlQ407.png"/> 


* Serverless 的应用基本组成单位是函数，函数之间互相独立，因此 Serverless 能提高应用稳定性；

* 函数定义与触发器和编程语言相关，不同 FaaS 平台的实现不尽相同；

* 为了使代码扩展性更强，建议你将业务逻辑拆分到入口函数之外；

* 为了使应用稳定性更好，建议你编写函数代码时充分考虑程序异常。

在实际工作中，我经常用 Serverless 来处理业务逻辑，比如快速开发一个测试接口、实时处理日志等，如果你有类似需求也可以尝试使用 Serverless 来实现。

本节课的作业相对来讲比较简单，那就是动手实现你的第一个 Serverless 应用，希望你能夯实基础，游刃有余地学习接下来的内容，我们下一讲见。

