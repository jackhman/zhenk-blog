# 12WebClient：如何实现非阻塞式的跨服务远程调用？

在上一讲中，我已经带你在 ReactiveSpringCSS 案例系统中通过 WebFlux 创建了响应式 Web 服务，并给你留下了一道思考题：如何实现非阻塞式的跨服务调用？

我们知道在 Spring 中存在一个功能强大的工具类 RestTemplate，专门用来实现基于 HTTP 协议的远程请求和响应处理。RestTemplate 的主要问题在于不支持响应式流规范，也就无法提供非阻塞式的流式操作。Spring 5 全面引入响应式编程模型，同时也提供了 RestTemplate 的响应式版本，这就是 WebClient 工具类。

这一讲我们就针对 WebClient 展开详细的探讨。首先我会带你创建和配置 WebClient对象；然后使用 WebClient 来访问远程 Web 服务，并介绍该组件的一些使用技巧；最后我依然会结合 ReactiveSpringCSS 案例来给出与现有服务之间的集成过程。

### 创建和配置 WebClient

WebClient 类位于 org.springframework.web.reactive.function.client 包中，要想在项目中集成 WebClient 类，只需要引入 WebFlux 依赖即可。

#### 创建 WebClient

创建 WebClient 有两种方法，一种是通过它所提供的 create() 工厂方法，另一种则是使用 WebClient Builder 构造器工具类。

我们可以直接使用 create() 工厂方法来创建 WebClient 的实例，示例代码如下所示。

```java
WebClient webClient = WebClient.create();
```

如果我们创建 WebClient 的目的是针对某一个特定服务进行操作，那么就可以使用该服务的地址作为 baseUrl 来初始化 WebClient，示例代码如下所示。

```java
WebClient webClient = 
	WebClient.create("https://localhost:8081/accounts");
```

WebClient 还附带了一个构造器类 Builder，使用方法也很简单，示例代码如下所示。

```java
WebClient webClient = WebClient.builder().build();
```

#### 配置 WebClient

创建完 WebClient 实例之后，我们还可以在 WebClient.builder() 方法中添加相关的配置项，来对 WebClient 的行为做一些控制，通常用来设置消息头信息等，示例代码如下所示。

```java
WebClient webClient = WebClient.builder()
	.baseUrl("https://localhost:8081/accounts")
    .defaultHeader(HttpHeaders.CONTENT_TYPE, "application/json")
	.defaultHeader(HttpHeaders.USER_AGENT, "Reactive WebClient")
	.build();
```

上述代码展示了 defaultHeader 的使用方法，WebClient.builder() 还包含 defaultCookie、defaultRequest 等多个配置项可供使用。

现在，我们已经成功创建了 WebClient 对象，接下来就可以使用该对象来访问远程服务了。

### 使用 WebClient 访问服务

在远程服务访问上，WebClient 有几种常见的使用方式，包括非常实用的 retrieve() 和 exchange() 方法、用于封装请求数据的 RequestBody，以及表单和文件的提交。接下来我就对这些使用方式进行详细介绍并给出相关示例。

#### 构造 URL

Web 请求中通过请求路径可以携带参数，在使用 WebClient 时也可以在它提供的 uri() 方法中添加路径变量和参数值。如果我们定义一个包含路径变量名为 id 的 URL，然后将 id 值设置为 100，那么就可以使用如下示例代码。

```java
webClient.get().uri("http://localhost:8081/accounts/{id}", 100);
```

当然，URL 中也可以使用多个路径变量以及多个参数值。如下所示的代码中就定义了 URL 中拥有路径变量 param1 和 param2，实际访问的时候将被替换为 value1 和 value2。如果有很多的参数，只要按照需求对请求地址进行拼装即可。

```java
webClient.get().uri("http://localhost:8081/account/{param1}/{ param2}", "value1", "value12");
```

