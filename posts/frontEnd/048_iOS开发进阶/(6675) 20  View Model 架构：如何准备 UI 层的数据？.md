# 20ViewModel架构：如何准备UI层的数据？

UI 是 App 的重要组成部分，因为所有 App 都必须呈现 UI，并接收用户的事件。为了让 UI 能正确显示，我们需要把 Model 数据进行转换。例如，当我们显示图片的时候，需要把字符串类型的 URL 转换成 iOS 所支持 URL 类型；当显示时间信息时，需要把 UTC 时间值转换成设备所在的时区。

不过存在一个问题，如果我们把所有类型转换的逻辑都放在 UI/View 层里面，作为 View 层的 View Controller 往往会变得越来越臃肿。 为了避免这一情况，我使用了 MVVM 模式和 RxSwift 来架构 Moments App。MVVM 模式的核心部分是 ViewModel 模块，主要用于把 Model 转换成 UI/View 层所需的数据。为了简化转换的工作，我使用了 RxSwift 的操作符（Operator）。

所以，在这一讲中，我会和你介绍下 ViewModel 模式是怎样工作的，以及如何使用 RxSwift 里常用的操作符。

### ViewModel 模式的架构

首先我们以朋友圈功能为例，看看 ViewModel 模式的架构图。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M00/3C/0F/CioPOWCH7COAXcMTAAPT7Gr7yvg197.png"/> 


**View 模块** 负责呈现 UI，并接收用户的事件。在朋友圈功能中，`MomentsTimelineViewController`负责呈现朋友圈的时间轴列表。为了正确显示该页面，我们需要为它准备好一些的数据，例如朋友的名字，朋友头像的 URL 等等，那些数据可以从 ViewModel 模块中读取。

**ViewModel 模块** 是 MVVM 模式的核心，该模块由两个重要的协议所组成：`ListViewModel`和`ListItemViewModel`。其中`ListViewModel`协议用于定义列表页面所需的 ViewModel，而`ListItemViewModel`用于定义每一条列表项所需的 ViewModel。当他们需要读写数据时，会调用 Repository 模块。比如在朋友圈功能里面，它们都调用`MoomentsRepoType`来读写数据。

### ViewModel 模式的实现

有了上述的架构图，我们就可以看看 ViewModel 模块是怎样实现的。首先看一下`ListViewModel`协议的定义。

```swift
protocol ListViewModel {
    var hasContent: Observable<Bool> { get }
    var hasError: BehaviorSubject<Bool> { get }
    func trackScreenviews()
    func loadItems() -> Observable<Void>
    var listItems: BehaviorSubject<[SectionModel<String, ListItemViewModel>]> { get }
}
```

下面我们逐一介绍该协议的各个属性与方法。`hasContent`属性用于通知 UI 是否有内容。例如，当 BFF 没有返回数据时，我们可以在页面上提示用户"目前还没有朋友圈信息，可以添加好友来查看更多的朋友圈信息"。

为了代码共享，我们为`hasContent`属性提供了一个默认的实现，代码如下。

```swift
extension ListViewModel {
    var hasContent: Observable<Bool> {
        return listItems
            .map(\.isEmpty)
            .distinctUntilChanged()
            .asObservable()
    }
}
```

这个方法使用`map`和`distinctUntilChanged`操作符来把`listItems`转换成 Bool 类型的`hasContent`。其中`map`用于提取`listItems`里的数组并检查是否为空，`distinctUntilChanged`用来保证只有在值发生改变时才发送新事件。

`hasError`属性是一个`BehaviorSubject`，其初始值为`false`。它用于通知 UI 是否需要显示错误信息。

`trackScreenviews()`方法用于发送用户行为数据。而`loadItems() -> Observable<Void>`方法用于读取数据。

最后看一下`listItems`属性。 该属性用于准备 TableView 所需的数据，其存放了类型为`ListItemViewModel`的数据。`ListItemViewModel`能为 TableView 的各个 Cell 提供所需数据。该协议只定义一个名为`reuseIdentifier`的静态属性 ，如下所示。

```swift
protocol ListItemViewModel {
    static var reuseIdentifier: String { get }
}
extension ListItemViewModel {
    static var reuseIdentifier: String {
        String(describing: self)
    }
}
```

`reuseIdentifier`属性作为 TableView Cell 的唯一标示，为了重用，我们通过协议扩展来为该属性提供一个默认的实现并把类型的名字作为字符串进行返回。  

上述就是`ListViewModel`协议的定义，接下来看它的实现结构体`MomentsTimelineViewModel`。

