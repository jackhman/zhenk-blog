# 08RPC消息：Dubbo与Naco体系如何协同作业

上一节我介绍了什么是 OpenFeign 通信组件，讲解了如何基于 OpenFeign 实现微服务间的高可用通信。本文我们将继续探讨微服务通信话题，了解阿里巴巴自家的 RPC 框架 Dubbo 是如何与 Spring Cloud Alibaba 协同作业的。在本文我们将介绍以下三方面内容：

* 对比 RESTful 与 RPC；

* 介绍 Dubbo 的特点；

* 讲解 Dubbo 与 Spring Cloud Alibaba 的整合过程。

### RESTful 与 RPC 的区别

在微服务定义中提道，每个小服务运行在自己的进程中，并以**轻量级的机制**进行通信。这里并没有明确给出具体的通信方式，只是要求以轻量级的机制进行通信，虽然作者推荐使用 RESTful 作为首选方案，但微服务间通信本身还有另一个轻量级的选择：以 Dubbo 为代表的 RPC通信方式。

那什么是 RPC 呢？RPC 是远程过程调用（Remote Procedure Call）的缩写形式，RPC 与 RESTful 最大的不同是，RPC 采用**客户端（Client) - 服务端（Server）** 的架构方式实现跨进程通信，实现的通信协议也没有统一的标准，具体实现依托于研发厂商的设计。


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image6/M01/1F/21/Cgp9HWBRmtGAJrWGAAS5A1X6ztc358.png"/> 
  
RPC 基于 C/S 架构实现跨进程通信

目前开源市场上 RPC 框架有很多，例如 GoogleRPC、Alibaba Dubbo、Facebook Thrift，每一种产品都有自己的设计与实现方案。

那 RESTful 与 RPC 孰优孰劣呢？我们通过一个表格进行说明：


<Image alt="图片2.png" src="https://s0.lgstatic.com/i/image6/M01/1F/22/Cgp9HWBRmt2APWu8AAH9-fU6l5c006.png"/> 


可以发现，RESTful 通信更适合调用延时不敏感、短连接的场景。而 RPC 则拥有更好的性能，适用于长连接、低延时系统。两者本质是互补的，并不存在孰优孰劣。在微服务架构场景下，因为大多数服务都是轻量级的，同时 90%的任务通过短连接就能实现，因此马丁福勒更推荐使用 RESTful 通信。这只是因为应用场景所决定的，并不代表 RPC 比 RESTful 落后。

在了解 RPC 方式后，我们来聊一聊 RPC领域最具代表性的国产开源框架 Apache Dubbo。

### Apache Dubbo

Dubbo 是阿里巴巴开源的高性能、轻量级的开源 Java 框架，目前被 Apache收录，官网是：

```java
http://dubbo.apache.org/
```


<Image alt="图片22.png" src="https://s0.lgstatic.com/i/image6/M01/1F/22/Cgp9HWBRmuqAa3CBAAIAHzTPLj0715.png"/> 
  
Dubbo的官方介绍

Dubbo 是典型的 RPC 框架的代表，通过客户端/服务端结构实现跨进程应用的高效二进制通信。

Apache Dubbo 提供了六大核心能力：

* 面向接口代理的高性能 RPC 调用；

* 智能容错和负载均衡；

* 服务自动注册和发现；

* 高度可扩展能力；

* 运行期流量调度；

* 可视化的服务治理与运维。


<Image alt="图片3.png" src="https://s0.lgstatic.com/i/image6/M01/1F/1E/CioPOWBRmvaAKTm2AAPyFp0dSf8331.png"/> 
  
Dubbo主要特性

下图我们引用 Dubbo 的官方架构图，讲解 ApacheDubbo 的组成。


<Image alt="图片4.png" src="https://s0.lgstatic.com/i/image6/M00/1F/1F/CioPOWBRmxWANqxoAAIXlEgpEbQ890.png"/> 
  
Dubbo架构图

Dubbo 架构中，包含 5 种角色。

