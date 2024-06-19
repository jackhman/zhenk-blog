# 第03讲：掌握JavaAgent真的可以为所欲为？

我们在上一课时中，将 demo-provider 和 demo-webapp 接入 SkyWalking Agent 的时候，只需要在 VM options 中添加下面这一行配置即可：

```js
-javaagent:/path/to/skywalking-agent.jar \
-Dskywalking_config=/path/to/agent.config
```

并没有修改任何一行 Java 代码。这里便使用到了 Java Agent 技术，本课时我们将对 Java Agent 技术进行简单介绍并通过示例演示 Java Agent 技术的基本使用。

### 什么是 Java Agent

Java Agent 是从 JDK1.5 开始引入的，算是一个比较老的技术了。作为 Java 的开发工程师，我们常用的命令之一就是 java 命令，而 Java Agent 本身就是 java 命令的一个参数（即 -javaagent）。正如上一课时接入 SkyWalking Agent 那样，-javaagent 参数之后需要指定一个 jar 包，这个 jar 包需要同时满足下面两个条件：

1. 在 META-INF 目录下的 MANIFEST.MF 文件中必须指定 premain-class 配置项。
2. premain-class 配置项指定的类必须提供了 premain() 方法。

在 Java 虚拟机启动时，执行 main() 函数之前，虚拟机会先找到 -javaagent 命令指定 jar 包，然后执行 premain-class 中的 premain() 方法。用一句概括其功能的话就是：main() 函数之前的一个拦截器。

使用 Java Agent 的步骤大致如下：

1. 定义一个 MANIFEST.MF 文件，在其中添加 premain-class 配置项。

2. 创建 premain-class 配置项指定的类，并在其中实现 premain() 方法，方法签名如下：

```java
public static void premain(String agentArgs, Instrumentation inst){
   ... 
}
```

3. 将 MANIFEST.MF 文件和 premain-class 指定的类一起打包成一个 jar 包。

4. 使用 -javaagent 指定该 jar 包的路径即可执行其中的 premain() 方法。

### Java Agent 示例

首先，我们创建一个最基本的 Maven 项目，然后创建 TestAgent.java 这一个类，项目的整体结构如图所示。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/73/51/Cgq2xl5p4auAbrrvAACRfWvGnT4223.png"/> 


TestAgent 中提供了 premain() 方法的实现，如下所示：

```java
public class TestAgent {
    public static void premain(String agentArgs, 
            Instrumentation inst) {
        System.out.println("this is a java agent with two args");
        System.out.println("参数:" + agentArgs + "\n");
    }

    public static void premain(String agentArgs) {
        System.out.println("this is a java agent only one args");
        System.out.println("参数:" + agentArgs + "\n");
    }
}
```

premain() 方法有两个重载，如下所示，如果两个重载同时存在，【1】将会被忽略，只执行【2】：

```java
public static void premain(String agentArgs) [1]
public static void premain(String agentArgs, 
      Instrumentation inst); [2]
```

代码中有两个参数需要我们注意。

* **agentArgs 参数**：-javaagent 命令携带的参数。在前面介绍 SkyWalking Agent 接入时提到，agent.service_name 这个配置项的默认值有三种覆盖方式，其中，使用探针配置进行覆盖，探针配置的值就是通过该参数传入的。
* **inst 参数**：java.lang.instrumen.Instrumentation 是 Instrumention 包中定义的一个接口，它提供了操作类定义的相关方法。

确定 premain() 方法的两个重载优先级的逻辑在 sun.instrument.InstrumentationImpl.java 中实现，相关代码如下：

