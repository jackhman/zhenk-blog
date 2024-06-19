# 16API：基于Servele构建弹性可扩展的RetfulAPI

今天我想和你聊一聊怎么基于 Serverless 构建弹性可扩展的 Restful API。

API 是使用 Serverless 最常见，也是最适合的场景之一。和 Serverful 架构的 API 相比，用 Serverless 开发 API 好处很多：

* 不用购买、管理服务器等基础设施，不用关心服务器的运维，节省人力成本；

* 基于 Serverless 的 API，具备自动弹性伸缩的能力，能根据请求流量弹性扩缩容，让你不再担心流量波峰、波谷；

* 基于 Serverless 的 API 按实际资源使用量来付费，节省财务成本。

因为好处很多，很多开发者跃跃欲试，但在实践过程中却遇到了很多问题，比如怎么设计最优的架构？怎么组织代码？怎么管理多个函数？所以今天我就以开发一个内容管理系统为例，带你学习怎么基于 Serverless 去开发一个 Restful API，解决上述共性问题。

首先，我们需要对内容管理系统进行架构设计。

### 内容管理系统的架构设计

在进行架构设计前，你要明确系统的需求。对于一个内容管理系统，最核心的功能（也是这一讲要实现的功能），主要有这样几个：

* 用户注册；

* 用户登录；

* 发布文章；

* 修改文章；

* 删除文章；

* 查询文章。

这 6 个功能分别对应了我们要实现的 Restful API。为了方便统一管理 API，在 Serverless 架构中我们通常会用到 API 网关，通过 API 网关触发函数执行，并且基于 API 网关我们还可以实现参数控制、超时时间、IP 黑名单、流量控制等高级功能。

对于文章管理相关的 Restful API，用户发布文章前需要先登录，在 15 讲，你已经知道在 Serverless 中可以用 JWT 进行身份认证，咱们的管理系统中的登录注册功能也将沿用上一讲的内容。

在传统的 Serverful 架构中，通常会用 MySQL 等关系型数据库存储数据，但因为关系型数据库要在代码中维护连接状态及连接池，且一般不能自动扩容，并不适合 Serverless 应用，所以在 Serverless 架构中，通常选用表格存储等 Serverless NoSQL 数据来存储数据。

基于 JWT 的身份认证方案、数据存储方案，我们可以画出 Serverless 的内容管理系统架构图：


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image2/M01/0C/35/CgpVE2AXxXCASAwbAAKdD1n4Tyk774.png"/> 


**图中主要表达的意思是：** 通过 API 网关承接用户请求，并驱动函数执行。每个函数分别实现一个具体功能，并通过 JWT 实现身份认证，最后表格存储作为数据库。

其中，数据库中存储的数据主要是用户数据和文章数据。假设用户有 username（用户名） 和 password（密码） 两个属性；文章有 article_id（文章 ID）、username（创建者）、title（文章标题）、content（文章内容）、create_date（创建时间）、update_date（更新时间）这几个属性。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image2/M01/0C/35/CgpVE2AXxXyAUsksAAD9II6PlcU787.png"/> 


接下来，你可以在表格存储中创建对应的数据表（你可以在表格存储控制台创建，也可以直接用我提供的这段代码进行创建）：