由于`MomentsTimelineViewModel`遵循了`ListViewModel`协议，因此需要实现了该协议中`listItems`和`hasError`属性以及`loadItems()`和`trackScreenviews()`方法。我们首先看一下`loadItems()`方法的实现。

```swift
func loadItems() -> Observable<Void> {
    return momentsRepo.getMoments(userID: userID)
}
```

当 ViewModel 需要读取数据的时候，会调用 Repository 模块的组件，在朋友圈功能中，我们调用了`MomentsRepoType`的`getMoments()`方法来读取数据。

接着看看`trackScreenviews()`方法的实现。在该方法里面，我们调用了`TrackingRepoType`的`trackScreenviews()`方法来发送用户的行为数据，具体实现如下。

```swift
func trackScreenviews() {
    trackingRepo.trackScreenviews(ScreenviewsTrackingEvent(screenName: L10n.Tracking.momentsScreen, screenClass: String(describing: self)))
 }
```

**ViewModel 模块的一个核心功能，是把 Model 数据转换为用于 UI 呈现所需的 ViewModel 数据**，我通过下面代码看它是怎样转换的。

```swift
func setupBindings() {
 momentsRepo.momentsDetails
     .map {
         [UserProfileListItemViewModel(userDetails: $0.userDetails)]
             + $0.moments.map { MomentListItemViewModel(moment: $0) }
     }
     .subscribe(onNext: {
         listItems.onNext([SectionModel(model: "", items: $0)])
     }, onError: { _ in
         hasError.onNext(true)
     })
     .disposed(by: disposeBag)
}
```

从代码中你可以发现，我们订阅了`momentsRepo`的`momentsDetails`属性，接收来自 Model 的数据更新。因为该属性的类型是`MomentsDetails`，而 View 层用所需的数据类型为`ListItemViewModel`。我们通过 map 操作符来进行类型转换，在转换成功后，调用`listItems`的`onNext()`方法把准备好的 ViewModel 数据发送给 UI。如果发生错误，就通过`hasError`属性发送出错信息。

在 map 操作符的转换过程中，我们分别使用了`UserProfileListItemViewModel`和`MomentListItemViewModel`结构体来转换用户简介信息和朋友圈条目信息。这两个结构体都遵循了`ListItemViewModel`协议。

接下来是它们的实现，首先看一下`UserProfileListItemViewModel`。

```swift
struct UserProfileListItemViewModel: ListItemViewModel {
    let name: String
    let avatarURL: URL?
    let backgroundImageURL: URL?
    init(userDetails: MomentsDetails.UserDetails) {
        name = userDetails.name
        avatarURL = URL(string: userDetails.avatar)
        backgroundImageURL = URL(string: userDetails.backgroundImage)
    }
}
```

该结构体只包含了三个属性：`name`、`avatarURL`和`backgroundImageURL`。

其中，由于`name`属性的类型与`MomentsDetails.UserDetails`中`name`属性的类型都是字符串，我们只需要直接赋值就可以了。

而`avatarURL`和`backgroundImageURL`用于在 UI 上显示图片。因为 BFF 返回的 URL 值都是字符串类型，我们需要把字符串转换成`URL`类型。所有的转换工作我都放在`init(userDetails: MomentsDetails.UserDetails)`方法里面完成，我们只需要调用`URL`的初始化函数即可。

接着看一下`MomentListItemViewModel`结构体，它也是负责把 Model 的数据类型转换成用于 View 层显示 UI 的 ViewModel 数据。其转换的逻辑也封装在`init()`方法中，我们一起看看该方法是如何工作的。

```swift
init(moment: MomentsDetails.Moment, now: Date = Date(), relativeDateTimeFormatter: RelativeDateTimeFormatterType = RelativeDateTimeFormatter()) {
    userAvatarURL = URL(string: moment.userDetails.avatar)
    userName = moment.userDetails.name
    title = moment.title

    if let firstPhoto = moment.photos.first {
        photoURL = URL(string: firstPhoto)
    } else {
        photoURL = nil
    }
    var formatter = relativeDateTimeFormatter
    formatter.unitsStyle = .full
    if let timeInterval = TimeInterval(moment.createdDate) {
        let createdDate = Date(timeIntervalSince1970: timeInterval)
        postDateDescription = formatter.localizedString(for: createdDate, relativeTo: now)
    } else {
        postDateDescription = nil
    }
}
```

`userName`和`title`属性都是字符串类型，只需要简单的赋值就可以了。而`userAvatarURL`和`photoURL`属性需要把字符串转换为`URL`类型来呈现图片。