同时，我们也可以事先把这些路径变量和参数值拼装成一个 Map 对象，然后赋值给当前 URL。如下所示的代码就定义了 Key 为 param1 和 param2 的 HashMap，实际访问时会从这个 HashMap 中获取参数值进行替换，从而得到最终的请求路径为[http://localhost:8081/accounts/value1/value2](http://localhost:8081/accounts/value1/value2?fileGuid=xxQTRXtVcqtHK6j8)，如下所示。

```java
Map<String, Object> uriVariables = new HashMap<>();
uriVariables.put("param1", "value1");
uriVariables.put("param2", "value2");
webClient.get().uri("http://localhost:8081/accounts/{param1}/{param2}", variables);
```

我们还可以通过使用 URIBuilder 来获取对请求信息的完全控制，示例代码如下所示。

```java
public Flux<Account> getAccounts(String username, String token) {
    return webClient.get()
           .uri(uriBuilder -> uriBuilder.path("/accounts").build())
           .header("Authorization", "Basic " + Base64Utils
                   .encodeToString((username + ":" + token).getBytes(UTF_8)))
           .retrieve()
           .bodyToFlux(Account.class);
}
```

这里我们为每次请求添加了包含授权信息的"Authorization"消息头，用来传递用户名和访问令牌。一旦我们准备好请求信息，就可以使用 WebClient 提供的一系列工具方法完成远程服务的访问，例如上面示例中的 retrieve() 方法。

#### retrieve() 方法

retrieve() 方法是获取响应主体并对其进行解码的最简单方法，我们再看一个示例，如下所示。

```java
WebClient webClient = WebClient.create("http://localhost:8081");
 
Mono<Account> result = webClient.get()
        .uri("/accounts/{id}", id)
	    .accept(MediaType.APPLICATION_JSON)
        .retrieve()
        .bodyToMono(Account.class);
```

上述代码使用 JSON 作为序列化方式，我们也可以根据需要设置其他方式，例如采用 MediaType.TEXT_EVENT_STREAM 以实现基于流的处理，示例如下。

```java
Flux<Order> result = webClient.get()
  .uri("/accounts").accept(MediaType.TEXT_EVENT_STREAM)
  .retrieve()
  .bodyToFlux(Account.class);
```

#### exchange() 方法

如果希望对响应拥有更多的控制权，retrieve() 方法就显得无能为力，这时候我们可以使用 exchange() 方法来访问整个响应结果，该响应结果是一个 ClientResponse 对象，包含了响应的状态码、Cookie 等信息，示例代码如下所示。

```java
Mono<Account> result = webClient.get()
 .uri("/accounts/{id}", id)
 .accept(MediaType.APPLICATION_JSON)
 .exchange() 
 .flatMap(response -> response.bodyToMono(Account.class));
```

以上代码演示了如何对结果执行 flatMap() 操作符的实现方式，通过这一操作符调用 ClientResponse 的 bodyToMono() 方法以获取目标 Account 对象。

#### 使用 RequestBody

如果你有一个 Mono 或 Flux 类型的请求体，那么可以使用 WebClient 的 body() 方法来进行编码，使用示例如下所示。

```java
Mono<Account> accountMono = ... ;
 
Mono<Void> result = webClient.post()
            .uri("/accounts")
            .contentType(MediaType.APPLICATION_JSON)
            .body(accountMono, Account.class)
            .retrieve()
            .bodyToMono(Void.class);
```

如果请求对象是一个普通的 POJO 而不是 Flux/Mono，则可以使用 syncBody() 方法作为一种快捷方式来传递请求，示例代码如下所示。

```java
Account account = ... ;
 
Mono<Void> result = webClient.post()
            .uri("/accounts")
            .contentType(MediaType.APPLICATION_JSON)
            .syncBody(account)
            .retrieve()
            .bodyToMono(Void.class);
```

#### 表单和文件提交

当传递的请求体是一个 MultiValueMap 对象时，WebClient 默认发起的是表单提交。例如，针对用户登录场景，我们可以构建一个 MultiValueMap 对象，并传入参数 username 和 password 进行提交，代码如下所示。

```java
String baseUrl = "http://localhost:8081";
WebClient webClient = WebClient.create(baseUrl);
 
MultiValueMap<String, String> map = new LinkedMultiValueMap<>();
map.add("username", "jianxiang");
map.add("password", "password");
 
Mono<String> mono = webClient.post()
	.uri("/login")
	.syncBody(map)
	.retrieve()
	.bodyToMono(String.class);
```

如果想提交 Multipart Data，我们可以使用 MultipartBodyBuilder 工具类来简化请求的构建过程。MultipartBodyBuilder 的使用方法如下所示，最终我们也将得到一个 MultiValueMap 对象。

```java
MultipartBodyBuilder builder = new MultipartBodyBuilder();
builder.part("paramPart", "value");
builder.part("filePart", new FileSystemResource("jianxiang.png"));
builder.part("accountPart", new Account("jianxiang"));
 
MultiValueMap<String, HttpEntity<?>> parts = builder.build();
```

一旦 MultiValueMap 构建完成，通过 WebClient 的 syncBody() 方法就可以实现请求提交，我已经在上文中提到过这种实现方法。

以上介绍的都是 WebClient 所提供的基础方法，我们可以使用这些方法来满足面向业务处理的常规请求。但如果你希望对远程调用过程有更多的控制，那么就需要使用 WebClient 所提供的的一些其他使用技巧了。让我们一起来看一下。

### WebClient 的其他使用技巧

除了实现常规的 HTTP 请求之外，WebClient 还有一些高级用法，包括请求拦截和异常处理等。

#### 请求拦截

和传统 RestTemplate 一样，WebClient 也支持使用过滤器函数。让我们回顾 WebClient 的构造器 Builder，你会发现 Builder 实际上是一个接口，它内置了一批初始化 Builder 和 WebClient 的方法定义。DefaultWebClientBuilder 就是该接口的默认实现，截取该类的部分核心代码如下。

```java
class DefaultWebClientBuilder implements WebClient.Builder {
	 
@Override
    public WebClient.Builder filter(ExchangeFilterFunction filter) {
        Assert.notNull(filter, "ExchangeFilterFunction must not be null");
        initFilters().add(filter);
        return this;
	 }
	 
	...
	 
@Override
    public WebClient build() {
        ExchangeFunction exchange = initExchangeFunction();
        ExchangeFunction filteredExchange = (this.filters != null ? this.filters.stream()
                .reduce(ExchangeFilterFunction::andThen)
                .map(filter -> filter.apply(exchange))
                .orElse(exchange) : exchange);
        return new DefaultWebClient(filteredExchange, initUriBuilderFactory(),
                unmodifiableCopy(this.defaultHeaders), unmodifiableCopy(this.defaultCookies),
                new DefaultWebClientBuilder(this));
	 }
	 
	...
}
```

可以看到 build() 方法的目的是构建出一个 DefaultWebClient，而 DefaultWebClient 的构造函数中依赖于 ExchangeFunction 接口。我们来看一下 ExchangeFunction 接口的定义，其中的 filter() 方法传入并执行 ExchangeFilterFunction，如下所示。

```java
public interface ExchangeFunction {
	    ...
	 
    default ExchangeFunction filter(ExchangeFilterFunction filter) {
        Assert.notNull(filter, "'filter' must not be null");
        return filter.apply(this);
    }
}
```

当我们看到 Filter（过滤器）这个单词时，思路上就可以触类旁通了。在 Web 应用程序中，Filter 体现的就是一种拦截器作用，而多个 Filter 组合起来构成一种过滤器链。ExchangeFilterFunction 也是一个接口，其部分核心代码如下所示。

```java
public interface ExchangeFilterFunction {
 
Mono<ClientResponse> filter(ClientRequest request, ExchangeFunction next);
 
default ExchangeFilterFunction andThen(ExchangeFilterFunction after) {
        Assert.notNull(after, "'after' must not be null");
        return (request, next) -> {
            ExchangeFunction nextExchange = exchangeRequest -> after.filter(exchangeRequest, next);
            return filter(request, nextExchange);
        };
    }
	 
default ExchangeFunction apply(ExchangeFunction exchange) {
        Assert.notNull(exchange, "'exchange' must not be null");
        return request -> this.filter(request, exchange);
	}
	 
	...
}
```

显然，ExchangeFilterFunction 通过 andThen() 方法将自身添加到过滤器链并实现 filter() 这个函数式方法。我们可以使用过滤器函数以任何方式拦截和修改请求，例如通过修改 ClientRequest 来调用 ExchangeFilterFucntion 过滤器链中的下一个过滤器，或者让 ClientRequest 直接返回以阻止过滤器链的进一步执行。

作为示例，如下代码演示了如何使用过滤器功能添加 HTTP 基础认证机制。

```java
WebClient client = WebClient.builder()
  .filter(basicAuthentication("username", "password"))
  .build();
```

这样，基于客户端过滤机制，我们不需要在每个请求中添加 Authorization 消息头，过滤器将拦截每个 WebClient 请求并自动添加该消息头。再来看一个例子，我们将编写一个自定义的过滤器函数 logFilter()，代码如下所示。

```java
private ExchangeFilterFunction logFilter() {
    return (clientRequest, next) -> {
        logger.info("Request: {} {}", clientRequest.method(), clientRequest.url());
        clientRequest.headers()
                .forEach((name, values) -> values.forEach(value -> logger.info("{}={}", name, value)));
        return next.exchange(clientRequest);
    };
}
```

显然，logFilter() 方法的作用是对每个请求做详细的日志记录。我们同样可以通过 filter() 方法把该过滤器添加到请求链路中，代码如下所示。

```java
WebClient webClient = WebClient.builder()
  .filter(logFilter())
  .build();
```

#### 异常处理

当发起一个请求所得到的响应状态码为 4XX 或 5XX 时，WebClient 就会抛出一个 WebClientResponseException 异常，我们可以使用 onStatus() 方法来自定义对异常的处理方式，示例代码如下所示。

```java
public Flux<Account> listAccounts() {
    return webClient.get()
         .uri("/accounts)
        .retrieve()
        .onStatus(HttpStatus::is4xxClientError, clientResponse ->
             Mono.error(new MyCustomClientException())
         )
        .onStatus(HttpStatus::is5xxServerError, clientResponse ->
             Mono.error(new MyCustomServerException())
         )
        .bodyToFlux(Account.class);
}
```

这里我们构建了一个 MyCustomServerException 来返回自定义异常信息。需要注意的是，这种处理方式只适用于使用 retrieve() 方法进行远程请求的场景，exchange() 方法在获取 4XX 或 5XX 响应的情况下不会引发异常。因此，当使用 exchange() 方法时，我们需要自行检查状态码并以合适的方式处理它们。

### 案例集成：基于 WebClient 的非阻塞式跨服务通信

介绍完 WebClient 类的使用方式之后，让我们回到 ReactiveSpringCSS 案例。在上一讲中，我已经给出了位于 customer-service 的 CustomerService 类中的 generateCustomerTicket 方法的代码结构，该方法用于完成与 account-service 和 order-service 进行集成，我们来回顾一下。

```java
public Mono<CustomerTicket> generateCustomerTicket(String accountId, String orderNumber) {
 
        // 创建 CustomerTicket 对象
        CustomerTicket customerTicket = new CustomerTicket();
        customerTicket.setId("C_" + UUID.randomUUID().toString());
 
        // 从远程 account-service 获取 Account 对象
        Mono<AccountMapper> accountMapper = getRemoteAccountByAccountId(accountId);
        
        // 从远程 order-service 中获取 Order 对象
        Mono<OrderMapper> orderMapper = getRemoteOrderByOrderNumber(orderNumber);
        
        Mono<CustomerTicket> monoCustomerTicket = 
                Mono.zip(accountMapper, orderMapper).flatMap(tuple -> {
            AccountMapper account = tuple.getT1();
            OrderMapper order = tuple.getT2();
            
            // 设置 CustomerTicket 对象属性
            ...
            
            return Mono.just(customerTicket);
        });
        
        // 保存 CustomerTicket 对象并返回
        return monoCustomerTicket.flatMap(customerTicketRepository::save);
}
```

另一方面，上一讲中我也给出了在 order-service 中基于函数式编程模型构建 Web 服务的实现过程。同样的，这里也以 getRemoteOrderByOrderNumber 方法为例来和你讨论如何完成与 Web 服务之间的远程调用。getRemoteOrderByOrderNumber 方法定义如下。

```java
private Mono<OrderMapper> getRemoteOrderByOrderNumber(String orderNumber) {
 
        return orderClient.getOrderByOrderNumber(orderNumber);
}
```

这里，我们会构建一个 ReactiveOrderClient 类来完成对 order-service 的远程访问，如下所示。

```java
@Component
public class ReactiveOrderClient { 
    
    public Mono<OrderMapper> getOrderByOrderNumber(String orderNumber) {          
     Mono<OrderMapper> orderMono = WebClient.create()
                .get()
                .uri("localhost:8081/orders/{orderNumber}", orderNumber)
                .retrieve()
                .bodyToMono(OrderMapper.class).log("getOrderFromRemote");
     
        return orderMono;
    }
}
```

你可以注意到，这里基于 WebClient.create() 工厂方法构建了一个 WebClient 对象，并通过它的 retrieve 方法来完成对远程 order-serivce 的请求过程。同时，我们看到这里的返回对象是一个 Mono`<OrderMapper>`，而不是一个 Mono`<Order>` 对象。事实上，它们的内部字段都是一一对应的，只是位于两个不同的代码工程中，所以故意从命名上做了区分。WebClient 会自动完成 OrderMapper 与 Order 之间的自动映射。

### 小结与预告

在上一讲的基础上，这一讲我为你引入了 WebClient 模板类来完成对远程 HTTP 端点的响应式访问。WebClient 为开发人员提供了一大批有用的工具方法来实现 HTTP 请求的发送以及响应的获取。同时，该模板类还提供了一批定制化的入口供开发人员嵌入对 HTTP 请求过程进行精细化管理的处理逻辑。

这里给你留一道思考题：在使用 WebClient 时，如何实现对请求异常等控制逻辑的定制化处理？

关于远程调用，业界也存在一些协议，在网络通信层面提供非阻塞式的交互体验。RSocket 就是这一领域的主流实现，下一讲我将针对该协议和你一起展开讨论，到时候见。
> 点击链接，获取课程相关代码↓↓↓  
> [https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git](https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git?fileGuid=xxQTRXtVcqtHK6j8)

