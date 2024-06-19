# 17SSR：使用React.j开发Serverle服务端渲染应用

今天我想和你聊一聊怎么用 Serverless 开发一个服务端渲染（SSR）应用。

对前端工程师来说，Serverless 最大的应用场景之一就是开发服务端渲染（SSR）应用。因为传统的服务端渲染应用要由前端工程师负责服务器的运维，但往往前端工程师并不擅长这一点，基于 Serverless 开发服务端渲染应用的话，就可以减轻这个负担。希望你学完今天的内容之后，能够学会如何去使用 Serverless 开发一个服务端渲染应用。

话不多说，我们开始今天的学习。

### 基于 Serverless 的服务端渲染架构

现在的主流前端框架是 React.js、Vue.js 等，基于这些框架开发的都是单页应用，其渲染方式都是客户端渲染：代码开发完成后，构建出一个或多个 JS 资源，页面渲染时加载这些 JS 资源，然后再执行 JS 渲染页面。虽然这些框架可以极大提升前端开发效率，但也带来了一些新的问题。

* **不利于 SEO：** 页面源码不再是HTML，而是渲染 HTML 的 JavaScript，这就导致搜索引擎爬虫难以解析其中的内容；

* **初始化性能差：** 通常单元应用的 JS 文件体积都比较大、加载耗时比较长，导致页面白屏。

为了解决这些问题，很多框架和开发者就开始尝试服务端渲染的方式：页面加载时，由服务端先生成 HTML 返回给浏览器，浏览器直接渲染 HTML。在传统的服务端渲染架构中，通常需要前端同学使用 Node.js 去实现一个服务端的渲染应用。在应用内，每个请求的 path 对应着服务端的每个路由，由该路由实现对应 path 的 HTML 文档渲染：


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image/M00/94/3B/Ciqc1GAXxlCABEjhAAGFmUrRE68475.png"/> 
  
传统服务端渲染架构

对前端工程师来说，要实现一个服务端渲染应用，通常面临着一些问题：

* 部署服务端渲染应用需要购买服务器，并配置服务器环境，要对服务器进行运维；

* 需要关注业务量，考虑有没有高并发场景、服务器有没有扩容机制；

* 需要实现负载均衡、流量控制等复杂后端能力等。

开篇我也提到，而且是服务端的工作，很多前端同学都不擅长，好在有了 Serverless。

用 Serverless 做服务端渲染，就是将以往的每个路由，都拆分为一个个函数，再在 FaaS 上部署对应的函数，这样用户请求的 path，对应的就是每个单独的函数。通过这种方式，就将运维操作转移到了 FaaS 平台，前端同学开发服务端渲染应用，就再也不用关心服务端程序的运维部署了。并且在 FaaS 平台中运行的函数，天然具有弹性伸缩的能力，你也不用担心流量波峰波谷了。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image/M00/94/46/CgqCHmAXxluARkcHAAF-S8PNwUE730.png"/> 
  
基于 Serverless 的服务选渲染架构

如图所示，FaaS 函数接收请求后直接执行代码渲染出 HTML 并返回给浏览器，这是最基本的架构，虽然它可以满足大部分场景，但要追求极致的性能，你通常要加入缓存。


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image/M00/94/3B/Ciqc1GAXxmOATGYqAAGjC4CgYTw981.png"/> 
  
进阶版基于 Serverless 的服务端渲染架构

首先我们会使用 CDN 做缓存，基于 CDN 的缓存可以减少函数执行次数，进而避免函数冷启动带来的性能损耗。如果 CDN 中没有 SSR HTML 页面的缓存，则继续由网关处理请求，网关再去触发函数执行。

函数首先会判读缓存数据库中是否有 SSR HTML 的缓存，如果有直接返回；如果没有再渲染出 HTML 并返回。基于数据库的缓存，可以减少函数渲染 HTML 的时间，从而页面加载提升性能。

讲了这么多，具体怎么基于 Serverless 实现一个服务端渲染应用呢？

### 实现一个 Serverless 的服务端渲染应用

在 16 讲中，我们实现了一个内容管理系统的 Restful API，但没有前端界面，所以今天我们的目标就基于 Serverless 实现一个内容管理系统的前端界面（如图所示）。