`postDateDescription`属性相对复杂些，它的用途是显示一个相对的时间值，例如 "5 分钟前""2 小时前"等。我们需要把朋友圈信息生成的时间与当前时间进行对比，然后根据手机上的语言配置来显示相对时间值。

### RxSwift 操作符

ViewModel 的核心功能是把 Model 数据转换为用于 UI 呈现所需的数据。其实**RxSwift 的操作符就是负责转换的，使用合适的操作符能帮我们减少代码量并提高生产力**。因此我建议你把 RxSwift 所提供的所有操作符都看一遍，然后在实际工作再挑选合适的来满足业务需求。

在这里，我着重介绍下过**滤操作符，转换操作符和合并操作符**中常用的 filter、distinctUntilChanged、map 和 combineLatest 等用法。

#### 过滤操作符

过滤操作符用于过滤事件，我们可以使用过滤操作符把订阅者不关心的事件给过滤掉。常用的过滤操作符有 filter 和 distinctUntilChanged。

**filter**操作符常用于通过规则过滤不需要的事件，例如在朋友圈功能里面，可以把发布时间早于一天前的信息过滤掉不显示。为了方便理解，我就以几个数字来解释下。如下所示，有 2、23、5、60、1、31，我想把小于 10 的数过滤掉，就可以通过 filter 设置过滤规则，然后打印出来的数字就是 23、 60、31。代码示例如下。

```swift
Observable.of(2, 23, 5, 60, 1, 31)
    .filter { $0 > 10 }
    .subscribe(onNext: {
        print($0)
    })
    .disposed(by: disposeBag)
```


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image6/M01/3C/06/Cgp9HWCH7E6AcOAxAAD0m4P1ZAs382.png"/> 
  
过滤操作符 filter 的效果

**distinctUntilChanged**用于把相同的事件过滤掉。如下面例子中的第二个 1 和第四个 2，使用distinctUntilChanged 就可以把它们给过滤掉，然后打印出 1、 2、 1。代码和图例如下所示。

```swift
Observable.of(1, 1, 2, 2, 1)
    .distinctUntilChanged()
    .subscribe(onNext: {
        print($0)
    })
    .disposed(by: disposeBag)
```


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image6/M01/3C/06/Cgp9HWCH7Q-AVcVjAAEFCx3nsK4458.png"/> 
  
过滤操作符 distinctUntilChanged 的效果

除了相同的事件，我们还可以使用操作符**distinctUntilChanged**过滤掉相同的状态，从而避免频繁更新 UI。例如，我们先使用本地缓存数据呈现 UI，然后发起网络请求。当请求成功以后可以把结果数据与缓存进行对比，如果数据一致就没必要再次更新 UI。

#### 转换操作符

转换操作符非常实用，能帮助我们从一种数据类型转变成另外一种类型，例如我们可以把用于数据传输和存储的 Model 类型转换成用于 UI 呈现的 ViewModel 类型。在这里，我就以几个常用的转换操作符 map，compactMap 和 flapMap 来介绍下如何使用它们。

**map**是一个十分常用的操作符，可用于从一种类型转换成另外一种类型，例如下面的例子，我把数值类型转换成字符串。程序执行的时候会打印 "String: 1" 和 "String: 2"。代码和图例如下所示。

```swift
Observable.of(1, 2)
    .map { "String: " + String($0) }
    .subscribe(onNext: {
        print($0)
    })
    .disposed(by: disposeBag)
```


<Image alt="Drawing 7.png" src="https://s0.lgstatic.com/i/image6/M01/3C/07/Cgp9HWCH7R6ASEB0AAD5Z_BYeoQ092.png"/> 
  
转换操作符 map 的效果

**compactMap** 常用于过滤掉值为`nil`的操作符，你可以把 compactMap 理解为同时使用 filter 和 map 的两个操作符。filter 把`nil`的值过滤掉，而 map 把非空的值进行转换。

例如下面的例子中，我把字符串的值转换为数值类型，并把转换不成功的值过滤掉。由于 "not-a-number" 不能转换成数值类型，因此被过滤掉了，执行的时候会打印 1 和 2。代码示例如下所示：

```swift
Observable.of("1", "not-a-number", "2")
    .compactMap { Int($0) }
    .subscribe(onNext: {
        print($0)
    })
    .disposed(by: disposeBag)
```


<Image alt="Drawing 9.png" src="https://s0.lgstatic.com/i/image6/M01/3C/0F/CioPOWCH7SeAfVeYAAEfEP1ULSY822.png"/> 
  
转换操作符 compactMap 效果

**flatMap**用于把两层的 Observable 序列合并到一层。我们通过一个例子来解析到底怎样合并。