1. **Provider**：RPC服务提供者，Provider 是消息的最终处理者。

2. **Container**：容器，用于启动、停止 Provider 服务。这里的容器并非 Tomcat、Jetty 等 Web 容器，Dubbo 也并不强制要求 Provider 必须具备 Web 能力。Dubbo 的容器是指对象容器，例如 Dubbo 内置的 SpringContainer 容器就提供了利用 Spring IOC 容器管理 Provider 对象的职能。

3. **Consumer**：消费者，调用的发起者。Consumer 需要在客户端持有 Provider 的通信接口才能完成通信过程。

4. **Registry**：注册中心，Dubbo 架构中注册中心与微服务架构中的注册中心职责类似，提供了 Dubbo Provider 的注册与发现职能，Consumer通过 Registry 可以获取Provider 可用的节点实例的 IP、端口等，并产生直接通信。需要注意的是，前面我们讲解的 Alibaba Nacos 除了可以作为微服务架构中的注册中心外，同样对自家的 Dubbo 提供了 RPC 调用注册发现的职责，这是其他 Spring Cloud 注册中心所不具备的功能。

5. **Monitor**：监控器，监控器提供了Dubbo的监控职责。在 Dubbo 产生通信时，Monitor 进行收集、统计，并通过可视化 UI 界面帮助运维人员了解系统进程间的通信状况。Dubbo Monitor 主流产品有 Dubbo Admin、Dubbo Ops 等。

下面我们通过实例讲解 Dubbo 与 Nacos 如何协同作业实现服务间调用

### Dubbo与 Nacos 协同作业

为了方便理解，我们仍然采用 07 讲"订单与库存服务"案例，改由 RPC 方式实现通信。


<Image alt="图片5.png" src="https://s0.lgstatic.com/i/image6/M01/1F/22/Cgp9HWBRmyOAQauOAAGVp6w3uG4991.png"/> 
  
订单与仓储服务的业务流程

#### 开发 Provider仓储服务

第一步，创建工程引入依赖。

利用 Spring Initializr 向导创建 warehouse-service 工程，确保 pom.xml 引入以下依赖。

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
    <groupId>org.apache.dubbo</groupId>
    <artifactId>dubbo-spring-boot-starter</artifactId>
    <version>2.7.8</version>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

相比标准微服务，需要额外依赖 dubbo-spring-boot-starter 与 spring-boot-starter-actuator。其中 dubbo-spring-boot-starter 是 Dubbo 与 Spring Boot 整合最关键的组件，为 Spring Boot 提供了 Dubbo 的默认支持。而 spring-boot-starter-actuator则为微服务提供了监控指标接口，便于监控系统从应用收集各项运行指标。

第二步，设置微服务、Dubbo 与 Nacos 通信选项。

打开 application.yml 文件，配置 Nacos 地址与 Dubbo通信选项。

```yaml
server:
  port: 8000 #服务端口
spring:
  application:
    name: warehouse-service #微服务id
  cloud:
    nacos: #nacos注册地址
      discovery:
        server-addr: 192.168.31.101:8848
        username: nacos
        password: nacos
dubbo: #dubbo与nacos的通信配置
  application:
    name: warehouse-dubbo #provider在Nacos中的应用id
  registry: #Provider与Nacos通信地址，与spring.cloud.nacos地址一致
    address: nacos://192.168.31.101:8848
  protocol: 
    name: dubbo #通信协议名
    port: 20880 #配置通信端口，默认为20880
  scan: 
    base-packages: com.lagou.warehouseservice.dubbo
```

很多人不明白，为什么上面配置了 spring.cloud.nacos.discovery.server-addr 还要在下面配置 dubbo.registry.address 呢？前面介绍架构时介绍了，Dubbo 需要依托 Container（容器）对外暴露服务，而这个容器配置与微服务配置是分开的，需要额外占用一个网络端口20880提供服务。


<Image alt="图片6.png" src="https://s0.lgstatic.com/i/image6/M00/1F/22/Cgp9HWBRmziAAd_LAAE40sLBEjo538.png"/> 
  
