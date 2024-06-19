# 23告别依赖，MockServer必杀技

在上一课时，我们详细了解了微服务下的测试分层实践，也讲解了微服务给测试带来的挑战。你会发现，其中最重要的一条挑战，便是微服务独立开发、独立部署这一特性。由于各个微服务都是独立开发和部署，增大了微服务联调测试时的难度。

在实践中，大部分微服务被拆分到不同的小型开发和测试团队。而各个团队由于各自的KPI导向不同，势必会产生对同一个Task， 两个团队设定有不同的优先级。这样就导致了**开发节奏不一致， 联调测试变得更加困难了**。

那么，对于相互有依赖的微服务，当我方已经接近完成，而对方尚未开始或仍在进行的情况下，我方该如何进行测试就成了一个不得不解决的问题。**这也是本讲我们要解决的问题：如何搭建 Mock Server 破除环境依赖。**

下图是本讲的知识脑图，可供你学习参考。


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image/M00/71/5D/Ciqc1F--FzGAXZ6WAAMdoZK9qV4023.png"/> 


### 什么是 Mock？

Mock 是模拟的意思。在测试中，通常表述为：对测试过程中**不容易构造** 或者**不容易获取** 的对象，用一个**虚拟**的对象来进行模拟的一个过程。

那么哪些对象不容易构造？哪些对象不容易获取呢？

* 拿微服务举例，在一个调用链条上，微服务 A 依赖 B 服务才能提供服务，而微服务 B 依赖 C 服务， 微服务 C 依赖 D 服务.....在这样的情况下，把每个依赖的服务都构造完毕再开始测试，就变得不太现实。这种情况我们称之为**不容易构造**。

* 又比如，假设我们的服务依赖银行的接口提供资金的查询。在测试中， 银行不可能无条件或者随意提供接口给我们调用。那么，在我们开发完毕但是要依赖对方才能开始测试时， 我们称这种情况为**不容易获取**。

无论是哪种情况，使用 Mock 的一大前提条件是：我们仅关注测试对象自身内部逻辑是否正确，而**不关心其依赖对象逻辑的正确性**。

### Mock Server 是什么

了解了什么是 Mock，理解 Mock Server 就比较容易了。简而言之，能够提供 Mock 功能的服务就叫作 Mock Server。Mock Server 通过模仿真实的服务器，提供对来自客户端请求的真实响应。

**那么 Mock Serve 如何模仿真实的服务器呢？**

一般情况下，搭建 Mock Server 前，需要了解将要 Mock 的服务，都能提供哪些功能？对外提供功能时，又以哪种格式提供服务？例如，以接口方式提供服务，接口的种类、接口的定义，以及接口输出的参数等信息。

了解了这些，Mock Server 就可以根据请求的不同，直接静态地返回符合业务规范的接口，也可以在 Mock Server 内部经过简单计算，动态返回符合业务规范的接口。

在实际工作中，Mock Server 通常以 Mock API Server 的形式存在，也就是我们一般以接口的形式对外提供服务，Mock Server 搭建在本地或者远程均可以对外提供服务。

### Mock Server 的常用场景

最常见的 Mock Server 的使用场景如下：

* 前后端联调使用，通过事先约定接口规范，使前端可以不依赖后端服务**独立开展工作**，这也是开发最常用的功能。

* 使用 Mock Server**屏蔽无关的真实服务**，从而专注于要测试的服务本身。仅仅测试需要测试的服务，其他不在我负责范围的服务使用 Mock。

* 供测试工程师使用，在测试环境**避免调用第三方收费服务**。比如，企查查等服务是收费的，在测试环境就可以不调用，以节省费用。

* **破除第三方依赖**。比如，本公司业务流程的某一个步骤需要获取第三方服务的正确返回才能继续进行，那么在测试中就可以用 Mock Server，直接模拟外部 API 的响应来断言系统的正确行为。

以上四条基本可以概括 Mock Server 绝大多数的使用情况。

可以看到，前两条主要是开发之间在使用，那么这个 Mock Server 通常是开发之间协调提供；或者是前端开发根据 API 接口规范，直接写 Hard Code 的响应供自己调用；或者是后端直接提供一个返回值给前端调用，基于成本和时间考虑，这个返回值通常也是 Hard Code 的，这一块不在我们今天的讨论范畴。

**而后两条就都是跟测试密切相关了，也是我们今天需要关注的。**

### Mock Server 搭建

