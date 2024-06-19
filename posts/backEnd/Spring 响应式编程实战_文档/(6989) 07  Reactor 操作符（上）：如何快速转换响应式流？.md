# 07Reactor操作符（上）：如何快速转换响应式流？

上一讲，我系统地为你介绍了 Reactor 框架中创建 Flux 和 Mono 这两种数据流的各种方法。一旦我们得到了一个数据流，就可以使用它来完成某个特定的需求。

和其他主流的响应式编程框架一样，Reactor 框架的设计目标也是为了简化响应式流的使用方法。为此，Reactor 框架为我们提供了大量操作符，用于操作 Flux 和 Mono 对象。本讲和下一讲，我们将对常用的操作符展开讨论。

### 操作符的分类

在进行响应式编程时，灵活应用操作符是开发人员的核心工作。由于 Reactor 中所提供的操作符数量众多，本课程不打算对所有这些操作符进行全面而细致的介绍，而是尝试将操作符进行分类，然后对每一类中具有代表性的操作符展开讨论。

业界关于响应式操作符的分类并没有统一的说法，但针对数据流通常都会涉及转换、过滤、裁剪等核心操作，以及一些辅助性的操作。因此，本课程中我将 Flux 和 Mono 操作符分成如下六大类型：

* 转换（Transforming）操作符，负责将序列中的元素转变成另一种元素；

* 过滤（Filtering）操作符，负责将不需要的数据从序列中剔除出去；

* 组合（Combining）操作符，负责将序列中的元素进行合并、连接和集成；

* 条件（Conditional）操作符，负责根据特定条件对序列中的元素进行处理；

* 裁剪（Reducing）操作符，负责对序列中的元素执行各种自定义的裁剪操作；

* 工具（Utility）操作符，负责一些针对流式处理的辅助性操作。

其中，我把前面三种操作符统称为"转换类"操作符，剩余的三大类统称为"裁剪类"操作符。这一讲先来针对"转换类"的常见操作符做具体展开，"裁剪类"的操作符将放在下一讲中介绍。

### 转换操作符

转换可以说是对数据流最常见的一种操作了，Reactor 中常用的转换操作符包括 buffer、window、map 和 flatMap 等。

#### buffer 操作符

buffer 操作符的作用相当于把当前流中的元素统一收集到一个集合中，并把这个集合对象作为新的数据流。使用 buffer 操作符在进行元素收集时，可以指定集合对象所包含的元素的最大数量。buffer 操作符的一种用法如下所示。

```java
Flux.range(1, 25).buffer(10).subscribe(System.out::println);
```

以上代码先使用上一讲中介绍的 range() 方法创建 1\~25 这 25 个元素，然后演示了通过 buffer 操作符从包含这 25 个元素的流中构建一组集合，每个集合包含 10 个元素，所以一共构建 3 个集合。显然，上面这段代码的执行效果如下所示。

```xml
[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
[11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
[21, 22, 23, 24, 25]
```

buffer 操作符的另一种用法是指定收集的时间间隔，由此演变出了一组 bufferTimeout() 方法，bufferTimeout() 方法可以指定时间间隔为一个 Duration 对象或毫秒数。

#### window 操作符

window 操作符的作用类似于 buffer，不同的是 window 操作符是把当前流中的元素收集到另外的 Flux 序列中，而不是一个集合。因此该操作符的返回值类型就变成了 Flux\<Flux \>。window 操作符相对比较复杂，我们附上官方给出的弹珠图，如下所示。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M00/29/9C/Cgp9HWBhfxqAbRiUAAQFjAhjF5U321.png"/> 
  
window 操作符示意图（来自 Reactor 官网）

上图比较复杂，代表的是一种对序列进行开窗的操作。我们还是通过一个简单的示例来进一步阐述 window 操作符的作用，示例代码如下。

```java
Flux.range(1, 5).window(2).toIterable().forEach(w -> {
        w.subscribe(System.out::println);
        System.out.println("-------");
});
```

这里我们生成了 5 个元素，然后通过 window 操作符把这 5 个元素转变成 3 个 Flux 对象。在将这些 Flux 对象转化为 Iterable 对象后，通过 forEach() 循环打印出来，执行效果如下所示。

```xml
1
2
-------
3
4
-------
5
```

#### map 操作符

map 操作符相当于一种映射操作，它对流中的每个元素应用一个映射函数从而达到转换效果，比较简单，你可以来看一下示例。

```java
Flux.just(1, 2).map(i -> "number-" + i).subscribe(System.out::println);
```

显然，这行代码的输入应该是这样：

```xml
number-1
number-2
```

#### flatMap 操作符