```java
private void loadClassAndCallPremain(String  String  optionsString)
            throws Throwable {
    loadClassAndStartAgent( classname, "premain", optionsString );
}

private void loadClassAndStartAgent(String  classname, 
        String  methodname, String  optionsString) throws Throwable {
    ... ... // 省略变量定义,下面省略 try/catch代码块
    // 查找两个参数的 premain()方法
    m = javaAgentClass.getDeclaredMethod( methodname,
            new Class<?>[] {String.class, 
                java.lang.instrument.Instrumentation.class});
    twoArgAgent = true;

    if (m == null) { // 查找一个参数的 premain()方法
        m = javaAgentClass.getDeclaredMethod(methodname,
            new Class<?>[] { String.class });
    }
    ... ...// 省略其他查找 
    setAccessible(m, true);
    // 调用查找到的 premain()重载
    if (twoArgAgent) {
        m.invoke(null, new Object[] { optionsString, this });
    } else {
        m.invoke(null, new Object[] { optionsString });
    }
    setAccessible(m, false);
```

接下来还需要创建 MANIFEST.MF 文件并打包，这里我们直接使用 maven-assembly-plugin 打包插件来完成这两项功能。在 pom.xml 中引入 maven-assembly-plugin 插件并添加相应的配置，如下所示：

```html
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-assembly-plugin</artifactId>
    <version>2.4</version>
    <configuration>
        <appendAssemblyId>false</appendAssemblyId>
        <!-- 将TestAgent的所有依赖包都打到jar包中-->
        <descriptorRefs>
            <descriptorRef>jar-with-dependencies</descriptorRef>
        </descriptorRefs>
        <archive>
            <!-- 添加MANIFEST.MF中的各项配置-->
            <manifest>
                <!-- 添加 mplementation-*和Specification-*配置项-->
                <addDefaultImplementationEntries>true
                </addDefaultImplementationEntries>
                <addDefaultSpecificationEntries>true
                </addDefaultSpecificationEntries>
            </manifest>
            <!-- 将 premain-class 配置项设置为com.xxx.TestAgent-->
            <manifestEntries>
                <Premain-Class>com.xxx.TestAgent</Premain-Class>
            </manifestEntries>
        </archive>
    </configuration>
    <executions>
        <execution>
            <!-- 绑定到package生命周期阶段上 -->
            <phase>package</phase>
            <goals>
                <!-- 绑定到package生命周期阶段上 -->
                <goal>single</goal>
            </goals>
        </execution>
    </executions>
</plugin>
```

最后执行 maven 命令进行打包，如下：

```java
mvn package -Dcheckstyle.skip -DskipTests
```

完成打包之后，我们可以解压 target 目录下的 test-agent.jar，在其 META-INF 目录下可以找到 MANIFEST.MF 文件，其内容如下：

```js
Manifest-Version: 1.0
Implementation-Title: TestAgent
Premain-Class: com.xxx.TestAgent       # 关注这一项
Implementation-Versioclearn: 1.0.0-SNAPSHOT
Archiver-Version: Plexus Archiver
Built-By: xxx
Specification-Title: TestAgent
Implementation-Vendor-Id: com.xxx
Created-By: Apache Maven 3.6.0
Build-Jdk: 1.8.0_191
Specification-Version: 1.0.0-SNAPSHOT
```

到此为止，Java Agent 使用的 jar 包创建完成了。

下面再创建一个普通的 Maven 项目：TestMain，项目结构与 TestAgent 类似，如图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/73/51/CgpOIF5p4auARfNmAACdrDhFMHg352.png"/> 


在 Main 这个类中定义了该项目的入口 main() 方法，如下所示：

```java
public class Main {
    public static void main(String[] args) throws Exception {
        Thread.sleep(1000);
        System.out.println("TestMain Main!");
    }
}
```

在启动 TestMain 项目之前，需要在 VM options 中使用 -javaagent 命令指定前面创建的 test-agent.jar，如图所示：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/73/51/Cgq2xl5p4ayACZVOAABtprd-NZA652.png"/> 


启动 TestMain 之后得到了如下输出：

```java
this is a java agent.
参数:option1=value2,option2=value2
TestMain Main!
```

### 修改类实现

Java Agent 可以实现的功能远不止添加一行日志这么简单，这里需要关注一下 premain() 方法中的第二个参数：Instrumentation。Instrumentation 位于 java.lang.instrument 包中，通过这个工具包，我们可以编写一个强大的 Java Agent 程序，用来动态替换或是修改某些类的定义。

