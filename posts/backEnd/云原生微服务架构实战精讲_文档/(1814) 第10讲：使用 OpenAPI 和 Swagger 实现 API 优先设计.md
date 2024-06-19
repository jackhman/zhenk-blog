# 第10讲：使用OpenAPI和Swagger实现API优先设计

从本课时开始，我们将进入到云原生微服务架构应用的实战开发环节，在介绍微服务的具体实现之前，首要的工作是设计和确定每个微服务的**开放 API** 。开放 API 在近几年得到了广泛的流行，很多在线服务和政府机构都对外提供了开放 API，其已经成为在线服务的标配功能。开发者可以利用开放 API 开发出各种不同的应用。  

<br />

微服务应用中的开放 API 与在线服务的开放 API，虽然存在一定的关联，但作用是不同的。在微服务架构的应用中，微服务之间只能通过进程间的通讯方式来交互，一般使用 REST 或 gRPC。这样的交互方式需要以形式化的方式固定下来，就形成了开放 API，一个微服务的开放 API 对外部使用者屏蔽了服务内部的实现细节，同时也是外部使用者与之交互的唯一方式（当然，这里指的是微服务之间仅通过 API 来进行集成，如果使用异步事件来进行集成的话，这些事件也是交互方式）。由此可以看出，微服务 API 的重要性。从受众的角度来说，微服务API的使用者主要是其他微服务，也就是说，主要是应用内部的使用者，这一点与在线服务的 API 主要面向外部用户是不同的。除了其他微服务之外，应用的 Web 界面和移动客户端也需要使用微服务的 API，不过，它们一般通过 API 网关来使用微服务的 API。

<br />

由于微服务 API 的重要性，我们需要在很早的时候就得进行 API 的设计，也就是 API 优先的策略。

API 优先的策略
---------

如果你有过开发在线服务 API 的经验，会发现通常是先有实现，再有公开 API，这是因为在设计之前，并没有考虑到公开 API 的需求，而是之后才添加的公开 API。这种做法带来的结果就是，开放的 API 只是反映了当前的实际实现，而不是 API 应该有的样子。API 优先（API First）的设计方式，是把 API 的设计放在具体的实现之前，API 优先强调应该更多地从 API 使用者的角度来考虑 API 的设计。

<br />

在写下第一行实现的代码之前，API 的提供者和使用者应该对 API 进行充分的讨论，综合两方面的意见，最终确定 API 的全部细节，并以形式化的格式固定下来，成为 API 规范。在这之后，API 的提供者确保实际的实现满足 API 规范的要求，使用者则根据 API 规范来编写客户端实现。API 规范是提供者和使用者之间的契约，API 优先的策略已经应用在很多在线服务的开发中了。API 设计并实现出来之后，在线服务自身的 Web 界面和移动端应用，和其他第三方应用一样，都使用相同的 API 实现。

<br />

API 优先的策略，在微服务架构的应用实现中，有着更加重要的作用。这里有必要区分两类 API：一类是提供给其他微服务使用的 API，另一类是提供给 Web 界面和移动客户端使用的 API。在第 07 课时中介绍领域驱动设计的时候，我提到过界定的上下文的映射模式中的开放主机服务和公开语言，微服务与界定的上下文是一一对应的。如果把开放主机服务和公共语言结合起来，就得到了微服务的 API，公共语言就是 API 的规范。

<br />

从这里我们可以知道，第一类微服务 API 的目的是进行上下文映射，与第二类 API 的作用存在显著的不同。举例来说，乘客管理微服务提供了管理乘客的功能，包括乘客注册、信息更新和查询等。对于乘客 App 来说，这些功能都需要 API 的支持，其他微服务如果需要获取乘客信息，也必须调用乘客管理微服务的 API。这是为了把乘客这个概念在不同的微服务之间进行映射。

API 实现方式
--------

在 API 实现中，首要的一个问题是选择 API 的实现方式。理论上来说，微服务的内部 API 对互操作性的要求不高，可以使用私有格式。不过，为了可以使用服务网格，推荐使用通用的标准格式，下表给出了常见的 API 格式。除了使用较少的 SOAP 之外，一般在 REST 和 gRPC 之间选择。两者的区别在于，REST 使用文本格式，gRPC 使用二进制格式；两者在流行程度、实现难度和性能上存在不同。简单来说，REST 相对更加流行，实现难度较低，但是性能不如 gRPC。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/03/D7/CgoCgV6ZTAOAe8LCAAAmZRAsEQw388.png"/> 


