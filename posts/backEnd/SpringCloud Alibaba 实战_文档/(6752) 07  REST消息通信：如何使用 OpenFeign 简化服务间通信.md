# 07REST消息通信：如何使用OpenFeign简化服务间通信

上一讲我们学习了 Ribbon 与 RestTemplate 两个组件。Ribbon 提供了客户端负载均衡，而 RestTemplate 则封装了 HTTP 的通讯，简化了发送请求的过程。两者相辅相成构建了服务间的高可用通信。

不过在使用后，你也应该会发现 RestTemplate，它只是对 HTTP 的简单封装，像 URL、请求参数、请求头、请求体这些细节都需要我们自己处理，如此底层的操作都暴露出来这肯定不利于项目团队间协作，因此就需要一种封装度更高、使用更简单的技术屏蔽通信底层复杂度。好在 Spring Cloud 团队提供了 OpenFeign 技术，大幅简化了服务间高可用通信处理过程。本讲将主要介绍三部分：

* 介绍 Feign 与 OpenFeign；

* 讲解 OpenFeign 的使用办法；

* 讲解生产环境 OpenFeign 的配置优化。

### Feign 与 OpenFeign

Spring Cloud OpenFeign 并不是独立的技术。它底层基于 Netflix Feign，Netflix Feign 是 Netflix 设计的开源的声明式 WebService 客户端，用于简化服务间通信。Netflix Feign 采用"**接口+注解**"的方式开发，通过模仿 RPC 的客户端与服务器模式（CS），采用接口方式开发来屏蔽网络通信的细节。OpenFeign 则是在 Netflix Feign 的基础上进行封装，结合原有 Spring MVC 的注解，对 Spring Cloud 微服务通信提供了良好的支持。使用 OpenFeign 开发的方式与开发 Spring MVC Controller 颇为相似。下面我们通过代码说明 OpenFeign 的各种开发技巧。

### OpenFeign 的使用办法

为了便于理解，我们模拟实际案例进行说明。假设某电商平台日常订单业务中，为保证每一笔订单不会超卖，在创建订单前订单服务（order-service）首先去仓储服务（warehouse-service）检查对应商品 skuId（品类编号）的库存数量是否足够，库存充足创建订单，不存不足 App 前端提示"库存不足"。


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image6/M00/29/69/CioPOWBhSD6AVJ1jAADZb3zB8iU341.png"/> 
  
订单与仓储服务处理流程

在这个业务中，订单服务依赖于仓储服务，那仓储服务就是服务提供者，订单服务是服务消费者。下面我们通过代码还原这个场景。

首先，先创建仓储服务（warehouse-service），仓储服务作为提供者就是标准微服务，使用 Spring Boot 开发。

第一步，利用 Spring Initializr 向导创建 warehouse-service 工程。确保在 pom.xml 引入以下依赖。

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
```

第二步，编辑 application.yml 新增 Nacos 通信配置。

```yaml
spring:
  application:
    name: warehouse-service #应用/微服务名字
  cloud:
    nacos:
      discovery:
        server-addr: 192.168.31.102:8848 #nacos服务器地址
        username: nacos #用户名密码
        password: nacos
server:
  port: 80
```

第三步，创建 Stock 库存类，用于保存库存数据。

```java
package com.lagou.warehouseservice.dto;
//库存商品对象
public class Stock {
    private Long skuId; //商品品类编号
    private String title; //商品与品类名称
    private Integer quantity; //库存数量
    private String unit; //单位
    private String description; //描述信息
    //带参构造函数
    public Stock(Long skuId, String title, Integer quantity, String unit) {
        this.skuId = skuId;
        this.title = title;
        this.quantity = quantity;
        this.unit = unit;
    }
    //getter and setter省略...
}
```

第四步，创建仓储服务控制器 WarehouseController，通过 getStock() 方法传入 skuId 编号则返回具体商品库存数量，代码中模拟 skuId 编号为 1101 的"紫色 128G iPhone 11"库存 32 台，而编号 1102 的"白色 256G iPhone 11"已没有库存。

```java
package com.lagou.warehouseservice.controller;
//省略 import 部分
//仓储服务控制器
@RestController
public class WarehouseController {
    /**
     * 查询对应 skuId 的库存状况
     * @param skuId skuId
     * @return Stock 库存对象
     */
    @GetMapping("/stock")
    public Stock getStock(Long skuId){
        Map result = new HashMap();
        Stock stock = null;
        if(skuId == 1101l){
            //模拟有库存商品
            stock = new Stock(1101l, "Apple iPhone 11 128GB 紫色", 32, "台");
            stock.setDescription("Apple 11 紫色版对应商品描述");
        }else if(skuId == 1102l){
            //模拟无库存商品
            stock = new Stock(1101l, "Apple iPhone 11 256GB 白色", 0, "台");
            stock.setDescription("Apple 11 白色版对应商品描述");
        }else{
            //演示案例，暂不考虑无对应 skuId 的情况
        }
        return stock;
    }
}
```

可以看到 WarehouseController 就是普通的 Spring MVC 控制器，对外暴露了 stock 接口，当应用启动后，查看 Nacos 服务列表，已出现 warehouse-service 实例。


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image6/M00/1E/2B/Cgp9HWBQbJSAduJQAAI73U_ruyQ393.png"/> 
  
Nacos 注册成功

访问下面的 URL 可看到 Stock 对象 JSON 序列化数据。

```java
http://192.168.31.111/stock?skuId=1101
{
  skuId: 1101,
  title: "Apple iPhone 11 128GB 紫色",
  quantity : 32,
  unit: "台",
  description:"Apple 11 紫色版对应商品描述"
}
```

至此，服务提供者 warehouse-service 示例代码已开发完毕。下面我们要开发服务消费者 order-service。

第一步，确保利用 Spring Initializr 创建 order-service 工程，确保 pom.xml 引入以下 3 个依赖。

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-starter-openfeign</artifactId>
    <version>2.2.5.RELEASE</version>
</dependency>
```