Mock Server 的搭建有两种方式，分别是借助第三方工具直接提供 Mock Server，以及自主编码实现 Mock Server。下面我来分别介绍下这两种方式。

#### 1.借助第三方工具直接提供 Mock Server

可以直接提供 Mock Server 功能的第三方工具很多，这里我选择使用**Postman**的 Mock 功能。 Postman 提供了三种方式创建 Mock Server，我们直接选择第一种，并以Postman官方给的例子来看下如何不写代码创建 Mock Server。

（1）打开 Postman， 点击"+New" button。


<Image alt="图片2.png" src="https://s0.lgstatic.com/i/image/M00/71/68/CgqCHl--Fx6ARgtQAAJ9oo1jikM473.png"/> 


（2）在弹出来的"Create New"选项中点击 Mock Server 。


<Image alt="图片3.png" src="https://s0.lgstatic.com/i/image/M00/71/5D/Ciqc1F--FzyAMKe3AAJtlj-EnM4677.png"/> 


（3）Postman支持"Create a new API"或者"Use collection from this workspace"两种方式来创建 Mock Server。

简单起见，我们选择"Create a new API"。在下图中我们选择请求方法，可以是 GET、POST、UPDATE，也可以是 DELETE，也就是我们常说的增删查改。然后输入请求路径，需要返回的 HTTP 响应码，以及响应的 Body，可以模拟多个 API 接口。全部设置好后点击下一步。


<Image alt="图片4.png" src="https://s0.lgstatic.com/i/image/M00/71/69/CgqCHl--F0WATe6SAAIT0U9K5xI725.png"/> 


（4）然后，你将看到下图 4 个需要配置的地方。


<Image alt="图片5.png" src="https://s0.lgstatic.com/i/image/M00/71/5D/Ciqc1F--F02AUHoXAAI1JkHHCBM654.png"/> 


* 输入 Mock Server 的名称。

* 选择一个环境（可选），通常我们的测试环境有好几个，你可以配置使用不同的测试环境。

* 是否要将 Mock Server 设为私有。

* 是否将 Mock Server 的 URL 保存为环境变量。

等你都配置好后，单击下一步继续。

（5）当你看到如下界面，说明配置成功。此时你的简易版 Mock Server 就生成了。记录下生成的 URL，然后在你的测试中调用相应的 URL 地址即可。


<Image alt="图片6.png" src="https://s0.lgstatic.com/i/image/M00/71/5D/Ciqc1F--F1WAG2HEAAIVgTJq3fU557.png"/> 


在本例中，我在第（3）步设置了 echo 这个接口，它是个 GET 请求，你就可以直接在浏览器输入 http://mock-server-url/echo 这样的方式来访问，需要替换这里 mock-server-url 为图中的地址。

如果是 POST 请求，你也可以自定义参数，Request Body 等。

#### 2.自主编码实现 Mock Server（Flask）

使用第三方工具创建 Mock Server 比较简单，但是由于严重依赖于第三方工具，在实际工作中，一般用作开发完成后的第一轮手工测试。而**业务上线后，在测试框架中使用时**，我们还是倾向于根据业务规则自主编码实现 Mock Server。

当前，Github 上有很多成熟的 Mock Server 可供我们使用，根据编程语言的不同，最常见的有如下几个：

