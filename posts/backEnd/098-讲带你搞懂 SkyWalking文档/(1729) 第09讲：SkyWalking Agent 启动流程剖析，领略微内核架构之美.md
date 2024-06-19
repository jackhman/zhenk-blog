# 第09讲：SkyWalkingAgent启动流程剖析，领略微内核架构之美

通过此前 8 个课时的学习，相信你已经了解了 SkyWalking Agent 是通过 Java Agent 的方式随应用程序一起启动，然后通过 Byte Buddy 库动态插入埋点收集 Trace 信息。从本课时开始，我会带你深入研究 SkyWalking Agent 的架构、原理以及具体实现，还将深入分析 Tomcat、Dubbo、MySQL 等常用的插件。

### 微内核架构

SkyWalking Agent 采用了微内核架构（Microkernel Architecture），那什么是微内核架构呢？微内核架构也被称为插件化架构（Plug-in Architecture），是一种面向功能进行拆分的可扩展性架构。在基于产品的应用中通常会使用微内核架构，例如，IDEA、Eclipse 这类 IDE 开发工具，内核都是非常精简的，对 Maven、Gradle 等新功能的支持都是以插件的形式增加的。

如下图所示，微内核架构分为核心系统和插件模块两大部分。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/08/53/Ciqah16FsIuAY29rAADXS1mP1qk235.png"/> 


在上图展示的微内核架构中，内核功能是比较稳定的，只负责管理插件的生命周期，不会因为系统功能的扩展而不断进行修改。功能上的扩展全部封装到插件之中，插件模块是独立存在的模块，包含特定的功能，能拓展核心系统的功能。通常，不同的插件模块互相之间独立，当然，你可以设计成一个插件依赖于另外一个插件，但应尽量让插件之间的相互依赖关系降低到最小，避免繁杂的依赖带来扩展性问题。

最终所有插件会由内核系统统一接入和管理：

* 首先，内核系统必须知道要加载哪些插件，一般会通过配置文件或是扫描 ClassPath 的方式（例如前文介绍的 SPI 技术）确定待加载的插件；
* 之后，内核系统还需要了解如何使用这些插件，微内核架构中需要定义一套插件的规范，内核系统会按照统一的方式初始化、启动这些插件；
* 最后，虽然插件之间完全解耦，但实际开发中总会有一些意想不到的需求会导致插件之间产生依赖或是某些底层插件被复用，此时内核需要提供一套规则，识别插件消息并能正确的在插件之间转发消息，成为插件消息的中转站。

由此可见微内核架构的好处：

* 测试成本下降。从软件工程的角度看，微内核架构将变化的部分和不变的部分拆分，降低了测试的成本，符合设计模式中的开放封闭原则。
* 稳定性。由于每个插件模块相对独立，即使其中一个插件有问题，也可以保证内核系统以及其他插件的稳定性。
* 可扩展性。在增加新功能或接入新业务的时候，只需要新增相应插件模块即可；在进行历史功能下线时，也只需删除相应插件模块即可。

SkyWalking Agent 就是微内核架构的一种落地方式。在前面的课时中我已经介绍了 SkyWalking 中各个模块的功能，其中 apm-agent-core 模块对应微内核架构中的内核系统，apm-sdk-plugin 模块中的各个子模块都是微内核架构中的插件模块。

### SkyWalking Agent 启动流程概述

此前，在搭建 SkyWalking 源码环境的最后，我们尝试 Debug 了一下 SkyWalking Agent 的源码，其入口是 apm-agent 模块中 SkyWalkingAgent 类的 premain() 方法，其中完成了 Agent 启动的流程：

1. 初始化配置信息。该步骤中会加载 agent.config 配置文件，其中会检测 Java Agent 参数以及环境变量是否覆盖了相应配置项。
2. 查找并解析 skywalking-plugin.def 插件文件。
3. AgentClassLoader 加载插件。
4. PluginFinder 对插件进行分类管理。
5. 使用 Byte Buddy 库创建 AgentBuilder。这里会根据已加载的插件动态增强目标类，插入埋点逻辑。
6. 使用 JDK SPI 加载并启动 BootService 服务。BootService 接口的实现会在后面的课时中展开详细介绍。
7. 添加一个 JVM 钩子，在 JVM 退出时关闭所有 BootService 服务。