<br />

本专栏的示例应用的 API 使用 REST 实现，不过会有一个课时专门来介绍 gRPC。下面介绍与 REST API 相关的 OpenAPI 规范。

OpenAPI 规范
----------

为了在 API 提供者和使用者之间更好的沟通，我们需要一种描述 API 的标准格式。对于 REST API 来说，这个标准格式由 OpenAPI 规范来定义。

<br />

OpenAPI 规范（OpenAPI Specification，OAS）是由 Linux 基金会旗下的 OpenAPI 倡议（OpenAPI Initiative，OAI）管理的开放 API 的规范。OAI 的目标是创建、演化和推广一种供应商无关的 API 描述格式。OpenAPI 规范基于 Swagger 规范，由 SmartBear 公司捐赠而来。

<br />

OpenAPI 文档描述或定义 API，OpenAPI 文档必须满足 OpenAPI 规范。OpenAPI 规范定义了 OpenAPI 文档的内容格式，也就是其中所能包含的对象及其属性。OpenAPI 文档是一个 JSON 对象，可以用 JSON 或 YAML 文件格式来表示。下面对 OpenAPI 文档的格式进行介绍，本课时的代码示例都使用 YAML 格式。

<br />

OpenAPI 规范中定义了几种基本类型，分别是 integer、number、string 和 boolean。对于每种基本类型，可以通过 format 字段来指定数据类型的具体格式，比如 string 类型的格式可以是 date、date-time 或 password。

<br />

下表中给出了 OpenAPI 文档的根对象中可以出现的字段及其说明，目前 OpenAPI 规范的最新版本是 3.0.3。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/11/06/Ciqah16ZTAOAAwW0AACP-qu5xrk547.png"/> 
  

### Info 对象

Info 对象包含了 API 的元数据，可以帮助使用者更好的了解 API 的相关信息。下表给出了 Info 对象中可以包含的字段及其说明。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/8A/1C/Cgq2xl6ZTAOAdpURAABX1Kfh-DM443.png"/> 


<br />

下面的代码是 Info 对象的使用示例。

<br />

```
title: 测试服务
description: 该服务用来进行简单的测试
termsOfService: http://myapp.com/terms/
contact:
  name: 管理员
  url: http://www.myapp.com/support
  email: support@myapp.com
license:
  name: Apache 2.0
  url: https://www.apache.org/licenses/LICENSE-2.0.html
version: 2.1.0
```

### Server 对象

Server 对象表示 API 的服务器，下表给出了 Server 对象中可以包含的字段及其说明。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/03/D7/CgoCgV6ZTAOABcF1AAA-57NeBGQ901.png"/> 


<br />

下面代码是 Server 对象的使用示例，其中服务器的 URL 中包含了 port 和 basePath 两个参数，port 是枚举类型，可选值是 80 和 8080。

<br />

```
url: http://test.myapp.com:{port}/{basePath}
description: 测试服务器
variables:
  port:
    enum:
      - '80'
      - '8080'
    default: '80'
  basePath:
    default: v2
```

### Paths 对象

Paths 对象中的字段是动态的。每个字段表示一个路径，以"/"开头，路径可以是包含变量的字符串模板。字段的值是 PathItem 对象，在该对象中可以使用 summary、description、servers 和 parameters 这样的通用字段，还可以使用 HTTP 方法名称，包括 get、put、post、delete、options、head、patch 和 trace，这些方法名称的字段，定义了对应的路径所支持的 HTTP 方法。

### Operation 对象

在 Paths 对象中，HTTP 方法对应的字段的值的类型是 Operation 对象，表示 HTTP 操作。下表给出了 Operation 对象中可以包含的字段及其说明，在这些字段中，比较常用的是 parameters、requestBody 和 responses。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/11/06/Ciqah16ZTAOAC-XoAAC9Yc_U9FY508.png"/> 
  

### Parameter 对象

