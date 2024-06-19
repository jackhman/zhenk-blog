# 06流式操作：如何使用Flux和Mono高效构建响应式数据流？

在上一讲中，我为你介绍了 Reactor 响应式编程框架，该框架实现了响应式流规范。我们知道在响应式流规范中，存在代表发布者的 Publisher 接口，而 Reactor 提供了这一接口的两种实现，即 Flux 和 Mono，它们是我们利用 Reactor 框架进行响应式编程的基础组件。在引入 Flux 和 Mono 的概念之后，这一讲的内容将围绕如何创建这两个组件展开。

### 通过 Flux 对象创建响应式流

创建 Flux 的方式非常多，大体可以分成两大类，一类是基于各种工厂模式的静态创建方法，而另一类则采用编程的方式动态创建 Flux。相对而言，静态方法在使用上都比较简单，但不如动态方法来得灵活。我们来一起看一下。

#### 通过静态方法创建 Flux

Reactor 中静态创建 Flux 的方法常见的包括 just()、range()、interval() 以及各种以 from- 为前缀的方法组等。同时，因为 Flux 可以代表 0 个数据，所以也有一些专门用于创建空序列的工具方法。

* **just() 方法**

我已经在上一讲为你演示过 just() 方法，它可以指定序列中包含的全部元素，创建出来的 Flux 序列在发布这些元素之后会自动结束。一般情况下，在已知元素数量和内容时，使用 just() 方法是创建 Flux 的最简单直接的做法。使用 just() 方法创建 Flux 对象的示例代码如下所示。

```java
Flux.just("Hello", "World").subscribe(System.out::println);
```

不难想象，执行以上代码，我们将在系统控制台中得到如下结果，该结果与我们的预想完全一致。

```xml
Hello
World
```

这里我们对 Flux 执行了用于订阅的 subscribe() 方法，并通过使用 Lambda 表达式调用了 System.out.println() 方法，这意味着将结果打印到系统控制台。关于 subscribe() 方法以及对响应式流的订阅过程，我会在本讲后续内容中进一步说明。

* **fromXXX() 方法组**

如果我们已经有了一个数组、一个 Iterable 对象或 Stream 对象，那么就可以通过 Flux 提供的 fromXXX() 方法组来从这些对象中自动创建 Flux，包括 fromArray()、fromIterable() 和 fromStream() 方法。

上一讲我们提到了 Flux.fromIterable() 方法，这里再给出一个使用 fromArray() 方法创建 Flux 对象的示例代码，如下所示。

```java
Flux.fromArray(new Integer[] {1, 2, 3})
	.subscribe(System.out::println);
```

这段代码的执行结果就是在控制台中输出三行记录。

```xml
1
2
3
```

* **range() 方法**

如果你快速生成一个整数数据流，那么可以采用 range() 方法，该方法允许我们指定目标整数数据流的起始元素以及所包含的个数，序列中的所有对象类型都是 Integer，这在创建连续的年份信息或序号信息等场景下非常有用。使用 range() 方法创建 Flux 对象的示例代码如下所示。

```java
Flux.range(2020, 5).subscribe(System.out::println);
```

显然，这段代码会在控制台中打印出 5 行记录，从 2020 开始，到 2024 结束。

* **interval() 方法**

在 Reactor 框架中，interval() 方法可以用来生成从 0 开始递增的 Long 对象的数据序列。通过 interval() 所具备的一组重载方法，我们可以分别指定这个数据序列中第一个元素发布之前的延迟时间，以及每个元素之间的时间间隔。interval() 方法相对复杂，我们先附上它的弹珠图，如下所示。


<Image alt="图片9.png" src="https://s0.lgstatic.com/i/image6/M00/27/AE/Cgp9HWBdhB-ASNRVAAJo-Y1sCZw573.png"/> 
  
使用 interval() 方法创建 Flux 示意图（来自 Reactor 官网）

可以看到，上图中每个元素发布时相当于添加了一个定时器的效果。使用 interval() 方法的示例代码如下所示。

```java
Flux.interval(Duration.ofSeconds(2), Duration.ofMillis(200)).subscribe(System.out::println);
```

这段代码的执行效果相当于在等待 2 秒钟之后，生成一个从 0 开始逐一递增的无界数据序列，每 200 毫秒推送一次数据。

* **empty()、error() 和 never()**