Dubbo Provider 端启动时向 Nacos 注册两次

这里还有一个配置点需要特别注意：dubbo.scan.base-packages 代表在 Dubbo 容器启动时自动扫描 com.lagou.warehouseservice.dubbo 包下的接口与实现类，并将这些接口信息在Nacos 进行登记，因此 Dubbo 对外暴露的接口必须放在该包下。

第三步，开发接口与实现类。

**1**. 开发 Stock 库存商品对象。

```java
package com.lagou.warehouseservice.dto;
import java.io.Serializable;
//库存商品对象
public class Stock implements Serializable {
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
    //getter 与 setter...
}
```

注意：Dubbo 在对象传输过程中使用了 JDK 序列化，对象必须实现 Serializable 接口。

**2**. 在 com.lagou.warehouseservice.dubbo包下创建 WarehouseService 接口并声明方法。包名要与 dubbo.scan.base-packages 保持一致。

```java
package com.lagou.warehouseservice.dubbo;
import com.lagou.warehouseservice.dto.Stock;
//Provider接口
public interface WarehouseService {
    //查询库存
    public Stock getStock(Long skuId);
}
```

**3**. 在 com.lagou.warehouseservice.dubbo.impl 包下创建实现类 WarehouseServiceImpl。

```java
package com.lagou.warehouseservice.dubbo.impl;
import com.lagou.warehouseservice.dto.Stock;
import com.lagou.warehouseservice.dubbo.WarehouseService;
import org.apache.dubbo.config.annotation.DubboService;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.Map;
@DubboService
public class WarehouseServiceImpl implements WarehouseService {
    public Stock getStock(Long skuId){
        Map result = new HashMap();
        Stock stock = null;
        if(skuId == 1101l){
            //模拟有库存商品
            stock = new Stock(1101l, "Apple iPhone 11 128GB 紫色", 32, "台");
            stock.setDescription("Apple 11 紫色版对应商品描述");
        }else if(skuId == 1102l){
            //模拟无库存商品
            stock = new Stock(1102l, "Apple iPhone 11 256GB 白色", 0, "台");
            stock.setDescription("Apple 11 白色版对应商品描述");
        }else{
            //演示案例，暂不考虑无对应skuId的情况
        }
        return stock;
    }
}
```

实现逻辑非常简单，不做赘述，重点是在实现类上需要额外增加 @DubboService注解。@DubboService 是 Provider 注解，说明该类所有方法都是服务提供者，加入该注解会自动将类与方法的信息在 Nacos中注册为 Provider。

第四步，启动微服务，验证 Nacos 注册信息。

启动 WarehouseServiceApplication.main()，之后打开下面网址访问 Nacos 服务列表。

```java
http://192.168.31.101:8848/nacos/#/serviceManagement?dataId=&group=&appName=&namespace=
```


<Image alt="图片7.png" src="https://s0.lgstatic.com/i/image6/M01/1F/1F/CioPOWBRm0mAKUgNAALNIHodMII419.png"/> 
  
验证Nacos注册信息

此时在服务列表中出现了 2 条数据，warehouse-service 是仓储微服务的注册信息，providers 开头的是 Dubbo 在 Nacos 的注册 Provider 信息，这也验证了前面介绍 Dubbo 的注册过程。

而查看 Provider详情后，你会得到更多信息，其中包含 Provider 的 IP、端口、接口、方法、pid、版本的明细，方便开发、运维人员对应用进行管理。


<Image alt="图片8.png" src="https://s0.lgstatic.com/i/image6/M01/1F/1F/CioPOWBRm1SAKLjbAAGK7S9aIpY685.png"/> 
  
Provider详情

到这里，仓储服务与 Dubbo Provider 的开发已完成。下面咱们开发Consumer消费者。

#### **开发 Consumer 订单服务**

第一步，创建工程引入依赖。

