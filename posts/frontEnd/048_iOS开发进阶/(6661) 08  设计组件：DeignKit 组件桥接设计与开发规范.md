# 08设计组件：DeignKit组件桥接设计与开发规范

在上一模块"配置与规范"中，我主要介绍了如何统一项目的配置，以及如何制定统一开发和设计规范。

接下来我们将进入基础组件设计模块，我会为你介绍一些在 iOS 开发过程中，工程化实践需要用的组件，比如设计组件、路由组件。除此之外，我还会聊聊在开发中如何支持多语言、动态字体和深色模式等辅助功能，让你的 App 既有国际范，获取更多用户，还能提升用户体验，获得更多好评。

这一讲，我们就先来聊聊公共组件库，以及如何封装基础设计组件。

### 封装公共功能组件库

随着产品不断发展，我们会发现，越来越多的公共功能可以封装成组件库，从而被各个模块甚至多个 App 共同使用，比如字体、调色板、间距和头像可以封装成 UI 设计组件库，登录会话和权限管理可以封装成登录与鉴权组件库。

通过利用这些公共功能组件库，不仅能节省大量开发时间，不需要我们再为每个模块重复实现类似的功能；还能减少编译时间，因为如果没有独立的组件库，一点代码的改动都会导致整个 App 重新编译与链接。

那么，怎样才能创建和使用公共功能组件库呢？下面我们以一个设计组件库 DesignKit 为例子介绍下具体怎么做。

#### 创建内部公共功能组件库

公共功能组件库根据使用范围可以分为三大类：内部库、私有库和开源库。

* 内部库是指该库和主项目共享一个 Repo ，它可以共享到主项目的所有模块中。

* 私有库是指该库使用独立的私有 Repo ，它可以共享到公司多个 App 中。

* 开源库是指该库发布到 GitHub 等开源社区提供给其他开发者使用。

这三类库的创建和使用方式都是一致的。**在实际操作中，我们一般先创建内部库，如果今后有必要，可以再升级为私有库乃至开源库**。下面咱们一起看看怎样创建内部库。

为了方便管理各个内部公共功能组件库，首先我们新建一个叫作**Frameworks 的文件夹**来保存所有的内部库。这个文件夹和主项目文件夹（在我们例子中是 Moments）以及 Workplace 文档（Moments.xcworkspace）平衡。例如下面的文件结构：

```html
Frameworks          Moments             Pods            Moments.xcworkspace
```

然后我们通过 CocoaPods 创建和管理这个内部库。

怎么做呢？有两种办法可以完成这项工作，**一种是使用** `pod lib create [pod name]`命令。比如在这个案例当中，我们可以在 Frameworks 文件夹下执行`bundle exec pod lib create DesignKit`命令，然后输入邮箱、语言和平台等信息，让 CocoaPods 创建一个 DesignKit.podspec 以及例子项目等一堆文件。具体如下：

```java
DesignKit         Example           README.md
DesignKit.podspec LICENSE           _Pods.xcodeproj
```

DesignKit.podspec 是 DesignKit 库的 Pod 描述文件，用于描述该 Pod 库的一个特定版本信息。它存放在 CocoaPods 的中心 Repo 供使用者查找和使用。

随着这个 Pod 库的迭代，CocoaPods 的中心 Repo 会为每个特定的 Pod 版本存放一个对应的 podspec 文件。每个 podspec 文件都包括 Pod 对应 Repo 的 URL、源码存放的位置、所支持的系统平台及其系统最低版本号、Swift 语言版本，以及 Pod 的名字、版本号和描述等信息。