flatMap 操作符执行的也是一种映射操作，但与 map 不同，该操作符会把流中的每个元素映射成一个流而不是一个元素，然后再把得到的所有流中的元素进行合并，整个过程你可以通过 flapMap 操作符的弹珠图进行理解，如下所示。


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image6/M00/29/A5/CioPOWBhfyaAdHDOAALuJxPlC4w200.png"/> 
  
flapMap 操作符示意图（来自 Reactor 官网）

上图比较复杂，而如下代码展示了 flatMap 操作符的一种常见的应用方法。

```java
Flux.just(1, 5)
     .flatMap(x -> Mono.just(x * x))
     .subscribe(System.out::println);
```

以上代码中，我们对 1 和 5 这两个元素使用了 flatMap 操作，操作的结果是返回它们的平方值并进行合并，执行效果如下。

```xml
1
25
```

事实上，flatMap 可以对任何你感兴趣的操作进行转换。例如，在系统开发过程中，我们经常会碰到对从数据库查询所获取的数据项逐一进行处理的场景，这时候就可以充分利用 flatMap 操作符的特性开展相关操作。

如下所示的代码演示了针对从数据库获取的 User 数据，如何使用该操作符逐一查询 User 所生成的订单信息的实现方法。

```java
Flux<User> users = userRepository.getUsers();
users.flatMap(u -> getOrdersByUser(u))
```

flatMap 操作符非常强大而实用，在本课程的案例中，你会经常看到 flatMap 的这种使用方法。

以上就是常见的四种转换操作符，我通过文字描述以及代码演示，让你对此形成一定的认知，为后续的学习打下基础。下面再来说说过滤操作符。

### 过滤操作符

过滤类操作符的作用非常明确，就是从数据流中只获取自己想要的元素。Reactor 中的过滤操作符也有很多，常用的包括 filter、first/last、skip/skipLast、take/takeLast 等，这些操作符应用起来都相对比较简单。

#### filter 操作符

filter 操作符的含义与普通的过滤器类似，就是对流中包含的元素进行过滤，只留下满足指定过滤条件的元素，而过滤条件的指定一般是通过断言。

例如，我们想要对 1\~10 这 10 个元素进行过滤，只获取能被 2 取余的元素，可以使用如下代码。

```java
Flux.range(1, 10).filter(i -> i % 2 == 0)
	.subscribe(System.out::println);
```

这里的"i % 2 == 0"代表的就是一种断言。

#### first/last 操作符

first 操作符的执行效果为返回流中的第一个元素，而 last 操作符的执行效果即返回流中的最后一个元素。这两个操作符很简单，但却很常用。不需要给出代码示例相信你也能明白它们的用法。

#### skip/skipLast

如果使用 skip 操作符，将会忽略数据流的前 n 个元素。类似的，如果使用 skipLast 操作符，将会忽略流的最后 n 个元素。

#### take/takeLast

take 系列操作符用来从当前流中提取元素。我们可以按照指定的数量来提取元素，也可以按照指定的时间间隔来提取元素。类似的，takeLast 系列操作符用来从当前流的尾部提取元素。

take 和 takeLast 操作符的示例代码如下，我们不难得出它们的执行效果分别为返回 1 到 10，以及返回 991 到 1000 的 10 个数字。

```java
Flux.range(1, 100).take(10).subscribe(System.out::println);
 
Flux.range(1, 100).takeLast(10).subscribe(System.out::println);
```

以上就是过滤操作符，下面再来说说组合操作符。

### 组合操作符

Reactor 中常用的组合操作符有 then/when、merge、startWith 和 zip 等。相比过滤操作符，组合操作符要复杂一点，我们先从简单的看起。

#### then/when 操作符

then 操作符的含义是等到上一个操作完成再进行下一个。以下代码展示了该操作符的用法。

```java
Flux.just(1, 2, 3)
    .then()
    .subscribe(System.out::println);
```

这里尽管生成了一个包含 1、2、3 三个元素的 Flux 流，但 then 操作符在上游的元素执行完成之后才会触发新的数据流，也就是说会忽略所传入的元素，所以上述代码在控制台上实际并没有任何输出。

和 then 一起的还有一个 thenMany 操作服务，具有同样的含义，但可以初始化一个新的 Flux 流。示例代码如下所示，这次我们会看到控制台上输出了 4 和 5 这两个元素。

```java
Flux.just(1, 2, 3)
    .thenMany(Flux.just(4, 5))
    .subscribe(System.out::println);
```

对应的，when 操作符的含义则是等到多个操作一起完成。如下代码很好地展示了 when 操作符的实际应用场景。