SkywalkingAgent.premain() 方法的具体实现如下，其中省略了 try/catch 代码块以及异常处理逻辑：

```java
public static void premain(String agentArgs, 
       Instrumentation instrumentation) throws PluginException {
    // 步骤1、初始化配置信息
    SnifferConfigInitializer.initialize(agentArgs); 
    // 步骤2~4、查找并解析skywalking-plugin.def插件文件；
    // AgentClassLoader加载插件类并进行实例化；PluginFinder提供插件匹配的功能
    final PluginFinder pluginFinder = new PluginFinder(
       new PluginBootstrap().loadPlugins());
    // 步骤5、使用 Byte Buddy 库创建 AgentBuilder
    final ByteBuddy byteBuddy = new ByteBuddy()
       .with(TypeValidation.of(Config.Agent.IS_OPEN_DEBUGGING_CLASS));
    new AgentBuilder.Default(byteBuddy)...installOn(instrumentation);
    // 这里省略创建 AgentBuilder的具体代码，后面展开详细说
    // 步骤6、使用 JDK SPI加载的方式并启动 BootService 服务。
    ServiceManager.INSTANCE.boot();
    // 步骤7、添加一个JVM钩子
    Runtime.getRuntime().addShutdownHook(new Thread(new Runnable() {
      public void run() { ServiceManager.INSTANCE.shutdown(); }
    }, "skywalking service shutdown thread"));
}
```

了解了 SkyWalking Agent 启动的核心步骤之后，本课时剩余部分将对每个步骤进行深入分析。

### 初始化配置

在启动 demo-webapp 和 demo-provider 两个 demo 应用的时候，需要在 VM options 中指定 agent.confg 配置文件（skywalking_config 参数），agent.config 配置文件中的配置项如下：

```java
# 当前应用的服务名称，通过Skywalking Agent上报的Metrics、Trace数据都会
# 携带该信息进行标识
agent.service_name=${SW_AGENT_NAME:Your_ApplicationName}
```

在 SnifferConfigInitializer.initialize() 方法中会将最终的配置信息填充到 Config 的静态字段中，填充过程如下：

1. 将 agent.config 文件中全部配置信息填充到 Config 中相应的静态字段中。
2. 解析系统环境变量值，覆盖 Config 中相应的静态字段。
3. 解析 Java Agent 的参数，覆盖 Config 中相应的静态字段。

SnifferConfigInitializer.initialize() 方法的具体实现如下：

```java
public static void initialize(String agentOptions) {
    // 步骤1、加载 agent.config配置文件
    InputStreamReader configFileStream = loadConfig();
    Properties properties = new Properties();
    properties.load(configFileStream);
    for (String key : properties.stringPropertyNames()) {
        String value = (String)properties.get(key);
        // 按照${配置项名称:默认值}的格式解析各个配置项
        properties.put(key, PropertyPlaceholderHelper.INSTANCE
            .replacePlaceholders(value, properties));
    }
    // 填充 Config中的静态字段
    ConfigInitializer.initialize(properties, Config.class);
    // 步骤2、解析环境变量，并覆盖 Config中相应的静态字段
    overrideConfigBySystemProp();
    // 步骤3、解析 Java Agent参数，并覆盖 Config中相应的静态字段
    overrideConfigByAgentOptions(agentOptions);
    // 检测SERVICE_NAME和BACKEND_SERVICE两个配置项，若为空则抛异常(略)
    IS_INIT_COMPLETED = true; // 更新初始化标记
}
```

步骤 1 中的 loadConfig() 方法会优先根据环境变量（skywalking_config）指定的 agent.config 文件路径加载。若环境变量未指定 skywalking_ config 配置，则到 skywalking-agent.jar 同级的 config 目录下查找 agent.confg 配置文件。

将 agent.config 文件中的配置信息加载到 Properties 对象之后，将使用 PropertyPlaceholderHelper 对配置信息进行解析，将当前的"${配置项名称:默认值}"格式的配置值，替换成其中的默认值，demo-provider 解析结果如下图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/81/69/Cgq2xl6FsIuAD9SEAAXN2BldzCw554.png"/> 


完成解析之后，会通过 ConfigInitializer 工具类，将配置信息填充到 Config 中的静态字段中，具体填充规则如下：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/08/53/Ciqah16FsIuAMuWAAAGqpFKOkno592.png"/> 


