# 32UI替换：如何使用SwiftUI快速替换原有UI？

如今苹果公司力推的 SwiftUI 越来越流行，例如 Widget 等一些新功能只能使用 SwiftUI 进行开发，再加上 SwiftUI 又变得越来越稳定，可以说现在是学习和使用 SwiftUI 的良好时机。但并不是每个 App 都可以很方便地升级技术栈，幸运的是，Moments App 使用了 MVVM 的架构，该架构为我们提供了良好的灵活性和可扩展性，下面我们一起看看如何把 Moments App 的 UI 层从 UIKit 替换成 SwiftUI。

在前面[第 16 讲](https://kaiwu.lagou.com/course/courseInfo.htm?courseId=657&sid=20-h5Url-0&buyFrom=2&pageId=1pz4#/detail/pc?id=6669&fileGuid=xxQTRXtVcqtHK6j8)里，我们讲了如何使用 MVVM 模式来架构 Moments App。在这一讲中，我准备把 UIViewController 和 UIView 从 View 层移除，替换成 SwiftUI 的实现，如下图所示：


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image6/M01/44/1B/Cgp9HWC90WWALsfHAAMRfIFPUjA184.png"/> 


可以看到，除了 View 层以外，其他模块（包括 ViewModel 和 Model 层等）都没有做任何的改动。下面我们就来剖析下这个实现原理和步骤。

### SwiftUI 的状态管理

SwiftUI 是一个由状态驱动的 UI 框架，为了更好地理解 SwiftUI 的使用，我们就先来看看 SwiftUI 是如何管理状态的。

**状态管理最简单的方式是使用 @State 属性包装器（Property Wrapper）**，下面是使用 @State 的示例代码：

```swift
struct ContentView: View {
    @State private var age = 20
    var body: some View {
        Button("生日啦，现在几岁: \(age)") {
            age += 1
        }
    }
}
```

我们在`ContentView`里面创建了一个名叫`age`的属性，由于使用了 @State 属性包装器，所以 SwiftUI 会帮我们自动管理这个属性的内存并监听其状态更新的情况。在上述的例子中，当用户点击"生日啦"按钮时，就会把`age`属性的值增加一，这一更改会促使 SwiftUI 自动刷新`ContentView`。

@State 适合为某个特定的 View 管理类型为值（Value）的属性，而且我们通常把 @State 的属性都定义为`private`（私有的）以禁止外部的访问。但如何实现多个对象间（例如，父子视图间）的状态共享呢？那就需要使用到 @StateObject 和 @ObservedObject 属性包装器了。这两个属性包装器所定义的属性都必须遵循`ObservableObject`协议。

那接下来我们就再看一下为什么使用`ObservableObject`协议吧。

**为了让 SwiftUI 能访问来自 Model 的状态更新，我们必须让 Model 遵循 ObservableObject 协议**。那 Model 怎样才能发送状态通知呢？可以结合下面的例子来理解。

```swift
class UserObservableObject: ObservableObject {
    var name = "Jake"
    var age = 20 {
        willSet {
            objectWillChange.send()
        }
    }
}
```

`UserObservableObject`是一个遵循了`ObservableObject`协议的类。因为所有遵循`ObservableObject`协议的子类型都必须是引用类型，所以我们只能使用类而不是结构体（Struct）。`UserObservableObject`定义了两个属性：`age`属性的`willSet`里面调用了`objectWillChange.send()`方法，当我们修改`age`属性时，就会发送状态更新通知；而`name`属性没有调用`objectWillChange.send()`方法，因此我们修改它的时候并不会发送更新通知。

你可以看到，所有需要发送更新通知的属性都必须编写重复的`willSet`代码，幸运的是苹果为我们提供了 `@Published`属性包装器来简化编写更新通知的工作。有了`@Published`，上述的代码就可以简化为如下：

```swift
class UserObservableObject: ObservableObject {
    var name = "Jake"
    @Published var age = 20
}
```

我们只需要在发送状态更新的属性定义前加上`@Published`即可。

介绍完`ObservableObject`协议以后，我们就可以通过下面的例子看看如何使用 @StateObject 和 @ObservedObject 属性包装器了。

```swift
struct ChildView: View {
    @ObservedObject var user: UserObservableObject
    var body: some View {
        Button("生日啦，现在几岁: \(user.age)") {
            user.age += 1
        }
    }
}
struct ParentView: View {
    @StateObject var user: UserObservableObject = .init()
    var body: some View {
        VStack {
            Text("你的名字：\(user.name)")
            ChildView(user: user)
        }
    }
}
```

**@StateObject 和 @ObservedObject 都可以定义用于状态共享的属性，而且这些属性的类型都必须遵循** `ObservableObject`协议。不同的地方是 @StateObject 用于生成和管理状态属性的生命周期，而 @ObservedObject 只能把共享状态从外部传递进来。例如，在上面的示例代码中，我们在`ParentView`里使用 @StateObject 来定义并初始化`user`属性，然后传递给`ChildView`的`user`属性。由于`ChildView`的`user`属性来自外部的`ParentView`，因此定义为 @ObservedObject。

当我们需要共享状态的时候，通常在父对象里定义和初始化一个 @StateObject 属性，然后传递给子对象里的 @ObservedObject 属性。如果只有两层关系还是很方便的，但假如有好几层的父子关系，逐层传递会变得非常麻烦，那有没有好办法解决这个问题呢？

@EnvironmentObject 就是用于解决这个问题的。@EnvironmentObject 能帮我们把状态共享到整个 App 里面，下面还是通过一个例子来看看。

```swift
@main
struct MomentsApp: App {
    @StateObject var user: UserObservableObject = .init()
    var body: some Scene {
        WindowGroup {
            ParentView()
                .environmentObject(user)
        }
    }
}
struct ChildView: View {
    @EnvironmentObject var user: UserObservableObject
    var body: some View {
        Button("生日啦，现在几岁: \(user.age)") {
            user.age += 1
        }
    }
}
struct ParentView: View {
    var body: some View {
        VStack {
            ChildView()
        }
    }
}
```

我们在`MomentsApp`里面通过 @StateObject 定义并初始化`user`属性，然后调用`environmentObject()`方法把该属性注册成环境对象。`MomentsApp`内嵌了`ParentView`，而`ParentView`并没有使用`user`属性。`ParentView`内嵌了`ChildView`，`ChildView`则通过 @EnvironmentObject 来定义`user`属性，这样`ChildView`就能从环境对象中取出`MomentsApp`注册的值了。

**@EnvironmentObject 能帮我们把对象传递到 App 任何的地方，特别适合共享公共的状态**，例如用户登录的信息等。但是 @EnvironmentObject 有点像 Singleton，我们不能过度使用它，否则会增加模块间的耦合度。

@ObservedObject 与 @EnvironmentObject 都能帮助我们共享引用类型的属性，但如何共享值类型的属性呢？**@Binding 属性包装器就能帮我们定义共享值类型的属性。** 下面我们还是通过示例代码来看看如何使用 @Binding。

```swift
struct ChildView: View {
    @Binding var isPresented: Bool
    var body: some View {
        Button("关闭") {
            isPresented = false
        }
    }
}
struct ParentView: View {
    @State private var showingChildView = false
    var body: some View {
        VStack {
            Text("父 View")
        }.sheet(isPresented: $showingChildView) {
            ChildView(isPresented: $showingChildView)
        }
    }
}
```

`ChildView`通过 @Binding 定义了`isPresented`属性，表示该视图是否可见。该属性的值与`ParentView`的`showingChildView`属性同步。通过 @Binding，我们就可以把值类型的属性进行共享了。

至此，我们就介绍完 SwiftUI 的状态管理了。

### SwiftUI 的架构与实现

下面一起来看看使用 SwiftUI 开发 View 层的系统架构图。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M00/44/23/CioPOWC90amACsvfAAHhOfaicTI452.png"/> 


该架构图由两部分组成，分别是左边的 View 模块和右边的 ViewModel 模块。由于 View 模块依赖了 ViewModel 模块，所以这里我们就先看右边的 ViewModel 模块。该模块包含了`MomentsTimelineViewModel`、`ListItemViewModel`、`MomentListItemViewModel`和`UserProfileListItemViewModel`四个原有的 ViewModel，因为它们具有良好的可扩展性，所以我们无须对它们进行任何的改动。

#### 1. 桥接 RxSwift 与 SwiftUI

为了把这些 ViewModel 类型桥接到 SwiftUI 版本的 View 模块，我们增加了两个类型：`MomentsListObservableObject`和`IdentifiableListItemViewModel`。`MomentsListObservableObject`负责给 SwiftUI 组件发送更新消息，下面是它的具体实现：

```swift
final class MomentsListObservableObject: ObservableObject {
    private let viewModel: MomentsTimelineViewModel
    private let disposeBag: DisposeBag = .init()
    @Published var listItems: [IdentifiableListItemViewModel] = []
    init(userID: String, momentsRepo: MomentsRepoType) {
        viewModel = MomentsTimelineViewModel(userID: userID, momentsRepo: momentsRepo)
        setupBindings()
    }
    func loadItems() {
        viewModel.loadItems()
            .subscribe()
            .disposed(by: disposeBag)
    }
    private func setupBindings() {
        viewModel.listItems
            .observeOn(MainScheduler.instance)
            .subscribe(onNext: { [weak self] items in
                guard let self = self else { return }
                self.listItems.removeAll()
                self.listItems.append(contentsOf: items.flatMap { $0.items }.map { IdentifiableListItemViewModel(viewModel: $0) })
            })
            .disposed(by: disposeBag)
    }
}
```

`MomentsListObservableObject`遵循了`ObservableObject`协议，并使用了 @Published 来定义`listItems`属性，这样使得`listItems`的状态更新会自动往外发送。  
`listItems`属性的类型是`IdentifiableListItemViewModel`的数组，下面是`IdentifiableListItemViewModel`的具体实现：

```swift
struct IdentifiableListItemViewModel: Identifiable {
    let id: UUID = .init()
    let viewModel: ListItemViewModel
}
```

`IdentifiableListItemViewModel`其实是`ListItemViewModel`的一个包装类型，因为我们要在 SwiftUI 上重复显示`ListItemViewModel`的数据，所以就要用到`ForEach`语句来执行循环操作。而`ForEach`语句要求所有 Model 类型都遵循`Identifiable`协议，因此，我们定义了`IdentifiableListItemViewModel`来遵循`Identifiable`协议，并把`ListItemViewModel`包装在里面，同时还通过`id`属性来返回一个 UUID 的实例。

在`init()`初始化函数里，我们订阅了`MomentsTimelineViewModel`的`listItems`Subject 属性的更新，而且把接收到的数据转换成`IdentifiableListItemViewModel`类型并赋值给`listItems`属性，这样就能把 RxSwift 的事件消息桥接给 SwiftUI 进行自动更新了。

接着再来看看 View 模块，该模块由`SwiftUIMomentsTimelineView`、`SwiftUIMomentsListItemView`、`SwiftUIMomentListItemView`和`SwiftUIUserProfileListItemView`所组成，你可以结合下图了解它们之间的嵌套关系。


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image6/M01/44/1B/Cgp9HWC90b-AAGkCAAdM0BD6GgE546.png"/> 


`SwiftUIMomentsTimelineView`是一个容器视图，包含了多个`SwiftUIMomentsListItemView`。`SwiftUIMomentsListItemView`会根据 ViewModel 的具体类型来显示`SwiftUIUserProfileListItemView`或者`SwiftUIMomentListItemView`。

#### 2. 朋友圈时间轴视图

下面我们分别看看它们的实现吧，首先看容器视图`SwiftUIMomentsTimelineView`的代码实现。

```swift
struct SwiftUIMomentsTimelineView: View {
    @StateObject private var userDataStore: UserDataStoreObservableObject = .init()
    @StateObject private var momentsList: MomentsListObservableObject = .init(userID: UserDataStore.current.userID, momentsRepo: MomentsRepo.shared)
    @State private var isDragging: Bool = false
    var body: some View {
        ScrollView(axes, showsIndicators: true) {
            LazyVStack {
                ForEach (momentsList.listItems) { item in
                    SwiftUIMomentsListItemView(viewModel: item.viewModel, isDragging: $isDragging).ignoresSafeArea(.all)
                }.onAppear(perform: {
                    momentsList.loadItems()
                })
            }
        }.frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
        .background(Color("background"))
        .ignoresSafeArea(.all)
        .environmentObject(userDataStore)
    }
}
```

我们使用 @StateObject 定义了`userDataStore`属性，并通过`environmentObject()`方法把它注册到环境对象中，这样就使得所有的子视图都能通过 @EnvironmentObject 来访问`userDataStore`属性的值了。

`SwiftUIMomentsTimelineView`的布局比较简单，是一个`ScrollView`，在`ScrollView`里通过`LazyVStack`和`ForEach`把`momentsList.listItems`的每一条数据通过`SwiftUIMomentsListItemView`分别显示出来，而且在初始化`SwiftUIMomentsListItemView`的时候把具体的 ViewModel 以及`isDragging`属性传递进去。

#### 3. 中介视图

`SwiftUIMomentsListItemView`担任中介的角色，其具体代码实现如下：

```swift
struct SwiftUIMomentsListItemView: View {
    let viewModel: ListItemViewModel
    @Binding var isDragging: Bool
    var body: some View {
        if let viewModel = viewModel as? UserProfileListItemViewModel {
            SwiftUIUserProfileListItemView(viewModel: viewModel, isDragging: $isDragging)
        } else if let viewModel = viewModel as? MomentListItemViewModel {
            SwiftUIMomentListItemView(viewModel: viewModel)
        }
    }
}
```

我们使用了 @Binding 来定义`isDragging`属性，这样就能与父视图`SwiftUIMomentsTimelineView`共享用户的拖动状态了。`SwiftUIMomentsListItemView`本身不做任何的显示操作，而是在`body`属性里根据`viewModel`的类型来分别通过`SwiftUIUserProfileListItemView`或者`SwiftUIMomentListItemView`进行显示。为什么需要这样做呢？因为 SwiftUI 里所有的组件都是值类型，例如 View 就不支持继承关系，我们无法使用多态（Polymorphism）的方式来动态显示的子 View，只能通过条件判断语句来选择性显示不同的 View。

#### 4. 用户属性视图

朋友圈功能最上面的部分是用户属性视图，下面我们看一下它的具体实现。由于`SwiftUIUserProfileListItemView`的具体实现代码有点长，所以这里我把它拆成几部分来分别解释。

```swift
struct SwiftUIUserProfileListItemView: View {
    let viewModel: UserProfileListItemViewModel
    @Binding var isDragging: Bool
    @State private var viewSize: CGSize = .zero
}
```

首先看一下属性的定义，我们定义了`viewModel`属性来保存从父视图传进来的`UserProfileListItemViewModel`对象，这样我们就能使用该`viewModel`里的属性来进行显示了。

同时我们还使用了 @Binding 来定义`isDragging`属性，该属性与父视图`SwiftUIMomentsTimelineView`共享用户拖动的状态。有了这个属性，我们在启动触摸动画时就可以停止父视图的拖动事件，从而避免奇怪的拖动效果。

另外，我们还使用 @State 来定义一个私有的属性`viewSize`，该属性用于控制拖拉动画的视图大小。

为了更好地理解布局的代码实现，我们可以结合下面的图来看看各个组件之间的嵌套关系。


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image6/M01/44/1B/Cgp9HWC90d-AH97-AAYCP8Dw-HE675.png"/> 


因为我们要把名字和头像放在底部，所以使用了用于垂直布局的`VStack`。在该`VStack`里先放一个`Spacer`，这样能把下面的`HStack`压到底部。`HStack`用于水平布局，我们可以通过`Spacer`把其他视图推到右边，右边是用于显示名字的`Text`和显示头像的`KFImage`控件。这所有的布局代码都存放在`body`属性里，如下所示：

```swift
var body: some View {
    VStack {
        Spacer()
        HStack {
            Spacer()
            Text(viewModel.name)
                .font(.title2)
                .foregroundColor(.white)
                .padding(.trailing, 10)
            KFImage(viewModel.avatarURL)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .frame(width: 80, height: 80, alignment: .center)
                .clipShape(Circle())
        }
        .padding(.trailing, 10)
        .padding(.bottom, 10)
    }
    .frame(height: 350)
    .frame(maxWidth: .infinity)
}
```

由于`Spacer`不能提供高度和宽度，所以除了布局代码以外，我们还需要调用`frame(height: 350)`方法来配置视图的高度，然后使用`frame(maxWidth: .infinity)`方法使得视图占据设备的全部宽度。

你可能会问，后面两个深蓝色的圆圈和背景图在哪里配置呢？其实它们都放在`background`方法里面，具体代码如下：

```swift
.background(
    ZStack {
        Image(uiImage: #imageLiteral(resourceName: "Blob"))
            .offset(x: -200, y: -200)
            .rotationEffect(Angle(degrees: 450))
            .blendMode(.plusDarker)
        Image(uiImage: #imageLiteral(resourceName: "Blob"))
            .offset(x: -200, y: -250)
            .rotationEffect(Angle(degrees: 360), anchor: .leading)
            .blendMode(.overlay)
    }
)
.background(
    KFImage(viewModel.backgroundImageURL)
        .resizable()
        .offset(x: viewSize.width / 20, y: viewSize.height / 20)
)
.clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
```

这里调用了两次`background`方法。在第一个`background`方法里，我们使用了`ZStack`来进行布局，`ZStack`能帮助我们布局彼此覆盖的视图。在`ZStack`里，我们存放了两个名叫 Blob 的`Image`组件，由于它们使用了不一样的`blendMode`，所以显示的效果有所不同。

在第二个`background`方法里，我们使用了`KFImage`来加载背景图片，同时把`viewSize`传递给`offset()`方法来实现非常微妙的视差（parallax）效果。

最后我们调用了`clipShape()`方法来配置大圆角的效果，这是近期一种流行的设计风格。

以上都是配置静态 UI 风格的代码，下面我们再来看看如何为`SwiftUIUserProfileListItemView`呈现浮动的动画效果，如下实现代码：

```swift
.scaleEffect(isDragging ? 0.9 : 1)
.animation(.timingCurve(0.2, 0.8, 0.2, 1, duration: 0.8))
.rotation3DEffect(Angle(degrees: 5), axis: (x: viewSize.width, y: viewSize.height, z: 0))
.gesture(
    DragGesture().onChanged({ value in
        self.isDragging = true
        self.viewSize = value.translation
    }).onEnded({ _ in
        self.isDragging = false
        self.viewSize = .zero
    })
)
```

当调用`scaleEffect()`方法时，我们根据`isDragging`属性的状态来配置不同的缩放系数，这样能使得当用户拖拉视图时，视图会变小一点点。然后调用`animation()`方法使得视图改变大小时会有平滑的转换动画效果，`rotation3DEffect()`方法会使得拖拉视图时有浮动效果，`gesture()`方法让我们可以根据用户的触摸状态来改变`isDragging`和`viewSize`的状态，从而影响动画的运行状态。

#### 5. 朋友圈信息视图

看完用户属性视图的实现后，下面我们一起看看一条朋友圈信息是如何显示的，首先看一下它的布局图。


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image6/M01/44/1C/Cgp9HWC90huAF_a6AAIy6uuggTs430.png"/> 


外层是一个`ZStack`，这样能保证`Toggle`可以一直浮动在右下角。`ZStack`还包含一个`HStack`，在`HStack`的左边是一张用于显示朋友头像的图片，右边是一个`VStack`。`VStack`里依次放了显示朋友名字的`Text`、显示标题的`Text`、显示图片的`KFImage`、显示时间的`Text`，以及最底层的`HStack`，这个`HStack`放置了一个心形图片和多个点赞人的头像。其布局代码如下所示， 你可以结合上面的图来理解。

```swift
ZStack(alignment: .bottomTrailing) {
    HStack(alignment: .top, spacing: Spacing.medium) {
        KFImage(viewModel.userAvatarURL)
            .resizable()
            .clipShape(Circle())
            .frame(width: 44, height: 44)
            .shadow(color: Color.primary.opacity(0.15), radius: 5, x: 0, y: 2)
            .padding(.leading, Spacing.medium)
        VStack(alignment: .leading) {
            Text(viewModel.userName)
                .font(.subheadline)
                .foregroundColor(.primary)
            if let title = viewModel.title {
                Text(title)
                    .font(.body)
                    .foregroundColor(Color.secondary)
            }
            if let photoURL = viewModel.photoURL {
                KFImage(photoURL)
                    .resizable()
                    .frame(width: 240, height: 120)
            }
            if let postDateDescription = viewModel.postDateDescription {
                Text(postDateDescription)
                    .font(.footnote)
                    .foregroundColor(Color.secondary)
            }
            if let likes = viewModel.likes, !likes.isEmpty {
                HStack {
                    Image(systemName: "heart")
                        .foregroundColor(.secondary)
                    ForEach(likes.map { IdentifiableURL(url: $0) }) {
                        KFImage($0.url)
                            .resizable()
                            .frame(width: 20, height: 20)
                            .clipShape(Circle())
                            .shadow(color: Color.primary.opacity(0.15), radius: 3, x: 0, y: 2)
                    }
                }
            }
        }
        Spacer()
    }
    Toggle(isOn: $isLiked) {
    }
}
```

其中，`Toggle`使用了当前流行的新拟物化设计（Neumorphism），其具有光影效果，同时在点击时会有丝绸物料凸凹变化的效果。那是怎样做到的呢？下面一起看看`Toggle`组件的代码。

```swift
Toggle(isOn: $isLiked) {
    Image(systemName: "heart.fill")
        .foregroundColor(isLiked == true ? Color("likeButtonSelected") : Color("likeButtonNotSelected"))
        .animation(.easeIn)
}
.toggleStyle(LikeToggleStyle())
.padding(.trailing, Spacing.medium)
.onChange(of: isLiked, perform: { isOn in
    guard isLiked == isOn else { return }
    if isOn {
        viewModel.like(from: userDataStore.currentUser.userID).subscribe().disposed(by: disposeBag)
    } else {
        viewModel.unlike(from: userDataStore.currentUser.userID).subscribe().disposed(by: disposeBag)
    }
})
```

我们在`Toggle`里面放了一个心形的`Image`，并根据选中状态来填充不同的颜色。当我们点击`Toggle`时，会根据选中状态来调用`viewModel`的`like()`或者`unlike()`方法，这样就能把选中状态更新到后台去了。

下面看一下如何配置`Toggle`的显示风格。这里我们定义了一个名叫`LikeToggleStyle`的结构体，该结构体遵循了`ToggleStyle`协议。我们可以在`LikeToggleStyle`里面配置`Toggle`的显示风格，代码如下：

```swift
private struct LikeToggleStyle: ToggleStyle {
    func makeBody(configuration: Self.Configuration) -> some View {
        Button(action: {
            configuration.isOn.toggle()
        }, label: {
            configuration.label
                .padding(Spacing.extraSmall)
                .contentShape(Circle())
        })
        .background(
            LikeToggleBackground(isHighlighted: configuration.isOn, shape: Circle())
        )
    }
}
```

要配置`Toggle`的显示风格，我们需要实现`makeBody(configuration:)`方法来返回一个`View`。在这个`View`里面包含了一个`Button`组件来处理用户的点击事件，当用户点击的时候，我们会改变了`isOn`属性的值。除了按钮以外，我们还使用了`label`参数把`Toggle`配置成圆形，并通过`background()`方法来进行绘制，绘制 UI 的代码都封装在`LikeToggleBackground`里面。下面一起看看它的实现代码：

```swift
private struct LikeToggleBackground<S: Shape>: View {
    var isHighlighted: Bool
    var shape: S
    var body: some View {
        ZStack {
            if isHighlighted {
                shape
                    .fill(LinearGradient(Color("likeButtonFillEnd"), Color("likeButtonFillStart")))
                    .overlay(shape.stroke(LinearGradient(Color("likeButtonFillStart"), Color("likeButtonFillEnd")), lineWidth: 2))
                    .shadow(color: Color("likeButtonStart"), radius: 5, x: 5, y: 5)
                    .shadow(color: Color("likeButtonEnd"), radius: 5, x: -5, y: -5)
            } else {
                shape
                    .fill(LinearGradient(Color("likeButtonFillStart"), Color("likeButtonFillEnd")))
                    .overlay(shape.stroke(LinearGradient(Color("likeButtonFillStart"), Color("likeButtonFillEnd")), lineWidth: 2))
                    .shadow(color: Color("likeButtonStart"), radius: 5, x: 5, y: 5)
                    .shadow(color: Color("likeButtonEnd"), radius: 5, x: -5, y: -5)
            }
        }
    }
}
```

在`LikeToggleBackground`里面，我们根据`isHighlighted`属性的选中状态，为图形填充不同的颜色和阴影效果，从而做出丝绸材质的效果。  

最后看看朋友圈信息视图的外层显示风格，代码如下：

```swift
.frame(maxWidth:.infinity)
.padding(EdgeInsets(top: Spacing.medium, leading: 0, bottom: Spacing.medium, trailing: 0))
.background(BlurView(style: .systemMaterial))
.clipShape(RoundedRectangle(cornerRadius: 30, style: .continuous))
.shadow(color: Color.black.opacity(0.15), radius: 20, x: 0, y: 20)
.padding(.horizontal)
```

我们调用`frame(maxWidth:.infinity)`和`padding(.horizontal)`方法把`SwiftUIMomentListItemView`的宽度设为设备大小并减去左右两边的留白间距。`padding(EdgeInsets())`方法用于添加上下的间距。通过把自定义的`BlurView`传递给`background()`方法，我们就能实现毛玻璃的显示效果；调用`clipShape()`方法可以来设置大圆角的效果；而调用`shadow()`方法就能完成配置阴影的效果，从而使得朋友圈信息视图有浮动起来的特效。

到此为止，我们已经使用 SwiftUI 实现了整个 View 层了，最后看一下实现的效果，如下动图：


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image6/M00/44/24/CioPOWC90g2ANeBIAAWrFoNi17Q433.png"/> 


### 总结

在这一讲，我们介绍了 SwiftUI 管理状态的几种方法，它们之间有些细微的区别，搞清楚它们的工作原理能帮助我们在实践中选择出合适的方法。

另外，我们还讲述了如何使用 SwiftUI 重新实现 Moments App 的 UI 层。你可能已经发现了，在实现的过程中，我们完全没有改动原有的代码，只是在原有代码的基础上进行扩展。一套灵活的框架能帮助我们不断扩展新功能，并无缝引入新技术。

作为开发者，学习新东西已经成为我们生活的一部分。我建议你多花点时间学习一下 SwiftUI，因为现在很多新功能（例如 Widget）只能使用 SwiftUI 进行开发了。后续随着 SwiftUI 的不断成熟，再加上用户设备上 iOS 版本的更新，SwiftUI 慢慢会成为 iOS 乃至苹果所有操作系统开发的主流。

**思考题**
> 请问你在实际工作中使用过 SwiftUI 吗？能分享一下你的使用经验吗？

可以把你心得体会写到留言区哦。到此为止，整个课程就学习完毕了，下一讲是结束语，我会把整个课程做一个简单的梳理和串讲，也相当于我们课程的一个小结吧，记住按时来听课哦。

**源码地址**
> SwiftUI 实现的 PR：[https://github.com/lagoueduCol/iOS-linyongjian/pull/13](https://github.com/lagoueduCol/iOS-linyongjian/pull/13?fileGuid=xxQTRXtVcqtHK6j8)

