# 第18讲：带你揭开toolkit-activation工具箱的秘密

在前面两课时中，我们详细介绍了 tomcat-7.x-8.x-plugin 插件以及 dubbo-2.7.x-plugin 插件的核心实现。但是在有些场景中，不仅需要通过插件收集开源组件的 Trace 数据，还需要收集某些关键业务逻辑的 Trace 数据。我们可以通过开发新插件的方式来实现该需求，但是成本是非常高的，尤其是当业务代码发生重构时（例如，方法名或是类名改变了），插件也需要随之修改、发布 jar 包，非常麻烦。

### toolkit-trace 插件

SkyWalking 为了解决上述问题，提供了一个 @Trace 注解，我们只要将该注解添加到需要监控的业务方法之上，即可收集到该方法相关的 Trace 数据。

下面我们先通过 demo-webapp 介绍 @Trace 注解的使用和效果。首先，我们定义一个 Service 类------ DemoService：

```java
@Service // Spring的@Service注解
public class DemoService {
    // 添加@Trace注解，使用该注解需要引入apm-toolkit-trace依赖，
    // 在搭建demo-webapp项目时已经介绍过了，pom文件不再展示
    @Trace(operationName = "default-trace-method")
    public void traceMethod() throws Exception {
        Thread.sleep(1000);
        ActiveSpan.tag("trace-method", 
             String.valueOf(System.currentTimeMillis()));
        ActiveSpan.info("traceMethod info Message");
        System.out.println(TraceContext.traceId()); // 打印Trace ID
    }
}
```

然后在 HelloWorldController 中注入 DemoService，并在 "/hello/{words}" 接口中调用 traceMethod() 方法：

```java
@RestController
@RequestMapping("/")
public class HelloWorldController {
    @Autowired
    private DemoService demoService;

    @GetMapping("/hello/{words}")
    public String hello(@PathVariable("words") String words) {
        ... 
        demoService.traceMethod();
        ... // 省略其他方法
    }
}
```

接下来访问 "localhost:8000/hello/xxx" 这个地址等待片刻之后，即可在 SkyWalking Rocketbot 界面中看到相应的 Span 数据，如下图所示：


<Image alt="image.png" src="https://s0.lgstatic.com/i/image/M00/04/26/CgqCHl6zvL-AJxsiAALX11rEFcE040.png"/> 


点击该 Span，可以看到具体的 Tag 信息以及 Log 信息，如下图所示：


<Image alt="image (1).png" src="https://s0.lgstatic.com/i/image/M00/04/26/Ciqc1F6zvMeAIijwAAG4HeGpP1w020.png"/> 


#### 深入工具类原理

了解了 @Trace 注解的使用之后，我们来分析其底层实现。首先我们跳转到 SkyWalking 项目的 apm-toolkit-trace 模块，如下图所示：


<Image alt="image (2).png" src="https://s0.lgstatic.com/i/image/M00/04/26/CgqCHl6zvNCANNntAAF2iT3mNig327.png"/> 


该模块就有前面使用到的 @Trace 注解以及 ActiveSpan、TraceContext 工具类，打开这两个工具类会发现，全部是空实现，那添加 Tag、获取 Trace ID 等操作是如何完成的呢？我在前面介绍 SkyWalking 源码各个模块功能时提到，apm-application-toolkit 模块类似于暴露 API 定义，对应的处理逻辑在 apm-sniffer/apm-toolkit-activation 模块中实现。

在 apm-toolkit-trace-activation 模块的 skywalking-plugin.def 文件中定义了四个 ClassEnhancePluginDefine 实现类：

* ActiveSpanActivation
* TraceAnnotationActivation
* TraceContextActivation
* CallableOrRunnableActivation

这四个 ClassEnhancePluginDefine 实现类的继承关系如下图所示：


<Image alt="image (3).png" src="https://s0.lgstatic.com/i/image/M00/04/26/CgqCHl6zvNmAEeMhAAHH-Xli_I8395.png"/> 


TraceAnnotationActivation 会拦截所有被 @Trace 注解标记的方法所在的类，在 TraceAnnotationActivation 覆盖的 enhanceClass() 方法中可以看到相关实现：