这里关键在于服务消费者依赖了 spring-cloud-starter-openfeign，在 Spring Boot 工程会自动引入 Spring Cloud OpenFeign 与 Netflix Feign 的 Jar 包。这里有个重要细节，当我们引入 OpenFeign 的时候，在 Maven 依赖中会出现 netflix-ribbon 负载均衡器的身影。


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image6/M00/1E/28/CioPOWBQbKGAVNY5AAOIqVeLiUM338.png"/> 
  
OpenFeign 内置 Ribbon 实现负载均衡

没错，OpenFeign 为了保证通信高可用，底层也是采用 Ribbon 实现负载均衡，其原理与 Ribbon+RestTemplate 完全相同，只不过相较 RestTemplate，OpenFeign 封装度更高罢了。

第二步，启用 OpenFeign 需要在应用入口 OrderServiceApplication 增加 @EnableFeignClients 注解，其含义为通知 Spring 启用 OpenFeign 声明式通信。

```java
package com.lagou.orderservice;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
@SpringBootApplication
@EnableFeignClients //启用OpenFeign
public class OrderServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }
}
```

第三步，默认 OpenFeign 并不需要任何配置，在 application.yml 配置好 Nacos 通信即可。

```yaml
spring:
  application:
    name: order-service
  cloud:
    nacos:
      discovery:
        server-addr: 192.168.31.102:8848
        username: nacos
        password: nacos
server:
  port: 80
```

第四步，最重要的地方来了，创建OpenFeign的通信接口与响应对象，这里先给出完整代码。

```java
package com.lagou.orderservice.feignclient;
import com.lagou.orderservice.dto.Stock;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
@FeignClient("warehouse-service")
public interface WarehouseServiceFeignClient {
    @GetMapping("/stock")
    public Stock getStock(@RequestParam("skuId") Long skuId);
}
```

在 order-service 工程下，创建一个 feignclient 包用于保存通信接口。OpenFeign 通过"接口+注解"形式描述数据传输逻辑，并不需要程序员编写具体实现代码便能实现服务间高可用通信，下面我们来学习这段代码：

* @FeignClient 注解说明当前接口为 OpenFeign 通信客户端，参数值 warehouse-service 为服务提供者 ID，这一项必须与 Nacos 注册 ID 保持一致。在 OpenFeign 发送请求前会自动在 Nacos 查询 warehouse-service 所有可用实例信息，再通过内置的 Ribbon 负载均衡选择一个实例发起 RESTful 请求，进而保证通信高可用。

* 声明的方法结构，接口中定义的方法通常与服务提供者的方法定义保持一致。这里有个非常重要的细节：用于接收数据的 Stock 对象并不强制要求与提供者端 Stock 对象完全相同，消费者端的 Stock 类可以根据业务需要删减属性，但属性必须要与提供者响应的 JSON 属性保持一致。距离说明，我们在代码发现消费者端 Stock 的包名与代码与提供者都不尽相同，而且因为消费者不需要 description 属性便将其删除，其余属性只要保证与服务提供者响应 JSON 保持一致，在 OpenFeign 获取响应后便根据 JSON 属性名自动反序列化到 Stock 对象中。