根据上一讲介绍的 Reactor 异步序列的语义，我们可以分别使用 empty()、error() 和 never() 这三个方法类创建一些特殊的数据序列。其中，如果你希望创建一个只包含结束消息的空序列，那么可以使用 empty() 方法，使用示例如下所示。显然，这时候控制台应该没有任何的输出结果。

```java
Flux.empty().subscribe(System.out::println);
```

然后，通过 error() 方法可以创建一个只包含错误消息的序列。如果你不希望所创建的序列不发出任何类似的消息通知，也可以使用 never() 方法实现这一目标。当然，这几个方法都比较少用，通常只用于调试和测试。

不难看出，静态创建 Flux 的方法简单直接，一般用于生成那些事先已经定义好的数据序列。而如果数据序列事先无法确定，或者生成过程中包含复杂的业务逻辑，那么就需要用到动态创建方法。

#### 通过动态方法创建 Flux

动态创建 Flux 所采用的就是以编程的方式创建数据序列，最常用的就是 generate() 方法和 create() 方法。

* **generate() 方法**

generate() 方法生成 Flux 序列依赖于 Reactor 所提供的 SynchronousSink 组件，定义如下。

```java
public static <T> Flux<T> generate(Consumer<SynchronousSink<T>> generator)
```

SynchronousSink 组件包括 next()、complete() 和 error() 这三个核心方法。从 SynchronousSink 组件的命名上就能知道它是一个同步的 Sink 组件，也就是说元素的生成过程是同步执行的。这里要注意的是 next() 方法只能最多被调用一次。使用 generate() 方法创建 Flux 的示例代码如下。

```java
Flux.generate(sink -> {
    sink.next("Jianxiang");
    sink.complete();
}).subscribe(System.out::println);
```

运行该段代码，会在系统控制台上得到"Jianxiang"。我们在这里调用了一次 next() 方法，并通过 complete() 方法结束了这个数据流。如果不调用 complete() 方法，那么就会生成一个所有元素均为"Jianxiang"的无界数据流。

这个示例非常简单，但已经具备了动态创建一个 Flux 序列的能力。如果想要在序列生成过程中引入状态，那么可以使用如下所示的 generate() 方法重载。

```java
Flux.generate(() -> 1, (i, sink) -> {
            sink.next(i);
            if (i == 5) {
                sink.complete();
            }
            return ++i;
}).subscribe(System.out::println);
```

这里我们引入了一个代表中间状态的变量 i，然后根据 i 的值来判断是否终止序列。显然，以上代码的执行效果会在控制台中输入 1 到 5 这 5 个数字。

* **create()**

create() 方法与 generate() 方法比较类似，但它使用的是一个 FluxSink 组件，定义如下。

```java
public static <T> Flux<T> create(Consumer<? super FluxSink<T>> emitter)
```

FluxSink 除了 next()、complete() 和 error() 这三个核心方法外，还定义了背压策略，并且可以在一次调用中产生多个元素。使用 create() 方法创建 Flux 的示例代码如下。

```java
Flux.create(sink -> {
            for (int i = 0; i < 5; i++) {
                sink.next("jianxiang" + i);
            }
            sink.complete();
}).subscribe(System.out::println);
```

运行该程序，我们会在系统控制台上得到从"jianxiang0"到"jianxiang4"的 5 个数据。通过 create() 方法创建 Flux 对象的方式非常灵活，在本专栏中会有多种场景用到这个方法。

以上就是通过Flux 对象创建响应式流的方法，此外，还可以通过 Mono 对象来创建响应式流，我们一起来看一下。

### 通过 Mono 对象创建响应式流

对于 Mono 而言，可以认为它是 Flux 的一种特例，所以很多创建 Flux 的方法同样适用。针对静态创建 Mono 的场景，前面给出的 just()、empty()、error() 和 never() 等方法同样适用。除了这些方法之外，比较常用的还有 justOrEmpty() 等方法。

justOrEmpty() 方法会先判断所传入的对象中是否包含值，只有在传入对象不为空时，Mono 序列才生成对应的元素，该方法示例代码如下。

```java
Mono.justOrEmpty(Optional.of("jianxiang"))
	.subscribe(System.out::println);
```

另一方面，如果要想动态创建 Mono，我们同样也可以通过 create() 方法并使用 MonoSink 组件，示例代码如下。

```java
Mono.create(sink ->
sink.success("jianxiang")).subscribe(System.out::println);
```

### 订阅响应式流