Parameter 对象表示操作的参数。下表给出了 Parameter 对象中可以包含的字段及其说明。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/8A/1C/Cgq2xl6ZTAOANejbAADhE2FZLo4096.png"/> 


<br />

下面的代码是 Parameter 对象的使用示例，参数 id 出现在路径中，类型是 string。

<br />

```
name: id
in: path
description: 乘客ID
required: true
schema:
  type: string
```

### RequestBody 对象

RequestBody 对象表示 HTTP 请求的内容，下表给出了 RequestBody 对象中可以包含的字段及其说明。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/03/D7/CgoCgV6ZTAOAU9XxAAA4YbmwX3A208.png"/> 
  

### Responses 对象

Responses 对象表示 HTTP 请求的响应，该对象中的字段是动态的。字段的名称是 HTTP 响应的状态码，对应的值的类型是 Response 或 Reference 对象。下表给出了 Response 对象中可以包含的字段及其说明。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/11/06/Ciqah16ZTAOAHz9LAAB3y1Wy79M022.png"/> 
  

### Reference 对象

在对不同类型的对象描述中，字段的类型可以是 Reference 对象，该对象表示对其他组件的引用，其中只包含一个 $ref 字段来声明引用。引用可以是同一文档中的组件，也可以来自外部文件。在文档内部，可以在 Components 对象中定义不同类型的可复用组件，并由 Reference 对象来引用；文档内部的引用是以 # 开头的对象路径，比如 #/components/schemas/CreateTripRequest。

### Schema 对象

Schema 对象用来描述数据类型的定义，数据类型可以是简单类型、数组或对象类型，通过字段 type 可以指定类型，format 字段表示类型的格式。如果是数组类型，即 type 的值是 array，则需要通过字段 items 来表示数组中元素的类型；如果是对象类型，即 type 的值是 object，则需要通过字段 properties 来表示对象中属性的类型。

### 完整文档示例

下面是一个完整的 OpenAPI 文档示例。在 paths 对象中，定义了 3 个操作，操作的请求内容和响应格式的类型定义，都在 Components 对象的 schemas 字段中定义。操作的 requestBody 和 responses 字段都使用 Reference 对象来引用。

<br />

```
openapi: '3.0.3'
info:
  title: 行程服务
  version: '1.0'
servers:
  - url: http://localhost:8501/api/v1
tags:
  - name: trip
    description: 行程相关
paths:
  /:
    post:
      tags:
        - trip
      summary: 创建行程
      operationId: createTrip
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/CreateTripRequest"
        required: true      
      responses:
        '201':
          description: 创建成功
  /{tripId}:
    get:
      tags:
        - trip
      summary: 获取行程
      operationId: getTrip
      parameters:
        - name: tripId
          in: path
          description: 行程ID
          required: true
          schema:
            type: string
      responses:
        '200':
          description: 获取成功  
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/TripVO"
        '404':
          description: 找不到行程
  /{tripId}/accept:
    post:
      tags:
        - trip
      summary: 接受行程
      operationId: acceptTrip
      parameters:
        - name: tripId
          in: path
          description: 行程ID
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/AcceptTripRequest"
        required: true
      responses:
        '200':
          description: 接受成功
components:
  schemas:
    CreateTripRequest:
      type: object
      properties:
        passengerId:
          type: string   
        startPos:
          $ref: "#/components/schemas/PositionVO"
        endPos:
          $ref: "#/components/schemas/PositionVO"
      required:
        - passengerId
        - startPos
        - endPos
    AcceptTripRequest:
        type: object
        properties:
          driverId:
            type: string
          posLng:
            type: number
            format: double
          posLat:
            type: number
            format: double
        required:
          - driverId
          - posLng
          - posLat
    TripVO:
      type: object
      properties:
        id: 
          type: string
        passengerId:
          type: string
        driverId:
          type: string
        startPos:
          $ref: "#/components/schemas/PositionVO"
        endPos:
          $ref: "#/components/schemas/PositionVO"
        state:
          type: string                     
    PositionVO:
      type: object
      properties:
        lng:
          type: number
          format: double
        lat:
          type: number
          format: double 
        addressId:
          type: string 
      required:
        - lng
        - lat
```

OpenAPI 工具
----------