请看代码示例：

```swift
struct TemperatureSensor {
  let temperature: Observable<Int>
}
let sensor1 = TemperatureSensor(temperature: Observable.of(21, 23))
let sensor2 = TemperatureSensor(temperature: Observable.of(22, 25))
Observable.of(sensor1, sensor2)
    .flatMap { $0.temperature }
    .subscribe(onNext: {
        print($0)
    })
    .disposed(by: disposeBag)
```

在这个例子中，我定义一个叫作`TemperatureSensor`的结构体，用来表示收集温度的传感器，该结构体包含了一个类型为`Observable`的`temperature`的属性。

假如天气站有多个这样的传感器，我们要把它们的温度信息合并到一个单独的 Observable 序列中方便统计，此时就可以使用 flatMap 来完成这项任务。

具体来说，我们在`flatMap`方法的闭包里面返回`temperature`属性，由于该属性是一个`Observable`对象，因此`flatMap`方法会把这些序列统一合并到一个单独的 Observable 序列里面，并打印出 21、23、22、25。


<Image alt="Drawing 11.png" src="https://s0.lgstatic.com/i/image6/M01/3C/0F/CioPOWCH7TKAWC3hAAEPlMCt_uM223.png"/> 
  
转换操作符 flatMap 的效果

#### 合并操作符

合并操作符用于组装与合并多个 Observable 序列。我们通过 startWith，concat 和 merge 等几个常用的合并操作符，来看看它们是怎样运作的。

**startWith** 可以使订阅者在接收到 Observable 序列的事件前，先收到传给 startWith 方法的事件。它的使用非常简单，例如在下面的例子中，我们把 3 和 4 传递给`startWith`。那么在执行过程中，会先把 3 和 4 事件发送给订阅者，其运行效果为 3、4、1、2。代码示例如下：

```swift
Observable.of(1, 2)
    .startWith(3, 4)
    .subscribe(onNext: {
        print($0)
    })
    .disposed(by: disposeBag)
```


<Image alt="Drawing 13.png" src="https://s0.lgstatic.com/i/image6/M01/3C/0F/CioPOWCH7USAKIvoAADtwXiN318148.png"/> 
  
合并操作符 startWith 效果

**日常中我们可以通过** `startWith`方法，把加载事件插入网络数据事件之前，以此**来保持 UI 状态的自动更新。**

**concat**能把多个 Observable 序列按顺序合并在一起。例如，在下面的例子中我们合并了两个 Observable 序列，第一个包含 1 和 2，第二个包含 3 和 4，那么执行的时候会打印 1、2、3、4。代码示例如下。

```swift
Observable.of(1, 2)
    .concat(Observable.of(3, 4))
    .subscribe(onNext: {
        print($0)
    })
    .disposed(by: disposeBag)
```


<Image alt="Drawing 15.png" src="https://s0.lgstatic.com/i/image6/M00/3C/0F/CioPOWCH7VeAeMD5AACnQDe-5Nk532.png"/> 
  
合并操作符 concat 效果

**merge**，常用于合并多个 Observable 序列的操作符，和 concat 不一样的地方是它能保持原来事件的顺序。我们可以通过一个例子来看看，它是怎样合并 Observable 序列的。代码示例如下：

```swift
let first = PublishSubject<Int>()
let second = PublishSubject<Int>()
Observable.of(first, second)
    .merge()
    .subscribe(onNext: {
        print($0)
    })
    .disposed(by: disposeBag)
first.onNext(1)
first.onNext(2)
second.onNext(11)
first.onNext(3)
second.onNext(12)
second.onNext(13)
first.onNext(4)
```

我们调用`merge`方法把两个 PublishSubject 合并在一起，然后不同的 PublishSubject 会分别发出不同的`next`事件，订阅者根据事件发生的顺序来接收到相关事件。如下图所示，程序执行时会打印 1、2、11、3、12、13、4。  

<Image alt="Drawing 17.png" src="https://s0.lgstatic.com/i/image6/M00/3C/0F/CioPOWCH7W6AOGypAAEmk4CaMh0083.png"/> 
  
合并操作符 merge 的效果

**combineLatest**会把两个 Observable 序列里最后的事件合并起来，代码示例如下。

```swift
let first = PublishSubject<String>()
let second = PublishSubject<String>()
Observable.combineLatest(first, second) { $0 + $1 }
    .subscribe(onNext: {
        print($0)
    })
    .disposed(by: disposeBag)
first.onNext("1")
second.onNext("a")
first.onNext("2")
second.onNext("b")
second.onNext("c")
first.onNext("3")
first.onNext("4")
```

