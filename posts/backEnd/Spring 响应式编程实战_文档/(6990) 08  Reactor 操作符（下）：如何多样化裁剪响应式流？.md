# 08Reactor操作符（下）：如何多样化裁剪响应式流？

通过前两讲的内容可以知道，Reactor 框架为我们提供了各种操作符，使用这些操作符可以高效地操作 Flux 和 Mono 对象。Reactor 中的操作符可以分成不同的类型，上一讲我们关注转换、过滤和组合类的操作符，而今天我将继续为你介绍剩余的条件、裁剪、工具类的操作符。

### 条件操作符

所谓条件操作符，本质上就是提供了一个判断的依据来确定是否处理流中的元素。Reactor 中常用的条件操作符有 defaultIfEmpty、takeUntil、takeWhile、skipUntil 和 skipWhile 等，下面我将分别介绍。

#### defaultIfEmpty 操作符

defaultIfEmpty 操作符针对空数据流提供了一个简单而有用的处理方法。该操作符用来返回来自原始数据流的元素，如果原始数据流中没有元素，则返回一个默认元素。

defaultIfEmpty 操作符在实际开发过程中应用广泛，通常用在对方法返回值的处理上。如下所示的就是在 Controller 层中对 Service 层返回结果的一种常见处理方法。

```java
@GetMapping("/orders/{id}")
public Mono<ResponseEntity<Order>> findOrderById(@PathVariable 
	String id) {
     return orderService.findOrderById(id)
         .map(ResponseEntity::ok)
         .defaultIfEmpty(ResponseEntity
	.status(404).body(null));
}
```

可以看到，这里使用 defaultIfEmpty 操作符实现默认返回值。在示例代码所展示的 HTTP 端点中，当找不到指定的数据时，我们可以通过 defaultIfEmpty 方法返回一个空对象以及 404 状态码。

#### takeUntil/takeWhile 操作符

takeUntil 操作符的基本用法是 takeUntil (Predicate\<? super T\> predicate)，其中 Predicate 代表一种断言条件，该操作符将从数据流中提取元素直到断言条件返回 true。takeUntil 的示例代码如下所示，我们希望从一个包含 100 个连续元素的序列中获取 1\~10 个元素。

```java
Flux.range(1, 100).takeUntil(i -> i == 10)
	.subscribe(System.out::println);
```

类似的，takeWhile 操作符的基本用法是 takeWhile (Predicate\<? super T\> continuePredicate)，其中 continuePredicate 代表的也是一种断言条件。与 takeUntil 不同的是，takeWhile 会在 continuePredicate 条件返回 true 时才进行元素的提取。takeWhile 的示例代码如下所示，这段代码的执行效果与 takeUntil 的示例代码一致。

```java
Flux.range(1, 100).takeWhile(i -> i <= 10)
	.subscribe(System.out::println);
```

讲到这里，让我们回顾上一讲介绍的第一个转换操作符 buffer。事实上，Reactor 框架中同样也提供了 bufferUntil 和 bufferWhile 操作符来实现数据收集，这两个操作符用到了和 takeUntil/takeWhile 完全一样的断言机制，如下代码演示了 bufferUntil 的使用方法。

```java
Flux.range(1, 10).bufferUntil(i -> i % 2 == 0)
	.subscribe(System.out::println);
```

以上代码的执行结果如下所示，这里所设置的断言就是"i % 2 == 0"这一条件。

```xml
[1, 2]
[3, 4]
[5, 6]
[7, 8]
[9, 10]
```

对应的，bufferWhile 的使用方法和执行结果分别如下所示。

```java
Flux.range(1, 10).bufferWhile(i -> i % 2 == 0)
	.subscribe(System.out::println);
```

```xml
[2]
[4]
[6]
[8]
[10]
```

#### skipUntil/skipWhile 操作符

与 takeUntil 相对应，skipUntil 操作符的基本用法是 skipUntil (Predicate\<? super T\> predicate)。skipUntil 将丢弃原始数据流中的元素直到 Predicate 返回 true。

同样，与 takeWhile 相对应，skipWhile 操作符的基本用法是 skipWhile (Predicate\<? super T\> continuePredicate)，当 continuePredicate 返回 true 时才进行元素的丢弃。这两个操作符都很简单，就不具体展开讨论了。

下面来说说裁剪操作符。

### 裁剪操作符

裁剪操作符通常用于统计流中的元素数量，或者检查元素是否具有一定的属性。在 Reactor 中，常用的裁剪操作符有 any 、concat、count 和 reduce 等。

#### any 操作符

any 操作符用于检查是否至少有一个元素具有所指定的属性，示例代码如下。

```java
Flux.just(3, 5, 7, 9, 11, 15, 16, 17)
        .any(e -> e % 2 == 0)
        .subscribe(isExisted -> System.out.println(isExisted));
```

在这个 Flux 流中存在一个元素 16 可以被 2 除尽，所以控制台将输出"true"。

类似的，Reactor 中还存在一个 all 操作符，用来检查流中元素是否都满足同一属性，示例代码如下所示。

