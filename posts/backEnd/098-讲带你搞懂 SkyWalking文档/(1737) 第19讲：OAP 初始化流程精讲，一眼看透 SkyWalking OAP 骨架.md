# 第19讲：OAP初始化流程精讲，一眼看透SkyWalkingOAP骨架

在前面的课程中，我们重点介绍了 SkyWalking Agent 的工作原理和核心实现，包括 Agent 核心启动流程、插件实现代码增强的核心原理、核心 BootService 实现类的原理、Trace 概念在 SkyWalking 中的落地实现、收发 Trace 数据的核心实现。最后深入介绍了 Tomcat、Dubbo 等常用开源软件的插件实现，以及 toolkit-activation 工具箱的核心原理。

#### OAP 架构

从本课时开始，我们将开始介绍 SkyWalking OAP 服务。OAP 与 Agent 类似，也采用了微内核架构（Microkernel Architecture），如下图所示。


<Image alt="image.png" src="https://s0.lgstatic.com/i/image/M00/08/09/CgqCHl66RCiAJ3mTAAHxQQrh8Cg825.png"/> 


OAP 使用 ModuleManager（组件管理器）管理多个 Module（组件），一个 Module 可以对应多个 ModuleProvider（组件服务提供者），ModuleProvider 是 Module 底层真正的实现。  

在 OAP 服务启动时，一个 Module 只能选择使用一个 ModuleProvider 对外提供服务。一个 ModuleProvider 可能支撑了一个非常复杂的大功能，在一个 ModuleProvider 中，可以包含多个 Service ，一个 Service 实现了一个 ModuleProvider 中的一部分功能，通过将多个 Service 进行组装集成，可以得到 ModuleProvider 的完整功能。

ApplicationConfiguration（应用配置对象） 负责管理整个 OAP 的配置信息，ApplicationConfiguration 中包含多个 ModuleConfiguration(组件配置对象) 。

ModuleConfiguration 负责管理一个 Module 的配置信息，ModuleConfiguration 与 Module 是一一对应关系。ModuleConfiguration 中包含多个 ProviderConfiguration（服务提供者配置对象）。ProviderConfiguration 负责管理一个 ModuleProvider 的配置信息，两者也是一一对应的关系。上面两组对象之间的映射关系，如下图所示：


<Image alt="image (1).png" src="https://s0.lgstatic.com/i/image/M00/08/0A/Ciqc1F66RO-ANDsBAADxvp0EW2Q875.png"/> 


在之前搭建 SkyWalking 源码环境的课时中我们看到，OAPServerStartUp 类的 main() 方法是整个 OAP 服务的入口方法，其核心逻辑如下：

```js
public static void main(String[] args) {
    // mode这个环境变量有两个可选值：init、no-init，其中init值表示初始化底层
    // 的存储结构，例如，使用ES时会初始化其中的索引，使用数据库时会初始化表结构；
    // no-init值表示不初始化上述存储结构
    String mode = System.getProperty("mode");
    RunningMode.setMode(mode); 
    // 创建ApplicationConfigLoader，加载配置文件
    ApplicationConfigLoader configLoader = 
           new ApplicationConfigLoader();
    ApplicationConfiguration applicationConfiguration = 
           configLoader.load();
    // 创建ModuleManager，并根据配置初始化全部Module
    ModuleManager manager = new ModuleManager();
    manager.init(applicationConfiguration);
    // 查找指定Module中的指定Service进行使用，后面会展开核心Module进行分析
    manager.find(TelemetryModule.NAME).provider()
    .getService(MetricsCreator.class).createGauge("uptime",
        "oap server start up time", MetricsTag.EMPTY_KEY, 
          MetricsTag.EMPTY_VALUE)
            .setValue(System.currentTimeMillis() / 1000d);
}
```

#### 初始化配置

OAP 启动时会使用 ApplicationConfigLoader 加载 application.yml 配置文件，该文件位于 server-starter 子模块的 resources 目录下，如下图所示：


