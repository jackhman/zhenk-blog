# 05自动化准备：如何使用Fatlane管理自动化操作？

要成为一个优秀的 iOS 开发者，我们要做的事情远多于"开发"，例如我们要构建和打包 App，管理证书，为 App 进行签名，把 App 分发给测试组，上传 App 到 App Store，等等。这些操作不但繁琐费时，而且容易出错。那么，有没有更便利的方法呢？有，那就是使用 fastlane 来完成这些重复性的工作。接下来这一讲，我们主要聊的也就是这个主题。

### fastlane 安装

**fastlane** 是用 Ruby 语言编写的一个命令行工具，可以自动化几乎所有 iOS 开发所需要的操作，例如自动打包和签名 App，自动上传到 App Store 等等。有了 fastlane，我们就可以开发一套统一的、可靠的和可共享的配置，团队所有成员都可以通过这套配置实现自动化操作，减少重复性劳动。

如何安装 fastlane 呢？我记得在第一讲就曾提到过，可以使用 Bundler 来安装，只需要在 Gemfile 文件里面添加以下一行即可：

```java
gem "fastlane", "2.166.0"
```

注意，由于是通过 Bundler 来安装 fastlane，每次执行 fastlane 命令前，都需要加上`bundle exec`（`bundle exec fastlane`）。不过为了简洁，在这里后面凡涉及 fastlane 命令时，我会省略`bundle exec`部分。

### Action 与 Lane

fastlane 为我们提供了一百多个 Action，它们是 iOS 项目开发中所有自动化操作的基础。所谓的**Action**，你可以理解成是 fastlane 自动化流程中的最小执行单元。一般常用的 Action 有：

* scan，用于自动测试 App；

* cert，用于自动生成和管理 iOS App 签名的证书；

* sigh，用于自动生成、更新、下载和修复 Provisioning Profile；

* match，为整个团队自动管理和同步证书和 Provisioning Profile；

* gym，用于自动构建和打包 App；

* snapshot，用于自动在不同设备上截屏；

* pilot，用于自动把 App 部署到 TestFlight 并管理测试用户；

* deliver，用于自动把 App 上传到 App Store；

* pem，用于自动生成和更新推送消息的 Profile。

这些 Action 怎么执行呢？我们可以通过`fastlane <action>`（例如`fastlane scan`）来执行。下面是执行效果，它提示我选择其中一个 Scheme 来继续执行。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image6/M00/16/10/CioPOWBF-DaAV56WAAR8Ne2bQ4c230.png"/> 


从运行情况可知，尽管这些 Action 为我们提供了不少便利，但还是需要手工输入来继续。所以，我不推荐你直接使用这些 Action，而是根据项目需要，在开发自己的自动化操作时通过传入合适的参数来调用 fastlane 所提供的 Action。

具体来说，我们可以把所需的 Action 组合在一起，开发出对应的自动化操作。在 fastlane 中，我们把这个自动化操作或者任务叫作 **Lane** 。**实际上， iOS 开发中的所有自动化操作，主要通过 Lane 来封装和配置的。**


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image6/M00/16/10/CioPOWBF-EqACKcpAAC6PT8Ghi4740.png"/> 


Lane 和 Action 的关系如上图所示， 一条 Lane 可以通过参数调用一个或几个 Action 。以 Moments app 为例，我们要自动打包和签名 App，那么我就建了一条名叫`archive_appstore`的 Lane。因为这条 Lane 用到的"更新签名"和"打包"在 fastalne 里已经提供了相关的 Action------`update_code_signing_settings`和`gym`，我就可以到它官网去寻找，从而减轻了开发工作量。

一般，iOS 项目所需的自动化操作都配置为 Lane 并保存在 Fastfile 文件，由 Git 统一管理起来，共享给所有成员。然后，大家就可以使用统一的自动化配置了。

这里的 Fastfile 文件是怎么出来的呢？

它是由`fastlane init`命令自动生成。这条命令会建立一个 fastlane 文件夹，文件夹里除了 Fastfile ，还有 Appfile，以及执行过程中所生成的一些中间文件（如截图、日志与报告等）。因为我们之前已经在 .gitignore 文件里把这些中间文件忽略了，因此这些中间文件不再保存到 Git 里面。

fastlane 文件夹里的 Appfile，用于保存 App 的唯一标识符和 Apple ID 等信息。当 fastlane 在执行一个 Action 的时候，首先会使用传递进来的参数，当参数没有传递进来时，fastlane 会从 Appfile 文件中查找并使用对应的信息。