```java
Flux.just("abc", "ela", "ade", "pqa", "kang")
        .all(a -> a.contains("a"))
        .subscribe(isAllContained -> System.out.println(isAllContained));
```

显然，在这个 Flux 流中所有元素都包含了字符"a"，所以控制台也将输出"true"。

#### concat 操作符

concat 操作符用来合并来自不同 Flux 的数据。与上一讲中所介绍的 merge 操作符不同，这种合并采用的是顺序的方式，所以严格意义上并不是一种合并操作，所以我们把它归到裁剪操作符类别中。

例如，如果执行下面这段代码，我们将在控制台中依次看到 1 到 10 这 10 个数字。

```java
Flux.concat(
            Flux.range(1, 3),
            Flux.range(4, 2),
            Flux.range(6, 5)
        ).subscribe(System.out::println);
};
```

#### reduce 操作符

裁剪操作符中最经典的就是这个 reduce 操作符。reduce 操作符对来自 Flux 序列中的所有元素进行累积操作并得到一个 Mono 序列，该 Mono 序列中包含了最终的计算结果。reduce 操作符示意图如下所示。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M00/2C/98/CioPOWBlYDaAMg1pAAPcwZ2XS_I628.png"/> 
  
reduce 操作符示意图（来自 Reactor 官网）

在上图中，具体的累积计算很简单，我们也可以通过一个 BiFunction 来实现任何自定义的复杂计算逻辑。reduce 操作符的示例代码如下所示，这里的 BiFunction 就是一个求和函数，用来对 1 到 10 的数字进行求和，运行结果为 55。

```java
Flux.range(1, 10).reduce((x, y) -> x + y)
	.subscribe(System.out::println);
```

与 reduce 操作符类似的还有一个 reduceWith 操作符，用来在 reduce 操作时指定一个初始值。reduceWith 操作符的代码示例如下所示，我们使用 5 来初始化求和过程，显然得到的结果将是 60。

```java
Flux.range(1, 10).reduceWith(() -> 5, (x, y) -> x + y)
	.subscribe(System.out::println);
```

以上就是三种裁剪操作符的介绍，应该很好理解，下面我们来看看工具操作符。

### 工具操作符

Reactor 中常用的工具操作符有 subscribe、timeout、block、log 和 debug 等。

#### subscribe 操作符

说起 subscribe 操作符，我已经在"06 \| 流式操作：如何使用 Flux 和 Mono 高效构建响应式数据流"中讲到订阅响应式流时介绍过很多，这里再带你回顾一下通过该操作符订阅序列的最通用方式，如下所示。

```java
//订阅序列的最通用方式，可以为我们的Subscriber实现提供所需的任意行为
subscribe(Subscriber<T> subscriber);
```

基于这种方式，如果默认的 subscribe() 方法没有提供所需的功能，我们可以实现自己的 Subscriber。一般而言，我们总是可以直接实现响应式流规范所提供的 Subscriber 接口，并将其订阅到流。实现一个自定义的 Subscriber 并没有想象中那么困难，这里我给你演示一个简单的实现示例。

```java
Subscriber<String> subscriber = new Subscriber<String>() {
            volatile Subscription subscription; 

            public void onSubscribe(Subscription s) {
                subscription = s;
                System.out.println("initialization");
                subscription.request(1);
            }

            public void onNext(String s) {
                System.out.println("onNext:" + s);
                subscription.request(1);
            }

            public void onComplete() { 
                System.out.println("onComplete");
            }

            public void onError(Throwable t) { 
                System.out.println("onError:" + t.getMessage());
            }
};
```

在这个自定义 Subscriber 实现中，我们首先持有对订阅令牌 Subscription 的引用。由于订阅和数据处理可能发生在不同的线程中，因此我们使用 volatile 关键字来确保所有线程都具有对 Subscription 实例的正确引用。

当订阅到达时，我们会通过 onSubscribe 回调通知 Subscriber。在这里，我们保存订阅令牌并初始化请求。

你应该注意到，在 onNext 回调中，我们打印接收到的数据并请求下一个元素。在这种情况下，我们执行 subscription.request(1) 方法，也就是说使用简单的拉模型来管理背压。

剩下的 onComplete 和 onError 方法我们都只是打印了一下日志。

现在，让我们通过 subscribe() 方法来使用这个 Subscriber，如下所示。

```java
Flux<String> flux = Flux.just("12", "23", "34");
        flux.subscribe(subscriber);
```

上述代码应该产生以下控制台输出的结果。

```xml
initialization
onNext:12
onNext:23
onNext:34
onComplete
```

前面构建的自定义 Subscriber 虽然能够正常运作，但因为过于偏底层，因此并不推荐你使用。我们推荐的方法是扩展 Project Reactor 提供的 BaseSubscriber 类。在这种情况下，订阅者可能如下所示。

```java
class MySubscriber<T> extends BaseSubscriber<T> {
            public void hookOnSubscribe(Subscription subscription) {
                System.out.println("initialization");
                request(1);
            }
 
            public void hookOnNext(T value) {
                System.out.println("onNext:" + value);
                request(1);
            }
}
```