<Image alt="image (2).png" src="https://s0.lgstatic.com/i/image/M00/08/0B/Ciqc1F66RQuAKLYRAAB7aXtA8Vc434.png"/> 


application.yml 配置文件中包含了整个 OAP 服务中全部 Module 的配置信息，后面在介绍一个 Module 的时候会展示相应的配置信息。

在 load() 方法中， ApplicationConfigLoader 会创建 ApplicationConfiguration 对象以及相关的 ModuleConfiguration、ProviderConfiguration 对象。ApplicationConfiguration 维护了一个 HashMap\<String, ModuleConfiguration\> 集合（modules 字段），记录了 Module 名称与相应配置对象。

在 ModuleConfiguration 中只维护了一个 HashMap\<String, ProviderConfiguration\> 集合（providers 字段）记录了 ModuleProvider 名称与相应配置对象。在 ProviderConfiguration 中只有一个 Properties 集合（properties 字段），存储了 application.yml 中 KV 配置信息。下图所示 core Module 对应的 ModuleConfiguration 以及它下面 default ModuleProvider 对应的 ProviderConfiguration：


<Image alt="ModuleDefine继承图.png" src="https://s0.lgstatic.com/i/image/M00/08/0B/CgqCHl66RRSAMwsQAACTJig2rOc013.png"/> 


完成 application.yml 配置文件的读取之后，会紧接着调用 overrideConfigBySystemEnv() 方法读取 System.getProperties() 集合，并覆盖从 application.yml 读取到的相应默认值。

#### ModuleManager

完成配置的初始化之后，OAPServerStartUp 会创建 ModuleManager 对象。ModuleManager 中的 loadedModules 字段负责管理加载的 Module：

```java
// Key是Module的名称，Value是相应的ModuleDefine，ModuleDefine就是对
// Module的抽象
Map<String, ModuleDefine> loadedModules = new HashMap<>();
```

在其 init() 方法中首先会通过 SPI 的方式加载插件配置文件中定义的 Module 实现类和 ModuleProvider 实现类，并调用其 prepare() 方法执行一些准备操作，最后创建 BootstrapFlow 开始启动流程：

```java
public void init(ApplicationConfiguration applicationConfiguration){
    // 根据配置拿到所有Module的名称
    String[] moduleNames = applicationConfiguration.moduleList(); 
    // 通过SPI方式加载ModuleDefine接口和 ModuleProvider接口的实现
    ServiceLoader<ModuleDefine> moduleServiceLoader = 
         ServiceLoader.load(ModuleDefine.class);
    ServiceLoader<ModuleProvider> moduleProviderLoader = 
         ServiceLoader.load(ModuleProvider.class);

    LinkedList<String> moduleList = 
          new LinkedList<>(Arrays.asList(moduleNames));
    for (ModuleDefine module : moduleServiceLoader) {
        for (String moduleName : moduleNames) {
            if (moduleName.equals(module.name())) {
                // 通过SPI可能加载很多ModuleDefine实现以及ModuleProvider实      
                // 现类，但是这里只初始化在配置文件中出现过的Module,并调用
                // 其prepare()方法
                ModuleDefine newInstance =  
                   module.getClass().newInstance();
                newInstance.prepare(this, applicationConfiguration
                    .getModuleConfiguration(moduleName), 
                          moduleProviderLoader);
                // 记录初始化的ModuleDefine对象
                loadedModules.put(moduleName, newInstance);
                moduleList.remove(moduleName);
            }
        }
    }
    isInPrepareStage = false;
    // 初始化BootstrapFlow，具体的初始化逻辑后面展开分析
    BootstrapFlow bootstrapFlow = new BootstrapFlow(loadedModules);
    // 启动Module
    bootstrapFlow.start(this);
    // 启动流程结束之后会通知相关组件
    bootstrapFlow.notifyAfterCompleted();
}
```

#### ModuleDefine