在程序执行过程中，当其中一个 PublishSubject 发出`next`事件时，就会从另外一个 PublishSubject 取出其最后一个事件，然后调用`combineLatest`方法的闭包，把这两个事件合并起来并通知订阅者。上述的例子在执行时会打印 1a、2a、2b、2c、3c、4c。


<Image alt="Drawing 19.png" src="https://s0.lgstatic.com/i/image6/M00/3C/0F/CioPOWCH7X6AJXQvAAEo9AcsIGo039.png"/> 
  
合并操作符 combineLatest

在实际开发中，`combineLatest`方法非常实用。我们可以用它来监听多个 Observable 序列，然后组合起来统一更新状态。例如在一个登录页面里面，我们可以同时监听用户名和密码两个输入框，当它们同时有值的时候才激活登录按钮。

**zip**也能用于合并两个 Observable 序列，和 combineLatest 不一样的地方是， zip 只会把两个 Observable 序列的事件配对合并。就像两队小朋友，排在前头的手牵手来到一个新队列。一旦出来就不再留在原有队列了。

为了方便理解 zip 与 combineLatest 的区别，我在下面例子中也使用了一样的数据并保持事件发送的顺序。

```swift
let first = PublishSubject<String>()
let second = PublishSubject<String>()
Observable.zip(first, second) { $0 + $1 }
    .subscribe(onNext: {
        print($0)
    })
    .disposed(by: disposeBag)
first.onNext("1")
second.onNext("a")
first.onNext("2")
second.onNext("b")
second.onNext("c")
first.onNext("3")
first.onNext("4")
```

在上述的例子中，有两个 PublishSubject，其中`first`发出 1、2、3、4，而`second`发出 a、b、c。`zip`方法会返回它们的合并事件 1a、2b、3c。由于`first`所发出`next("4")`事件没有在`second`里面找到对应的事件，所以合并后的 Observable 序列只有三个事件。


<Image alt="图片5.png" src="https://s0.lgstatic.com/i/image6/M01/3C/9B/Cgp9HWCLocCASVLAAAEE-3Z6-aU135.png"/> 


合并操作符 zip 的效果

<br />

上面是常用的操作符，灵活使用它们，我们可以完成绝大部分的任务了。

### 总结

在这一讲中，我们介绍了 ViewModel 模式的架构与实现和 RxSwift 的操作符。有了 ViewModel，我们可以把业务逻辑从 View 层抽离出来，甚至把 View 层进行替换，例如把 UIKit 替换成 SwiftUI。而 UI 所需的数据，可以通过 ViewModel 模块把 Model 数据转换出来。至于转换工作，我们可以借助操作符来完成。

有关本讲操作符的例子代码，我都放在项目中的**RxSwift Playground 文件**里面，希望你能多练习，灵活运用。

RxSwift 为我们提供了 50 多个操作符，我建议你到 rxmarbles.com 或者到 App Store 下载 RxMarbles App，并在 App 中替换各种参数来观察执行的结果，这样能帮助你学会所有的操作符，在现实工作中能选择合适的操作符来简化大量的开发工作。

**思考题**
> 请问你会把所有逻辑都编写在 ViewController 里面吗？如果没有，使用了怎样模式与架构来解耦呢？能分享一下这方面的经验吗？

请把你的想法写到留言区哦，下一讲我将介绍如何开发统一并且灵活的 UI。

**源码地址：**
> RxSwift Playground 文件地址：  
> [https://github.com/lagoueduCol/iOS-linyongjian/blob/main/Playgrounds/RxSwiftPlayground.playground/Contents.swift](https://github.com/lagoueduCol/iOS-linyongjian/blob/main/Playgrounds/RxSwiftPlayground.playground/Contents.swift?fileGuid=xxQTRXtVcqtHK6j8)  
>
> ViewModel 协议定义的源码地址：[https://github.com/lagoueduCol/iOS-linyongjian/tree/main/Moments/Moments/Foundations/ViewModels](https://github.com/lagoueduCol/iOS-linyongjian/tree/main/Moments/Moments/Foundations/ViewModels?fileGuid=xxQTRXtVcqtHK6j8)  
>
> 朋友圈功能 ViewModel 实现的源码地址：  
> [https://github.com/lagoueduCol/iOS-linyongjian/tree/main/Moments/Moments/Features/Moments/ViewModels](https://github.com/lagoueduCol/iOS-linyongjian/tree/main/Moments/Moments/Features/Moments/ViewModels?fileGuid=xxQTRXtVcqtHK6j8)