在接下来的 overrideConfigBySystemProp() 方法中会遍历环境变量（即 System.getProperties() 集合），如果环境变 是以 "skywalking." 开头的，则认为是 SkyWalking 的配置，同样会填充到 Config 类中，以覆盖 agent.config 中的默认值。

最后的 overrideConfigByAgentOptions() 方法解析的是 Java Agent 的参数，填充 Config 类的规则与前面两步相同，不再重复。

到此为止，SkyWalking Agent 启动所需的全部配置都已经填充到 Config 中，后续使用配置信息时直接访问 Config 中的相应静态字段即可。

### 插件加载原理

完成 Config 类的初始化之后，SkyWalking Agent 开始扫描指定目录下的 SkyWalking Agent 插件 jar 包并进行加载。

#### AgentClassLoader

SkyWalking Agent 加载插件时使用到一个自定义的 ClassLoader ------ AgentClassLoader，之所以自定义类加载器，目的是不在应用的 Classpath 中引入 SkyWalking 的插件 jar 包，这样就可以让应用无依赖、无感知的插件。

#### 并行加载优化

AgentClassLoader 的静态代码块中会调动 tryRegisterAsParallelCapable() 方法，其中会通过反射方式尝试开启 JDK 的并行加载功能：

```java
private static void tryRegisterAsParallelCapable() {
    Method[] methods = ClassLoader.class.getDeclaredMethods();
    for (int i = 0; i < methods.length; i++) {
        Method method = methods[i];
        String methodName = method.getName();
        // 查找 ClassLoader中的registerAsParallelCapable()静态方法
        if ("registerAsParallelCapable".equalsIgnoreCase(methodName)) 
        {
            method.setAccessible(true);
            method.invoke(null); // 调用registerAsParallelCapable()方法
            return;
        }
    }
}
```

在使用 ClassLoader 加载一个类的时候，JVM 会进行加锁同步，这也是我们能够利用类加载机制实现单例的原因。在 Java 6 中，ClassLoader.loadClass() 方法是用 synchronized 加锁同步的，需要全局竞争一把锁，效率略低。

在 Java 7 之后提供了两种加锁模式：

* 串行模式下，锁的对象是还是 ClassLoader 本身，和 Java 6 里面的行为一样；
* 另外一种就是调用 registerAsParallelCapable() 方法之后，开启的并行加载模式。在并行模式下加载类时，会按照 classname 去获取锁。ClassLoader.loadClass() 方法中相应的实现片段如下：

```java
protected Class<?> loadClass(String name, boolean resolve)
    throws ClassNotFoundException{
    // getClassLoadingLock() 方法会返回加锁的对象
    synchronized (getClassLoadingLock(name)) { 
       ... ... // 加载指定类，具体加载细节不展开介绍
    }
}


protected Object getClassLoadingLock(String className) {
    Object lock = this;
    if (parallelLockMap != null) { // 检测是否开启了并行加载功能
        Object newLock = new Object();
        // 若开启了并行加载，则一个className对应一把锁；否则还是只
        // 对当前ClassLoader进行加锁
        lock = parallelLockMap.putIfAbsent(className, newLock);
        if (lock == null) {
            lock = newLock;
        }
    }
    return lock;
}
```

#### AgentClassLoader 核心实现

在 AgentClassLoader 的构造方法中会初始化其 classpath 字段，该字段指向了 AgentClassLoader 要扫描的目录（skywalking-agent.jar 包同级别的 plugins 目录和 activations 目录），如下所示：

```java
private List<File> classpath; 

public AgentClassLoader(ClassLoader parent) {
    super(parent); // 双亲委派机制
    // 获取 skywalking-agent.jar所在的目录
    File agentDictionary = AgentPackagePath.getPath();
    classpath = new LinkedList<File>();
    // 初始化 classpath集合，指向了skywalking-agent.jar包同目录的两个目录
    classpath.add(new File(agentDictionary, "plugins"));
    classpath.add(new File(agentDictionary, "activations"));
}
```

AgentClassLoader 作为一个类加载器，主要工作还是从其 Classpath 下加载类（或资源文件），对应的就是其 findClass() 方法和 findResource() 方法，这里简单看一下 findClass() 方法的实现：