前文提到 Module 与 ModuleProvider 的一对多关系，所以 ModuleDefine 抽象类继承了 ModuleProviderHolder 接口，该接口中只定义了一个 provider() 方法，用于获取该 Module 当前使用的 ModuleProvider 对象。

通过对 ModuleManager 的分析我们知道，ModuleDefine 的实现类是通过 SPI 方式被加载到内存的，这些实现类分散在不同的插件模块中，下图展示了 OAP 服务中几个核心插件模块的 ModuleDefine 实现类：


<Image alt="image (3).png" src="https://s0.lgstatic.com/i/image/M00/08/0B/CgqCHl66RSyAasXnAAxKC1wvreU269.png"/> 


上图 ModuleDefine 实现类后面的课程会逐个分析，先来看 ModuleDefine 抽象类本身，其中有两个字段：

```java
// 当前Module的名称
private final String name; 
// 属于该Module的所有ModuleProvider对象
private final LinkedList<ModuleProvider> loadedProviders = new LinkedList<>();
```

每个 Module 都有一个全局唯一的名称，通过前面对配置初始化的介绍我们了解到，ModuleManager 会通过 Module 名称在 application.yml 配置文件中查找相应的配置信息。下图展示了核心 Module 对应的名称：


<Image alt="image (4).png" src="https://s0.lgstatic.com/i/image/M00/08/0B/Ciqc1F66RTOAc7l_AAGhZ9L9Cqc865.png"/> 


在 ModuleDefine.prepare() 方法中，会查找与当前 Module 配置的 ModuleProvider 实现，然后记录到 loadedProviders 集合中。随后会继续调用这些 ModuleProvider 对象的 prepare() 方法，继续准备操作：

```java
void prepare(ModuleManager moduleManager,  
      ApplicationConfiguration.ModuleConfiguration configuration,
          ServiceLoader<ModuleProvider> moduleProviderLoader)  {
    for (ModuleProvider provider : moduleProviderLoader) {
        // 这里只关心配置文件中指定的、与当前Module相关的ModuleProvider实现类
        if (!configuration.has(provider.name())) {
            continue; 
        }
        if (provider.module().equals(getClass())) {
            // 初始化ModuleProvider对象
            ModuleProvider newProvider = 
                  provider.getClass().newInstance();
            newProvider.setManager(moduleManager);
            // 设置ModuleProvider与 Module之间的关联关系
            newProvider.setModuleDefine(this);
            // 将ModuleProvider对象记录到loadedProviders集合
            loadedProviders.add(newProvider);
        }
    }
    // 检查:该Module没有任何关联的ModuleProvider，会在这里报错(省略该检查代码)
    for (ModuleProvider moduleProvider : loadedProviders) {
        // 前面读取配置信息时，ModuleProvider的配置信息是存储到ProviderConfig
        // 之中的Properties集合之中，此处，每个ModuleProvider都会关联一个        
        // ModuleConfig对象，并ProviderConfig中的配置信息拷贝到ModuleConfig
        // 对象中的相应字段，实现Properties到Java Bean的转换
        copyProperties(moduleProvider.createConfigBeanIfAbsent(),
             configuration.getProviderConfiguration(
                 moduleProvider.name()), this.name(),         
                       moduleProvider.name());
        // 调用ModuleProvider的prepare()方法，继续prepare流程
        moduleProvider.prepare();
    }
}
```

ModuleDefine.provider() 方法（继承自 ModuleProviderHolder 接口）不仅会返回底层的 ModuleProvider 实例，还会保证 loadedProviders 集合有且只有一个 ModuleProvider 实现存在，如下所示，这也是前文提到的每个 Module 只会选用一个 ModuleProvider 实现的原因：

```java
public final ModuleProvider provider() throws {
    if (loadedProviders.size() > 1 || loadedProviders.size() == 0) {
        throw new xxxException("..."); // 抛异常
    }
    return loadedProviders.getFirst(); // 返回唯一的ModuleProvider实例
}
```