```java
static ClassMatch byMethodAnnotationMatch(String[] annotations){
    return new MethodAnnotationMatch(annotations); 
}
```

MethodAnnotationMatch 在判断一个类是否符合条件时，会遍历类中的全部方法，只要发现一个被 @Trace 注解标记的方法，则该类符合拦截条件。

从 getInstanceMethodsInterceptPoints() 方法中可以看到，@Trace 注解的相关增强逻辑定义在 TraceAnnotationMethodInterceptor 中，其 beforeMethod() 方法会调用 ContextManager.createLocalSpan() 方法创建 LocalSpan（注意，EndpointName 优先从注解配置中获取）。在 afterMethod() 方法中会关闭该 LocalSpan，在 handleMethodException() 方法会将异常堆栈作为 Log 记录在该 LocalSpan 中。

TraceContextActivation 拦截的是 TraceContext.traceId() 这个 static 静态方法，具体增强逻辑在 TraceContextInterceptor 中，其 afterMethod() 方法会调用 ContextManager.getGlobalTraceId() 方法获取当前线程绑定的 Trace ID 并替换 TraceContext.traceId() 方法返回的空字符串。

ActiveSpanActivation 会拦截 ActiveSpan 类中 static 静态方法并交给不同的 Interceptor 进行增强，具体的 static 静态方法与 Interceptor 之间的映射关系如下：


<Image alt="image (4).png" src="https://s0.lgstatic.com/i/image/M00/04/26/CgqCHl6zvOSAJMFjAAIONP7amFM561.png"/> 


这里以 tag() 方法为例，在 ActiveSpanTagInterceptor 的 beforeMethod() 方法中，会获取 activeSpanStack 栈顶的 Span 对象，并调用其 tag() 方法记录 Tag 信息。其他的 ActiveSpan\*Interceptor 会通过 Span.log() 方法记录 Log，这里不再展开。

#### 跨线程传播

前面的课时已经详细介绍了 Trace 信息跨进程传播的实现原理，这里我们简单看一下跨线程传播的场景。这里我们在 HelloWorldService 中启动一个线程池，并改造 DemoService 的调用方式：

```java
@RestController
@RequestMapping("/")
public class HelloWorldController {
    // 启动一个单线程的线程池
    private ExecutorService executorService = 
            Executors.newSingleThreadScheduledExecutor();

    @Autowired
    private DemoService demoService;

    @GetMapping("/hello/{words}")
    public String hello(@PathVariable("words") String words){
        ... // 省略其他调用
        executorService.submit( // 省略try/catch代码块
            // 使用RunnableWrapper对Runnable进行包装，实现Trace跨线程传播
            RunnableWrapper.of(() -> demoService.traceMethod())
        );
        ...
    }
}
```

此时再访问 "<http://localhost:8000/hello/xxx>" 地址，稍等片刻之后，会在 SkyWalking Rocketbot 上看到下图这种分叉的 Trace，其中下面那条 Trace 分支就是通过跨线程传播过去的：


<Image alt="跨线程传播.png" src="https://s0.lgstatic.com/i/image/M00/04/26/Ciqc1F6zvO-AEq9VAAFo-ZWXkGM186.png"/> 


除了通过 RunnableWrapper 包装 Runnable 之外，我们可以通过 CallableWrapper 包装 Callable 实现 Trace 的跨线程传播。下图展示了 Trace 信息跨线程传播的核心原理：


<Image alt="image (5).png" src="https://s0.lgstatic.com/i/image/M00/04/26/Ciqc1F6zvPqAKHZ1AAFedhJrbC8809.png"/> 


下面来看 RunnableWrapper 和 CallableWrapper 的实现原理。toolkit-trace-activation 中的 CallableOrRunnableActivation 会拦截被 @TraceCrossThread 注解标记的类（RunnableWrapper 和 CallableWrapper 都标注了 @TraceCrossThread 注解）。

目标类的构造方法会由 CallableOrRunnableConstructInterceptor 进行增强，其中会调用 capture() 方法将当前 TracingContext 的核心信息填充到 ContextSnapshot 中，并记录到_$EnhancedClassField_ws 字段中：