```java
public Mono<Void> updateOrders(Flux<Order> orders) {
        return orders
            .flatMap(file -> {
                Mono<Void> saveOrderToDatabase = ...;
                
                Mono<Void> sendMessage = ...;
 
                return Mono.when(saveOrderToDatabase, 
	sendMessage);
       });
}
```

*** ** * ** ***

在上述代码中，假设我们对订单列表进行批量更新，首先把订单数据持久化到数据库，然后再发送一条通知类的消息。我们需要确保这两个操作都完成之后方法才能返回，所以用到了 when 操作符。

#### merge 操作符

作为一种典型的组合类操作符，merge 操作符用来把多个 Flux 流合并成一个 Flux 序列，而合并的规则就是按照流中元素的实际生成的顺序进行，它的弹珠图如下所示。


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image6/M00/29/9C/Cgp9HWBhfz6ABVQNAANJ8ZXLXC8786.png"/> 
  
merge 操作符示意图（来自 Reactor 官网）

merge 操作符的代码示例如下所示，我们通过 Flux.intervalMillis() 方法分别创建了两个 Flux 序列，然后将它们 merge 之后打印出来。

```java
Flux.merge(Flux.intervalMillis(0, 100).take(2), Flux.intervalMillis(50, 100).take(2)).toStream()
                .forEach(System.out::println);
```

请注意，这里的第一个 intervalMillis 方法没有延迟，每隔 100 毫秒生成一个元素，而第二个 intervalMillis 方法则是延迟 50 毫秒之后才发送第一个元素，时间间隔同样是 100 毫秒。相当于两个数据序列会交错地生成数据，并合并在一起。所以以上代码的执行效果如下所示。

```xml
0
0
1
1
```

和 merge 类似的还有一个 mergeSequential 方法。不同于 merge 操作符，mergeSequential 操作符则按照所有流被订阅的顺序，以流为单位进行合并。现在我们来看一下这段代码，这里仅仅将 merge 操作换成了 mergeSequential 操作。

```java
Flux.mergeSequential (Flux.intervalMillis(0, 100).take(2), Flux.intervalMillis(50, 100).take(2)).toStream()
                .forEach(System.out::println);
```

执行以上代码，我们将得到不同的结果，如下所示。

```xml
0
1
0
1
```

显然从结果来看，mergeSequential 操作是等上一个流结束之后再 merge 新生成的流元素。

#### zip 操作符

zip 操作符的合并规则比较特别，是将当前流中的元素与另外一个流中的元素按照一对一的方式进行合并，如下所示。


<Image alt="Drawing 7.png" src="https://s0.lgstatic.com/i/image6/M00/29/A5/CioPOWBhf0-AMFkrAAMs-TKDoUM878.png"/> 
  
zip 操作符示意图（来自 Reactor 官网）

使用 zip 操作符在合并时可以不做任何处理，由此得到的是一个元素类型为 Tuple2 的流，示例代码如下所示。

```java
Flux flux1 = Flux.just(1, 2);
Flux flux2 = Flux.just(3, 4);
Flux.zip(flux1, flux2).subscribe(System.out::println);
```

以上代码执行效果如下所示。

```xml
[1,3]
[2,4]
```

我们可以使用 zipWith 操作符实现同样的效果，示例代码如下所示。

```java
Flux.just(1, 2).zipWith(Flux.just(3, 4))
	.subscribe(System.out::println);
```

另一方面，我们也可以通过自定义一个 BiFunction 函数来对合并过程做精细化的处理，这时候所得到的流的元素类型即为该函数的返回值类似，示例代码如下所示。

```java
Flux.just(1, 2).zipWith(Flux.just(3, 4), (s1, s2) -> 
	String.format("%s+%s=%s", s1, s2, s1 + s2))
	.subscribe(System.out::println);
```

以上代码执行效果如下，可以看到我们对输出内容做了自定义的格式化操作。

```xml
1+3=4
2+4=6
```

关于组合操作符的大致情况我就介绍到这了，本讲内容也将告一段落。

### 小结与预告

这一讲开始系统介绍 Reactor 框架所提供的各类操作符，使用操作符是我们开发响应式应用程序的主要工作。Reactor 框架中的操作符数量繁多，今天我们先给出了针对这些操作符的分类讨论，并重点对转换类、过滤类和组合类的操作符展开了详细的介绍，希望你能对此有一个清晰的认知，为后续的深入学习打下基础。

这里给你留一道思考题：在 Reactor 中，map 和 flatMap 操作符有什么区别？

下一讲将承接本讲内容继续讨论 Reactor 框架中的操作符，我们将讨论条件、裁剪和工具类的操作符使用方法，到时见。
> 点击链接，获取课程相关代码↓↓↓  
> [https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git](https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git?fileGuid=5qq2xRIWjHwZ6Uvr)