#### ModuleProvider

完成 Module 的初始化之后再来看 ModuleProvider。 ModuleProvider 下可以关联多个 Service（一对多的关系，每个 Service 实现了一个简单功能，多个 Service 组装起来就是 ModuleProvider 的全部功能），所以实现了 ModuleServiceHolder 接口。在 ModuleServiceHolder 接口中定义了两个方法：

```java
public interface ModuleServiceHolder {
    // 注册Service实例，当Service类型与service对象不匹配时，会报错
    void registerServiceImplementation(
          Class<? extends Service> serviceType, Service service);
          
    // 获取指定类型的Service对象
    <T extends Service> T getService(Class<T> serviceType) ;
}
```

在 ModuleProvider 中维护了一个 HashMap 集合（services 字段），其中记录了 Service 类型与相应 Service 对象之间的映射关系。ModuleProvider 对 ModuleServiceHolder 接口的实现就是读写该集合。

与 ModuleDefine 实现类相同，ModuleProvider 的实现类也是通过 SPI 方式被加载的，下图展示了 OAP 服务中几个核心插件模块的 ModuleProvider 实现类：


<Image alt="CoreModuleProvider.png" src="https://s0.lgstatic.com/i/image/M00/08/0B/Ciqc1F66RUuAOOobAADhJDK8Z_Q834.png"/> 


除了 ModuleServiceHolder 接口中的这两个关键方法之外，ModuleProvider 中还定义了一些通用的抽象方法：

* **name() 方法**：返回当前 ModuleProvider 的名称，该名称在同一个 Module 下是唯一的。例如，StorageModule 负责实现 OAP 的持久化存储功能，Module 名称为 "storage"，具体依赖的底层存储可以是 ElasticSearch、H2 等，分别对应StorageModuleElasticsearchProvider、H2StorageProvider 两个 ModuleProvider 实现类，ModuleProvider 名称分别是 "elasticsearch" 和 "h2"。
* **createConfigBeanIfAbsent() 方法**: 返回当前 ModuleProvider 对应的 ModuleConfig 对象。ModuleConfig 是一个空的抽象类，其实现类都是用于存储配置信息的 Java Bean。下图展示了 OAP 服务中几个核心插件模块对应的 ModuleConfig 实现类：


<Image alt="ModuleConfig.png" src="https://s0.lgstatic.com/i/image/M00/08/0B/CgqCHl66RVSAUPzJAACewmU9Ffw912.png"/> 


结合 ModuleDefine、ModuleProvider 以及 ModuleConfig，整个存储模块的结构如下：


<Image alt="image (5).png" src="https://s0.lgstatic.com/i/image/M00/08/0B/Ciqc1F66RV-AHPCmAAuhu0QRPZ4250.png"/> 


* **prepare() 方法**：与 ModuleDefine 中的 prepare() 方法的功能相同，也是完成一些准备性的操作，不同的 ModuleProvider 实现类会执行不同的准备操作。例如，StorageModuleElasticsearchProvider 会准备 High Level Rest Client 来访问 ElasticSearch，而 H2StorageProvider 则会准备 JDBC Client 来访问 H2 数据库。

* **requiredModules() 方法**：返回当前 ModuleProvider 依赖的 Module 名称。整个 OAP 服务会有多个 Module，Module 之间相对独立，但是也有一定的依赖关系，例如，trace-receiver-plugin 插件模块（用于接收 Trace 数据）就依赖了 CoreModule、ConfigurationModule 等基础 Module。

* **requiredCheck() 方法**：在 ModuleDefine.service() 这个方法中会定义该 Module 提供的一系列 Service，例如，在 StorageModule 中就会提供 StorageDAO、IRegisterLockDAO 等等一系列 DAO。requiredCheck() 方法会在 ModuleProvider 启动之前，检查当前 services 集合中是否已经装载了这些 Service 的实现，从而保证 ModuleProvider 能够完整地提供 Module 的功能。