下面先来简单介绍一下 Instrumentation 中的核心 API 方法：

* **addTransformer()/removeTransformer() 方法**：注册/注销一个 ClassFileTransformer 类的实例，该 Transformer 会在类加载的时候被调用，可用于修改类定义。
* **redefineClasses() 方法**：该方法针对的是已经加载的类，它会对传入的类进行重新定义。
* \*\*getAllLoadedClasses()方法：\*\*返回当前 JVM 已加载的所有类。
* **getInitiatedClasses() 方法**：返回当前 JVM 已经初始化的类。
* **getObjectSize()方法**：获取参数指定的对象的大小。

下面我们通过一个示例演示 Instrumentation 如何与 Java Agent 配合修改类定义。首先我们提供一个普通的 Java 类：TestClass，其中提供一个 getNumber() 方法：

```java
public class TestClass {
    public int getNumber() { return 1;  }
}
```

编译生成 TestClass.class 文件之后，我们将 getNumber() 方法返回值修改为 2，然后再次编译，并将此次得到的 class 文件重命名为 TestClass.class.2 文件，如图所示，我们得到两个 TestClass.class 文件：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/73/51/CgpOIF5p4ayAQ7QjAAAJJFmWXV4100.png"/> 


之后将 TestClass.getNumber() 方法返回值改回 1 ，重新编译。

然后编写一个 main() 方法，新建一个 TestClass 对象并输出其 getNumber() 方法的返回值：

```java
public class Main {
    public static void main(String[] args) {
        System.out.println(new TestClass().getNumber());
    }
}
```

接下来编写 premain() 方法，并注册一个 Transformer 对象：

```java
public class TestAgent {
    public static void premain(String agentArgs, Instrumentation inst) 
              throws Exception {
        // 注册一个 Transformer，该 Transformer在类加载时被调用
        inst.addTransformer(new Transformer(), true);
        inst.retransformClasses(TestClass.class);
        System.out.println("premain done");
    }
}
```

Transformer 实现了 ClassFileTransformer，其中的 transform() 方法实现可以修改加载到的类的定义，具体实现如下：

```java
class Transformer implements ClassFileTransformer {
    public byte[] transform(ClassLoader l, String className, 
       Class<?> c, ProtectionDomain pd, byte[] b)  {
        if (!c.getSimpleName().equals("TestClass")) {
            return null; // 只修改TestClass的定义
        }
        // 读取 TestClass.class.2这个 class文件，作为 TestClass类的新定义
        return getBytesFromFile("TestClass.class.2");
    }
}
```

之后还需要在 maven-assembly-plugin 插件中添加 Can-Retransform-Classes 参数：

```html
// 省略其他配置
<manifestEntries>
    <Premain-Class>com.xxx.TestAgent</Premain-Class>
    <Can-Retransform-Classes>true</Can-Retransform-Classes>
</manifestEntries>
```

最后，打包启动应用，得到的输出如下：

```java
premain done
2 
# 此输出说明，类TestClass的定义在加载时已经被 Transformer替换成 
# 文件 TestClass.class.2 中的定义
```

### 统计方法耗时

介绍完 Java Agent 的基本使用流程之后，这里做一个简单的进阶示例，将 Java Agent 与 Byte Buddy 结合使用，统计 com.xxx 包下所有方法的耗时。

回到 TestAgent 项目，整个项目的结构不变，需要在 pom.xml 中添加 Byte Buddy 的依赖，如下所示：

```html
<dependency>
    <groupId>net.bytebuddy</groupId>
    <artifactId>byte-buddy</artifactId>
    <version>1.9.2</version>
</dependency>
<dependency>
    <groupId>net.bytebuddy</groupId>
    <artifactId>byte-buddy-agent</artifactId>
    <version>1.9.2</version>
</dependency>
```