```java
// 在下面的getAllJars()方法中会扫描全部jar文件，并缓存到
// allJars字段(List<Jar>类型)中，后续再次扫描时会重用该缓
private List<Jar> allJars;

protected Class<?> findClass(String name) {
    List<Jar> allJars = getAllJars();  // 扫描过程比较简单，不再展开介绍
    String path = name.replace('.', '/').concat(".class");
    for (Jar jar : allJars) { // 扫描所有jar包，查找类文件
        JarEntry entry = jar.jarFile.getJarEntry(path);
        if (entry != null) {
            URL classFileUrl = new URL("jar:file:" + 
                jar.sourceFile.getAbsolutePath() + "!/" + path);
            byte[] data = ...;// 省略读取".class"文件的逻辑                          // 加载类文件内容，创建相应的Class对象
            return defineClass(name, data, 0, data.length);
        }
    } // 类查找失败，直接抛出异常
    throw new ClassNotFoundException("Can't find " + name);
}
```

findResource() 方法会遍历 allJars 集合缓存的全部 jar 包，从中查找指定的资源文件并返回，遍历逻辑与 findClass() 方法类似，不再展开分析。

最后，AgentClassLoader 中有一个 DEFAULT_LOADER 静态字段，记录了 默认的 AgentClassLoader，如下所示，但是注意，AgentClassLoader 并不是单例，后面会看到其他创建 AgentClassLoader 的地方。

```java
private static AgentClassLoader DEFAULT_LOADER;
```

### 解析插件定义

每个 Agent 插件中都会定义一个 skywalking-plugin.def 文件，如下图 tomcat-7.x-8.x-plugin 插件所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/81/69/Cgq2xl6FsIyAD1i3AAAs9sJ1s2Y631.png"/> 


tomcat-7.x-8.x-plugin 插件中 skywalking-plugin.def 文件的内容如下，其中每一行都是一个插件类的定义：

```java
tomcat-7.x/8.x=org.apache.skywalking.apm.plugin.tomcat78x.define 
.TomcatInstrumentation

tomcat-7.x/8.x=org.apache.skywalking.apm.plugin.tomcat78x.define
.ApplicationDispatcherInstrumentation
```

PluginResourcesResolver 是 Agent 插件的资源解析器，会通过 AgentClassLoader 中的 findResource() 方法读取所有 Agent 插件中的 skywalking-plugin.def 文件。

### AbstractClassEnhancePluginDefine

拿到全部插件的 skywalking-plugin.def 文件之后，PluginCfg 会逐行进行解析，转换成 PluginDefine 对象。PluginDefine 中有两个字段：

```java
// 插件名称，以 tomcat-7.x-8.x-plugin 插件第一行为例，就是tomcat-7.x/8.x
private String name; 
// 插件类，对应上例中的 org.apache.skywalking.apm.plugin.tomcat78x.define
// .TomcatInstrumentation
private String defineClass;
```

PluginCfg 是通过枚举实现的、单例的工具类，逻辑非常简单，不再展开介绍。

接下来会遍历全部 PluginDefine 对象，通过反射将其中 defineClass 字段中记录的插件类实例化，核心逻辑如下：

```java
for (PluginDefine pluginDefine : pluginClassList) {
    // 注意，这里使用类加载器是默认的AgentClassLoader实例
    AbstractClassEnhancePluginDefine plugin =
        (AbstractClassEnhancePluginDefine)
            Class.forName(pluginDefine.getDefineClass(), true,
            AgentClassLoader.getDefault()).newInstance();
    plugins.add(plugin); // 记录AbstractClassEnhancePluginDefine 对象
}
```

AbstractClassEnhancePluginDefine 抽象类是所有 Agent 插件类的顶级父类，其中定义了四个核心方法，决定了一个插件类应该增强哪些目标类、应该如何增强、具体插入哪些逻辑，如下所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/81/69/Cgq2xl6FsIyAT0wmAAIua7pnGBg062.png"/> 


* **enhanceClass() 方法**：返回的 ClassMatch，用于匹配当前插件要增强的目标类。
* **define() 方法**：插件类增强逻辑的入口，底层会调用下面的 enhance() 方法和 witnessClass() 方法。
* **enhance() 方法**：真正执行增强逻辑的地方。
* **witnessClass() 方法**：一个开源组件可能有多个版本，插件会通过该方法识别组件的不同版本，防止对不兼容的版本进行增强。

在后续的课时中会详细介绍每个方法的具体功能和实现，你先知道 AbstractClassEnhancePluginDefine 中大致有这四个方法即可。

