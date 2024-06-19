# 13生产实践：Sentinel进阶应用场景

上一讲我为各位讲解了 Nacos 配置中心的用途及配置技巧。本讲咱们基于上一讲的成果，学习如何在生产环境下通过 Nacos 实现 Sentinel 规则持久化。本讲咱们将介绍三方面内容：

* Sentinel 与Nacos整合实现规则持久化；

* 自定义资源点进行熔断保护；

* 开发友好的异常处理程序。

### Sentinel 与 Nacos 整合实现规则持久化

细心的你肯定在前面 Sentinel的使用过程中已经发现，当微服务重启以后所有的配置规则都会丢失，其中的根源是默认微服务将 Sentinel 的规则保存在 JVM 内存中，当应用重启后 JVM 内存销毁，规则就会丢失。为了解决这个问题，我们就需要通过某种机制将配置好的规则进行持久化保存，同时这些规则变更后还能及时通知微服务进行变更。

正好，上一讲我们讲解了 Nacos 配置中心的用法，无论是配置数据的持久化特性还是配置中心主动推送的特性都是我们需要的，因此 Nacos 自然就成了 Sentinel 规则持久化的首选。

本讲我们仍然通过实例讲解 Sentinel 与 Nacos 的整合过程。

#### 案例准备

首先，咱们快速构建演示工程 sentinel-sample。

**1**. 利用 Spring Initializr 向导创建 sentinel-sample 工程，pom.xml 增加以下三项依赖。

```xml
<!-- Nacos 客户端 Starter-->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-nacos-discovery</artifactId>
</dependency>
<!-- Sentinel 客户端 Starter-->
<dependency>
    <groupId>com.alibaba.cloud</groupId>
    <artifactId>spring-cloud-starter-alibaba-sentinel</artifactId>
</dependency>
<!-- 对外暴露 Spring Boot 监控指标-->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

**2**. 配置 Nacos 与 Sentinel 客户端。

```yaml
spring:
  application:
    name: sentinel-sample #应用名&微服务 id
  cloud:
    sentinel: #Sentinel Dashboard 通信地址
      transport:
        dashboard: 192.168.31.10:9100
      eager: true #取消控制台懒加载
    nacos: #Nacos 通信地址
      server-addr: 192.168.31.10:8848
      username: nacos
      password: nacos
  jackson:
    default-property-inclusion: non_null
server:
  port: 80
management:
  endpoints:
    web: #将所有可用的监控指标项对外暴露
      exposure: #可以访问 /actuator/sentinel进行查看Sentinel监控项
        include: '*'
logging:
  level:
    root: debug #开启 debug 是学习需要，生产改为 info 即可
```

**3**. 在 sentinel-sample服务中，增加 SentinelSampleController 类，用于演示运行效果。

```java
@RestController
public class SentinelSampleController {
    //演示用的业务逻辑类
    @Resource
    private SampleService sampleService;
    /**
     * 流控测试接口
     * @return
     */
    @GetMapping("/test_flow_rule")
    public ResponseObject testFlowRule(){
        //code=0 代表服务器处理成功
        return new ResponseObject("0","success!");
    }

    /**
     * 熔断测试接口
     * @return
     */
    @GetMapping("/test_degrade_rule")
    public ResponseObject testDegradeRule(){
        try {
            sampleService.createOrder();
        }catch (IllegalStateException e){
            //当 createOrder 业务处理过程中产生错误时会抛出IllegalStateException
            //IllegalStateException 是 JAVA 内置状态异常，在项目开发时可以更换为自己项目的自定义异常
            //出现错误后将异常封装为响应对象后JSON输出
            return new ResponseObject(e.getClass().getSimpleName(),e.getMessage());
        }
        return new ResponseObject("0","order created!");
    }
}
```

此外，ResponseObject 对象封装了响应的数据。

```java
/**
 * 封装响应数据的对象
 */