Byte Buddy 是一个开源 Java 库，其主要功能是帮助用户屏蔽字节码操作，以及复杂的 Instrumentation API 。Byte Buddy 提供了一套类型安全的 API 和注解，我们可以直接使用这些 API 和注解轻松实现复杂的字节码操作。另外，Byte Buddy 提供了针对 Java Agent 的额外 API，帮助开发人员在 Java Agent 场景轻松增强已有代码。在 下一课时中，我们将深入介绍 SkyWalking 涉及的 Byte Buddy 的 API，这里不做深入研究，只对此处涉及的 API 和注解做简单说明。

接下来对 TestAgent.java 进行修改，使用 Byte Buddy 提供的 API 拦截指定的类和方法，如下所示：

```java
public class TestAgent {
    public static void premain(String agentArgs, 
        Instrumentation inst) {
        // Byte Buddy会根据 Transformer指定的规则进行拦截并增强代码
        AgentBuilder.Transformer transformer = 
            new AgentBuilder.Transformer() {
            public DynamicType.Builder<?> transform(
                        DynamicType.Builder<?> builder,
                        TypeDescription typeDescription, 
                        ClassLoader classLoader,
                        JavaModule module) {
                // method()指定哪些方法需要被拦截，ElementMatchers.any()表                  // 示拦截所有方法
                return builder.method(
                   ElementMatchers.<MethodDescription>any())
                      // intercept()指明拦截上述方法的拦截器
                     .intercept(MethodDelegation.to(
                      TimeInterceptor.class));
            }
        };
        // Byte Buddy专门有个AgentBuilder来处理Java Agent的场景
        new AgentBuilder 
                .Default()
                // 根据包名前缀拦截类
                .type(ElementMatchers.nameStartsWith("com.xxx"))
                // 拦截到的类由transformer处理
                .transform(transformer)
                .installOn(inst); // 安装到 Instrumentation
    }
}
```

当拦截到符合条件的类时，会交给我们的 AgentBuilder.Transformer 实现处理，当 Transformer 拦截到符合条件的方法时，会交给上面指定的 TimeInterceptor 处理。TimeInterceptor 的具体实现如下：

```java
public class TimeInterceptor {
    @RuntimeType
    public static Object intercept(@Origin Method method,
          @SuperCall Callable<?> callable) throws Exception {
        long start = System.currentTimeMillis();
        try {
            return callable.call(); // 执行原函数
        } finally {
            System.out.println(method.getName() + ":"
                    + (System.currentTimeMillis() - start) + "ms");
        }
    }
}
```

TimeInterceptor 就类似于 AOP 的环绕切面。这里通过 @SuperCall 注解注入的 Callable 实例可以调到被拦截的目标方法，需要注意的是，在通过 Callable 调用目标方法时，即使目标方法带参数，这里也不用显式的传递。这里 @Origin 注解注入了被拦截方法对应的 Method 对象。

完成 TestAgent 的修改之后，执行如下命令，重新打包 test-agent.jar：

```java
mvn clean  package -Dcheckstyle.skip -DskipTests
```

打包完成，回到 TestMain 项目，所有代码和配置都无需修改，直接启动，会得到输出如下：

```js
TestMain Main!
main:1003ms
```

### Attach API 基础

在 Java 5 中，Java 开发者只能通过 Java Agent 中的 premain() 方法在 main() 方法执行之前进行一些操作，这种方式在一定程度上限制了灵活性。Java 6 针对这种状况做出了改进，提供了一个 agentmain() 方法，Java 开发者可以在 main() 方法执行以后执行 agentmain() 方法实现一些特殊功能。

agentmain() 方法同样有两个重载，它们的参数与 premain() 方法相同，而且前者优先级也是高于后者的：

```java
public static void agentmain (String agentArgs, 
      Instrumentation inst);[1]

public static void agentmain (String agentArgs); [2]
```

agentmain() 方法主要用在 JVM Attach 工具中，Attach API 是 Java 的扩展 API，可以向目标 JVM "附着"（Attach）一个代理工具程序，而这个代理工具程序的入口就是 agentmain() 方法。

