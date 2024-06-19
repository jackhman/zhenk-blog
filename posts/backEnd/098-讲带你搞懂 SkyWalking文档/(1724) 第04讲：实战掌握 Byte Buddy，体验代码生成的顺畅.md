# 第04讲：实战掌握ByteBuddy，体验代码生成的顺畅

在上一课时介绍 Java Agent 技术时，结合 Byte Buddy 技术实现了统计方法执行时间的功能。本课时将深入介绍 Byte Buddy 的一些基础知识，为后续分析 SkyWalking Agent 实现扫清障碍。

### 为什么需要运行时代码生成

我们知道，Java 是一种强类型的编程语言，即要求所有变量和对象都有一个确定的类型，如果在赋值操作中出现类型不兼容的情况，就会抛出异常。强类型检查在大多数情况下是可行的，然而在某些特殊场景下，强类型检查则成了巨大的障碍。

例如，在对外提供一个通用 jar 包时，我们通常不能引用用户应用中定义的任何类型，因为当这个通用 jar 包被编译时，我们还不知道这些用户的自定义类型。为了调用用户自定义的类，访问其属性或方法，Java 类库提供了一套反射 API 帮助我们查找未知类型，以及调用其方法或字段。但是 Java 反射 API 有两个明显的缺点：

* 在早期 JDK 版本中，反射 API 性能很差。
* 反射 API 能绕过类型安全检查，反射 API 自身并不是类型安全的。

运行时代码生成在 Java 应用启动之后再动态生成一些类定义，这样就可以模拟一些只有使用动态编程语言编程才有的特性，同时也不丢失 Java 的强类型检查。在运行时生成代码需要特别注意的是 Java 类型被 JVM 加载之后，一般不会被垃圾被回收，因此不应该过度使用代码生成。

### 为什么选择 Byte Buddy

在 Java 的世界中，代码生成库不止 Byte Buddy 一个，以下代码生成库在 Java 中也很流行：

* **Java Proxy**

Java Proxy 是 JDK 自带的一个代理工具，它允许为实现了一系列接口的类生成代理类。Java Proxy 要求目标类必须实现接口是一个非常大限制，例如，在某些场景中，目标类没有实现任何接口且无法修改目标类的代码实现，Java Proxy 就无法对其进行扩展和增强了。

* **CGLIB**

CGLIB 诞生于 Java 初期，但不幸的是没有跟上 Java 平台的发展。虽然 CGLIB 本身是一个相当强大的库，但也变得越来越复杂。鉴于此，导致许多用户放弃了 CGLIB 。

* **Javassist**

Javassist 的使用对 Java 开发者来说是非常友好的，它使用Java 源代码字符串和 Javassist 提供的一些简单 API ，共同拼凑出用户想要的 Java 类，Javassist 自带一个编译器，拼凑好的 Java 类在程序运行时会被编译成为字节码并加载到 JVM 中。Javassist 库简单易用，而且使用 Java 语法构建类与平时写 Java 代码类似，但是 Javassist 编译器在性能上比不了 Javac 编译器，而且在动态组合字符串以实现比较复杂的逻辑时容易出错。

* **Byte Buddy**

Byte Buddy 提供了一种非常灵活且强大的领域特定语言，通过编写简单的 Java 代码即可创建自定义的运行时类。与此同时，Byte Buddy 还具有非常开放的定制性，能够应付不同复杂度的需求。

下表是 Byte Buddy 官网给出的数据，显示了上述代码生成库的基本性能，以纳秒为单位，标准偏差在括号内附加：


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/36/Cgq2xl5wS6eAEhhvAABWkAaOdsc174.png"/> 


代码生成库需要在"生成快速的代码"与"快速生成代码"之间进行折中。Byte Buddy 折中的考虑是：类型动态创建不是程序中的常见步骤，并不会对长期运行的应用程序产生重大性能影响，但方法调用等操作却在程序中随处可见。所以，Byte Buddy 的主要侧重点在于生成更快速的代码。

### Byte Buddy 基础入门

我们需要了解的第一个类就是 ByteBuddy 类，任何一个由 Byte Buddy 创建/增强的类型都是通过 ByteBuddy 类的实例来完成的，如下所示：