```json
#服务提供者返回的响应
{
    skuId: 1101,
    title: "Apple iPhone 11 128GB 紫色",
    quantity: 32,
    unit: "台",
    description: "Apple 11 紫色版对应商品描述"
}
```

```java
package com.lagou.orderservice.dto;
//消费者端接收响应Stock对象
public class Stock {
    private Long skuId; //商品品类编号
    private String title; //商品与品类名称
    private Integer quantity; //库存数量
    private String unit; //单位
    @Override
    public String toString() {
        return "Stock{" +
                "skuId=" + skuId +
                ", title='" + title + '\'' +
                ", quantity=" + quantity +
                ", unit='" + unit + '\'' +
                '}';
    }
    //getter与setter省略
}
```

* @GetMapping/@PostMapping，以前我们在编写 Spring MVC 控制器时经常使用 @GetMapping 或者@ PostMapping 声明映射方法的请求类型。虽然 OpenFeign 也使用了这些注解，但含义完全不同。在消费者端这些注解的含义是：**OpenFeign 向服务提供者 warehouse-service 的 stock 接口发起 Get 请求**。简单总结下，如果在服务提供者书写 @GetMapping 是说明 Controller 接收数据的请求类型必须是 Get，而写在消费者端接口中则说明 OpenFeign 采用 Get 请求发送数据，大多数情况下消费者发送的请求类型、URI 与提供者定义要保持一致。

* @RequestParam，该注解说明方法参数与请求参数之间的映射关系。举例说明，当调用接口的 getStock() 方法时 skuId 参数值为 1101，那实际通信时 OpenFeign 发送的 Get 请求格式就是：

```java
http://warehouse-service可用实例 ip:端口/stock?skuId=1101
```

介绍每一个细节后，我用自然语言完整描述处理逻辑：

1.在第一次访问 WarehouseServiceFeignClient 接口时，Spring 自动生成接口的实现类并实例化对象。

2.当调用 getStock() 方法时，Ribbon 获取 warehouse-service 可用实例信息，根据负载均衡策略选择合适实例。

3.OpenFeign 根据方法上注解描述的映射关系生成完整的 URL 并发送 HTTP 请求，如果请求方法是 @PostMapping，则参数会附加在请求体中进行发送。

```java
http://warehouse-service 可用实例 ip:端口/stock?skuId=xxx
```

4.warehouse-service 处理完毕返回 JSON 数据，消费者端 OpenFeign 接收 JSON 的同时反序列化到 Stock 对象，并将该对象返回。

到这里我们花了较大的篇幅介绍 OpenFeign 的执行过程，那该怎么使用呢？这就是第五步的事情了。

第五步，在消费者 Controller 中对 FeignClient 接口进行注入，像调用本地方法一样完成业务逻辑。

```java
package com.lagou.orderservice.controller;
import com.lagou.orderservice.dto.Stock;
import com.lagou.orderservice.feignclient.WarehouseServiceFeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import javax.annotation.Resource;
import java.util.LinkedHashMap;
import java.util.Map;
@RestController
public class OrderController {
    //利用@Resource将IOC容器中自动实例化的实现类对象进行注入
    @Resource
    private WarehouseServiceFeignClient warehouseServiceFeignClient;
    /**
     * 创建订单业务逻辑
     * @param skuId 商品类别编号
     * @param salesQuantity 销售数量
     * @return
     */
    @GetMapping("/create_order")
    public Map createOrder(Long skuId , Long salesQuantity){
        Map result = new LinkedHashMap();
        //查询商品库存，像调用本地方法一样完成业务逻辑。
        Stock stock = warehouseServiceFeignClient.getStock(skuId);
        System.out.println(stock);
        if(salesQuantity <= stock.getQuantity()){
            //创建订单相关代码，此处省略
            //CODE=SUCCESS代表订单创建成功
            result.put("code" , "SUCCESS");
            result.put("skuId", skuId);
            result.put("message", "订单创建成功");
        }else{
            //code=NOT_ENOUGN_STOCK代表库存不足
            result.put("code", "NOT_ENOUGH_STOCK");
            result.put("skuId", skuId);
            result.put("message", "商品库存数量不足");
        }
        return result;
    }
}
```

启动后分别传入不同 skuId 与销售数量。可以看到 1101 商品库存充足订单创建成功，1102 商品因为没有库存导致无法创建订单。

```javascript
http://192.168.1.120/create_order?skuId=1101&salesQuantity=1
{
code: "SUCCESS", 
skuId: 1101, 
message: "订单创建成功" 
}
```

创建订单成功消息

```javascript
http://192.168.1.120/create_order?skuId=1102&salesQuantity=1
{
code: "NOT_ENOUGH_STOCK", 
skuId: 1102, 
message: "商品库存数量不足" 
}
```