#### ClassMatch

enhanceClass() 方法决定了一个插件类要增强的目标类，返回值为 ClassMatch 类型对象。ClassMatch 类似于一个过滤器，可以通过多种方式匹配到目标类，ClassMatch 接口的实现如下：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/81/69/Cgq2xl6FsIyAbzszAAFwI9x3bVc197.png"/> 


* \*\*NameMatch：\*\*根据其 className 字段（String 类型）匹配目标类的名称。
* \*\*IndirectMatch：\*\*子接口中定义了两个方法。

```java
// Junction是Byte Buddy中的类，可以通过and、or等操作串联多个ElementMatcher
// 进行匹配
ElementMatcher.Junction buildJunction(); 
// 用于检测传入的类型是否匹配该Match
boolean isMatch(TypeDescription typeDescription);
```

* **MultiClassNameMatch**：其中会指定一个 matchClassNames 集合，该集合内的类即为目标类。
* **ClassAnnotationMatch**：根据标注在类上的注解匹配目标类。
* **MethodAnnotationMatch**：根据标注在方法上的注解匹配目标类。
* **HierarchyMatch**：根据父类或是接口匹配目标类。

这里以 ClassAnnotationMatch 为例展开分析，其中的 annotations 字段（String\[\] 类型）指定了该 ClassAnnotationMatch 对象需要检查的注解。在 buildJunction() 方法中将为每一个注解创建相应的 Junction 并将它们以 and 形式连接起来并返回，如下所示：

```java
public ElementMatcher.Junction buildJunction() {
    ElementMatcher.Junction junction = null;
    for (String annotation : annotations) { // 遍历全部注解
        if (junction == null) { 
            // 该Junction用于检测类是否标注了指定注解
            junction = buildEachAnnotation(annotation);
        } else {// 使用 and 方式将所有Junction对象连接起来
            junction = junction.and(buildEachAnnotation(annotation));
        }
    }
    junction = junction.and(not(isInterface())); // 排除接口
    return junction;
}
```

isMatch() 方法的实现类似，只有包含所有指定注解的类，才能匹配成功，如下所示：

```java
public boolean isMatch(TypeDescription typeDescription) {
    List<String> annotationList = 
        new ArrayList<String>(Arrays.asList(annotations));
    // 获取该类上的注解
    AnnotationList declaredAnnotations = 
          typeDescription.getDeclaredAnnotations();
    // 匹配一个删除一个
    for (AnnotationDescription annotation : declaredAnnotations) {
        annotationList.remove(annotation
              .getAnnotationType().getActualName());
    }
    if (annotationList.isEmpty()) { // 删空了，就匹配成功了
        return true;
    }
    return false;
}
```

其他 ClassMatch 接口的实现原理类似，不再展开分析，如果你感兴趣可以看一下代码。

### PluginFinder

PluginFinder 是 AbstractClassEnhancePluginDefine 查找器，可以根据给定的类查找用于增强的 AbstractClassEnhancePluginDefine 集合。

在 PluginFinder 的构造函数中会遍历前面课程已经实例化的 AbstractClassEnhancePluginDefine ，并根据 enhanceClass() 方法返回的 ClassMatcher 类型进行分类，得到如下两个集合：

```java
// 如果返回值为NameMatch类型，则相应 AbstractClassEnhancePluginDefine 
// 对象会记录到该集合
private Map<String, LinkedList<AbstractClassEnhancePluginDefine>> nameMatchDefine;

// 如果是其他类型返回值，则相应 AbstractClassEnhancePluginDefine 
// 对象会记录到该集合
private List<AbstractClassEnhancePluginDefine> signatureMatchDefine;
```

find() 方法是 PluginFinder 对外暴露的查询方法，其中会先后遍历 nameMatchDefine 集合和 signatureMatchDefine 集合，通过 ClassMatch.isMatch() 方法确定所有的匹配插件。find() 方法的实现并不复杂，不再展开介绍。

### AgentBuilder

前面已经分析了 Skywalking Agent 启动过程中加载配置信息、初始化 Config 类、查找 skywalking-pluing.def 文件、初始化 AbstractClassEnhancePluginDefine 对象等步骤。现在开始介绍 Byte Buddy 如何使用加载到的插件类增强目标方法。