DesignKit 组件库的 podspec 文件你可以在[拉勾教育的仓库中](https://github.com/lagoueduCol/iOS-linyongjian/blob/main/Frameworks/DesignKit/DesignKit.podspec?fileGuid=xxQTRXtVcqtHK6j8)找到。下面是该 podspec 文件的一些重要配置：

```java
  s.name             = 'DesignKit'
  s.version          = '1.0.0'

  s.ios.deployment_target = '14.0'
  s.swift_versions = '5.3'
  s.source_files = 'src/**/*'
  s.resources = 'assets/**/*'
```

`name`是该组件的名字，`version`是组件的版本号，当我们更新组件的时候同时需要使用 Semantic Versioning（语义化版本号）更新该版本号。

`ios.deployment_target`为该库所支持的平台和所支持平台的最低版本号。`swift_versions`是支持 Swift 语言的版本号。`source_files`是该库的源代码所在的文件夹，在我们例子中是 src。`resources`是该库资源文件所在的文件夹。

**另外一种是手工创建 DesignKit.podspec 文件。我偏向于这一种，因为手工创建出来的项目更简练**。

比如在这里，我们只需要在 Frameworks 新建一个叫作 DesignKit 的文件夹，然后在它下面建立 src 和 assets 这两个文件夹，以及 LICENSE 和 DesignKit.podspec 这两个文件即可。

如下所示：

```java
DesignKit.podspec LICENSE           assets            src
```

以后所有源代码文件都存放在 src 文件夹下面，而图片、Xib 和 Storyboard 等资源文件存放在 assets 文件夹下。

LICENSE 是许可证文件，如果是开源库，我们必须严格选择一个许可证，这样才能方便其他开发者使用我们的库。

#### 检测内部公共功能组件库

为了保证组件库的使用者能顺利安装和使用我们的库，当我们配置好 DesignKit.podspec 文件后，需要执行`bundle exec pod spec lint`命令来检测该 podspec 文件是否正确。如果我们维护的是一个开源库，这一步尤为重要。因为它会影响到使用者的第一印象，因此我们在发布该 Pod 之前需要把每个错误或者警告都修复好。

不过需要注意的是， CocoaPods 对内部库的检测存在一个 Bug， 会显示下面的警告以及错误信息：

    WARN | Missing primary key for source attribute 
    ERROR | unknown: Encountered an unknown error (Unsupported download strategy `{:path=>"."}`.) during validation

由于我们创建的是内部库，所以可以忽略这个警告和错误，只要没有其他错误信息就可以了。

#### 使用内部公共功能组件库

使用内部公共功能组件库非常简单，只要在主项目的 Podfile 里面使用`:path`来指定该内部库的路径即可。

```java
pod 'DesignKit', :path => './Frameworks/DesignKit', :inhibit_warnings => false
```

当执行`bundle exec pod install`命令以后，CocoaPods 会在 Pods 项目下建立一个**Development Pods** 文件夹来存放所有内部库的相关文件。  

<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image6/M00/1F/4C/Cgp9HWBRveSAYt47AASIGxbwB9s124.png"/> 


有了 CocoaPods，我们新建、管理和使用公共组件库就会变得非常简单。下面我们介绍下如何开发设计组件 DesignKit。

### DesignKit 设计组件

DesignKit 是一个设计组件，用于封装与 UI 相关的公共组件。为了方便维护，每次新增一个组件，我们最好都建立一个独立的文件夹，例如把 Spacing.swift 放在新建的 Spacing 文件夹中。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M00/1F/4C/Cgp9HWBRve-AVJZSAACVtoXExgU145.png"/> 


下面以几乎每个 App 都会使用到的三个组件：间距（Spacing）、头像（Avatar）和点赞按钮（Favorite Button）为例子，介绍下如何封装基础设计组件。

#### 间距

为了呈现信息分组并体现信息的主次关系，所有 App 的所有页面都会使用到间距来添加留白效果。

间距看起来这么简单，为什么我们还需要为其独立封装为一个公共组件呢？主要原因有这么几条。

1. 可以为整个 App 提供一致的体验，因为我们统一定义了所有间距，各个功能模块的 UI 呈现都保持一致。

2. 可以减低设计师和开发者的沟通成本，不会再为某些像素值的多与少而争论不休。设计师只使用预先定义的间距，而开发者也只使用在代码中定义好的间距就行了。

3. 可以减低设计师的工作量，很多 UI 界面可以只提供一个设计稿来同时支持 iOS、Android 以及移动 Web。因为设计师只提供预先定义的间距名，而不是 hardcoded （硬编码）的像素值。不同设备上像素值有可能不一样，但间距名却能保持一致。

4. 在支持响应式设计的时候，这些间距定义可以根据设备的宽度而自动调整。这远比硬编码的像素值灵活很多，例如在 iPhone 中 twoExtraSmall 是 4 points，而在 iPad 中是 6 points。

别看间距公共组件有那么多优点，但实现起来并不难，一个**struct**就搞定了，简直是一本万利的投入。

```java
public struct Spacing {
    public static let twoExtraSmall: CGFloat = 4
    public static let extraSmall: CGFloat = 8
    public static let small: CGFloat = 12
    public static let medium: CGFloat = 18
    public static let large: CGFloat = 24
    public static let extraLarge: CGFloat = 32
    public static let twoExtraLarge: CGFloat = 40
    public static let threeExtraLarge: CGFloat = 48
}
```

有了上述的定义以后，使用这些间距变得很简单。请看：

```java
import DesignKit

private let likesStakeView: UIStackView = configure(.init()) {
    $0.spacing = Spacing.twoExtraSmall
    $0.directionalLayoutMargins = NSDirectionalEdgeInsets(top: Spacing.twoExtraSmall, leading: Spacing.twoExtraSmall, bottom: Spacing.twoExtraSmall, trailing: Spacing.twoExtraSmall)
}
```

我们可以先 import (引入) DesignKit 库，然后通过`Spacing`结构体直接访问预定义的间距，例如`Spacing.twoExtraSmall`。

#### 头像组件

iOS 开发者都知道，头像组件应用广泛，例如在房产 App 中显示中介的头像，在我们例子 Moments App 中显示自己和好友头像，在短视频 App 中显示视频博主头像等。

也许你会问，头像那么简单，为什么需要独立封装为一个组件？原因主要是方便以后改变其 UI 的呈现方式，例如从圆角方形改成圆形，添加边界线（border），添加阴影效果（shadow）等。有了独立的组件以后，我们只需要修改一个地方就能把这个 App 的所有头像一次性地修改呈现效果。

下面是头像组件的实现方式：

```java
public extension UIImageView {
    func asAvatar(cornerRadius: CGFloat = 4) {
        clipsToBounds = true
        layer.cornerRadius = cornerRadius
    }
}
```

我们为 UIKit 所提供的`UIImageView`实现了一个扩展方法`asAvatar(cornerRadius:)`，该方法接收`cornerRadius`作为参数来配置圆角的角度，默认值是`4`。

使用也是非常简单，只有创建一个`UIImageView`的实例，然后调用`asAvatar(cornerRadius:)`方法即可。

```java
    private let userAvatarImageView: UIImageView = configure(.init()) {
        $0.asAvatar(cornerRadius: 4)
    }
```

这是人像组件的显示效果，可以在内部菜单查看。  

<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image6/M00/1F/49/CioPOWBRvgqAL1THABqNofQMQ_4461.png"/> 


#### 点赞按钮

可以说，每个具有社交属性的 App 都会用到点赞功能，所以在开发当中，点赞按钮也是必不可少的功能组件。

那么，点赞按钮该如何封装呢？和人像组件十分类似，我们可以通过扩展`UIButton`来实现。示例代码如下：

```java
public extension UIButton {
    func asStarFavoriteButton(pointSize: CGFloat = 18, weight: UIImage.SymbolWeight = .semibold, scale: UIImage.SymbolScale = .default, fillColor: UIColor = UIColor(hex: 0xf1c40f)) {
        let symbolConfiguration = UIImage.SymbolConfiguration(pointSize: pointSize, weight: weight, scale: scale)
        let starImage = UIImage(systemName: "star", withConfiguration: symbolConfiguration)
        setImage(starImage, for: .normal)
        let starFillImage = UIImage(systemName: "star.fill", withConfiguration: symbolConfiguration)
        setImage(starFillImage, for: .selected)
        tintColor = fillColor
        addTarget(self, action: #selector(touchUpInside), for: .touchUpInside)
    }
}
private extension UIButton {
    @objc
    private func touchUpInside(sender: UIButton) {
        isSelected = !isSelected
    }
}
```

其核心逻辑把当前 UIButton 对象的普通 (`.normal`) 状态和选中 (`.selected`) 状态设置不同的图标。比如在这里我就把星星按钮的普通状态设置成了名叫 "Star" 的图标，并把它的选中状态设置成了名叫 "tar.fill"" 的图标。

注意，这些图标来自苹果公司的 SF Symbols 不需要额外安装，iOS 14 系统本身就自带了。而且它们的使用也非常灵活，支持字号、字重、填充色等配置。

使用点赞按钮组件也非常简单，只需要建立一个`UIButton`的实例，然后调用`asStarFavoriteButton`方法就可以了。

```java
    private let favoriteButton: UIButton = configure(.init()) {
        $0.asStarFavoriteButton()
    }
```

点赞按钮的运行效果，也可以在内部菜单查看。

以上我们以间距、头像、点赞按钮为例介绍了如何使用 DesignKit 封装与 UI 相关的公共组件。以我多年的开发经验来说，在封装 UI 组件的时候，可以遵循下面几个原则。

1. 尽量使用扩展方法而不是子类来扩展组件，这样做可以使其他开发者在使用这些组件时，仅需要调用扩展方法，而不必使用特定的类。

2. 尽量使用代码而不要使用 Xib 或者 Storyboard，因为有些 App 完全不使用 Interface Builder。

3. 如果可以，要为组件加上`@IBDesignable`和`@IBInspectable`支持，这样能使得开发者在使用 Interface Builder 的时候预览我们的组件。

4. 尽量只使用 UIkit 而不要依赖任何第三方库，否则我们可能会引入一个不可控的依赖库。

### 总结

前面我介绍了如何封装公共功能组件库，以及以怎样封装基础设计组件，希望对你有所帮助。合理使用功能组件可以让你的开发事半功倍。  

<Image alt="思维导图+二维码.png" src="https://s0.lgstatic.com/i/image6/M00/1F/73/Cgp9HWBR3wyAAnwjAAcCv2pASBs854.png"/> 
  

不过，在封装组件的时候，我还需要提醒你注意这么几点。

首先，为了减低组件之间的耦合性，提高组件的健壮性，组件的设计需要符合单一功能原则 。也就是说，一个组件只做一件事情，一个组件库只做一类相关的事情。每个组件库都要相对独立且功能单一。

比如，我们可以分别封装网络库、UI 库、蓝牙处理库等底层库，但不能把所有库合并在一个单独的库里面，这样可以方便上层应用按需使用这些依赖库。例如，广告 SDK 可以依赖于网络库、UI 库，但并不依赖蓝牙处理库。这样做一方面可以减少循环依赖的可能性，另一方面可以加快编译和链接的速度，方便使用。

其次，每次发布新增和更新组件的时候，都需要严格按照 Semantic Versioning 来更新版本号，这样有效防止因为版本的问题而引入 Bug。

最后，组件的开发并不是一蹴而就，很多时候可以根据业务需求把公共模块一点点地移入公共组件库中，一步步地完善组件库的功能。不要为了开发组件而开发组件，很多时候当我们充分理解了使用者的需求后，才能为组件定义完善的接口和完整的功能。

思考题：
> 上面我们讲述了如何使用 CocoaPods 来封装内部组件，请问怎样把内部组件升级成为私有组件和开源组件呢？

可以把回答写到下面的留言区哦，我们下一讲将介绍如何使用功能开关支持产品快速迭代。

源码地址：
> DesignKit 源代码：[https://github.com/lagoueduCol/iOS-linyongjian/tree/main/Frameworks/DesignKit](https://github.com/lagoueduCol/iOS-linyongjian/tree/main/Frameworks/DesignKit?fileGuid=xxQTRXtVcqtHK6j8)