利用 Spring Initializr 向导创建 order-service 工程，确保 pom.xml 引入以下依赖，依赖部分与 warehouse-service 保持一致。

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
    <groupId>org.apache.dubbo</groupId>
    <artifactId>dubbo-spring-boot-starter</artifactId>
    <version>2.7.8</version>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

第二步，设置微服务、Dubbo 与 Nacos通信选项。  

打开 application.yml文件，配置 Nacos 与 Dubbo 通信选项，因为 order-service 是消费者，因此不需要专门配置端口与 base-packages选项。

```yaml
spring:
  application:
    name: order-service
  cloud:
    nacos:
      discovery:
        server-addr: 192.168.31.101:8848
        username: nacos
        password: nacos
server:
  port: 9000
dubbo:
  application:
    name: order-service-dubbo
  registry:
    address: nacos://192.168.31.101:8848
```

第三步，将 Provider 端接口 WarehouseService 以及依赖的 Stock类复制到 order-service 工程，注意要求包名、类名及代码保持完全一致。当然我这种做法比较原始，在项目环境通常是将接口与依赖的类发布到 Maven 仓库，由 Consumer 直接依赖即可。


<Image alt="图片9.png" src="https://s0.lgstatic.com/i/image6/M01/1F/20/CioPOWBRm2KAIpCRAAJoR7cA3Hw642.png"/> 
  
必须保证 Provider 与 Consumer 接口一致

第四步，Consumer 调用接口实现业务逻辑。

这一步最为关键，先给出代码再进行分析。

```java
@RestController
public class OrderController {
    @DubboReference
    private WarehouseService warehouseService;
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
        Stock stock = warehouseService.getStock(skuId);
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

业务逻辑非常简单，前文讲过不再赘述，关键点是第三行 @DubboReference 注解。该注解用在 Consumer 端，说明 WarehouseService 是 Dubbo Consumer 接口，Spring 会自动生成 WarehouseService 接口的代理实现类，并隐藏远程通信细节，处理流程如下图所示：


<Image alt="图片10 (2).png" src="https://s0.lgstatic.com/i/image6/M00/1F/21/CioPOWBRm8WAUi4pAAFRuMBBSJc896.png"/> 
  
Dubbo Consumer 处理流程

第五步，启动微服务，验证 Nacos 注册信息。

启动 OrderServiceApplication.main()，之后打开下面网址访问 Nacos 服务列表。

```java
http://192.168.31.101:8848/nacos/#/serviceManagement?dataId=&group=&appName=&namespace=
```


<Image alt="图片11.png" src="https://s0.lgstatic.com/i/image6/M01/1F/20/CioPOWBRm3uAW-qFAAJ0jHj71gk377.png"/> 
  
DubboConsumer 注册成功

此时 Consumer 已在服务列表中出现，说明消费者已注册成功。

最后，打开浏览器访问下面网址验证结果。

```javascript
http://192.168.31.106:9000/create_order?skuId=1101&salesQuantity=10
{
code: "SUCCESS",
skuId: 1101,
message: "订单创建成功"
}
```

订单创建成功

```javascript
http://192.168.31.106:9000/create_order?skuId=1102&salesQuantity=1
{
code: "NOT_ENOUGH_STOCK",
skuId: 1102,
message: "商品库存数量不足"
}
```

订单创建失败

至此，Dubbo 与 Nacos 完整的接入流程与开发技巧我们通过案例方式进行了讲解，最后咱们来总结一下。

### 小结与预告

本节主要学习了三方面知识，首先介绍 RPC 与 RESTful 的区别，之后对 Dubbo 架构进行了介绍，最后通过案例详细讲解了 Dubbo 与 Nacos的协同作业过程。

在这里我为你准备了一道思考题：目前以微信、QQ 为代表的即时通信类软件，为保证低延时，通信方式使用 RESTful 还是 RPC 呢？请你把思考后的原因和结果写在评论中，与其他同学们一起交流。

课程预告，下一节咱们将学习微服务的门户：API 网关。理解通过网关如何对用户屏蔽微服务架构的实现细节。