在 SkywalkingAgent.premain() 方法中的步骤 5 中，首先会创建 ByteBuddy 对象，正如前面 Byte Buddy 基础课时中提到的，它是 Byte Buddy 的基础对象之一：

```java
// 步骤5、通过Byte Buddy API创建Agent
final ByteBuddy byteBuddy = new ByteBuddy()
   .with(TypeValidation.of(Config.Agent.IS_OPEN_DEBUGGING_CLASS));
```

Config.Agent.IS_OPEN_DEBUGGING_CLASS 在 agent.config 文件中对应的配置项是：

```java
agent.is_open_debugging_class
```

如果将其配置为 true，则会将动态生成的类输出到 debugging 目录中。

接下来创建 AgentBuilder 对象，AgentBuilder 是 Byte Buddy 库专门用来支持 Java Agent 的一个 API，如下所示：

```java
new AgentBuilder.Default(byteBuddy) // 设置使用的ByteBuddy对象
.ignore(nameStartsWith("net.bytebuddy.")// 不会拦截下列包中的类
       .or(nameStartsWith("org.slf4j."))
       .or(nameStartsWith("org.apache.logging."))
       .or(nameStartsWith("org.groovy."))
       .or(nameContains("javassist"))
       .or(nameContains(".asm."))
       .or(nameStartsWith("sun.reflect"))
       .or(allSkyWalkingAgentExcludeToolkit()) // 处理 Skywalking 的类
       // synthetic类和方法是由编译器生成的，这种类也需要忽略
       .or(ElementMatchers.<TypeDescription>isSynthetic()))
.type(pluginFinder.buildMatch())// 拦截
.transform(new Transformer(pluginFinder)) // 设置Transform
.with(new Listener()) // 设置Listener
.installOn(instrumentation)
```

简单解释一下这里使用到的 AgentBuilder 的方法：

* **ignore() 方法**：忽略指定包中的类，对这些类不会进行拦截增强。
* **type() 方法**：在类加载时根据传入的 ElementMatcher 进行拦截，拦截到的目标类将会被 transform() 方法中指定的 Transformer 进行增强。
* **transform() 方法**：这里指定的 Transformer 会对前面拦截到的类进行增强。
* **with() 方法**：添加一个 Listener 用来监听 AgentBuilder 触发的事件。

首先， PluginFInder.buildMatch() 方法返回的 ElementMatcher 对象会将全部插件的匹配规则（即插件的 enhanceClass() 方法返回的 ClassMatch）用 OR 的方式连接起来，这样，所有插件能匹配到的所有类都会交给 Transformer 处理。

再来看 with() 方法中添加的监听器 ------ SkywalkingAgent.Listener，它继承了 AgentBuilder.Listener 接口，当监听到 Transformation 事件时，会根据 IS_OPEN_DEBUGGING_CLASS 配置决定是否将增强之后的类持久化成 class 文件保存到指定的 log 目录中。注意，该操作是需要加锁的，会影响系统的性能，一般只在测试环境中开启，在生产环境中不会开启。

最后来看 Skywalking.Transformer，它实现了 AgentBuilder.Transformer 接口，其 transform() 方法是插件增强目标类的入口。Skywalking.Transformer 会通过 PluginFinder 查找目标类匹配的插件（即 AbstractClassEnhancePluginDefine 对象），然后交由 AbstractClassEnhancePluginDefine 完成增强，核心实现如下：

```java
public DynamicType.Builder<?> transform(DynamicType.Builder<?>builder,
    TypeDescription typeDescription, // 被拦截的目标类
    ClassLoader classLoader,  // 加载目标类的ClassLoader
    JavaModule module) {
    // 从PluginFinder中查找匹配该目标类的插件，PluginFinder的查找逻辑不再重复
    List<AbstractClassEnhancePluginDefine> pluginDefines =
           pluginFinder.find(typeDescription);
    if (pluginDefines.size() >0){ 
        DynamicType.Builder<?>newBuilder = builder;
        EnhanceContext context = new EnhanceContext();
        for (AbstractClassEnhancePluginDefinedefine : pluginDefines) {
            // AbstractClassEnhancePluginDefine.define()方法是插件入口，
            // 在其中完成了对目标类的增强
            DynamicType.Builder<?>possibleNewBuilder = 
                 define.define(typeDescription, 
                      newBuilder, classLoader,context);
            if (possibleNewBuilder != null) {
                // 注意这里，如果匹配了多个插件，会被增强多次
                newBuilder = possibleNewBuilder;
            }
        }
        return newBuilder;
    }
    return builder;
}
```