可以看到这里使用了两个钩子方法：hookOnSubscribe(Subscription) 和 hookOnNext(T)。和这两个方法一起，我们可以重载诸如 hookOnError(Throwable)、hookOnCancel()、hookOnComplete() 等方法。

#### timeout 操作符

timeout 操作符非常简单，保持原始的流发布者，当特定时间段内没有产生任何事件时，将生成一个异常。

#### block 操作符

顾名思义，block 操作符在接收到下一个元素之前会一直阻塞。block 操作符常用来把响应式数据流转换为传统数据流。例如，使用如下方法将分别把 Flux 数据流和 Mono 数据流转变成普通的 List`<Order>` 对象和单个的 Order 对象，我们同样可以设置 block 操作的等待时间。

```java
public List<Order> getAllOrders() {
        return orderservice.getAllOrders()
	.block(Duration.ofSecond(5));
}
 
public Order getOrderById(Long orderId) {
  return orderservice.getOrderById(orderId)
	.block(Duration.ofSecond(2));
}
```

#### log 操作符

Reactor 中专门提供了针对日志的工具操作符 log，它会观察所有的数据并使用日志工具进行跟踪。我们可以通过如下代码演示 log 操作符的使用方法，在 Flux.just() 方法后直接添加 log() 函数。

```java
Flux.just(1, 2).log().subscribe(System.out::println);
```

以上代码的执行结果如下所示（为了显示简洁，部分内容和格式做了调整）。通常，我们也可以在 log() 方法中添加参数来指定日志分类的名称。

```xml
Info: | onSubscribe([Synchronous Fuseable] FluxArray.ArraySubscription)
Info: | request(unbounded)
Info: | onNext(1)
1
Info: | onNext(2)
2
Info: | onComplete()
```

#### debug 操作符

在"01 \| 追本溯源：响应式编程究竟是一种什么样的技术体系"中，我们已经提到基于回调和异步的实现方式比较难以调整。响应式编程也是一样，这也是它与传统编程方式之间一个很大的差异点。

为此，Reactor 框架的设计者也考虑到了普通开发人员的诉求，并开发了专门用于 debug 的操作符。要想启动调试模式，我们需要在程序开始的地方添加如下代码。

```java
Hooks.onOperator(providedHook -> 
	providedHook.operatorStacktrace())
```

现在，所有的操作符在执行时都会保存与执行过程相关的附加信息。而当系统出现异常时，这些附加信息就相当于系统异常堆栈信息的一部分，方便开发人员进行问题的分析和排查。

上述做法是全局性的，如果你只想观察某个特定的流，那么就可以使用检查点（checkpoint）这一调试功能。例如以下代码演示了如何通过检查点来捕获 0 被用作除数的场景，我们在代码中添加了一个名为"debug"的检查点。

```java
Mono.just(0).map(x -> 1 / x)
	.checkpoint("debug").subscribe(System.out::println);
```

以上代码的执行结果如下所示。

```java
Exception in thread "main" reactor.core.Exceptions$ErrorCallbackNotImplemented: java.lang.ArithmeticException: / by zero
	Caused by: java.lang.ArithmeticException: / by zero
	...
 
Assembly trace from producer [reactor.core.publisher.MonoMap] :
    reactor.core.publisher.Mono.map(Mono.java:2029)
    com.jianxiang.reactor.demo.Debug.main(Debug.java:10)
Error has been observed by the following operator(s):
    |_  Mono.map(Debug.java:10)
    |_  Mono.checkpoint(Debug.java:10)
 
    Suppressed: reactor.core.publisher.FluxOnAssembly$AssemblySnapshotException: zero
        at reactor.core.publisher.MonoOnAssembly.<init>(MonoOnAssembly.java:55)
        at reactor.core.publisher.Mono.checkpoint(Mono.java:1304)
        ... 1 more
```

可以看到，这个检查点信息会包含在异常堆栈中。根据需要在系统的关键位置上添加自定义的检查点，也是我们日常开发过程中的一种最佳实践。

### 小结与预告

好了，这一讲内容就介绍到这。承接上一讲的 Reactor 框架所提供的操作符，这一讲我分别就条件操作符、裁剪操作符以及各种工具操作符展开了详细的说明。在日常开发过程中，这些操作符都比较常见，能够加速我们开发响应式系统的开发过程。

这里依然给你留一道思考题：在 Reactor 中，如何自己实现一个 Subscriber？

那么介绍完 Spring 内置的 Reactor 框架之后，从下一讲开始，我们要讨论在 Spring 中使用这一框架来实现响应式组件的具体过程，首先要说的就是全新的 WebFlux 组件。下一讲，我们将详细分析 WebFlux 与传统 WebMVC 之间的区别，希望会带给你新的思路，我们到时见。
> 点击链接，获取课程相关代码↓↓↓  
> [https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git](https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git?fileGuid=oD5pMrGWYzgDig8d)