```java
public void onConstruct(EnhancedInstance objInst, 
       Object[] allArguments) {
    if (ContextManager.isActive()) {
        objInst.setSkyWalkingDynamicField(ContextManager.capture());
    }
}
```

此时的 Runnable（或 Callable）对象就携带了当前线程关联的 Trace 信息。

目标类的 run() 方法或是 callable() 方法由 CallableOrRunnableInvokeInterceptor 进行增强，其 before() 方法会创建 LocalSpan，在上面的 demo-webapp 示例中，线程池中的工作线程没有关联的 TracingContext 也会新创建，之后从增强的 _$EnhancedClassField_ws 字段中获取 ContextSnapshot 对象，将上游线程的数据恢复到新建的 TracingContext 中，具体实现如下：

```java
public void beforeMethod(EnhancedInstance objInst, Method method,
        Object[] allArguments, Class<?>[] argumentsTypes,
            MethodInterceptResult result) throws Throwable {
    // 该调用中会先创建TracingContext，然后创建LocalSpan
    ContextManager.createLocalSpan("Thread/" + 
         objInst.getClass().getName() + "/" + method.getName());
    ContextSnapshot cachedObjects = 
        (ContextSnapshot)objInst.getSkyWalkingDynamicField();
    if (cachedObjects != null) { // 恢复Trace信息
        ContextManager.continued(cachedObjects);
    }
}
```

在 afterMethod() 中会关闭前置增强逻辑中创建的 LocalSpan，同时，为了防止内存泄漏，会清空 _$EnhancedClassField_ws 字段。

### Trace ID 与日志

在实际定位问题的时候，我们可能需要将某个用户的某个请求的 Trace 监控以及相关的日志结合起来进行分析，毕竟 Trace 携带 Log 有限，不会携带请求整个生命周期中全部的日志。为了方便将 Trace 和日志进行关联，一般会在日志开头的固定位置打印 Trace ID，  

application-toolkit 工具箱目前支持 logback、log4j-1.x、log4j-2.x 三个日志框架，下面以 logback 为例演示并分析原理。

#### 日志集成 Trace ID

这里依然通过 demo-webapp 模块为例，介绍如何在日志文件中自动输出 Trace ID。首先我们引入 apm-toolkit-logback-1.x 这个依赖，如下所示：

```html
<dependency>
    <groupId>org.apache.skywalking</groupId>
    <artifactId>apm-toolkit-logback-1.x</artifactId>
    <version>6.2.0</version>
</dependency>
```

接下来在 resource 目录下添加 logback.xml 配置文件，指定日志的输出格式：


<Image alt="image (6).png" src="https://s0.lgstatic.com/i/image/M00/04/26/CgqCHl6zvQeAdq60AAJd-oywE_o373.png"/> 


该配置文件有两个地方需要注意，一个是使用的 layout 为 TraceIdPatternLogbackLayout，该类位于 apm-toolkit-logback-1.x.jar 这个依赖包中，另一个在 pattern 配置中添加了 \[%tid\] 占位符。

在 HelloWorldController 中的 "/hello/world" 接口中，我们添加一条日志输出：

```java
private static final Logger LOGGER = 
       LoggerFactory.getLogger(HelloWorldController.class);

@GetMapping("/hello/{words}")
public String hello(@PathVariable("words") String words)
    LOGGER.info("this is an info log,{}", words);
    ... // 省略其他代码
}
```

最后重启 demo-webapp 项目，访问 "localhost:8000/hello/xxx" 这个地址，就可以在控制台看到如下输出：


<Image alt="image (7).png" src="https://s0.lgstatic.com/i/image/M00/04/26/Ciqc1F6zvRKAMCK4AAHOkonOBic764.png"/> 


#### Logback 核心概念

Logback 日志框架分为三个模块：logback-core、logback-classic 和 logback-access：

* **core 模块**是整个 logback 的核心基础。
* **classic 模块**是在 core 模块上的扩展，classic 模块实现了 SLF4J API。
* **access 模块**主要用于与 Servlet 容器进行集成，实现记录 access-log 的功能。

Logback 日志框架中有三个核心类：Logger、Appender 和 Layout。Logger 主要用来接收要输出的日志内容。每个 Logger 实例都有名字，而 Logger 的继承关系与其名称的层级关系保持一致。例如，现在有 3 个 Logger 实例 L1、L2、L3，L1 的名字为 "com"，L2 的名字为 "com.xxx"，L3 的名字为 "com.xxx.Main"，那么三者的继承关系如下图所示：