* [Java - Mock Server](https://github.com/mock-server)

* [Python - responses](https://github.com/getsentry/responses)

* [JavaScript - easy Mock](https://github.com/easy-mock/easy-mock)

这些 Mock Server 的搭建非常简单，按照步骤操作即可，我就不再赘述。

下面我讲下 Mock Server 的另外一个普遍搭建过程，即使用**Flask**来充当 Mock Server。
> Flask 是一个微 Web 框架，使用 Python 语言编写。使用它可以快速完成功能丰富的中小型网站或 Web 服务的实现。

（1）首先你要保证系统已经安装好 Flask，并确保你的机器有 Python 运行环境。

```python
pip install flask
```

（2）创建一个 Python 文件，比如叫 easyMock.py.，代码如下：


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image/M00/70/B7/CgqCHl-7kfKAPZUaAAG9yxU5oGo024.png"/> 


这段代码实现了这一功能：访问 <http://127.0.0.1:5000>，直接返回"hello world"。

直接使用 GET 方式访问**http://127.0.0.1:5000/mock**，会出现 404 错误。

如果使用 POST 方式，假设提交的数据中包括"name=kevin"这个键值对，则返回如下结果：

```java
{"status": 200, "message": "True", "response": {"orderID": 100}}
```

如果你提交的数据中不包括"name=kevin"， 则返回如下结果：

```java
{"status": 400, "message": "False", "response": {}}
```

如果代码在运行过程中发生了错误，则返回如下结果：

```java
{"status": 500, "message": "Server Error", "response": {}}
```

这其实就是一个最简单的Mock Server。  

（3）启动这个 Flask 服务。

打开命令行工具，在你的 Terimal 里运行以下命令行，以启动这个 Mock Server。

```python
python easyMock.py
```

（4）测试 Mock Server。  

首先安装 curl。
> curl 是一个利用 URL 语法在命令行方式下工作的文件传输工具。由于它支持 HTTP 协议及其请求方法，故也可以用来发送 HTTP 请求。

```python
# curl的安装和配置，根据操作系统的不同，步骤也不同。
# 如果你使用pip， 可以直接以如下方式安装。 
pip install curl
# 如果你发现在你的操作系统下，上述安装方式不起作用，你可以直接在搜索引擎中搜索相关的安装方式。
```

curl 常用的语法如下：

```python
# 直接发送GET请求
$ curl https://www.helloqa.com
# 添加HTTP请求头访问
$ curl -H "Content-type: application/json" https://www.helloqa.com
# 指定HTTP请求
# -X 表示请求方法
# -d 表示发送 POST 请求的数据体
$ curl -X POST  -d 'iTesting=Good' https://www.helloqa.com
```

最后，我们通过 curl 发送 HTTP 请求，来验证下搭建的 Mock Server 是否功能正确：

```python
# 通过curl直接调用，返回500
curl -H "Content-type: application/json" -X POST -d '{"name":"kevin"}' http://127.0.0.1:5000/mock
# 返回400
curl -d'name=kevin＆'-X POST http://127.0.0.1:5000/mock
# 返回200
curl -d'name=kevin' -X POST http://127.0.0.1:5000/mock
```

可以看到，根据我的输入不同，Mock Server 返回了期望的结果。

至此，你的 Mock Server 已经搭建完毕。之后在你的测试代码里，涉及调用第三方应用的情况，你就可以直接转而调用 Mock Server 来继续你的测试了。当然，你的 Mock Server 实现要考虑第三方应用的业务逻辑和输出结果的格式、参数以及数据等方面。

不知道你有没有注意到，Mock Server 无论是上述哪种方式的创建，都需要一点点工作量，而且都有如下弊端：

* 你无法向真正的服务器发送请求，你的所有请求都发送至 Mock Server。

* 在真实服务器可以提供工作，或由 Mock Server 向真实服务器之间进行切换时，可能由于**人为原因**导致错误。比如，有的地方你替换了真实服务器，有点地方你仍调用 Mock Server。

那么，有没有办法可以实现：我直接向真实的服务器发送请求，同时我要求真实的服务器根据我的需要，来返回 Mock 数据或者真实的服务器响应数据呢？

当然有了，利用新一代前端自动化测试框架 Cypress 可以不写代码便能完成如上请求。Cypress 是新一代端到端测试神器，被誉为 Selenium/WebDriver 杀手和 Web 端自动化测试技术的未来。
> 关于如何利用 Cypress 搭建 MockServer，实现更高效的 Mock，大家可以参考下我今年出版的新书《前端自动化测试框架 -- Cypress 从入门到精通》。

### 总结

下面我来总结下本章学习的内容。本章我先是从 Mock 的定义出发，讲解了 Mock Server 的含义、常用场景，以及 Mock Server 在我们开发测试中的重要性，接着又采用两种方式实现了Mock Server，分别是：

* 使用 API 接口工具 Postman。它的优点是无须编程，缺点是生成是 Server URL 地址无法更改。

* 使用 Python 的 Flask 框架编程。它的优点是可以把 Mock Server 集成至自己的测试框架中，缺点是需要一定的编程能力。

Mock Server 作为破除环境依赖的利器，能够大大提升我们的测试效率，希望通过这些内容，让你彻底掌握 Mock Server。如果你希望掌握更前沿的 Mock 技术，也可以去了解 Cypress 框架，让自己更上一层楼。

我是蔡超，我们下节课再见。

更多关于测试框架、Mock Server、PostMan 使用的知识，请关注公众号 iTesting 查看。

*** ** * ** ***

[课程评价入口，挑选 5 名小伙伴赠送小礼品～](https://wj.qq.com/s2/7506053/9b01)

