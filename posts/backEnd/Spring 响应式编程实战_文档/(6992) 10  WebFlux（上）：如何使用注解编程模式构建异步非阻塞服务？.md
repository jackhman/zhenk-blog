# 10WebFlux（上）：如何使用注解编程模式构建异步非阻塞服务？

通过上一讲的介绍，我们已经明确了 Spring 家族中 WebFlux 组件诞生的背景和意义。作为一款新型的 Web 服务开发组件，WebFlux 一方面充分考虑了与原有 Spring MVC 在开发模式上的兼容性，开发人员仍然可以使用基于注解的编程方式来创建响应式 Web 服务；另一方面，WebFlux 也引入了基于函数式编程的全新开发模式。本讲和下一讲将分别对这两种开发模式展开讨论，今天的内容将先关注基于注解的编程模型。

### 引入 Spring WebFlux

如果你是第一次创建 WebFlux 应用，那么最简单的方法应该是使用 Spring 所提供的 Spring Initializer 初始化模板。直接访问 Spring Initializer 网站（[http://start.spring.io/](http://start.spring.io/?fileGuid=xxQTRXtVcqtHK6j8)），选择创建一个 Maven 项目并指定相应的配置项，然后在添加的依赖中选择 Spring Reactive Web，我们就可以获取一个可运行的 WebFlux 模版项目了，如下所示。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image6/M01/31/1A/CioPOWBsGwCAXcqVAABornEKBhA084.png"/> 
  
使用 Spring Initializer 初始化响应式 Web 应用示意图
> 请注意，不做特殊说明的话，本课程将统一使用 Maven 进行代码依赖管理。

我们进一步打开模板项目中的 pom 文件，会找到如下依赖。

```xml
<dependencies>      
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-webflux</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
 
        <dependency>
            <groupId>io.projectreactor</groupId>
            <artifactId>reactor-test</artifactId>
            <scope>test</scope>
        </dependency>       
</dependencies>
```

这其中最核心的就是 spring-boot-starter-webflux，它是构成响应式 Web 应用程序开发的基础。spring-boot-starter-test 是包含 JUnit、Spring Boot Test、Mockit 等常见测试工具类在内的测试组件库；而 reactor-test 则是用来测试 Reactor 框架的测试组件库。关于这两个测试库的使用方法我会放在"22 \| 测试集成：响应式 Web 应用程序如何进行测试？"中具体展开。

当然，你也可以新建一个任意的 Maven 项目，然后添加这些依赖。这样，使用 Spring WebFlux 构建响应式 Web 服务的初始化环境就准备好了。

### 使用注解编程模型创建响应式 RESTful 服务

请注意，想要使用 WebFlux 构建响应式服务的编程模型，开发人员有两种选择。第一种是使用基于 Java 注解的方式，这种编程模型与传统的 Spring MVC 一致；而第二种则是使用函数式编程模型。这一讲，我们先来介绍第一种实现方式，关于函数式编程模型我们将在下一讲讨论。

#### RESTful 服务与传统创建方法

在创建响应式 Web 服务之前，我们先来回顾一下传统 RESTful 服务的创建方法。你可能听说过 REST 这个名称，但不一定清楚它的含义。REST（Representational State Transfer，表述性状态转移）本质上只是一种架构的风格而不是规范。这种架构风格把位于服务器端的访问入口看作是一种资源，每个资源都使用一个 URI 来表示唯一的访问地址。而在请求过程上使用的就是标准的 HTTP 方法，比如最常见的 GET、PUT、POST 和 DELETE。

如果我们使用 Spring Boot 来构建一个传统的 RESTful 服务，那么首要的一步就是创建一个 Bootstrap 启动类。Bootstrap 类结构简单且比较固化，如下所示。

```java
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
 
@SpringBootApplication
public class HelloApplication {
 
    public static void main(String[] args) {
        SpringApplication.run(HelloApplication.class, args);
    }
}
```

这段代码需要我们对 Spring Boot 有一定的了解。在 Spring Boot 中，标注 @SpringBootApplication 注解的类就是整个应用程序的入口类，通过这个类相当于启动了 Spring 容器。一旦 Spring 容器已经启动，我们就可以通过提供一系列的 Controller 类来构建 HTTP 端点，最简单的 Controller 类如下所示。

```java
@RestController
public class HelloController {
 
    @GetMapping("/")
    public String hello() {
        return "Hello World!";
    }
}
```

可以看到，以上代码中包含了 @RestController 和 @GetMapping 这两个注解。其中，@RestController 注解继承自 Spring MVC 中的 @Controller 注解。与传统的 @Controller 注解相比，@RestController 注解内置了基于 JSON 的序列化/反序列化方式，专门用于构建轻量级的 RESTful 端点。通过这个特性，我们在构建 RESTful 服务时可以使用 @RestController 注解来代替 @Controller 注解以简化开发。

另外一个 @GetMapping 注解也与 Spring MVC 中的 @RequestMapping 注解类似。Spring Boot 2 中引入了一批新注解，除了 @GetMapping 外还有 @PutMapping、@PostMapping、@DeleteMapping 等注解，方便开发人员显式指定 HTTP 的请求方法。当然，你也可以继续使用原先的 @RequestMapping 实现同样的效果。

以下代码展示了一个典型的 Controller，实现了一个根据订单编号 OrderNumber 获取订单信息的 HTTP 端点。这个端点的访问 URI 为"orders/{orderNumber}"，由根路径"orders"+子路径"/{orderNumber}"构成，我们还指定了对应的 HTTP 请求方法和所需传入的参数，如下所示。

```java
@RestController
@RequestMapping(value="orders")
public class OrderController {
  
    @Autowired
    private OrderService orderService;       
    
    @GetMapping(value = "/{orderNumber}")
    public Order getOrderByOrderNumber(@PathVariable String orderNumber) {   
        Order order = orderService.getOrderByOrderNumber(orderNumber);
        
        return order；
    }
}
```

基于注解编程模型来创建响应式 RESTful 服务与使用传统的 Spring MVC 非常类似，通过掌握响应式编程的基本概念和技巧，在 WebFlux 应用中使用这种编程模型几乎没有任何学习成本。

#### 通过注解构建响应式 RESTful 服务

针对前面介绍的两个 RESTful 服务示例，我们将展示如何就响应式编程模型给出它们的响应式版本。

第一个响应式 RESTful 服务来自对原有 HelloController 示例进行响应式改造，改造之后的代码如下所示。

```java
@RestController
public class HelloController {
 
    @GetMapping("/")
    public Mono<String> hello() {
        return Mono.just("Hello World!");
    }
}
```

以上代码只有一个地方值得注意，即 hello() 方法的返回值从普通的 String 对象转化为了一个 Mono 对象。这点是完全可以预见的，使用 Spring WebFlux 与 Spring MVC 的不同之处在于，前者使用的类型都是 Reactor 中提供的 Flux 和 Mono 对象，而不是普通的 POJO。

第一个响应式 RESTful 服务非常简单，在接下来的内容中，我们将更进一步，构建带有一个 Service 层实现的响应式 RESTful 服务。而 Service 层中一般都会使用具体的数据访问层来实现数据操作，但因为响应式数据访问是一个独立的话题，所以我会在后续的"14 \| 响应式全栈：响应式编程能为数据访问过程带来什么样的变化？"中进行展开。

这一讲我们还是尽量屏蔽响应式数据访问所带来的复杂性，数据层采用打桩（Stub）的方式来实现这个 Service 层组件。我们将针对常见的订单服务构建一个桩服务 StubOrderService，如下所示。

```java
@Service
public class StubOrderService {
 
    private final Map<String, Order> orders = new ConcurrentHashMap<>();
 
    public Flux<Order> getOrders() {
        return Flux.fromIterable(this.orders.values());
    }
 
    public Flux<Order> getOrdersByIds(final Flux<String> ids) {
        return ids.flatMap(id -> Mono.justOrEmpty(this.orders.get(id)));
    }
 
    public Mono<Order> getOrdersById(final String id) {
        return Mono.justOrEmpty(this.orders.get(id));
    }
 
    public Mono<Void> createOrUpdateOrder(final Mono<Order> productMono) {
        return productMono.doOnNext(product -> {
            orders.put(product.getId(), product);
        }).thenEmpty(Mono.empty());
    }
 
    public Mono<Order> deleteOrder(final String id) {
        return Mono.justOrEmpty(this.orders.remove(id));
    }
}
```

StubOrderService 用来对 Order 数据进行基本的 CRUD 操作。我们使用一个位于内存中的 ConcurrentHashMap 对象来保存所有的 Order 对象信息，从而提供一种桩代码实现方案。

这里的 getOrdersByIds() 方法具有代表性，它接收 Flux 类型的参数 ids。Flux 类型的参数代表有多个对象需要处理，这里使用"07 \| Reactor 操作符（上）：如何快速转换响应式流？"中所介绍的 flatMap 操作符来对传入的每个 id 进行处理，这也是 flatMap 操作符的一种非常典型的用法。

另外 createOrUpdateOrder() 方法使用 Mono.doOnNext() 方法，将 Mono 对象转换为普通 POJO 对象并进行保存。doOnNext() 方法相当于在响应式流每次发送 onNext 通知时，为消息添加了定制化的处理。

有了桩服务 StubOrderService，我们就可以创建 StubOrderController 来构建具体的响应式 RESTful 服务，它使用 StubOrderService 来完成具体的端点。StubOrderController 中暴露的端点都很简单，我们只是把具体功能代理给了 StubOrderService 中的对应方法，代码如下。

```java
@RestController
@RequestMapping("/orders")
public class StubOrderController {
 
    @Autowired
    private StubOrderService orderService;
 
    @GetMapping("")
    public Flux<Order> getOrders() {
        return this.orderService.getOrders();
    }
 
    @GetMapping("/{id}")
    public Mono<Order> getOrderById(@PathVariable("id") final String id) {
        return this.orderService.getOrderById(id);
    }
 
    @PostMapping("")
    public Mono<Void> createOrder(@RequestBody final Mono<Order> order) {
        return this.orderService.createOrUpdateOrder(order);
    }
 
    @DeleteMapping("/{id}")
    public Mono<Order> delete(@PathVariable("id") final String id) {
        return this.orderService.deleteOrder(id);
    }
}
```

至此，使用注解编程模型创建响应式 RESTful 服务的过程介绍完毕。我们看到 WebFlux 中支持使用与 Spring MVC 相同的注解，两者的主要区别在于底层通信方式是否阻塞。对于简单的场景来说，这两者之间并没有什么太大的差别。但对于复杂的应用而言，响应式编程和背压的优势就会体现出来，可以带来整体性能的提升。

### 案例集成：ReactiveSpringCSS 中的 Web 服务

在介绍完如何使用编程模型创建响应式 RESTful 服务之后，让我们来到 ReactiveSpringCSS 案例中，梳理系统中服务交互之间的应用场景。作为客服系统，其核心业务流程是生成客服工单，而工单的生成通常需要使用到用户账户信息和所关联的订单信息。

在案例中，我们包含三个独立的 Web 服务，分别是用来管理订单的 order-service、管理用户账户的 account-service 以及核心的客服服务 customer-service，这三个服务之间的交互方式如下图所示。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M00/31/1A/CioPOWBsGyaACJz3AACV3vlgteU433.png"/> 
  
ReactiveSpringCSS 案例系统中三个服务的交互方式图

通过这个交互图，实际上我们已经可以梳理工单生成的核心流程的伪代码，如下所示。

```java
generateCustomerTicket {
 
    创建 CustomerTicket 对象
 
	从远程 account-service 中获取 Account 对象
 
	从远程 order-service 中获取 Order 对象
 
	设置 CustomerTicket 对象属性
 
	保存 CustomerTicket 对象并返回
}
```

其中从远程 account-service 中获取 Account 对象和从远程 order-service 中获取 Order 对象这两个步骤，都会涉及远程 Web 服务的访问。为此，我们首先需要分别在 account-service 和 order-service 服务中创建对应的 HTTP 端点。今天我们将先基于注解编程模型给出 account-service 中 AccountController 的实现过程，完整的 AccountController 类如下所示。

```java
@RestController
@RequestMapping(value = "accounts")
public class AccountController {
 
    @Autowired
    private AccountService accountService;
 
    @GetMapping(value = "/{accountId}")
    public Mono<Account> getAccountById(@PathVariable("accountId") String accountId) {
 
        Mono<Account> account = accountService.getAccountById(accountId);
        return account;
    }
 
    @GetMapping(value = "accountname/{accountName}")
    public Mono<Account> getAccountByAccountName(@PathVariable("accountName") String accountName) {
 
        Mono<Account> account = accountService.getAccountByAccountName(accountName);
        return account;
    }
 
    @PostMapping(value = "/")
    public Mono<Void> addAccount(@RequestBody Mono<Account> account) {
        
        return accountService.addAccount(account);
    }
 
    @PutMapping(value = "/")
    public Mono<Void> updateAccount(@RequestBody Mono<Account> account) {
        
        return accountService.updateAccount(account);
    }
}
```

可以看到，这里的几个 HTTP 端点都比较简单，基本都是基于 AccountService 完成的 CRUD 操作。需要注意的是，在 addAccount 和 updateAccount 这两个方法中，输入的参数都是一个 Mono 对象，而不是 Account 对象，这意味着 AccountController 将以响应式流的方式处理来自客户端的请求。

### 小结与预告

从今天开始，我们将引入 Spring WebFlux 来构建响应式的 RESTful Web 服务。作为一款全新的开发框架，WebFlux 具有广泛的应用场景，同时也支持两种不同的开发模型。本讲针对注解编程模型给出了 RESTful 服务的开发方法。

这里给你留一道思考题：使用 Spring WebFlux 和 Spring MVC 开发 RESTful 服务有什么联系和区别？

下一讲会继续讨论 Spring WebFlux 的应用，我们将分析全新的函数式编程模型中的编程组件，并完成与 ReactiveSpringCSS 的集成。
> 点击链接，获取课程相关代码↓↓↓  
> [https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git](https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git?fileGuid=xxQTRXtVcqtHK6j8)