public class ResponseObject {
    private String code; //结果编码，0-固定代表处理成功
    private String message;//响应消息
    private Object data;//响应附加数据（可选）
 
    public ResponseObject(String code, String message) {
        this.code = code;
        this.message = message;
    }
    //Getter/Setter省略
}
```

**4**. 额外增加 SampleService 用于模拟业务逻辑，等下我们将用它讲解自定义资源点与熔断设置。

```java
/**
 * 演示用的业务逻辑类
 */
@Service
public class SampleService {
    //模拟创建订单业务
    public void createOrder(){
        try {
            //模拟处理业务逻辑需要101毫秒
            Thread.sleep(101);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        System.out.println("订单已创建");
    }
}
```

启动 sentinel-sample，访问[http://localhost/test_flow_rule](http://localhost/test_flow_rule?fileGuid=xxQTRXtVcqtHK6j8)，浏览器出现code=0 的 JSON 响应，说明 sentinel-sample 服务启动成功。

```json
{
    code: "0",
    message: "success!"
}
```

#### 流控规则持久化

工程创建完成，下面咱们将 Sentinel接入 Nacos 配置中心。

第一步，pom.xml 新增 sentinel-datasource-nacos 依赖。

```xml
<dependency>
    <groupId>com.alibaba.csp</groupId>
    <artifactId>sentinel-datasource-nacos</artifactId>
</dependency>
```

sentinel-datasource-nacos 是 Sentinel 为 Nacos 扩展的数据源模块，允许将规则数据存储在 Nacos 配置中心，在微服务启动时利用该模块 Sentinel 会自动在 Nacos下载对应的规则数据。

第二步，在application.yml 文件中增加 Nacos下载规则，在原有的sentinel 配置下新增 datasource 选项。这里咱们暂时只对流控规则进行设置，重要配置项我在代码中进行了注释，请同学们仔细阅读。

```yaml
spring:
  application:
    name: sentinel-sample #应用名&微服务id
  cloud:
    sentinel: #Sentinel Dashboard通信地址
      transport:
        dashboard: 192.168.31.10:9100
      eager: true #取消控制台懒加载
      datasource:
        flow: #数据源名称，可以自定义
          nacos: #nacos配置中心
            #Nacos内置配置中心，因此重用即可
            server-addr: ${spring.cloud.nacos.server-addr} 
            dataId: ${spring.application.name}-flow-rules #定义流控规则data-id，完整名称为:sentinel-sample-flow-rules，在配置中心设置时data-id必须对应。
            groupId: SAMPLE_GROUP #gourpId对应配置文件分组，对应配置中心groups项
            rule-type: flow #flow固定写死，说明这个配置是流控规则
            username: nacos #nacos通信的用户名与密码
            password: nacos
    nacos: #Nacos通信地址
      server-addr: 192.168.31.10:8848
      username: nacos
      password: nacos
    ...
```

通过这一份配置，微服务在启动时就会自动从 Nacos 配置中心 SAMPLE_GROUP 分组下载 data-id 为 sentinel-sample-flow-rules 的配置信息并将其作为流控规则生效。  

第三步，在 Nacos 配置中心页面，新增 data-id 为sentinel-sample-flow-rules 的配置项。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image6/M00/27/B7/Cgp9HWBdlU2AH_74AADL3_g2qEo343.png"/> 
  
流控规则设置

这里 data-id 与 groups 与微服务应用的配置保持对应，最核心的配置内容采用 JSON 格式进行书写，我们来分析下这段流控规则。

```json
[
    {
        "resource":"/test_flow_rule", #资源名，说明对那个URI进行流控
        "limitApp":"default",  #命名空间，默认default
        "grade":1, #类型 0-线程 1-QPS
        "count":2, #超过2个QPS限流将被限流
        "strategy":0, #限流策略: 0-直接 1-关联 2-链路
        "controlBehavior":0, #控制行为: 0-快速失败 1-WarmUp 2-排队等待
        "clusterMode":false #是否集群模式
    }
]
```

仔细观察不难发现，这些配置项与 Dashboard UI 中的选项是对应的，其实使用 DashboardUI 最终目的是为了生成这段 JSON 数据而已，只不过通过 UI 更容易使用罢了。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M00/27/B4/CioPOWBdlVmAUv8YAADoB7vbrZs676.png"/> 
  
Sentinel Dashboard 流控设置界面

关于这些设置项的各种细节，有兴趣的同学可以访问 Sentinel 的 GitHub 文档进行学习。

[https://github.com/alibaba/Sentinel/wiki/%E6%B5%81%E9%87%8F%E6%8E%A7%E5%88%B6](https://github.com/alibaba/Sentinel/wiki/%E6%B5%81%E9%87%8F%E6%8E%A7%E5%88%B6?fileGuid=xxQTRXtVcqtHK6j8)

最后，我们启动应用来验证流控效果。

访问 [http://localhost/test_flow_rule](http://localhost/test_flow_rule?fileGuid=xxQTRXtVcqtHK6j8)，在日志中将会看到这条 Debug 信息，说明在服务启动时已向 Nacos 配置中心获取到流控规则。

```java
DEBUG 12728 --- [main] s.n.www.protocol.http.HttpURLConnection  : sun.net.www.MessageHeader@5432948015 pairs: {GET /nacos/v1/cs/configs?dataId=sentinel-sample-flow-rules&accessToken=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJuYWNvcyIsImV4cCI6MTYxMDg3NTA1M30.Hq561OkXuAqPI20IBsnPIn0ia86R9sZgdWwa_K8zwvw&group=SAMPLE_GROUP HTTP/1.1: null}...
```

咱们在浏览器反复刷新，当 test_flow_rule 接口每秒超过 2 次访问，就会出现"Blocked by Sentinel (flow limiting)"的错误信息，说明流控规则已生效。

之后我们再来验证能否自动推送新规则，将Nacos 配置中心中流控规则 count 选项改为 1。

```json
[
    {
        "resource":"/test_flow_rule", 
        "limitApp":"default",
        "grade":1, 
        "count":1, #2改为1 
        "strategy":0, 
        "controlBehavior":0, 
        "clusterMode":false 
    }
]
```

修改后的流控规则

当新规则发布后，sentinel-sample控制台会立即收到下面的日志，说明新的流控规则即时生效。

```java
DEBUG 12728 --- [.168.31.10_8848] s.n.www.protocol.http.HttpURLConnection  : sun.net.www.MessageHeader@41257f3915 pairs: {GET /nacos/v1/cs/configs?dataId=sentinel-sample-flow-rules&accessToken=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJuYWNvcyIsImV4cCI6MTYxMDg3NTA1M30.Hq561OkXuAqPI20IBsnPIn0ia86R9sZgdWwa_K8zwvw&group=SAMPLE_GROUP HTTP/1.1: null}
```

在无须重启的情况下，test_flow_rule 接口 QPS 超过 1 就会直接报错。

与此同时，我们还可以通过 Spring Boot Actuator 提供的监控指标确认流控规则已生效。

访问 [http://localhost/actuator/sentinel](http://localhost/actuator/sentinel?fileGuid=xxQTRXtVcqtHK6j8)，在 flowRules 这个数组中，可以看到 test_flow_rule 的限流规则，每一次流控规则产生改变时 Nacos 都会主动推送到微服务并立即生效。


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image6/M01/27/B7/Cgp9HWBdlZCALcRVAADl835eOig018.png"/> 
  
新的流控规则

### 自定义资源点进行熔断保护

讲到这，我们已经实现了 test_flow_rule 接口的流控规则，但你发现了没有，在前面一系列 Sentinel 的讲解中我们都是针对 RESTful 的接口进行限流熔断设置，但是在项目中有的时候是要针对某一个 Service 业务逻辑方法进行限流熔断等规则设置，这要怎么办呢？

在 sentinel-core 客户端中为开发者提供了 @SentinelResource 注解，该注解允许在程序代码中自定义 Sentinel 资源点来实现对特定方法的保护，下面我们以熔断降级规则为例来进行讲解。熔断降级是指在某个服务接口在执行过程中频繁出现故障的情况下，在一段时间内将服务停用的保护措施。

在 sentinel-core 中基于 Spring AOP（面向切面技术）可在目标 Service 方法执行前按熔断规则进行检查，只允许有效的数据被送入目标方法进行处理。

还是以 sentinel-sample 工程为例，我希望对 SampleSerivce.createOrder方法进行熔断保护，该如何设置呢？

**第一步，声明切面类。**

在应用入口 SentinelSampleApplication声明 SentinelResourceAspect，SentinelResourceAspect就是 Sentinel 提供的切面类，用于进行熔断的前置检查。

```java
@SpringBootApplication
public class SentinelSampleApplication {
    // 注解支持的配置Bean
    @Bean
    public SentinelResourceAspect sentinelResourceAspect() {
        return new SentinelResourceAspect();
    }
    public static void main(String[] args) {
        SpringApplication.run(SentinelSampleApplication.class, args);
    }
}
```

第二步，声明资源点。

在 SampleService.createOrder 方法上增加 @SentinelResource 注解用于声明 Sentinel 资源点，只有声明了资源点，Sentinel 才能实施限流熔断等保护措施。

```java
/**
 * 演示用的业务逻辑类
 */
@Service
public class SampleService {
    //资源点名称为createOrder
    @SentinelResource("createOrder")
    /**
     * 模拟创建订单业务
     * 抛出IllegalStateException异常用于模拟业务逻辑执行失败的情况
     */
    public void createOrder() throws IllegalStateException{
        try {
            //模拟处理业务逻辑需要101毫秒
            Thread.sleep(101);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        System.out.println("订单已创建");
    }
}
```

修改完毕，启动服务访问 [http://localhost/test_degrade_rule](http://localhost/test_degrade_rule?fileGuid=xxQTRXtVcqtHK6j8)，当见到 code=0 的JSON 响应便代表应用运行正常。

```java
{
    code: "0",
    message: "order created!"
}
```

然后打开访问 Sentinel Dashboard，在簇点链路中要确认 createOrder资源点已存在。


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image6/M01/27/B7/Cgp9HWBdlaqATmTiAAFaj_pNHQg367.png"/> 
  
createOrder 资源点已生效

第三步，获取熔断规则。

打开sentinel-sample 工程的 application.yml 文件，将服务接入 Nacos 配置中心的参数以获取熔断规则。

```yaml
datasource:
  flow: #之前的流控规则，直接忽略
    ...
  degrade: #熔断规则
    nacos:
      server-addr: ${spring.cloud.nacos.server-addr}
      dataId: ${spring.application.name}-degrade-rules
      groupId: SAMPLE_GROUP
      rule-type: degrade #代表熔断
     username: nacos
     password: nacos
```

熔断规则的获取过程和前面流控规则类似，只不过 data-id 改为sentinel-sample-degrade-rules，以及 rule-type 更改为 degrade。

启动过程中，出现下面日志代表配置成功。

```java
[main] s.n.www.protocol.http.HttpURLConnection  : sun.net.www.MessageHeader@d96945215 pairs: {GET /nacos/v1/cs/configs?dataId=sentinel-sample-degrade-rules&accessToken=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJuYWNvcyIsImV4cCI6MTYxMDg5MDMwNH0.ooHkFb4zX14klmHMuLXTDkHSoCrwI8LtN7ex__9tMHg&group=SAMPLE_GROUP HTTP/1.1: null}...
```

第四步，在 Nacos 配置熔断规则。  

设置 data-id 为 sentinel-sample-degrade-rules，Groups 为 SAMPLE_GROUP与微服务的设置保持一致。


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image6/M01/27/B7/Cgp9HWBdlbaAND8LAAChJna7ALA579.png"/> 


配置内容如下，我对每一项也做了说明。

```json
[{
    "resource": "createOrder", #自定义资源名
    "limitApp": "default", #命名空间
    "grade": 0, #0-慢调用比例 1-异常比例 2-异常数
    "count": 100, #最大RT 100毫秒执行时间
    "timeWindow": 5, #时间窗口5秒
    "minRequestAmount": 1, #最小请求数
    "slowRatioThreshold": 0.1 #比例阈值
}]
```

上面这段 JSON 完整的含义是：在过去 1 秒内，如果 createOrder资源被访问 1 次后便开启熔断检查，如果其中有 10% 的访问处理时间超过 100 毫秒，则触发熔断 5 秒钟，这期间访问该方法所有请求都将直接抛出 DegradeException，5 秒后该资源点回到"半开"状态等待新的访问，如果下一次访问处理成功，资源点恢复正常状态，如果下一次处理失败，则继续熔断 5 秒钟。  

<Image alt="图片1-.png" src="https://s0.lgstatic.com/i/image6/M01/2A/57/Cgp9HWBihaeAcu_rAADj7f0dzWU991.png"/> 
  
熔断机制示意图

设置成功，访问 Spring Boot Actuator[http://localhost/actuator/sentinel](http://localhost/actuator/sentinel?fileGuid=xxQTRXtVcqtHK6j8)，可以看到此时 gradeRules 数组下 createOrder 资源点的熔断规则已被 Nacos推送并立即生效。


<Image alt="Drawing 6.png" src="https://s0.lgstatic.com/i/image6/M01/27/B4/CioPOWBdldiAfwYZAADXzZezOVY956.png"/> 
  
自定义资源点熔断规则

下面咱们来验证下，因为规则允许最大时长为 100 毫秒，而在 createOrder 方法中模拟业务处理需要 101 毫秒，显然会触发熔断。

```java
@SentinelResource("createOrder")
//模拟创建订单业务
public void createOrder(){
    try {
        //模拟处理业务逻辑需要101毫秒
        Thread.sleep(101);
    } catch (InterruptedException e) {
        e.printStackTrace();
    }
    System.out.println("订单已创建");
}
```

连续访问 [http://localhost/test_degrade_rule](http://localhost/test_degrade_rule?fileGuid=xxQTRXtVcqtHK6j8)，当第二次访问时便会出现 500 错误。


<Image alt="Drawing 7.png" src="https://s0.lgstatic.com/i/image6/M01/27/B4/CioPOWBdlfWASfRYAACZB-pUThM812.png"/> 
  
已触发熔断的错误提示

在控制台日志也看到了 ERROR 日志，说明熔断已生效。

```java
2021-01-17 17:19:44.795 ERROR 13244 --- [p-nio-80-exec-3] o.a.c.c.C.[.[.[/].[dispatcherServlet]    : Servlet.service() for servlet [dispatcherServlet] in context with path [] threw exception [Request processing failed; nested exception is java.lang.reflect.UndeclaredThrowableException] with root cause
com.alibaba.csp.sentinel.slots.block.degrade.DegradeException: null
```

看到 DegradeException 就说明之前配置的熔断规则已经生效。

讲到这，我们已经将 Sentinel 规则在 Nacos配置中心进行了持久化，并通过 Nacos 的推送机制做到新规则的实时更新，但在刚才的过程中，我们在触发流控或熔断后默认的错误提示是非常不友好的，在真正的项目中还需要对异常进行二次处理才能满足要求。

### 开发友好的异常处理程序

对于 Sentinel 的异常处理程序要区分为两种情况：

* 针对 RESTful 接口的异常处理；

* 针对自定义资源点的异常处理。

#### 针对 RESTful 接口的异常处理

默认情况下如果访问触发了流控规则，则会直接响应异常信息"BlockedbySentinel (flow limiting)"。


<Image alt="Drawing 8.png" src="https://s0.lgstatic.com/i/image6/M00/27/B7/Cgp9HWBdlgWAeKZlAAAq3uzq-uA090.png"/> 
  
触发流控的默认错误信息

我们都知道，RESTful接口默认应返回 JSON 格式数据，如果直接返回纯文本，调用者将无法正确解析，所以咱们要对其进行封装提供更友好的 JSON 格式数据。

针对 RESTful 接口的统一异常处理需要实现 BlockExceptionHandler，我们先给出完整代码。

```java
@Component //Spring IOC实例化并管理该对象
public class UrlBlockHandler implements BlockExceptionHandler {
    /**
     * RESTFul异常信息处理器
     * @param httpServletRequest
     * @param httpServletResponse
     * @param e
     * @throws Exception
     */
    @Override
    public void handle(HttpServletRequest httpServletRequest, HttpServletResponse httpServletResponse, BlockException e) throws Exception {
        String msg = null;
        if(e instanceof FlowException){//限流异常
            msg = "接口已被限流";
        }else if(e instanceof DegradeException){//熔断异常
            msg = "接口已被熔断,请稍后再试";
        }else if(e instanceof ParamFlowException){ //热点参数限流
            msg = "热点参数限流"; 
        }else if(e instanceof SystemBlockException){ //系统规则异常
            msg = "系统规则(负载/....不满足要求)";
        }else if(e instanceof AuthorityException){ //授权规则异常
            msg = "授权规则不通过"; 
        }
        httpServletResponse.setStatus(500);
        httpServletResponse.setCharacterEncoding("UTF-8");
        httpServletResponse.setContentType("application/json;charset=utf-8");
        //ObjectMapper是内置Jackson的序列化工具类,这用于将对象转为JSON字符串
        ObjectMapper mapper = new ObjectMapper();
        //某个对象属性为null时不进行序列化输出
        mapper.setSerializationInclusion(JsonInclude.Include.NON_NULL);
        mapper.writeValue(httpServletResponse.getWriter(),
                new ResponseObject(e.getClass().getSimpleName(), msg)
        );
    }
}
```

BlockExceptionHandler.handle() 方法第三个参数类型是 BlockException，它有五种子类代表不同类型的规则异常。

**1** . FlowException：流控规则异常。  
**2** . DegradeException：熔断规则异常。  
**3**. ParamFlowException：热点参数规则异常。

例如：针对 id=5 的冷门商品编号时不开启限流，针对 id=10 的热门商品编号则需要进行限流，当 10 号商品被限流时抛出热点参数异常。

**4**.SystemBlockException：系统规则异常。

例如：服务器 CPU 负载超过80%，抛出系统规则异常。

**5**. AuthorityException：授权规则异常。

例如：某个 IP 被列入黑名单，该 IP 在访问时就会抛出授权规则异常。

我们利用 instanceof关键字确定具体的规则异常后，便通过response 响应对象将封装好的 ResponseObject对象返回给应用前端，此时响应中 code 值不再为 0，而是对应的异常类型。

例如，当 RESTful触发流控规则后，前端响应如下：

```json
{
    code: "FlowException",
    message: "接口已被限流"
}
```

当触发熔断规则后，前端响应如下。

```json
{
    code: "DegradeException",
    message: "接口已被熔断,请稍后再试"
}
```

通过这种统一而通用的异常处理机制，对RESTful 屏蔽了sentinel-core默认的错误文本，让项目采用统一的 JSON 规范进行输出。

说完了 RESTful 的异常处理，咱们再来说一说自定义资源点如何控制异常信息。

#### 自定义资源点的异常处理

自定义资源点的异常处理与 RESTful 接口处理略有不同，我们需要在 @SentinelResource 注解上额外附加 blockHandler属性进行异常处理，这里先给出完整代码。

```java
/**
 * 演示用的业务逻辑类
 */
@Service
public class SampleService {
    @SentinelResource(value = "createOrder",blockHandler = "createOrderBlockHandler")
    /**
     * 模拟创建订单业务
     * 抛出 IllegalStateException 异常用于模拟业务逻辑执行失败的情况
     */
    public void createOrder() throws IllegalStateException{
        try {
            //模拟处理业务逻辑需要 101 毫秒
            Thread.sleep(101);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        System.out.println("订单已创建");
    }
    public void createOrderBlockHandler(BlockException e) throws IllegalStateException{
        String msg = null;
        if(e instanceof FlowException){//限流异常
            msg = "资源已被限流";
        }else if(e instanceof DegradeException){//熔断异常
            msg = "资源已被熔断,请稍后再试";
        }else if(e instanceof ParamFlowException){ //热点参数限流
            msg = "热点参数限流";
        }else if(e instanceof SystemBlockException){ //系统规则异常
            msg = "系统规则(负载/....不满足要求)";
        }else if(e instanceof AuthorityException){ //授权规则异常
            msg = "授权规则不通过";
        }
        throw new IllegalStateException(msg);
    }
}
```

在这份代码中可以清楚地看到以下两点变化。

第一，我们为 @SentinelResource 附加了 blockHandler 属性，这个属性指向 createOrderBlockHandler 方法名，它的作用是当 sentinel-core 触发规则异常后，自动执行 createOrderBlockHandler 方法进行异常处理。

第二，createOrderBlockHandler 方法的书写有两个要求：

* 方法返回值、访问修饰符、抛出异常要与原始的 createOrder 方法完全相同。

* createOrderBlockHandler 方法名允许自定义，但最后一个参数必须是 BlockException 对象，这是所有规则异常的父类，通过判断 BlockException 我们就知道触发了哪种规则异常。

至于 createOrderBlockHandler 方法的代码和 RESTful 异常处理基本一致，先判断规则异常的种类再对外抛出 IllegalStateException异常。SampleController 会对 IllegalStateException 异常进行捕获，对外输出为 JSON 响应。

当程序运行后，咱们看一下结果。

访问 [http://localhost/test_degrade_rule](http://localhost/test_degrade_rule?fileGuid=xxQTRXtVcqtHK6j8) 当触发流控规则后，响应如下：

```json
{
    code: "IllegalStateException",
    message: "资源已被限流"
}
```

当触发熔断规则后，响应如下：

```json
{
    code: "IllegalStateException",
    message: "资源已被熔断,请稍后再试"
}
```

讲到这里，我们针对在生产实践中 Sentinel 必然会涉及的应用场景进行了讲解，下面咱们进行总结。

### 小结与预告

本讲咱们学习了三方面内容，首先通过流控案例说明如何利用 Nacos 配置中心将 Sentinel 规则持久化存储，并利用 Nacos 的推送功能实现新规则的实时更新；其次咱们通过熔断规则学习了 @SentinelResource 注解的用法，同时将自定义资源点的熔断规则放入 Nacos 进行持久化；最后针对流控熔断中默认非常不友好的异常输出，咱们利用Sentinel 自带的机制逐一进行的优化，生成了符合项目要求的友好的 JSON 格式数据。

在这里我为你留一道自习题：Sentinel 除了流控与熔断外，还有三种不常用的规则：

* 热点参数流控；

* 系统规则；

* 授权规则（黑白名单）。

请你自行前往 Sentinel 官网文档[https://github.com/alibaba/Sentinel/wiki](https://github.com/alibaba/Sentinel/wiki?fileGuid=xxQTRXtVcqtHK6j8) 进行学习。

到这里关于 Sentinel 的话题咱们告一段落。下一讲开始进入新的篇章，学习微服务架构下的链路追踪技术。