介绍完如何创建响应式流，接下来就需要讨论如何订阅响应式流。想要订阅响应式流，就需要用到 subscribe() 方法。在前面的示例中我们已经演示了 subscribe 操作符的用法，知道可以通过 subscribe() 方法来添加相应的订阅逻辑。同时，在调用 subscribe() 方法时可以指定需要处理的消息通知类型。正如前面内容所看到的，Flux 和 Mono 提供了一批非常有用的 subscribe() 方法重载方法，大大简化了订阅的开发例程。这些重载方法包括如下几种。

```java
//订阅流的最简单方法，忽略所有消息通知
subscribe();
 
//对每个来自 onNext 通知的值调用 dataConsumer，但不处理 onError 和 onComplete 通知
subscribe(Consumer<T> dataConsumer);
 
//在前一个重载方法的基础上添加对 onError 通知的处理
subscribe(Consumer<T> dataConsumer, Consumer<Throwable> errorConsumer);
 
//在前一个重载方法的基础上添加对 onComplete 通知的处理
subscribe(Consumer<T> dataConsumer, Consumer<Throwable> errorConsumer,
Runnable completeConsumer);
 
//这种重载方法允许通过请求足够数量的数据来控制订阅过程
subscribe(Consumer<T> dataConsumer, Consumer<Throwable> errorConsumer,
Runnable completeConsumer, Consumer<Subscription> subscriptionConsumer);
 
//订阅序列的最通用方式，可以为我们的 Subscriber 实现提供所需的任意行为
subscribe(Subscriber<T> subscriber);
```

在"05 \|顶级框架：Spring 为什么选择 Reactor 作为响应式编程框架"中我们提到 Reactor 中的消息通知类型有三种，即正常消息、错误消息和完成消息。显然，通过上述 subscribe() 重载方法，我们可以只处理其中包含的正常消息，也可以同时处理错误消息和完成消息。例如，下面这段代码示例展示了同时处理正常和错误消息的实现方法。

```java
Mono.just("jianxiang")
         .concatWith(Mono.error(new IllegalStateException()))
         .subscribe(System.out::println, System.err::println);
```

以上代码的执行结果如下所示，我们得到了一个"jianxiang"，同时也获取了 IllegalStateException 这个异常。

```java
jianxiang 
java.lang.IllegalStateException
```

有时候我们不想直接抛出异常，而是希望采用一种容错策略来返回一个默认值，就可以采用如下方式。

```java
Mono.just("jianxiang")
          .concatWith(Mono.error(new IllegalStateException()))
          .onErrorReturn("default")
          .subscribe(System.out::println);
```

以上代码的执行结果如下所示，当产生异常时我们使用 onErrorReturn() 方法返回一个默认值"default"。

```java
jianxiang 
default
```

另外一种容错策略是通过 switchOnError() 方法使用另外的流来产生元素，以下代码演示了这种策略，执行结果与上面的示例一致。

```java
Mono.just("jianxiang")
         .concatWith(Mono.error(new IllegalStateException()))
         .switchOnError(Mono.just("default"))
         .subscribe(System.out::println);
```

我们可以充分利用 Lambda 表达式来使用 subscribe() 方法，例如下面这段代码。

```java
Flux.just("jianxiang1", "jianxiang2", "jianxiang3").subscribe(data -> System.out.println("onNext:" + data), err -> {
        }, () -> System.out.println("onComplete"));
```

这段代码的执行效果如下所示，可以看到，我们分别对 onNext 通知和 onComplete 通知进行了处理。

```xml
onNext:jianxiang1
onNext:jianxiang2
onNext:jianxiang3
onComplete
```

### 小结与预告

那么，这一讲就说到这里了。本讲为你介绍了如何创建 Flux 和 Mono 对象，以及如何订阅响应式流的系统方法。想要创建响应式流，可以利用 Reactor 框架所提供的各种工厂方法来达到静态创建的效果，同时也可以使用更加灵活的编程式方式来实现动态创建。而针对订阅过程，Reactor 框架也提供了一组面向不同场景的 subscribe 方法。

这里给你留一道思考题：在 Reactor 中，通过编程的方式动态创建 Flux 和 Mono 有哪些方法？

一旦我们创建了 Flux 和 Mono 对象，就可以使用操作符来操作这些对象从而实现复杂的数据流处理。下一讲，我们就要引入 Reactor 框架所提供的各种操作符来达成这一目标，到时候见。
> 点击链接，获取课程相关代码↓↓↓  
> [https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git](https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git?fileGuid=xxQTRXtVcqtHK6j8)