库存数量不足错误提示

到这里已经基于 OpenFeign 实现了服务间通信。但事情还不算完，OpenFeign 默认的配置并不能满足生产环境的要求，下面咱们来讲解在生产环境下 OpenFeign 还需要哪些必要的优化配置。

### 生产环境 OpenFeign 的配置事项

#### 如何更改 OpenFeign 默认的负载均衡策略

前面提到，在 OpenFeign 使用时默认引用 Ribbon 实现客户端负载均衡。那如何设置 Ribbon 默认的负载均衡策略呢？在 OpenFeign 环境下，配置方式其实与之前 Ribbon+RestTemplate 方案完全相同，只需在 application.yml 中调整微服务通信时使用的负载均衡类即可。

```yaml
warehouse-service: #服务提供者的微服务ID
  ribbon:
    #设置对应的负载均衡类
    NFLoadBalancerRuleClassName: com.netflix.loadbalancer.RandomRule
```

#### 开启默认的 OpenFeign 数据压缩功能

在 OpenFeign 中，默认并没有开启数据压缩功能。但如果你在服务间单次传递数据超过 1K 字节，强烈推荐开启数据压缩功能。默认 OpenFeign 使用 Gzip 方式压缩数据，对于大文本通常压缩后尺寸只相当于原始数据的 10%\~30%，这会极大提高带宽利用率。但有一种情况除外，如果应用属于计算密集型，CPU 负载长期超过 70%，因数据压缩、解压缩都需要 CPU 运算，开启数据压缩功能反而会给 CPU 增加额外负担，导致系统性能降低，这是不可取的。

```yaml
feign:
  compression:
    request:
      # 开启请求数据的压缩功能
      enabled: true
      # 压缩支持的MIME类型
      mime-types: text/xml,application/xml, application/json
      # 数据压缩下限 1024表示传输数据大于1024 才会进行数据压缩(最小压缩值标准)
      min-request-size: 1024
    # 开启响应数据的压缩功能
    response:
      enabled: true
```

#### 替换默认通信组件

OpenFeign 默认使用 Java 自带的 URLConnection 对象创建 HTTP 请求，但接入生产时，如果能将底层通信组件更换为 Apache HttpClient、OKHttp 这样的专用通信组件，基于这些组件自带的连接池，可以更好地对 HTTP 连接对象进行重用与管理。作为 OpenFeign 目前默认支持 Apache HttpClient 与 OKHttp 两款产品。我以OKHttp配置方式为例，为你展现配置方法。

1.引入 feign-okhttp 依赖包。

```xml
<dependency>
    <groupId>io.github.openfeign</groupId>
    <artifactId>feign-okhttp</artifactId>
    <version>11.0</version>
</dependency>
```

2.在应用入口，利用 Java Config 形式初始化 OkHttpClient 对象。

```java
@SpringBootApplication
@EnableFeignClients
public class OrderServiceApplication {
    //Spring IOC容器初始化时构建okHttpClient对象
    @Bean
    public okhttp3.OkHttpClient okHttpClient(){
        return new okhttp3.OkHttpClient.Builder()
                //读取超时时间
                .readTimeout(10, TimeUnit.SECONDS)
                //连接超时时间
                .connectTimeout(10, TimeUnit.SECONDS)
                //写超时时间
                .writeTimeout(10, TimeUnit.SECONDS)
                //设置连接池
                .connectionPool(new ConnectionPool())
                .build();
    }
    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }
}
```

3.在 application.yml 中启用 OkHttp。

```yaml
feign:
  okhttp:
    enabled: true
```

做到这里，我们已将OpenFeign的默认通信对象从URLConnection调整为OKHttp，至于替换为HttpClient组件的配置思路是基本相同的。如果需要了解OpenFeign更详细的配置选项，可以访问Spring Cloud OpenFeign的官方文档进行学习。  
<https://docs.spring.io/spring-cloud-openfeign/docs/2.2.6.RELEASE/reference/html/>

### 小结与预告

本文我们介绍了三方面知识，开始介绍了 Netflix Feign 与 OpenFeign 的关系，之后讲解了如何使用 OpenFeign 实现服务间通信，最后讲解了 3 个在生产环境优化通信的技巧。

这里给你留一道思考题：目前跨进程通信主要有两种方式，基于 HTTP 协议的 RESTful 通信与基于二进制通信的 RPC 远程调用，请你梳理两者的特点与适用场景，可以写在评论区中大家一起探讨。

下一节课，我们将介绍 Alibaba 自家的 RPC 框架 Dubbo 是如何与微服务生态整合的，敬请期待。