<Image alt="ssr.gif" src="https://s0.lgstatic.com/i/image/M00/94/3B/Ciqc1GAXxoiANTROADtU9yybMQY209.gif"/> 


该应用主要包含两个页面：

* 首页，展示文章列表；

* 详情页，展示文章详情。

为了方便你进行实践，我为你提供了一份示例代码，你可以直接下载并使用：

```java
# 下载代码
$ git clone https://github.com/nodejh/serverless-class
# 进入服务端渲染应用目录
$ cd 16/serverless-ssr-cms
```

代码结构如下：

```java
.
├── config.js
├── f.yml
├── package-lock.json
├── package.json
├── src
│   ├── api.ts
│   ├── config
│   │   └── config.default.ts
│   ├── configuration.ts
│   ├── index.ts
│   ├── interface
│   │   ├── detail.ts
│   │   └── index.ts
│   ├── mock
│   │   ├── detail.ts
│   │   └── index.ts
│   ├── render.ts
│   └── service
│       ├── detail.ts
│       └── index.ts
├── tsconfig.json
├── tsconfig.lint.json
└── web
    ├── @types
    │   └── global.d.ts
    ├── common.less
    ├── components
    │   ├── layout
    │   │   ├── index.less
    │   │   └── index.tsx
    │   └── title
    │       ├── index.less
    │       └── index.tsx
    ├── interface
    │   ├── detail-index.ts
    │   ├── index.ts
    │   └── page-index.ts
    ├── pages
    │   ├── detail
    │   │   ├── fetch.ts
    │   │   ├── index.less
    │   │   └── render$id.tsx
    │   └── index
    │       ├── fetch.ts
    │       ├── index.less
    │       └── render.tsx
    └── tsconfig.json
```

文件很多，不过不用担心，你只需重点关注 web/pages/ 和 src/service 两个目录：

* web/ 目录中主要是前端页面的代码， web/pages/ 中的文件分别对应着我们要实现的 index（首页）和 detail（详情页）两个页面，这两个页面会使用到 components 目录中的公共组件；

* src/ 目录中主要是后端代码，src/service 目录中的 index.ts 和 detail.ts 则定义了两个页面分别需要用到的接口，为了简单起见，接口数据我使用了 src/mock/ 目录中的 mock 数据。

当我一个人又负责前端页面也负责后端接口的开发时，通常习惯先实现接口，再开发前端页面，这样方便调试。接下来就让我们看一下具体是怎么实现的。

#### 首页接口的实现

其源码在 src/service/index.ts 文件中，代码如下：

```typescript
// src/service/index.ts
import { provide } from '@midwayjs/faas'
import { IApiService } from '../interface'
import mock from '../mock'
@provide('ApiService')
export class ApiService implements IApiService {
  async index (): Promise<any> {
    return await Promise.resolve(mock)
  }
}
```

这段代码实现了一个 ApiService 类以及 index 方法，该方法会返回首页的文章列表。数据结构如下：

```json
{
    "data":[
        {
            "id":"3f8a198c-60a2-11eb-8932-9b95cd7afc2d",
            "title":"开篇词：Serverless 大热，程序员面临的新机遇与挑战",
            "content":"可能你会认为 Serverless 是最近两年兴起的技术......",
            "date":"2020-12-23"
        },
        {
            "id":"5158b100-5fee-11eb-9afa-9b5f85523067",
            "title":"基础入门：编写你的第一个 Serverless 应用",
            "content":"学习一门新技术，除了了解其基础概念，更重要的是把理论转化为实践...",
            "date":"2020-12-29"
        }
    ]
}
```

在进行服务端渲染时，你可以通过 ctx 获取到 ApiService 实例，进而调用其中的方法，获取文章列表数据。此外，ApiService 也会被 src/api.ts 调用，src/api.ts 则直接对外提供了 HTTP 接口。

#### 首页页面的实现

有了接口后，我们就可以继续实现首页的前端页面了。首页页面的代码在 web/pages/ 目录中，该目录下有三个文件：

* fetch.ts，获取首页数据；

* render.tsx 首页页面 UI 组件代码；

* index.less 样式代码。

首先来看一下 fetch.ts：