比如，我们在 Appfile 配置了`app_identifier "com.ibanimatable.moments"`以后，在调用`match`Action 时可以不传入`app_identifier`参数，fastlane 会自动把`"com.ibanimatable.moments"`作为`app_identifier`的值进行调用。

但是为了方便管理所有的 Lane ，保证每次执行的效果都一样，我建议在每次调用 Action 的时候，都明确传递每一个所需的参数，而不是从 Appfile 文件读取。下面我就演示下如何明确传递每一个参数来执行`match`Action。

```java
  match(
      type: "appstore",
      force: true,
      storage_mode: "git",
      git_url: "https://github.com/JakeLin/moments-codesign",
      app_identifier: "com.ibanimatable.moments", # pass  app_identifier explicitly
      team_id: "6HLFCRTYQU",
      api_key: api_key
  )
```

### 常用 Lane 定义

通过上面的介绍你已经知道，我们会使用 Lane 来封装项目所需的各个自动化操作。那么，这些 Lane 是如何开发定义的呢？接下来，我就为你介绍几种非常实用的 Lane，一起来看看怎么做。

#### 扫描和检查代码

每条 Lane 的定义都是放在一个`lane <lane_name> do <lane_body> end`的代码块里面。它以关键字`lane`开头，接着是这条 Lane 的名字。 下面是用于检查代码的 Lane 源码。

```ruby
lane :lint_code do
  puts("Lint code using SwfitLint")
  swiftlint(
    mode: :lint,
    executable: "./Pods/SwiftLint/swiftlint",  # Important if you've installed it via CocoaPods
    config_file: './Moments/.swiftlint.yml',
    raise_if_swiftlint_error: true)
end
```

在上面的例子中，我们定义了一个叫作`lint_code`的 Lane。因为 fastlane 使用 Ruby 开发，所以在 Fastfile 里面，Lane 的名字也遵循它的编码规范，使用小写字母和下划线组合的蛇式命名法。

Lane 的实现逻辑放在`do`和`end`中间，我们可以调用 fastlane 提供的任意 Action。在这个例子中我们就调用了`swiftlint`Action，并把`lint`传递给`mode`参数，以此来执行代码扫描和检查操作。

特别需要注意的是，由于我们之前使用了 CocoaPods 来安装 SwiftLint，因此要为`executable`参数指定 SwiftLint 的安装路径`./Pods/SwiftLint/swiftlint`。同时要把 .swiftlint.yml 文件的所在路径也传递给`config_file`参数。这样就能保证 fastlane 使用了统一的 SwiftLint 版本和规则文件，方便团队所有人执行该 Lane 时得到统一的效果。

当一条 Lane 开发配置完毕以后，我们就可以在项目的根目录执行 `fastlane <lane_name>`。比如扫描和检查代码的 Lane ，我们可以在终端输入`fastlane lint_code`看到它的执行效果。
> Driving the lane 'ios lint_code'  
>
> Lint code using SwfitLint  
>
> --- Step: swiftlint ---  
>
> $ ./Pods/SwiftLint/swiftlint lint --config ./Moments/.swiftlint.yml  
>
> Linting Swift files in current working directory  
>
> Linting 'Strings.swift' (1/87)  
>
> Linting 'MomentListItemViewModel.swift' (2/87)  
>
> Linting ......s
>
> UIButtonExtensions.swift:14:46: warning: no_hardcoded_strings Violation: Please do not hardcode strings and add them to the appropriate `Localizable.strings` file; a build script compiles all strings into strongly typed resources available through `Generated/Strings.swift`, e.g. \`L10n.accessCamera (no_hardcoded_strings)  
>
> Done linting! Found 6 violations, 0 serious in 87 files.  
>
> fastlane.tools finished successfully

在执行过程中，fastlane 先从 Fastfile 文件里名叫`lint_code`的 Lane 的定义，然后执行了该 Lane 里使用到的 swiftlint Action。swiftlint Action 会把项目下 87 个 Swift 源代码文件进行扫描和检查，并把所有不符合规范的代码提示给我们。

#### 格式化代码

检查代码之后，接下来就是清理不符合规范的代码，比如删掉所有代码中不必要的空格或者空行，修正缩进的大小等等。我们可以定义一条叫作`format_code`的 Lane 来执行该功能。有了它以后，我们只需要执行`fastlane format_code`就能把整个项目所有的代码进行格式化。

```ruby
lane :format_code do
  puts("Lint and format code using SwfitLint")
  swiftlint(
    mode: :autocorrect,
    executable: "./Pods/SwiftLint/swiftlint",  # Important if you've installed it via CocoaPods
    config_file: './Moments/.swiftlint.yml',
    raise_if_swiftlint_error: true)