```js
DynamicType.Unloaded<?> dynamicType = new ByteBuddy()
        .subclass(Object.class) // 生成 Object的子类
        .name("com.xxx.Type")   // 生成类的名称为"com.xxx.Type"
        .make();
```

包括 subclass 在内，Byte Buddy 动态增强代码总共有三种方式：

* **subclass**：对应 ByteBuddy.subclass() 方法。这种方式比较好理解，就是为目标类（即被增强的类）生成一个子类，在子类方法中插入动态代码。
* **rebasing**：对应 ByteBuddy.rebasing() 方法。当使用 rebasing 方式增强一个类时，Byte Buddy 保存目标类中所有方法的实现，也就是说，当 Byte Buddy 遇到冲突的字段或方法时，会将原来的字段或方法实现复制到具有兼容签名的重新命名的私有方法中，而不会抛弃这些字段和方法实现。从而达到不丢失实现的目的。这些重命名的方法可以继续通过重命名后的名称进行调用。例如：

```java
class Foo { // Foo的原始定义
  String bar() { return "bar"; }
}

class Foo { // 增强后的Foo定义
  String bar() { return "foo" + bar$original(); }
  private String bar$original() { return "bar"; }
}
```

* **redefinition**：对应 ByteBuddy.redefine() 方法。当重定义一个类时，Byte Buddy 可以对一个已有的类添加属性和方法，或者删除已经存在的方法实现。如果使用其他的方法实现替换已经存在的方法实现，则原来存在的方法实现就会消失。例如，这里依然是增强 Foo 类的 bar() 方法使其直接返回 "unknow" 字符串，增强结果如下：

```java
class Foo { // 增强后的Foo定义
  String bar() { return "unknow"; }
}
```

通过上述三种方式完成类的增强之后，我们得到的是 DynamicType.Unloaded 对象，表示的是一个未加载的类型，我们可以使用 ClassLoadingStrategy 加载此类型。Byte Buddy 提供了几种类加载策略，这些策略定义在 ClassLoadingStrategy.Default 中，其中：

* **WRAPPER 策略**：创建一个新的 ClassLoader 来加载动态生成的类型。
* **CHILD_FIRST 策略**：创建一个子类优先加载的 ClassLoader，即打破了双亲委派模型。
* **INJECTION 策略**：使用反射将动态生成的类型直接注入到当前 ClassLoader 中。

具体使用方式如下所示：

```html
Class<?> loaded = new ByteBuddy()
        .subclass(Object.class)
        .name("com.xxx.Type")
        .make()
        // 使用 WRAPPER 策略加载生成的动态类型
        .load(Main2.class.getClassLoader(), 
              ClassLoadingStrategy.Default.WRAPPER)
        .getLoaded();
```

前文动态生成的 com.xxx.Type 类型只是简单的继承了 Object 类，在实际应用中动态生成新类型的一般目的就是为了增强原始的方法，下面通过一个示例展示 Byte Buddy 如何增强 toString() 方法：

```js
String str = new ByteBuddy() // 创建ByteBuddy对象
        .subclass(Object.class) // subclass增强方式
        .name("com.xxx.Type") // 新类型的类名
        // 拦截其中的toString()方法
        .method(ElementMatchers.named("toString")) 
        // 让toString()方法返回固定值
        .intercept(FixedValue.value("Hello World!")) 
        .make()
        // 加载新类型，默认WRAPPER策略
        .load(ByteBuddy.class.getClassLoader()) 
        .getLoaded()
        .newInstance() // 通过 Java反射创建 com.xxx.Type实例
        .toString(); // 调用 toString()方法
System.out.println(str);
```

首先需要关注这里的 method() 方法，method() 方法可以通过传入的 ElementMatchers 参数匹配多个需要修改的方法，这里的 ElementMatchers.named("toString") 即为按照方法名匹配 toString() 方法。如果同时存在多个重载方法，则可以使用 ElementMatchers 其他 API 描述方法的签名，如下所示：

```java
ElementMatchers.named("toString") // 指定方法名称
    .and(ElementMatchers.returns(String.class)) // 指定方法的返回值
    .and(ElementMatchers.takesArguments(0)) // 指定方法参数
```