```typescript
// web/pages/index/fetch.ts
import { IFaaSContext } from 'ssr-types'
import { IndexData } from '@/interface'
interface IApiService {
  index: () => Promise<IndexData>
}
export default async (ctx: IFaaSContext<{
  apiService?: IApiService
}>) => {
  const data = __isBrowser__ ? await (await window.fetch('/api/index')).json() : await ctx.apiService?.index()
  return {
    indexData: data
  }
}
```

**这段代码的逻辑比较简单，核心点在第 10 行** ，如果是浏览器，就用浏览器自带的 fetch 方法请求`/api/index`接口获取数据；如果不是浏览器，即服务端渲染，可以直接调用 apiService 中的 index 方法。获取到数据后，将其存入 state.indexData 中，这样在 UI 组件中就可以使用了。  

首页的 UI 组件 render.tsx 代码如下：

```javascript
// web/pages/index/render.tsx
import React, { useContext } from "react";
import { SProps, IContext } from "ssr-types";
import Navbar from "@/components/navbar";
import Header from "@/components/header";
import Item from "@/components/item";
import { IData } from "@/interface";
import styles from "./index.less";
export default (props: SProps) => {
  const { state } = useContext<IContext<IData>>(window.STORE_CONTEXT);
  return (
    <div>
      <Navbar {...props} isHomePage={true}></Navbar>
      <Header></Header>
      <div className={styles.container}>
        {state?.indexData?.data.map((item) => (
          <Item
            {...props}
            id={item.id}
            key={item.id}
            title={item.title}
            content={item.content}
            date={item.date}
          ></Item>
        ))}
      </div>
    </div>
  );
};
```

在 UI 组件中，我们可以通过 useContext 获取刚才由 fetch.ts 存入 state 的数据，然后利用数据渲染 UI。UI 组件主要由三部分组成。

* Navbar：导航条。

* Header：页面标题。

* Item：每篇文章的简介。


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image/M00/94/46/CgqCHmAXx1WAV0BxAAM5rls-jc4377.png"/> 


#### 详情页接口的实现

完成了首页后，就可以实现详情页了。详情页与首页整体类似，区别就在于详情页需要传入参数查询某条数据。

详情页接口在 src/service/detail.ts 中 ，代码如下所示：

```typescript
// src/service/detail.ts
import { provide } from '@midwayjs/faas'
import { IApiDetailService } from '../interface/detail'
import mock from '../mock/detail'
@provide('ApiDetailService')
export class ApiDetailService implements IApiDetailService {
  async index (id): Promise<any> {
    return await Promise.resolve(mock.data[id])
  }
}
```

在这段代码中，我们实现了一个 ApiDetailService 类以及 index 方法，index 方法的如参 id 即文章 ID，然后根据文章 ID 从 mock 数据中查询文章详情。

文章详情数据如下：

```json
{
    "title":"Serverless 大热，程序员面临的新机遇与挑战",
    "wordCount":2540,
    "readingTime":10,
    "date":"2020-12-23 12:00:00",
    "content":"可能你会认为 Serverless 是最近两年兴起的技术，实际上，Serverless 概念从 2012 年就提出来了，随后 AWS 在 2014 年推出了第一款 Serverless 产品 Lambda，开启了 Serverless 元年... "
}
```

#### 详情页页面的实现

和首页一样，详情页也包含数据请求、UI 组件和样式代码三个文件。

数据请求代码文件的命名和首页一样，都是 fetch.ts。与首页不同的是，详情页我们需要从上下文（服务端渲染场景）或 URL 中（浏览器场景）获取到文章 ID，然后根据文章 ID 获取文章详情数据。代码如下：

```typescript
import { RouteComponentProps } from "react-router";
export default async (ctx) => {
  let data;
  if (__isBrowser__) {
    const id = (ctx as RouteComponentProps<{ id: string }>).match.params.id;
    data = await (await window.fetch(`/api/detail/${id}`)).json()
  } else {
    const id = /detail\/(.*)(\?|\/)?/.exec(ctx.req.path)[1];
    data = await ctx.apiDeatilservice.index(id);
  }

  return {
    detailData: data,
  };
};
```