我们可以用一些工具来辅助 OpenAPI 规范相关的开发。作为 OpenAPI 规范的前身，Swagger 提供了很多与 OpenAPI 相关的工具。

### Swagger 编辑器

Swagger 编辑器是一个 Web 版的 Swagger 和 OpenAPI 文档编辑器。在编辑器的左侧是编辑器，右侧是 API 文档的预览。Swagger 编辑器提供了很多实用功能，包括语法高亮、快速添加不同类型的对象、生成服务器代码和生成客户端代码等。

<br />

使用 Swagger 编辑器时，可以直接使用[在线版本](https://editor.swagger.io/)，也可以在本地运行，在本地运行最简单的方式是使用 Docker 镜像 swaggerapi/swagger-editor。

<br />

下面的代码启动了 Swagger 编辑器的 Docker 容器，容器启动之后，通过 localhost:8000 访问即可。

<br />

```
docker run -d -p 8000:8080 swaggerapi/swagger-editor
```

<br />

下图是 Swagger 编辑器的界面。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/8A/1C/Cgq2xl6ZTASABJOwAAFARz_LfhM630.png"/> 


### Swagger 界面

Swagger 界面提供了一种直观的方式来查看 API 文档，并进行交互。通过该界面，可以直接发送 HTTP 请求到 API 服务器，并查看响应结果。

<br />

同样，我们可以用 Docker 来启动 Swagger 界面，如下面的命令所示。容器启动之后，通过 localhost:8010 来访问即可。

<br />

```
docker run -d -p 8010:8080 swaggerapi/swagger-ui
```

<br />

对于本地的 OpenAPI 文档，可以配置 Docker 镜像来使用该文档。假设当前目录中有 OpenAPI 文档 openapi.yml，则可以使用下面的命令来启动 Docker 镜像来展示该文档。

<br />

```
docker run -p 8010:8080 -e SWAGGER_JSON=/api/openapi.yml -v $PWD:/api swaggerapi/swagger-ui
```

<br />

下图是 Swagger 界面的截图。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/03/D7/CgoCgV6ZTASAXGi3AAH17b7200I115.png"/> 
  

### 代码生成

通过 OpenAPI 文档，可以利用 Swagger 提供的代码生成工具来自动生成服务器存根代码和客户端。代码生成时可以使用不同的编程语言和框架。

<br />

下面给出了代码生成工具所支持的编程语言和框架。

<br />

```
aspnetcore, csharp, csharp-dotnet2, go-server, dynamic-html, html, html2, java, jaxrs-cxf-client,
 jaxrs-cxf, inflector, jaxrs-cxf-cdi, jaxrs-spec, jaxrs-jersey, jaxrs-di, jaxrs-resteasy-eap, jaxrs-resteasy, micronaut
, spring, nodejs-server, openapi, openapi-yaml, kotlin-client, kotlin-server, php, python, python-flask, r, scala, scal
a-akka-http-server, swift3, swift4, swift5, typescript-angular, javascript
```

<br />

代码生成工具是一个 Java 程序，下载之后可以直接运行。在下载 JAR 文件 [swagger-codegen-cli-3.0.19.jar](https://repo1.maven.org/maven2/io/swagger/codegen/v3/swagger-codegen-cli/3.0.19/swagger-codegen-cli-3.0.19.jar) 之后，可以使用下面的命令来生成 Java 客户端代码，其中 -i 参数指定输入的 OpenAPI 文档，-l 指定生成的语言，-o 指定输出目录。

<br />

```
java -jar swagger-codegen-cli-3.0.19.jar generate -i openapi.yml -l java -o /tmp
```

<br />

除了生成客户端代码之外，还可以生成服务器存根代码。下面代码是生成 NodeJS 服务器存根代码：

<br />

```
java -jar swagger-codegen-cli-3.0.19.jar generate -i openapi.yml -l nodejs-server -o /tmp
```

总结
---

API 优先的策略保证了微服务的 API 在设计时，充分考虑到 API 使用者的需求，使得 API 成为提供者和使用者之间的良好契约。本课时首先介绍了 API 优先的设计策略，然后介绍了 API 的不同实现方式，接着介绍了 REST API 的 OpenAPI 规范，最后介绍了 OpenAPI 的相关工具。