```javascript
// index.js
const TableStore = require("tablestore");
// 初始化 TableStore client
const client = new TableStore.Client({
  accessKeyId: '<your access key>',
  accessKeySecret: '<your access secret>',
  endpoint: "https://serverless-app.cn-shanghai.ots.aliyuncs.com",
  instancename: "serverless-cms",
});
/**
 * 创建 user 表
 *
 * 参考文档： https://help.aliyun.com/document_detail/100594.html
 */
async function createUserTable() {
  const table = {
    tableMeta: {
      tableName: "user",
      primaryKey: [
        {
          name: "username", // 用户名
          type: TableStore.PrimaryKeyType.STRING,
        },
      ],
      definedColumn: [
        {
          name: "password", // 密码
          type: TableStore.DefinedColumnType.DCT_STRING,
        },
      ],
    },
    // 为数据表配置预留读吞吐量或预留写吞吐量。0 表示不预留吞吐量，完全按量付费
    reservedThroughput: {
      capacityUnit: {
        read: 0,
        write: 0,
      },
    },
    tableOptions: {
      // 数据的过期时间，单位为秒，-1表示永不过期
      timeToLive: -1,
      // 保存的最大版本数，1 表示每列上最多保存一个版本即保存最新的版本
      maxVersions: 1,
    },
  };
  await client.createTable(table);
}
/**
 * 创建文章表
 */
async function createArticleTable() {
  const table = {
    tableMeta: {
      tableName: "article",
      primaryKey: [
        {
          name: "article_id", // 文章 ID，唯一字符串
          type: TableStore.PrimaryKeyType.STRING,
        },
      ],
      definedColumn: [
        {
          name: "title",
          type: TableStore.DefinedColumnType.DCT_STRING,
        },
        {
          name: "username",
          type: TableStore.DefinedColumnType.DCT_STRING,
        },
        {
          name: "content",
          type: TableStore.DefinedColumnType.DCT_STRING,
        },
        {
          name: "create_date",
          type: TableStore.DefinedColumnType.DCT_STRING,
        },
        {
          name: "update_date",
          type: TableStore.DefinedColumnType.DCT_STRING,
        },
      ],
    },
    // 为数据表配置预留读吞吐量或预留写吞吐量。0 表示不预留吞吐量，完全按量付费
    reservedThroughput: {
      capacityUnit: {
        read: 0,
        write: 0,
      },
    },
    tableOptions: {
      // 数据的过期时间，单位为秒，-1表示永不过期
      timeToLive: -1,
      // 保存的最大版本数，1 表示每列上最多保存一个版本即保存最新的版本
      maxVersions: 1,
    },
  };
  await client.createTable(table);
}
(async function () {
    await createUserTable();
  await createArticleTable();
})();
```

这段代码主要创建了 user 和 article 两张表，其中 user 表的主键是 username，article 表的主键是 article_id，主键的作用是方便查询。除了主键，我还定义了几个列。其实对于表格存储，默认也可以不创建列，表格存储是宽表，除主键外，数据列可以随意扩展。

在完成了数据库表的创建后，我们就可以开始进行系统实现了。

### 内容管理系统的实现