详情页的 UI 组件名称为`render$id.tsx`的文件，`$id`表示该组件的参数是 id，这样访问 /detail/ 这个路由（id 是变量）时，就会匹配到 web/pages/detail/render$id.tsx 这个页面了。

<br />

`render$id.tsx`详细代码如下：

```javascript
import React, { useContext } from "react";
import { IContext, SProps } from "ssr-types";
import { Data } from "@/interface";
import Navbar from "@/components/navbar";
import Content from "@/components/content";
import Title from "@/components/title";
import Tip from "@/components/tip";
import styles from "./index.less";
export default (props: SProps) => {
  const { state } = useContext<IContext<Data>>(window.STORE_CONTEXT);
  return (
    <div>
      <Navbar {...props}></Navbar>
      <div className={styles.container}>
        <Title>{state?.detailData?.title}</Title>
        <Tip
          date={state?.detailData?.date}
          wordCount={state?.detailData?.wordCount}
          readingTime={state?.detailData?.readingTime}
        />
        <Content>{state?.detailData?.content}</Content>
      </div>
    </div>
  );
};
```

详情页的 UI 组件由四部分组成。

* Navbar：导航条。

* Title：文章标题。

* Tip：文章发布时间、字数等提示。

* Content：文章内容。


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image/M00/94/3B/Ciqc1GAXx3GADE4AAAO-vJ2TBH0389.png"/> 


#### 应用部署

代码开发完成后，你可以通过下面的命令在本地启动应用：

```java
$ npm start
...
[HPM] Proxy created: /asset-manifest  -> http://127.0.0.1:8000
 Server is listening on http://localhost:3000
```

应用启动后就可以打开浏览器输入 <http://localhost:3000> 查看效果了。  

在本地开发测试完成后，接下来就需要将其部署到函数计算。你可以运行 npm run deploy 命令进部署：

```java
$ npm run deploy
...
service  serverless-ssr-cms deploy success
......
The assigned temporary domain is http://41506101-1457216987974698.test.functioncompute.com，expired at 2021-02-04 00:35:01, limited by 1000 per day.
......
Deploy success
```

`npm run deploy`其实是执行了构建代码和部署应用两个步骤，这两个步骤都是在本机执行的。但这就存在一个隐藏风险，如果团队同学本地开发环境不同，就可能导致构建产物不同，进而导致部署到线上的代码存在风险。**所以更好的实践是：实现一个业务的持续集成流程，统一构建部署。**

应用部署成功后，会自动创建一个测试的域名，例如<http://41506101-1457216987974698.test.functioncompute.com>，我们可以打开该域名查看最终效果。

讲到这儿，基于 Serverless 的服务端渲染应用就开发完成了。

### 总结

总的来说，基于 Serverless 的服务端渲染应用实现也比较简单。如果你想要追求更好的用户体验，我也建议你对核心业务做服务端渲染的优化。基于 Serverless 的服务端渲染，可以让我们不用再像以前一样担心服务器的运维和扩容，大大提高了生产力。同时有了服务端渲染后，我也建议你完善业务的持续集成流程，将整个研发链路打通，降低代码构建发布的风险，提升从开发到测试再到部署的效率。


<Image alt="玩转 Serverless 架构17金句.png" src="https://s0.lgstatic.com/i/image6/M00/04/7F/CioPOWAsxEeANlL-AAEkPyzgS2s711.png"/> 


当然，要达到页面的极致体验，我们还需要做很多工作，比如：

* 将静态资源部署到 CDN，提升资源加载速度；

* 针对页面进行缓存，减少函数冷启动对性能的影响；

* 对服务端异常进行降级处理等等。

但不管我们用不用 Serverless，都需要做这些工作。关于这一讲，我想要强调以下几点：

* 基于 Serverless 的服务端渲染应用，可以让我们不用关心服务器的运维，应用也天然具有弹性；

* 基于 Serverless 开发服务端渲染应用，建议你完善业务的持续集成流程；

* 要达到页面的极致性能，还需要考虑将静态资源部署到 CDN、对页面进行缓存等技术；

* 对于服务端渲染应用，建议你完善业务的服务降级能力，进一步提高稳定性。

最后，我给你的作业是，实现一个服务端渲染应用。 我们下一讲见。