end
```

`format_code`和`lint_code`两条 Lane 都使用了`swiftlint`Action，唯一不同的地方是为`mode`参数传递了`autocorrect`。

#### 排序 Xcode 项目文件列表

在多人开发的项目下，我们经常会修改项目文件，这往往很容易引起合并冲突，而合并 xcodeproj 文件又是一件非常麻烦的事情。怎么办呢？

一个有效办法就是在每次新建源代码和资源文件时，把 xcodeproj 里面的文件列表进行重新排序。这样能极大地减低合并冲突的发生。我们把这一个经常使用到的操作也配置到 Fastfile 里面，如下所示。

```ruby
lane :sort_files do
  puts("Sort the files for the Xcode project")
  sh "../scripts/sort-Xcode-project-file.pl ../Moments/Moments.xcodeproj"
end
```

可以看到，fastlane 除了能调用其提供的 Action 以外，还可以通过`sh`来调用其他程序命令。在这里我们调用了由苹果公司提供的一个**Perl 程序来为 xcodeproj 里面的文件列表进行排序** 。你也可以在[拉勾教育的代码仓库](https://github.com/lagoueduCol/iOS-linyongjian/blob/main/scripts/sort-Xcode-project-file.pl)找到这个Perl 程序。

#### 调用其他 Lane 操作

除了调用一些程序命令（如`sh`）以外，一条 Lane 还可以调用 Fastfile 里面其他的 Lane。例如我们定义了一条叫作`prepare_pr`的 Lane ，它可以帮我们在提交 Pull Request 之前做一些必要的准备。下面这个代码表示的就是，这条 Lane 在内部调用了另外两条 Lane ------`format_code`和`sort_files`，以此来同时完成格式化代码和排序 Xcode 项目文件列表的操作。

```ruby
lane :prepare_pr do
  format_code
  sort_files
end
```

#### 定义私有 Lane 和返回值

类似于 Swift 语言能通过`private`来定义内部使用的方法，我们也能定义私有 Lane 给Fastfile 内的其他 Lane 所调用，提高代码的复用。其做法就是把原先的关键字`lane`替换成`private_lane`。例如我们定义一条叫作`get_pi`的私有 Lane，代码如下。

```ruby
private_lane :get_pi do
  pi = 3.1415
  pi
end
```

该 Lane 的实现体有两行代码，第一行是给一个临时变量`pi`赋值。第二行表示把`pi`作为返回值传递给调用者。例如下面就演示了如何调用`get_pi`并取得返回值。

```ruby
lane :foo do
  pi = get_pi
  puts(pi)
end
```

这是执行`fastlane foo`的结果：
> Driving the lane 'ios foo'  
>
> --- Step: Switch to ios get_pi lane ---  
>
> Cruising over to lane 'ios get_pi'  
>
> Cruising back to lane 'ios foo'  
>
> 3.1415

fastlane 首先调用`foo`Lane，然后进去`get_pi`Lane 并返回到`foo`，同时把返回结果打印出来。

### 总结

这一讲我介绍了如何从头开始搭建一个 fastlane 环境。在这里需要注意三点：

1. 不要单独手工执行 fastlane 所提供的 Action，而是使用 Fastfile 文件来统一开发、配置和管理日常中经常使用的所有自动化操作；

2. 在开发我们的 Lane 时，要优先使用和调用 fastlane 提供的 Action，因为这些 Action 都是经过社区完善的，且会随着 Xcode 版本的升级而更新；

3. 当我们调用 fastlane 所提供的 Action 时，要明确传递各个参数，在执行过程中就无须任何手工交互就能从头到尾执行整个操作。


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image6/M00/16/13/Cgp9HWBF-HeACPAgAAQVQ3FLLec967.png"/> 


有了项目需要的所有 Lane 以后，能有效减轻团队成员的重复劳动，并为项目的自动化和工程化打下坚实的基础。在后面的章节中，我会详细介绍如何使用 fastlane 来管理证书，打包 App 和上传到 App Store。

思考题：
> 在你的项目中是怎样实施自动化的？如果你是第一次使用 fastlane，请按照上述的文章和 fastlane 的官方文档来开发一条执行测试的 Lane。

可以把你的答案写得留言区哦，下一讲我将介绍如何使用 Git 与 GitHub 统一代码管理流程。

**源码地址：**
> Fastfile 文件地址：<https://github.com/lagoueduCol/iOS-linyongjian/blob/main/fastlane/Fastfile#L19-L50>