<Image alt="image (8).png" src="https://s0.lgstatic.com/i/image/M00/04/26/Ciqc1F6zvRqAVReiAAEEjIqgllA872.png"/> 


其中，名为 "ROOT" 的 Logger 实例是顶层 Logger，它是所有其他 Logger 实例的祖先。

每个 Logger 实例都有对应的 Level 级别，如果未明确指定 Logger 实例的 Level 级别，则默认沿用上层 Logger 实例的 Level 级别，常用的 Level 级别以及 Level 优先级如下 ：

```html
TRACE < DEBUG < INFO < WARN < ERROR
```

在调用 Logger 实例记录日志时会产生对应的日志记录请求，每个日志记录请求也有一个 Level 属性。只有日志记录请求的 Level 属性值大于或等于相应的 Logger 实例的 Level 级别时，该日志记录请求才是有效的。例如，有一个 Logger 实例的 Level 级别为 INFO，调用它的 error() 方法产生的日志记录请求的 Level 级别为 ERROR，ERROR \> INFO，所以该日志记录可以正常输出；如果调用其 debug() 方法，则产生的日志记录请求 Level 级别为 DEBUG，DEBUG \< INFO，则该日志记录无法正常输出。

另外，当一个 Logger 实例的 Level 级别为 OFF 时，任何在该 Logger 实例上产生的日志记录请求都是无效的；当一个 Logger 实例的 Level 级别为 ALL 时，任何在该 Logger 实例上产生的日志记录请求都是有效的。

在使用 Logback 时，我们都是通过下面的方式获取 Logger 实例：

```java
private static final Logger LOGGER =
      LoggerFactory.getLogger(HelloWorldController.class);
```

这个过程底层会查找 LoggerContext 维护的缓存（loggerCache，Map\<String, Logger\> 类型，其中 Key 是 Logger 实例的名字，Value 为相应 Logger 实例）。如果 loggerCache 中存在相应 Logger 实例，会直接返回；否则会创建相应的 Logger 实例并返回，同时也会将该新建的 Logger 实例缓存到 loggerCache 中，也就是说，同名的 Logger 实例全局只有一个实例。另外，在新建 Logger 实例时，会同时把 loggerCache 中不存在的父 Logger 实例都创建好。

Appender 是对日志输出目的地的抽象，在示例中使用的 ConsoleAppender 会将日志打印到控制台，实践中常用的 FileAppender、RollingFileAppender 等会将日志输出到 log 文件中，还有 Appender 可以将日志输出到 MySQL 等持久化存储中，这里不再一一列举 。

一个 Logger 实例上可以绑定多个 Appender 实例，当在 Logger 实例上产生有效的日志记录请求时，日志记录请求会被发送到所有绑定的 Appender 实例上，然后由 Appender 实例进行输出。另外，Logger 实例上绑定的 Appender 实例还可以继承自上层 Logger 实例的 Appender 绑定。

在老版本的 Logback 中， Appender 会通过 Layout 将日志事件转换成字符串，然后输出到 java.io.Writer 中，实现控制日志输出格式的目的。在新版本的 Logback 中，Appender 不再直接使用 Layout，而是使用 Encoder 实现日志事件到字节数组的转换。Encoder 同时会将转换后的字节数组输出到 Appender 维护的 Outputstream 中。

最常用的 Encoder 实现是 PatternLayoutEncoder，继承关系如下图所示。


<Image alt="image (9).png" src="https://s0.lgstatic.com/i/image/M00/04/26/CgqCHl6zvSWAA-ZRAAB1DP_LB58112.png"/> 


从 LayoutWrapperEncoder 中 encode() 方法的实现就可以看出，上述 Encoder 底层还是依赖 Layout 确定日志的格式：

```java
public byte[] encode(E event) {
    String txt = layout.doLayout(event); // 依赖Layout将日志事件转换字符串
    return convertToBytes(txt); // 将字符串转换成字节数组
}
```