为了方便你学习，我为你提供了完整代码（[代码地址](https://github.com/nodejh/serverless-class/tree/master/15/cms)），你可以参考着学习。

```java
$ git clone https://github.com/nodejh/serverless-class
$ cd 15/cms
```

整个代码目录结构如下：

```java
.
├── package.json
├── src
│   ├── config
│   │   └── index.js
│   ├── db
│   │   └── client.js
│   ├── function
│   │   ├── article
│   │   │   ├── create.js
│   │   │   ├── delete.js
│   │   │   ├── detail.js
│   │   │   └── update.js
│   │   └── user
│   │       ├── login.js
│   │       └── register.js
│   └── middleware
│       └── auth.js
└── template.yml
```

其中，所有业务代码都放在 src 目录中：

* config/index.js 是配置文件，里面包含身份凭证等配置信息；

* db/client.js 对表格存储的增删改查操作进行了封装，方便在函数中使用（将数据库的操作封装还有一个好处是，如果你之后想要迁移到其他数据库，只要修改 db/client.js 中的逻辑，不用修改业务代码）；

* middleware 目录中是一些中间件，比如 auth.js，用于身份认证；

* functions 目录中就是所有函数，登录、注册、创建文章等，每个功能分别对应一个函数；

* template.yaml 是应用配置文件，包括函数和 API 网关的配置。

根据前面梳理的系统功能，我们需要实现以下几个 API：

| 用户注册 |        POST /user/register         |
|------|------------------------------------|
| 用户登录 | POST /user/login                   |
| 发布文章 | POST /article/create               |
| 查询文章 | GET /article/detail/\[article_id\] |
| 更新文章 | POST /article/update               |
| 删除文章 | PUT /article/delete/\[article_id\] |

每个 API 对应一个具体的函数，每个函数也都有一个与之对应的 API 网关触发器。由于这些函数属于同一个应用，所以我们可以通过一个 template.yaml 来定义所有函数。同时也可以在 template.yaml 中定义函数的 API 网关触发器，这样部署函数时，就会自动创建 API 网关。

内容管理系统的 template.yaml 格式如下：

```yaml
ROSTemplateFormatVersion: '2015-09-01'
Transform: 'Aliyun::Serverless-2018-04-03'
Resources:
  # 函数服务，该服务中的函数都是内容管理系统的函数
  serverless-cms:
    Type: 'Aliyun::Serverless::Service'
    Properties:
      Description: 'Serverless 内容管理系统'
    # 函数名称
    [functionName]:
      Type: 'Aliyun::Serverless::Function'
      Properties:
        # 函数路径
        Handler: <functionPath>.handler
        Runtime: nodejs12
        CodeUri: './'
  # API 网关分组，分钟中的所有 API 都是内容管理系统的 API
  ServerlessCMSGroup: 
    Type: 'Aliyun::Serverless::Api'
    Properties:
      StageName: RELEASE
      DefinitionBody:
        <Path>: # 请求的 path
          post: # 请求的 method
            x-aliyun-apigateway-api-name: user_register # API 名称
            x-aliyun-apigateway-fc: # 当请求该 API 时，要触发的函数，
              arn: acs:fc:::services/${serverless-cms.Arn}/functions/${<functionName>.Arn}/
              timeout: 3000
```

**template.yaml 主要分为两部分：** 函数定义和 API 网关定义，每个函数都有一个与之对应的 API 网关。我们用 serverless-cms 服务来表示内容管理系统这个应用，服务内的所有函数都是内容管理系统的函数。同理，ServerlessCMSGroup 这个 API 网关分组中的所有 API 都是内容管理系统的 API。

完整的 template.yaml 配置如下：

```yaml
ROSTemplateFormatVersion: '2015-09-01'
Transform: 'Aliyun::Serverless-2018-04-03'
Resources:
  # 函数服务
  serverless-cms:
    Type: 'Aliyun::Serverless::Service'
    Properties:
      Description: 'Serverless 内容管理系统'
    user-register:
      Type: 'Aliyun::Serverless::Function'
      Properties:
        Handler: src/function/user/register.handler
        Runtime: nodejs12
        CodeUri: './'
    user-login:
      Type: 'Aliyun::Serverless::Function'
      Properties:
        Handler: src/function/user/login.handler
        Runtime: nodejs12
        CodeUri: './'
    article-create:
      Type: 'Aliyun::Serverless::Function'
      Properties:
        Handler: src/function/article/create.handler
        Runtime: nodejs12
        CodeUri: './'
    article-detail:
      Type: 'Aliyun::Serverless::Function'
      Properties:
        Handler: src/function/article/detail.handler
        Runtime: nodejs12
        CodeUri: './'
    article-update:
      Type: 'Aliyun::Serverless::Function'
      Properties:
        Handler: src/function/article/update.handler
        Runtime: nodejs12
        CodeUri: './'
    article-delete:
      Type: 'Aliyun::Serverless::Function'
      Properties:
        Handler: src/function/article/delete.handler
        Runtime: nodejs12
        CodeUri: './'
  # API 网关分组
  ServerlessCMSGroup: 
    Type: 'Aliyun::Serverless::Api'
    Properties:
      StageName: RELEASE
      DefinitionBody:
        '/user/register': # 请求的 path
          post: # 请求的 method
            x-aliyun-apigateway-api-name: user_register # API 名称
            x-aliyun-apigateway-fc: # 当请求该 API 时，要触发的函数，
              arn: acs:fc:::services/${serverless-cms.Arn}/functions/${user-register.Arn}/
              timeout: 3000
        '/user/login':
          post:
            x-aliyun-apigateway-api-name: user_login
            x-aliyun-apigateway-fc:
              arn: acs:fc:::services/${serverless-cms.Arn}/functions/${user-login.Arn}/
              timeout: 3000
        '/article/create':
          post:
            x-aliyun-apigateway-api-name: article_create
            x-aliyun-apigateway-fc:
              arn: acs:fc:::services/${serverless-cms.Arn}/functions/${article-create.Arn}/
              timeout: 3000
        '/article/detail/[article_id]':
          GET:
            x-aliyun-apigateway-api-name: article_detail
            x-aliyun-apigateway-request-parameters:
              - apiParameterName: 'article_id'
                location: 'Path'
                parameterType: 'String'
                required: 'REQUIRED'
            x-aliyun-apigateway-fc:
              arn: acs:fc:::services/${serverless-cms.Arn}/functions/${article-detail.Arn}/
              timeout: 3000
        '/article/update/[article_id]':
          PUT:
            x-aliyun-apigateway-api-name: article_update
            x-aliyun-apigateway-request-parameters:
              - apiParameterName: 'article_id'
                location: 'Path'
                parameterType: 'String'
                required: 'REQUIRED'
            x-aliyun-apigateway-fc:
              arn: acs:fc:::services/${serverless-cms.Arn}/functions/${article-update.Arn}/
              timeout: 3000
        '/article/delete/[article_id]':
          DELETE:
            x-aliyun-apigateway-api-name: article_update
            x-aliyun-apigateway-request-parameters:
              - apiParameterName: 'article_id'
                location: 'Path'
                parameterType: 'String'
                required: 'REQUIRED'
            x-aliyun-apigateway-fc:
              arn: acs:fc:::services/${serverless-cms.Arn}/functions/${article-delete.Arn}/
              timeout: 3000
            
```

在这份配置中，需要注意两个地方：

* 函数的 Handler 配置，Handler 可以写函数路径，比如`src/function/user/register.handler`表示`src/function/user/`目录中的 register.js 文件中的 handler 方法；

* API 网关配置中的`/article/detail/[article_id]`Path，这种带参数的 PATH，必须使用`x-aliyun-apigateway-request-parameters`指定 Path 参数。

接下来，我们就来实现内容管理系统的各个 API，也就是 template.yaml 中定义的各个函数。

#### 用户注册

用户注册接口定义如下。

* 请求方法：POST。

* Path：`/user/register`

* Body参数：username 用户名、password 密码。

整体代码很简单，在入口函数 handler 中，通过 event 得到 API 网关传递过来的 HTTP 请求 body 数据，然后从中得到 username、password，再将用户信息写入数据库。

```javascript
// src/function/user/register
const client = require("../../db/client");
/**
 * 用户注册
 * @param {string} username 用户名
 * @param {string} password 密码
 */
async function register(username, password) {
  await client.createRow("user", { username }, { password });
}
module.exports.handler = function (event, context, callback) {
  // 从 event 中获取 API 网关传递 HTTP 请求 body 数据
  const body = JSON.parse(JSON.parse(event.toString()).body);
  const { username, password } = body;
  register(username, password)
    .then(() => callback(null, { success: true }))
    .catch((error) =>
      callback(error, { success: false, message: "用户注册失败" })
    );
};
```

代码完成后，就可以将应用部署到函数计算：

```java
# 部署应用
$ fun deploy
Waiting for service serverless-cms to be deployed...
...
service serverless-cms deploy success
Waiting for api gateway ServerlessCMSGroup to be deployed...
...
api gateway ServerlessCMSGroup deploy success
```

部署过程中，如果看到函数服务 serverless-cms 和 API 网关 ServerlessCMSGroup 都成功部署了，就说明应用部署完成。部署完成后，API 网关会提供一个用来测试的 API Endpoint，当然你也可以绑定自定义域名。

我们可以通过 curl 测试一下：

```java
$ curl http://a88f7e84f71749958100997b77b3e2f6-cn-beijing.alicloudapi.com/user/register \
-X POST \
-d "username=Jack&password=123456"
{"success":true}
```

返回 `{"success": true}` ，说明用户注册成功。这时在表格存储控制台也可以看到刚注册的用户。


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image/M00/94/46/CgqCHmAXxaeAe89-AADufUP1UJA961.png"/> 


#### 用户登录

完成用户注册函数开发后，就可以接着开发登录。用户登录的接口定义如下。

* 请求方法：POST。

* Path：`/user/login`

* Body 参数：username 用户名、password 密码。

登录的逻辑就是根据用户输入的密码是否正确，如果正确就生成一个 token 返回给调用方。代码实现如下：

```javascript
// src/function/user/login
const assert = require("assert");
const jwt = require('jsonwebtoken');
const { jwt_secret } = require("../../config");
const client = require("../../db/client");
/**
 * 用户登录
 * @param {string} username 用户名
 * @param {string} password 密码
 */
async function login(username, password) {
  const user = await client.getRow("user", { username });
  assert(user && user.password === password);
  const token = jwt.sign({ username: user.username }, jwt_secret);
  return token;
}
module.exports.handler = function (event, context, callback) {
  const body = JSON.parse(JSON.parse(event.toString()).body);
  const { username, password } = body;
  login(username, password)
    .then((token) => callback(null, { success: true, data: { token } }))
    .catch((error) =>
      callback(error, { success: false, message: "用户登录失败" })
    );
};
```

将其部署到函数计算后，我们也可以使用 curl 命令进行测试：

```java
$ curl http://a88f7e84f71749958100997b77b3e2f6-cn-beijing.alicloudapi.com/user/login \
-X POST \
-d "username=Jack&password=123456"
{"success":true,"data":{"token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IkphY2siLCJpYXQiOjE2MTE0OTI2ODF9.c56Xm4RBLYl5yVtR_Vk0IZOL0yijofcyE-P7vjKf4nA"}}
```

#### 身份认证

在完成了注册登录接口后，我们再来看一下内容管理系统中，身份认证应该怎么实现。

在 15 讲，我们实现了一个 Express.js 框架的身份认证中间件，用来拦截所有请求，身份认证通过后才能进执行后面的代码逻辑。在内容管理系统中，你也可以参考 Express.js 的思想，实现一个 auth.js 专门用于身份认证，代码如下：

```javascript
// src/middleware/auth.js
const jwt = require("jsonwebtoken");
const { jwt_secret } = require("../config/index");
/**
 * 身份认证
 * @param {object} event API 网关的 event 对象
 * @return {object} 认证通过后返回 user 信息；认证失败则返回 false
 */
const auth = function (event) {
  try {
    const data = JSON.parse(event.toString());
    if (data.headers && data.headers.Authorization) {
      const token = JSON.parse(event.toString())
        .headers.Authorization.split(" ")
        .pop();
      const user = jwt.verify(token, jwt_secret);
      return user;
    }
    return false;
  } catch (error) {
    return false;
  }
};
module.exports = auth;
```

其原理很简单，就是从 API 网关的 event 对象中获取 token，然后验证 token 是否正常。如果认证通过，就返回 user 信息，失败就返回 false。

这样在需要身份认证的函数中，你只引入 auth.js 并传入 event 对象就可以了。下面是一个简单的示例：

```javascript
const auth = require('./middleware/auth');
module.exports.handler = function (event, context, callback) {
  // 使用 auth 进行身份认证
  const user = auth(event);
  if (!user) {
    // 若认证失败则直接返回
    return callback('身份认证失败!')
  }
  // 通过身份认证后的业务逻辑
  // ...
  callback(null);
};
```

除了登录注册，其他接口都需要身份认证，所以接下来我们就通过实现"发布文章"函数来实际使用 auth.js。

#### 发布文章

发布文章的接口定义如下。

* 请求方法：POST。

* Path：`/article/create`

* Headers 参数: Authorization token。

* Body 参数：title、content。

由于登录后才能发布文章，所以要先通过登录接口获取 token，然后调用 `/article/create` 接口时，再将 token 放在 HTTP Headers 参数中。发布文章的代码实现如下：

```javascript
// src/function/article/auth
const uuid = require("uuid");
const auth = require("../../middleware/auth");
const client = require("../../db/client");
/**
 * 创建文章
 * @param {string} username 用户名
 * @param {string} title 文章标题
 * @param {string} content 文章内容
 */
async function createArticle(username, title, content) {
  const article_id = uuid.v4();
  const now = new Date().toLocaleString();
  await client.createRow(
    "article",
    {
      article_id,
    },
    {
      username,
      title,
      content,
      create_date: now,
      update_date: now,
    }
  );
  return article_id;
}
module.exports.handler = function (event, context, callback) {
  // 身份认证
  const user = auth(event);
  if (!user) {
    // 若认证失败则直接返回
    return callback("身份认证失败");
  }
  // 从 user 中获取 username
  const { username } = user;
  const body = JSON.parse(JSON.parse(event.toString()).body);
  const { title, content } = body;
  createArticle(username, title, content)
    .then(() =>
      callback(null, {
        success: true,
      })
    )
    .catch((error) =>
      callback(error, {
        success: false,
        message: "创建文章失败",
      })
    );
};
```

首先是使用 auth.js 进行身份认证，认证通过后就可以从 user 中获取 username。然后再从请求体中获取文章标题和文章内容数据，将其存入数据库。

接下来我们依旧可以将函数部署和使用 curl 进行测试：

```java
$ curl http://a88f7e84f71749958100997b77b3e2f6-cn-beijing.alicloudapi.com/article/create \
-X POST \
-d "title=这是文章标题&content=内容内容内容......" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IkphY2siLCJpYXQiOjE2MTE0OTI2ODF9.c56Xm4RBLYl5yVtR_Vk0IZOL0yijofcyE-P7vjKf4nA"
{"success":true,"data":{"article_id":"d4b9bad8-a0ed-499d-b3c6-c57f16eaa193"}}
```

在测试时，我们需要将 token 放在 HTTP 请求头的 Authorization 属性中。文章发布成功后，你就可以在表格存储中看到对应的数据了。


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image/M00/94/3B/Ciqc1GAXxceARRiPAACAwtaSp94526.png"/> 


#### 查询文章

发布文章的接口开发完成后，我们继续开发一个查询文章的接口，这样就可以查询出刚才创建的文章。查询文章接口定义如下。

* 请求方法：GET。

* Path：`/article/detail/[article_id]`

* Headers 参数: Authorization token。

在查询文章接口中，我们需要在 Path 中定义文章 ID 参数，即 article_id。这样在函数代码中，你就可以通过 event 对象的 pathParameters 中获取 article_id 参数，然后根据 article_id 来查询文章详情了。完整代码如下：

```javascript
const uuid = require("uuid");
const auth = require("../../middleware/auth");
const client = require("../../db/client");
/**
 * 获取文章详情
 * @param {string} title 文章 ID
 */
async function getArticle(article_id) {
  const res = await client.getRow(
    "article",
    {
      article_id,
    },
  );
  return res;
}
module.exports.handler = function (event, context, callback) {
  // 身份认证
  const user = auth(event);
  if (!user) {
    // 若认证失败则直接返回
    return callback("身份认证失败");
  }
  
  // 从 event 对象中获取文章 ID
  const article_id = JSON.parse(event.toString()).pathParameters['article_id'];
  getArticle(article_id)
    .then((detail) =>
      callback(null, {
        success: true,
        data: detail
      })
    )
    .catch((error) =>
      callback(error, {
        success: false,
        message: "创建文章失败",
      })
    );
};
```

开发完成后，我们可以将其部署到函数计算，再用 curl 命令进行测试：

```java
$ curl http://a88f7e84f71749958100997b77b3e2f6-cn-beijing.alicloudapi.com/article/detail/d4b9bad8-a0ed-499d-b3c6-c57f16eaa193 \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IkphY2siLCJpYXQiOjE2MTE0OTI2ODF9.c56Xm4RBLYl5yVtR_Vk0IZOL0yijofcyE-P7vjKf4nA"
{"success":true,"data":{"article_id":"d4b9bad8-a0ed-499d-b3c6-c57f16eaa193","content":"内容内容内容......","create_date":"1/24/2021, 2:05:46 PM","title":"这是文章标题","update_date":"1/24/2021, 2:05:46 PM","username":"Jack"}}
```

如上所示，查询文章的接口按照预期返回了文章详情。

#### 更新文章

更新文章的 API Path 参数和查询文章一样，都需要 Path 中定义 article_id。而其 body 参数则与创建文章相同。此外，更新文章的请求 method 是 PUT，因为在 Restful API 规范中，我们通常使用 POST 来表示创建， 使用 PUT 来表示更新。

更新文章的接口定义如下。

* 请求方法：PUT。

* Path：`/article/update/[article_id]`

* Headers 参数: Authorization token。

* Body 参数：title、content。

更新文章的逻辑就是根据 article_id 去更新一行数据。代码如下：

```javascript
const auth = require("../../middleware/auth");
const client = require("../../db/client");
/**
 * 更新文章
 * @param {string} article_id 待更新的文章 ID
 * @param {string} title 文章标题
 * @param {string} content 文章内容
 */
async function updateArticle(article_id, title, content) {
  const now = new Date().toLocaleString();
  await client.updateRow(
    "article",
    {
      article_id,
    },
    {
      title,
      content,
      update_date: now,
    }
  );
}
module.exports.handler = function (event, context, callback) {
  // 身份认证
  const user = auth(event);
  if (!user) {
    // 若认证失败则直接返回
    return callback("身份认证失败");
  }
  const eventObject = JSON.parse(event.toString())
  // 从 event 对象的 pathParameters 中获取 Path 参数
  const article_id = eventObject.pathParameters['article_id'];
  const body = JSON.parse(eventObject.body);
  // 从 event 对象的 body 中获取请求体参数
  const { title, content } = body;
  updateArticle(article_id, title, content)
    .then(() =>
      callback(null, {
        success: true,
      })
    )
    .catch((error) =>
      callback(error, {
        success: false,
        message: "更新文章失败",
      })
    );
};
```

开发并部署完成后，使用 curl 命令进行测试：

```java
$ curl http://a88f7e84f71749958100997b77b3e2f6-cn-beijing.alicloudapi.com/article/update/d4b9bad8-a0ed-499d-b3c6-c57f16eaa193 \
-X PUT \
-d "title=这是文章标题&content=更新的内容......" \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IkphY2siLCJpYXQiOjE2MTE0OTI2ODF9.c56Xm4RBLYl5yVtR_Vk0IZOL0yijofcyE-P7vjKf4nA"
{"success":true}
```

返回 `{"success":true}` 则说明更新成功。

#### 删除文章

最后就还是一个删除文章的 API 了。删除文章的 API 也需要在 Path 中定义 article_id 参数，并且其 HTTP method 是 DELETE。具体接口定义如下。

* 请求方法：DELETE。

* Path：`/article/delete/[article_id]`

* Headers 参数: Authorization token，

删除文章很简单，就是根据 article_id 删除一行数据，代码如下：

```javascript
const uuid = require("uuid");
const auth = require("../../middleware/auth");
const client = require("../../db/client");
/**
 * 删除文章
 * @param {string} title 文章 ID
 */
async function deleteArticle(article_id) {
  const res = await client.deleteRow(
    "article",
    {
      article_id,
    },
  );
  return res;
}
module.exports.handler = function (event, context, callback) {
  // 身份认证
  const user = auth(event);
  if (!user) {
    // 若认证失败则直接返回
    return callback("身份认证失败");
  }
  
  // 从 event 对象中获取文章 ID
  const article_id = JSON.parse(event.toString()).pathParameters['article_id'];
  deleteArticle(article_id)
    .then(() =>
      callback(null, {
        success: true,
      })
    )
    .catch((error) =>
      callback(error, {
        success: false,
        message: "删除文章失败",
      })
    );
};
```

同样我们可以通过 curl 命令进行测试：

```java
curl http://a88f7e84f71749958100997b77b3e2f6-cn-beijing.alicloudapi.com/article/delete/d4b9bad8-a0ed-499d-b3c6-c57f16eaa193 \
-X DELETE \
-H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6IkphY2siLCJpYXQiOjE2MTE0OTI2ODF9.c56Xm4RBLYl5yVtR_Vk0IZOL0yijofcyE-P7vjKf4nA"
{"success":true}
```

删除成功后，再去表格存储中就找不到这行记录了。至此，内容管理系统的 Restful API 就开发完毕了。

### 总结

可以看到，基于 Serverless 开发 Restful API 的整个代码非常简单，每个函数只负责一个独立的业务，职责单一、逻辑清晰。关于这一讲，我想强调这样几个重点：

* 基于 Serverless 开发 API 时，建议你使用 API 网关进行 API 的管理；

* 对于数据库等第三方服务，建议对其基本操作进行封装，这样更方便进行扩展；

* Serverless 函数需要保持简单、独立、单一职责。

最后，我留给你的作业就是，亲自动手实现一个基于 Serverless 的具有 Restful API 的内容管理系统。我们下一讲见。