* **start() 方法**：启动当前 ModuleProvider，其中会完成一些初始化操作和启动操作。不同的 ModuleProvider 实现类会执行不同的初始化操作。例如，StorageModuleElasticsearchProvider 会在 ElasticSearch 中初始化相关的索引，而 H2StorageProvider 则会在 H2 数据库中初始化后续使用的表结构。

* **notifyAfterCompleted() 方法**：当全部 Module 完成检查、初始化并启动之后，OAP 会回调该方法，通知所有监听者，当前 ModuleProvider 开始对外提供服务。

一个 ModuleProvider 对外提供相对完整的功能，ModuleProvider 中的一个子功能可以有一个 Service 实现。Service 接口是个空接口，没有定义任何方法，有点类似于 java.io.Serializable 接口，只是一个简单的标记接口。

#### BootstrapFlow

通过前面 ModuleManager 的分析，我们得到了下面的调用链：


<Image alt="image (6).png" src="https://s0.lgstatic.com/i/image/M00/08/0B/Ciqc1F66RW2AVITpAABWeBaF_vg920.png"/> 


那 ModuleProvider 的相关检查方法以及 start() 方法是在哪里调用的呢？在 ModuleManager.init() 方法中可以得到答案 ------ BootstrapFlow。在 BootstrapFlow 构造方法中会根据 ModuleProvider 与 Module 之间的依赖关系，确定所有 ModuleProvider 的启动顺序，并记录到一个 LinkedList 集合中（startupSequence 字段）。

在 BootstrapFlow.start() 方法中会遍历 startupSequence 集合，逐个启动 ModuleProvider 实例：

```java
void start(ModuleManager moduleManager) {
    // 按照startupSequence集合的顺序启动所有ModuleProvider实例
    for (ModuleProvider provider : startupSequence) { 
        // 检测当前ModuleProvider依赖的Module对象是否存在
        String[] requiredModules = provider.requiredModules();
        if (requiredModules != null) {
            for (String module : requiredModules) {
                if (!moduleManager.has(module)) { ... ... // 抛异常 }
            }
        }
        // 检查当前ModuleProvider对象是否能提供其所属Module需要的Service
        provider.requiredCheck(provider.getModule().services());
        provider.start(); // 上述两项检查都通过之后，才能启动ModuleProvider
    }
}
```

start() 方法完成启动之后，会紧接着调用 notifyAfterCompleted() 方法，通知全部 ModuleProvider 实例：全部 Module 已正常启动了，可以对外提供服务了。

最后，简单看一下 startupSequence 集合的生成原理。下图示例中，ModuleProvider a 依赖 Module B、Module C，ModuleProvider b 依赖 Module C、ModuleProvider c 依赖 Module D。


<Image alt="image (7).png" src="https://s0.lgstatic.com/i/image/M00/08/0B/Ciqc1F66RXeADVj3AAD7tFRaUQw017.png"/> 


在 BootstrapFlow.makeSequence() 方法中，根据 ModuleProvider 对 Module 依赖关系确定 ModuleProvider 的启动顺序，保证每个 ModuleProvider 启动时，其依赖 Module 的 ModuleProvider 已经启动。上图示例的最终启动顺序如下：


<Image alt="image (8).png" src="https://s0.lgstatic.com/i/image/M00/08/0B/Ciqc1F66RX6Af8e5AABjm7z7wTQ773.png"/> 


makeSequence() 方法的具体实现是靠四层 for 循环实现的，没有什么高深的算法，这里不展开了。

#### 总结

本课时首先介绍了 Skywalking OAP 服务的整体框架，OAP 与 Agent 类似，也是微内核+插件的架构，主要围绕 Module、 ModuleProvider、Service 等核心概念展开。然后介绍了 SkyWalking OAP 服务的启动流程，其中涉及 ModuleDefine、ModuleProvider 等核心组件的准备流程和初始化流程。