这里需要注意：如果一个类被多个插件匹配会被增强多次，当你打开 IS_OPEN_DEBUGGING_CLASS 配置项时，会看到对应的多个 class 文件。

### 加载 BootService

SkyWalking Agent 启动的最后一步是使用前面介绍的 JDK SPI 技术加载 BootService 接口的所有实现类，BootService 接口中定义了 SkyWalking Agent 核心服务的行为，其定义如下：

```java
public interface BootService {
    void prepare() throws Throwable;
    void boot() throws Throwable;
    void onComplete() throws Throwable;
    void shutdown() throws Throwable;
}
```

ServiceManager 是 BootService 实例的管理器，主要负责管理 BootService 实例的生命周期。

ServiceManager 是个单例，底层维护了一个 bootedServices 集合（Map\<Class, BootService\> 类型），记录了每个 BootService 实现对应的实例。boot() 方法是 ServiceManager 的核心方法，它首先通过 load() 方法实例化全部 BootService 接口实现，如下所示：

```java
void load(List<BootService> allServices) { 
    // 很明显使用了 JDK SPI 技术加载并实例化 META-INF/services下的全部 
    // BootService接口实现
    Iterator<BootService> iterator = ServiceLoader.load(
        BootService.class,AgentClassLoader.getDefault()).iterator();
    while (iterator.hasNext()) {
        // 记录到方法参数传入的 allServices集合中
        allServices.add(iterator.next()); 
    }
}
```

在 apm-agent-core 模块的 resource/META-INF.services/org.apache.skywalking.apm.agent.core.boot.BootService 文件中，记录了 ServiceManager 要加载的 BootService 接口实现类，如下所示，这些类在后面的课时中会逐个详细介绍其具体功能：

```java
org.apache.skywalking.apm.agent.core.remote.TraceSegmentServiceClient
org.apache.skywalking.apm.agent.core.context.ContextManager
org.apache.skywalking.apm.agent.core.sampling.SamplingService
org.apache.skywalking.apm.agent.core.remote.GRPCChannelManager
org.apache.skywalking.apm.agent.core.jvm.JVMService
org.apache.skywalking.apm.agent.core.remote.ServiceAndEndpointRegisterClient
org.apache.skywalking.apm.agent.core.context.ContextManagerExtendService
```

加载完上述 BootService 实现类型之后，ServiceManager 会针对 BootService 上的 @DefaultImplementor 和 @OverrideImplementor 注解进行处理：

* @DefaultImplementor 注解用于标识 BootService 接口的默认实现。
* @OverrideImplementor 注解用于覆盖默认 BootService 实现，通过其 value 字段指定要覆盖的默认实现。

BootService 的覆盖逻辑如下图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/08/53/Ciqah16FsIyAKF5JAAFCMa4LIHU953.png"/> 


确定完要使用的 BootService 实现之后，ServiceManager 将统一初始化 bootServices 集合中的 BootService 实现，同样是在 ServiceManager.boot() 方法中，会逐个调用 BootService 实现的 prepare()、startup()、onComplete() 方法，具体实现如下：

```java
public void boot() {
    bootedServices = loadAllServices(); 
    prepare(); // 调用全部BootService对象的prepare()方法
    startup(); // 调用全部BootService对象的boot()方法
    onComplete(); // 调用全部BootService对象的onComplete()方法
}
```

在 Skywalking Agent 启动流程的最后，会添加一个 JVM 退出钩子，并通过 ServiceManager.shutdown() 方法，关闭前文启动的全部 BootService 服务。

SkywalkingAgent.premain() 方法中相关的代码片段如下：

```java
Runtime.getRuntime().addShutdownHook(new Thread(new Runnable() {
    @Override public void run() {
        ServiceManager.INSTANCE.shutdown(); 
    }
}, "skywalking service shutdown thread"));
```

总结

本课时重点介绍了 SkyWalking Agent 启动核心流程的实现，深入分析了 Skywalking Agent 配置信息的初始化、插件加载原理、AgentBuilder 如何与插件类配合增强目标类、BootService 的加载流程。本课时是整个 Skywalking Agent 的框架性流程介绍，在后续的课时中将详细介绍 AbstractClassEnhancePluginDefine 以及 BootService 接口的实现。