PatternLayoutEncoder 底层就是直接依赖 PatternLayout 确定日志格式的。当然，我们可以使用 LayoutWrappingEncoder 并指定其他自定义的 Layout ，实现自定义格式的日志。

那 PatternLayout 是如何根据指定的日志输出格式呢？在示例中， 标签下会配置 标签，其中指定了日志的格式。在 PatternLayoutBase 初始化的时候，会解析 字符串，并创建相应的 Converter，其中每个占位符对应一个 Converter，相关代码片段如下：

```java
public void start() {
    // 解析pattern字符串
    Parser<E> p = new Parser<E>(pattern);
    Node t = p.parse();
    // 根据解析后的pattern创建Converter链表
    this.head = p.compile(t, getEffectiveConverterMap());
    ... ... // 省略其他代码
}
```

Logback 自带的 Converter 实现都在 PatternLayout.defaultConverterMap 集合之中，先来展示了部分 Converter 的功能：

```java
static {
    // DateConverter处理pattern字符串中的"%d"或是"%date"占位符
    defaultConverterMap.put("d", DateConverter.class.getName());
    defaultConverterMap.put("date", DateConverter.class.getName());
    // ThreadConverter处理pattern字符串中的"%t"或是"%thread"占位符
    defaultConverterMap.put("t", ThreadConverter.class.getName());
    defaultConverterMap.put("thread", 
         ThreadConverter.class.getName());
    // MessageConverter处理"%m"、"%msg"、"message"占位符
    defaultConverterMap.put("m", MessageConverter.class.getName());
    defaultConverterMap.put("msg", MessageConverter.class.getName());
    defaultConverterMap.put("message", 
         MessageConverter.class.getName());
    // 省略其他占位符对应的Converter
}
```

Converter 的核心是 convert() 方法，它负责从日志事件中提取相关信息填充占位符，例如， DateConverter.convert() 方法的实现就是获取日志时间来填充 %d（或 %date）占位符：

```java
public String convert(ILoggingEvent le) {
    long timestamp = le.getTimeStamp(); // 获取日志事件
    return cachingDateFormatter.format(timestamp); // 格式化
}
MessageConverter 就是获取日志格式化信息来填充 %m、%msg 或 %message 占位符：
public String convert(ILoggingEvent event) {
    return event.getFormattedMessage();
}
```

#### toolkit-logback-1.x

了解了 Logback 日志框架的核心概念之后，我们回到 demo-webapp 中的 logback.xml 配置文件，这里使用的 Encoder 实现是 LayoutWrappingEncoder，其中指定的 Layout 实现为 SkyWalking 提供的自定义 Layout 实现 ------ TraceIdPatternLogbackLayout，它继承了 PatternLayout 并向 defaultConverterMap 中注册了 %tid 占位符对应的 Converter，具体代码如下：

```java
public class TraceIdPatternLogbackLayout extends PatternLayout {
    static {
        defaultConverterMap.put("tid", 
             LogbackPatternConverter.class.getName());
    }
}
```

LogbackPatternConverter 中的 convert() 方法实现直接返回了 "TID: N/A"。

下面我们跳转到 apm-toolkit-logback-1.x-activation 模块，其 skywalking-plugin.def 文件中指定的 LogbackPatternConverterActivation 会拦截 LogbackPatternConverter 的 convert() 方法，并由 PrintTraceIdInterceptor 进行增强。PrintTraceIdInterceptor.afterMethod() 方法实现中会用当前的 Trace ID 替换 "TID: N/A"返回值：

```java
public Object afterMethod(EnhancedInstance objInst, Method method, 
    Object[] allArguments, Class<?>[] argumentsTypes, Object ret) {
    return "TID:" + ContextManager.getGlobalTraceId(); // 获取 Trace ID
}
```

### 总结

本课时重点介绍了 SkyWalking 中 application-toolkit 工具箱的核心原理。首先介绍了 toolkit-trace 模块中 @Trace 注解、 TraceContext 以及 ActiveSpan 工具类的使用方式，然后深入介绍了它们的核心实现。接下来，通过示例介绍了 SkyWalking 与 Logback 日志框架集成方式，深入分析了 Logback 日志框架的核心概念，最后深入介绍了 toolkit-trace-activation 模块的核心原理。