接下来需要关注的是 intercept() 方法，通过 method() 方法拦截到的所有方法会由 Intercept() 方法指定的 Implementation 对象决定如何增强。这里的 FixValue.value() 会将方法的实现修改为固定值，上例中就是固定返回 "Hello World!" 字符串。

Byte Buddy 中可以设置多个 method() 和 Intercept() 方法进行拦截和修改，Byte Buddy 会按照栈的顺序来进行拦截。下面通过一个示例进行说明，首先我们定一个 Foo 类，其中有三个方法，如下：

```java
class Foo { // Foo 中定义了三个方法
  public String bar() { return null; }
  public String foo() { return null; }
  public String foo(Object o) { return null; }
}
```

接下来使用 Byte Buddy 动态生成一个 Foo 的子类，并修改其中的方法：

```js
Foo dynamicFoo = new ByteBuddy()
  .subclass(Foo.class) 
  .method(isDeclaredBy(Foo.class)) // 匹配 Foo中所有的方法
  .intercept(FixedValue.value("One!")) 
  .method(named("foo")) // 匹配名为 foo的方法
  .intercept(FixedValue.value("Two!"))
  .method(named("foo").and(takesArguments(1))) // 匹配名为foo且只有一个
                                               // 参数的方法
  .intercept(FixedValue.value("Three!"))
  .make()
  .load(getClass().getClassLoader(), INJECTION)
  .getLoaded()
  .newInstance();
System.out.println(dynamicFoo.bar());
System.out.println(dynamicFoo.foo());
System.out.println(dynamicFoo.foo(null));
```

这里 method() 方法出现了三次，且每次出现后面都跟着的 intercept() 方法使用的 Implementation 参数都不同。Byte Buddy 会按照栈的方式将后定义 method() 方法在栈顶，先定义的方法在栈底。在匹配方法的时候，按照下图执行出栈流程逐一匹配：  

<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/34/CgpOIF5wSpuAZ3eOAAEl5LR7yUY040.png"/> 


所以上例的输出结果是：

```js
One!
Two!
Three!
```

前面的示例中，目标方法都被修改成了返回固定值，在实际应用中意义不大，实践中最常用的是通过 MethodDelegation 将拦截到的目标方法委托为另一个类去处理。下面通过一个示例对 MethodDelegation 的使用进行分析，首先创建一个名为 DB 的类作为目标类：

```java
class DB {
    public String hello(String name) {
        System.out.println("DB:" + name);
        return null;
    }
}
```

在使用 Byte Buddy 对其进行增强时的逻辑如下：

```js
String helloWorld = new ByteBuddy()
         .subclass(DB.class)
         .method(named("hello"))
         // 拦截DB.hello()方法，并委托给 Interceptor中的静态方法处理
         .intercept(MethodDelegation.to(Interceptor.class))
         .make()
         .load(ClassLoader.getSystemClassLoader(), INJECTION)
         .getLoaded()
         .newInstance()
         .hello("World");
System.out.println(helloWorld);
```

下面来看 Interceptor 这个类的定义：

```java
class Interceptor {
    public static String intercept(String name) { return "String"; }
    public static String intercept(int i) { return "int"; }
    public static String intercept(Object o) { return "Object";}
}
```

Interceptor 中有三个方法，最终会委托给哪个方法呢？答案是 intercept(String name) 方法，委托并不是根据名称来的，而是和 Java 编译器在选重载时用的参数绑定类似。如果我们将 Intercept(String) 这个重载去掉，则 Byte Buddy 会选择 Intercept(Object) 方法。你可以尝试执行一下该示例，得到的输出分别是 String 和 Object。

除了通过上述 API 拦截方法并将方法实现委托给 Interceptor 增强之外，Byte Buddy 还提供了一些预定义的注解，通过这些注解我们可以告诉 Byte Buddy 将哪些需要的数据注入到 Interceptor 中，下面依然通过一个示例来介绍 Byte Buddy 中常用的注解：