Attach API 中有 2 个核心类需要特别说明：

* **VirtualMachine** 是对一个 Java 虚拟机的抽象，在 Attach 工具程序监控目标虚拟机的时候会用到该类。VirtualMachine 提供了 JVM 枚举、Attach、Detach 等基本操作。
* **VirtualMachineDescriptor** 是一个描述虚拟机的容器类，后面示例中会介绍它如何与 VirtualMachine 配合使用。

下面的示例依然通过用类文件替换的方式修改 TestClass 这个类的返回值。首先，前文使用到的 TestClass，以及 TestClass.class.2 文件不变。main() 方法略作修改，其中每隔 1s 创建一个新的 TestClass 对象并输出 getNumber() 方法返回值，具体实现如下：

```java
public static void main(String[] args) throws InterruptedException {
    System.out.println(new TestClass().getNumber());
    while (true) {
        Thread.sleep(1000); // 注意，这里是新建TestClass对象
        System.out.println(new TestClass().getNumber());
    }
}
```

另外，将 TestAgent 中的 premain() 方法修改成 agentmain() 方法（除了名称变化，没有任何其他变化）。

需要再添加一个 AttachMain 类，其中会通过 Attach API 监听上面 main() 方法的启动，这里每隔 1s 检查一次所有的 Java 虚拟机，当发现有新的虚拟机出现的时候，就调用 attach() 方法，将 TestAgent 所在的 jar 包"附加"上去，"附加"成功之后，TestAgent 就会通过 Transformer 修改TestClass 类定义。AttachMain 的具体实现如下：

```java
public class AttachMain {
    public static void main(String[] args) throws Exception {
        List<VirtualMachineDescriptor> listBefore = 
             VirtualMachine.list();
        String jar = ".../test-agent.jar"; // agentmain()方法所在jar包
        VirtualMachine vm = null;
        List<VirtualMachineDescriptor> listAfter = null;
        while (true) {
            listAfter = VirtualMachine.list();
            for (VirtualMachineDescriptor vmd : listAfter) {
                if (!listBefore.contains(vmd)) { // 发现新的JVM
                    vm = VirtualMachine.attach(vmd); // attach到新JVM
                    vm.loadAgent(jar); // 加载agentmain所在的jar包
                    vm.detach(); // detach
                    return;
                }
            }
            Thread.sleep(1000);
        }
    }
}
```

在 pom.xml 文件中添加如下依赖，否则在编译的过程中会抛异常：

```html
<dependency>
    <groupId>com.sun</groupId>
    <artifactId>tools</artifactId>
    <version>1.8</version>
    <scope>system</scope>
    <systemPath>${java.home}/../lib/tools.jar</systemPath>
</dependency>
```

另外，还要在 MANIFEST.MF 文件中添加 Agent-Class 这一项， pom.xml 文件中具体配置如下：

```html
<manifestEntries>
    <Can-Retransform-Classes>true</Can-Retransform-Classes>
    <!-- 指向agentmain()方法所在的类 -->
    <Agent-Class>com.xxx.TestAgent</Agent-Class>
</manifestEntries>
```

最后，我们先启动 AttachMain 类，然后通过命令行启动 Main ：

```js
java  -cp ./test-agent.jar com.xxx.attach.Main
-------
输出：
1
premain done # attach成功，Transformer会修改TestClass的定义
2  # 修改后的TestClass.getNumber()方法返回值为 2
2
```

在 SkyWalking Agent 中并没有使用到 Attach API，但是作为 Java Agent 的扩展，还是希望你对其有所了解。

### 总结

本课时重点介绍了 Java Agent 技术的基础知识，然后通过 TestAgent 和 TestMain 两个示例项目简单展示了 Java Agent 技术的使用流程，之后通过 Java Agent 和 Byte Buddy 实现了统计方法耗时的功能，最后还简单介绍 Attach API 的相关功能并进行了示例演示。

希望你在课后可以自己多加练习。