```java
class Interceptor {
    @RuntimeType
    public Object intercept(
      @This Object obj, // 目标对象
      @AllArguments Object[] allArguments, // 注入目标方法的全部参数
      @SuperCall Callable<?> zuper, // 调用目标方法，必不可少哦
      @Origin Method method, // 目标方法
      @Super DB db // 目标对象
    ) throws Exception {
        System.out.println(obj); 
        System.out.println(db);
        // 从上面两行输出可以看出，obj和db是一个对象
        try {
          return zuper.call(); // 调用目标方法
        } finally {
        }
}
// 输出：
// com.xxx.DB$ByteBuddy$8AV3B7GI@2d127a61
// com.xxx.DB$ByteBuddy$8AV3B7GI@2d127a61
// DB:World
// null
```

这里详细说明每个注解的作用：

* **@RuntimeType 注解**：告诉 Byte Buddy 不要进行严格的参数类型检测，在参数匹配失败时，尝试使用类型转换方式（runtime type casting）进行类型转换，匹配相应方法。
* \*\*@This 注解：\*\*注入被拦截的目标对象（即前面示例的 DB 对象）。
* **@AllArguments 注解**：注入目标方法的全部参数，是不是感觉与 Java 反射的那套 API 有点类似了？
* **@Origin 注解**：注入目标方法对应的 Method 对象。如果拦截的是字段的话，该注解应该标注到 Field 类型参数。
* **@Super 注解**：注入目标对象。通过该对象可以调用目标对象的所有方法。
* **@SuperCall**：这个注解比较特殊，我们要在 intercept() 方法中调用目标方法的话，需要通过这种方式注入，与 Spring AOP 中的 ProceedingJoinPoint.proceed() 方法有点类似，需要注意的是，这里不能修改调用参数，从上面的示例的调用也能看出来，参数不用单独传递，都包含在其中了。另外，@SuperCall 注解还可以修饰 Runnable 类型的参数，只不过目标方法的返回值就拿不到了。

有一个地方需要注意，这里定义的 Interceptor.intercept() 方法不是静态方法，而是一个实例方法。前面示例中要委托到 Interceptor 的静态方法，在 MethodDelegation.to() 方法中传递的参数是 Interceptor.class，这里要委托到 Interceptor 的实例方法需要在 MethodDelegation.to() 方法中传递 Interceptor 实例：

```java
MethodDelegation.to(Interceptor.class) // 委托到 Interceptor的静态方法
MethodDelegation.to(new Interceptor()) // 委托到 Interceptor的实例方法
```

前面示例中，使用 @SuperCall 注解注入的 Callable 参数来调用目标方法时，是无法动态修改参数的，如果想要动态修改参数，则需要用到 @Morph 注解以及一些绑定操作，示例如下：

```js
String hello = new ByteBuddy()
    .subclass(DB.class)
    .method(named("hello"))
    .intercept(MethodDelegation.withDefaultConfiguration()
        .withBinders( 
            // 要用@Morph注解之前，需要通过 Morph.Binder 告诉 Byte Buddy 
            // 要注入的参数是什么类型
            Morph.Binder.install(OverrideCallable.class)
        )
        .to(new Interceptor()))
    .make()
    .load(Main.class.getClassLoader(), INJECTION)
    .getLoaded()
    .newInstance()
    .hello("World");
```

这里的 Interceptor 会使用 @Morph 注解注入一个 OverrideCallable 对象作为参数，然后通过该 OverrideCallable 对象调用目标方法，如下所示：

```java
class Interceptor {
    @RuntimeType
    public Object intercept(@This Object obj,
          @AllArguments Object[] allArguments,// 注入目标方法的全部参数
          @Origin Method method,
          @Super DB db,
          @Morph OverrideCallable callable // 通过@Morph注解注入
    ) throws Throwable {
        try {
            System.out.println("before");
            // 通过 OverrideCallable.call()方法调用目标方法，此时需要传递参数
            Object result = callable.call(allArguments);
            System.out.println("after");
            return result;
        } catch (Throwable t) {
            throw t;
        } finally {
            System.out.println("finally");
        }
    }
}
```

最后，这里使用的 OverrideCallable 是一个自定义的接口，如下所示：

```java
public interface OverrideCallable {
    Object call(Object[] args);
}
```

除了拦截 static 方法和实例方法，Byte Buddy 还可以拦截构造方法，这里依然通过一个示例进行说明。首先修改 DB 这个类，为它添加一个构造方法，如下所示：

```java
class DB { // 只有一个有参数的构造方法
    public DB(String name) { System.out.println("DB:" + name); }
}
```

使用的 Interceptor 与前文使用的类似：

```java
class Interceptor { 
    @RuntimeType
    public void intercept(@This Object obj, 
                          @AllArguments Object[] allArguments) {
        System.out.println("after constructor!");
    }
}
```

这里不再使用 method() 方法拦截，而是使用 constructor() 方法拦截构造方法，并且使用 SuperMethodCall 调用构造方法并委托给 Interceptor 实例，具体实现如下：

```java
Constructor<? extends DB> constructor = new ByteBuddy()
        .subclass(DB.class)
        .constructor(any()) // 通过constructor()方法拦截所有构造方法
        // 拦截的操作：首先调用目标对象的构造方法，根据前面自动匹配，
        // 这里直接匹配到参数为String.class的构造方法
        .intercept(SuperMethodCall.INSTANCE.andThen(
            // 执行完原始构造方法，再开始执行interceptor的代码
           MethodDelegation.withDefaultConfiguration()
              .to(new Interceptor())
        )).make().load(Main.class.getClassLoader(), INJECTION)
        .getLoaded()
        .getConstructor(String.class); 
// 下面通过反射创建生成类型的对象
constructor.newInstance("MySQL");
-----
输出：
DB:MYSQL
after constructor!
```

SuperMethodCall 会在新生成的方法中先调用目标方法，如果未找到目标方法则抛出异常，如果目标方法是构造方法，则根据方法签名匹配。

最后，我们通过一个示例展示 Byte Buddy 除修改方法实现之外的其他三个功能：

* defineMethod() 方法：新增方法。
* defineField() 方法：新增字段。
* Implement() 方法：实现一个接口。

示例如下：

```js
interface DemoInterface{
    String get();
    void set(String name);
}

Class<? extends Foo> loaded = new ByteBuddy()
  .subclass(Foo.class)
  .defineMethod("moon", // 定义方法的名称
          String.class,  // 方法的返回值
          Modifier.PUBLIC) // public修饰
  .withParameter(String.class, "s") // 新增方法的参数参数
  .intercept(FixedValue.value("Zero!")) // 方法的具体实现，返回固定值
  // 新增一个字段，该字段名称成为"name"，类型是 String，且public修饰
  .defineField("name", String.class, Modifier.PUBLIC)
  .implement(DemoInterface.class) // 实现DemoInterface接口
  // 实现 DemoInterface接口的方式是读写name字段
  .intercept(FieldAccessor.ofField("name")) 
  .make().load(Main.class.getClassLoader(),
   ClassLoadingStrategy.Default.INJECTION)
  .getLoaded(); // 获取加载后的Class

Foo dynamicFoo = loaded.newInstance(); // 反射
// 要调用新定义的doo()方法，只能通过反射方式
Method m = loaded.getDeclaredMethod("moon", String.class);
System.out.println(m.invoke(dynamicFoo, new Object[]{""}));
Field field = loaded.getField("name"); // 通过反射方式读写新增的name字段
field.set(dynamicFoo, "Zero-Name"); 
System.out.println(field.get(dynamicFoo));
// 通过反射调用 DemoInterface接口中定义的get()和set()方法，读取name字段的值
Method setNameMethod = loaded.getDeclaredMethod("set", String.class);
setNameMethod.invoke(dynamicFoo, new Object[]{"Zero-Name2"});
Method getNameMethod = loaded.getDeclaredMethod("get");
System.out.println(getNameMethod.invoke(dynamicFoo, new Object[]{}))
----------
输出如下：
Zero!
Zero-Name
Zero-Name
```

Byte Buddy 相关的基础入门就介绍完了，本课时的内容已经覆盖了 SkyWalking Agent 使用到的所有 Byte Buddy 知识。如果你想更深入地了解 Byte Buddy 的使用，可以参考其官网教程（<http://bytebuddy.net/#/tutorial>）进行学习。

### 总结

本课时首先说明了运行时生成代码技术存在的必要性，然后简单介绍了当前市面上流行的 Java 代码生成库，并简单比较了它们各自优缺点，最后通过多组示例演示了 Byte Buddy 库的基本使用方式，对其中的 API 以及常用注解进行了详细的介绍。

