# 第29讲：Appium框架常用自动化API

本课时我们开始学习 Appium 框架中常用的自动化 API。  

Appium 常用 API
-------------

通常对于一个UI控件我们会有这样几个操作。第 1 个操作称之为 find，它可以对元素控件进行定位。第 2 个操作是 get_attribute，用来获取控件的基本内容，获取内容后可以做一些基本断言。第 3 个是 Click，第 4 个是 send_keys ，它们表示对元素的基本操作。还有一些是与UI控件无关的，比如说滑屏、拖放等操作。

<br />

接下来我们先看 Appium 自动化测试用例编写相关的几个常用 API。在上一课时，我们学会了 Appium 最基本的测试用例，并对它做了一次改造。测试用例通常包含这样几个步骤：导入依赖、capabilities 设置、初始化 driver、对元素进行定位与操作， 最后断言。

### capabilities 设置

在改造中有个步骤叫 capabilities 设置，capabilities 是个词典，它里面存储的是一些经常用到的属性，比如说 appPackage 和 appActivity。

<br />

如果你想在 App 里重新安装一个包，你可以添加一个叫 app 的参数，它会自动帮你安装包。但这个方法比较慢，所以我们通常会直接使用已经存在的包，从而节省时间。但在正式的安装过程中，我们还是需加添加一些 APK 自动进行安装。

<br />

capabilities 设置里还有一个属性是 automationName，它默认使用的是 uiautomator2。

<br />

另外还有 autoGrantPermissions，它可以自动给你的 App 通过一些权限申请，这样就避免了很多权限弹框的出现。

<br />

noReset fullReset 设置可以判断在测试前后是否需要去清理 App 的数据。

<br />

如果说需要输入中文，你需要设置两个参数，一个叫 unicodeKeyBoard，它支持非英文之外的语言输入，所以当我们输入中文时，就可以使用这个参数。但它适用于自动化但不适用于人工，输入完成之后，它会一直保留在 unicodeKeyBoard。当你测试完成后手工测试的时候会发现没有地方输入。为了能够还原原来的输入法环境，你可以使用 resetKeyBoard。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4C/CgpOIF5wZS-ARQX_AAKCUn-qSck582.png"/> 


<br />

以上这些功能都是靠 capabilities 来进行设置的。在配置 capabilities 时我们会写这样一个词典，你可以在里面配置上所需要的参数，最后通过 webdriver .Remote 把这个参数传递给 Appium，Appium 收到请求和配置之后，就会帮你完成后续的操作。

<br />

在这个过程中隐式等待是必须要进行设置的，不设置隐式等待就会跟 Selenium 一样报错了。

### 控件定位与交互

接下来，我们来看一下控件定位和相关操作。首先我们来了解一下控件的基础知识。我们知道做网页测试的时候会有一个叫 HTML 的网页源代码，我们称之为 DOM，它的全称是 Document Object Model 文档对象模型。在 Web 时代，我们会用这个概念去表示界面里的一些控件，从而进行一些图形化的渲染。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4D/Cgq2xl5wZS-AErgaAAGdXiNhIc8313.png"/> 


<br />

对控件进行查找时，我们可以使用 CSS 选择器，以及 XPath 选择器。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4C/CgpOIF5wZS-AXSp5AAJGOBnUUVg131.png"/> 


<br />

到了移动时代，移动页面不再是一个 H5，而是有自己的解析规则，所以 H5 标准的 CSS 选择器的语法在移动端原生控件的自动化上是不支持的。

<br />

移动端使用一种叫 page sorce 的结构。它是由 Appium 定义的，属于一种特殊的 XML结构，由于不再是一个 HTML ，所以说 CSS 对它失效了。但是我们仍然可以使用 XML 里面的 xpath。因为 XPath 本身是一个 XML，所以我们可以借助它来进行定位。

<br />

那么有哪些控件可以辅助我们进行定位？我们来看一下。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4D/Cgq2xl5wZTCAKiTKAAMDhTaXVUk924.png"/> 


<br />

我截出 Android App 的某一个界面的page source，你可以看到它里面包含了很多层级结构，每一层里面有一个控件，它会将一个标签设置为控件的类名，里面有各种属性、有是否可选、是否已经选中，以及它实现的类，除此之外，还有 content-desc、clickable 等， 所有这些内容其实都是它的基本属性。

<br />

我们只能靠这些属性来定位控件。那么有哪些控件的属性是我们比较关注的？第 1 个叫 resource-id 。从图中你可以看到第一个 resource-id 是空的，而下面这个是有的。

<br />

resource-id 是一个控件的主要识别符。但是很多情况下一个控件可能是没有 resource-id 的。虽然我们默认 resource-id 代表一个控件，但当处于一个列表中的时候，有可能所有控件的 id 都是一模一样的，还有可能 resource-id 完全没有值。所以说在 resource-id 一样的情况下，它是用来唯一定位控件的。但是在真实过程中，可能研发做的并不标准，出现有多个相同 id 或没有 id 的情况。

<br />

resource-id 是我们第 1 个定位方法，但是它不能百分百的准确定位。我们再看第 2 个叫 content-desc 属性相关的accessibility-id方法，content-desc 也是 Android 里面用来标记控件可访问性的关键属性。在这里面你可以看到 content-desc 在多数情况下也是为空的，有一些开发者同样也没设置了属性，这导致我们很难定位这个控件。

<br />

如果说这两个方法都无法准确定位，那么接下来就只有 XPath 可以选择了。

<br />

除了 XPath 之外，还有一种 Android 支持的名叫 UIAutomator 的定位符。相对来说它比较复杂，也没有办法多平台复用，所以说我们通常是不推荐的。

<br />

综上，XPath 成为我们在移动端做自动化时用得比较多的方法。

<br />

我们在写 XPath 时也要靠一些关键属性进行定位，比较重要的有文本、resource-id 文本、content-desc 和元素的标签。把这些内容组合起来，就可以写出来一个相对精准的定位符了。

<br />

iOS 与 Android 在属性的命名上有一些差别，但是整个UI的界面结构都是 XML，所以说仍然可以使用 XPath 来进行定位。

### 元素定位

接下来我们来看一下如何做元素定位。

<br />

通常 id 是首选，我们称之为 resource-id，可以使用 find element by id 来进行定位。还有一个是 accessibilityId，它对应的是 Android 端的 content-desc。

<br />

除此之外，不推荐使用 Android 原生的 UIAutomator 定位符，因为我不建议你使用跟平台相关的一些定位，除非是在没有其他办法的情况下，你可以使用它做一些特殊的用途，但多数情况下你应该优先选用标准的支持多平台的定位符。

<br />

这几个定位是如何实现的呢？

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4C/CgpOIF5wZTCAbNmKAANOyGoom8U844.png"/> 


<br />

我们可以从 UIAutomator2-server 源代码里面分析它是如何定位的。

<br />

从源代码里可以看到，如果是根据 ById 进行定位，那么它取的是元素的 resource-id；如果是根据 AccessibilityId 进行定位，那么定位的是 content-desc 属性；如果是根据 class 进行定位，它对应的是类名，即我们刚才看到 class。

<br />

如果是 XPath 的话会有一套额外的解析逻辑， XPath 相对其他的定位方法会慢一步。

<br />

接下来我们看一下怎么进行定位。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4D/Cgq2xl5wZTCAAmUsAAGoOl4VKDs656.png"/> 


<br />

通常人们写代码都是习惯用 find_element_by 加上定位符。我不建议你使用 final_element_by 系列方法，而是直接使用 find_element 方法，在方法中使用"by+属性"进行定位，这样比较方便后续的Page Object改造。

### 控件相关方法

我们接下来看一下控件相关的几个重要方法。对一个控件做操作总会涉及这样几个内容，一是点击，二是输入文本，最后是控件的属性获取。

<br />

这 3 个内容组成了自动化步骤里几个关键 API。我们来解析一下这几个步骤，点击（click）和输入（send_keys）你已经用过了，控件属性获取有两个内容，第 1 个是对于通用的属性，比如它的文本内容、标签、地址、大小和宽高。这几个属性你可以使用控件自带的方法直接进行调用。

<br />

但当我想获取它的 resource-id 、 content-desc 和是否可点击等信息时，就可以独立使用 get_attibute() 获得更多的特定属性。

<br />

除了基本的控件定位之外，还有一些显式等待、隐式等待等相关的 API，这跟 Selenium 是一模一样的，所以这儿我就不详细介绍了。

### 手势操作

除了这个之外还有一部分是手势操作，比如说当我们要完成一次滑动，就要用到TouchAction 这个方法了。

<br />

除了 TouchAction 之外，还有一些系统性的操作，比如说我需要安装、卸载、清理 App 的数据，或者我要获取 App 的上下文，获取 App 当前有几个窗口，隐藏键盘，打开启动提醒、启动特定的 activity 等，这些相关操作都在 Appium 的官方文档里有详细介绍，你课后可以自行去看相关文档。

具体演示
----

接下来我们就演示如何调用 API。

<br />

首先我们回到上一课时使用过的代码，我对代码做了个简单改造，把 caps 改造成词典类型，传递过后隐式等待 20 秒。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4C/CgpOIF5wZTCANImEAALK32skzIY053.png"/> 


<br />

接着我们看它的每一步，你可以看到这个代码非常烦琐，有很多地方可以优化，我们把它改造一下。首先我们复制出来一个新的方法，用于与原有方法进行对比。我们自己创建一个叫 test_search_new 的方法，然后根据前面讲的几个基础的 API 来完成这个 case 的改造。

<br />

我们先看一下这个 case 的步骤，首先是 image_cancel，获取元素之后再点击 click。如果说你只是为它完成一次点击，那么就不用去存变量，我们可以直接使用这个办法：对 element 直接链式调用，find 之后再 click。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4D/Cgq2xl5wZTCAOieUAAHxtHNfr54405.png"/> 


<br />

我们也可以不用通过 find_element_by_id 进行查找，更常见的用法是使用 find，然后在里面调用 By.ID 就可以了。除了这个方法之外，还可以再做一次改造，这个 id 非常长，我们可以删掉它，只留斜杠后面的内容，这种写法也是可以的。对下面的内容我们也可以用这个办法进行改造。

<br />

通过这样的改造，我们就可以让代码更清楚明了。

<br />

最后一步是 XPath，它的内容超级长，这是 Appium 在 XPath 里为我们自动生成的表达式。前面说过了，XPath 里面有很多定位，包含 TextView 等内容，不仅看起来复杂，也不利于维护，所以我们通常是不使用它的。我们把这个代码删掉，换成自己的定位符。那么要用什么样的定位符呢？

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4C/CgpOIF5wZTCAbgebAABe4rzTUkY522.png"/> 


<br />

首先这个 XPath，它指的是我们搜索后第 1 个找到的内容。借助 UIAutomatorViewer（它是 Android SDK 下面的一个工具，你可以在 SDK 中找到），这个工具可以帮你分析 Android 的基础界面结构。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4D/Cgq2xl5wZTCAJZB0AAHT7G2hTLk140.png"/> 


<br />

我们回到雪球，搜索阿里巴巴，我们要点击的实际上是搜索框下面的选项。现在我们去看一下这个控件的属性，我们可以点击符号，去获取界面的内容。比如说我们点击搜索列表里的第一个阿里巴巴，这时就会出来相应的属性。因为它是个列表，所以下面的 id 是重复的。但是如果说我只是找第 1 个，那么就算 id 重复也没关系，因为 Appium 里的 final_element 会默认找第 1 个，所以我们直接写它就可以了。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4C/CgpOIF5wZTCAenCBAAGbZT7_m-M180.png"/> 


<br />

打开代码，我们开始对代码进行改造。仍然是 By.Id，然后里面写一个 name，最后加上 click，这样就完成了上面这段长代码的点击。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4D/Cgq2xl5wZTGAZMhhAALp2bU7Auw475.png"/> 


<br />

点击完成之后，我们还想写的更完善一点，比如说当我点击了阿里巴巴之后，我想对它的股价做一个断言。阿里巴巴现在的股价是 185，我们在这加一个断言，比如断言阿里巴巴的股价大于 100。

<br />

我们看到阿里巴巴股价这一栏的 resource-id 叫 current_price，获取后可以使用 self.driver.find_element(By.Id,current_prrice) 代码。然后我要获取它的价格，这个时候我们就要用 text， text 获取的内容其实是一个文本，我们要断言这个文本大于 100，但如果你直接 aseert 大于 100，肯定会报错的。

<br />

为什么会报错？因为阿里巴巴的股价是个符点数，用一个文本去比较肯定是不行的。所以这个时候我们通常会在代码前面加一个 float，将类型转成符点数，方便进行对比。最后我们把代码格式化一下。

<br />

这样我们很快就写出一个 case。 现在我们运行一下。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4C/CgpOIF5wZTGAFfYQAAGZZKFHP_s235.png"/> 


<br />

这个时候运行报错，是因为 Appium 现在没有启动，我们把 AppiumDesktop 关闭了。所以现在我们要启动 Appium。这次我们不再使用 AppiumDesktop 了。因为 AppiumDesktop 相对来说更适合新手入门，到了一定阶段如果想要使用 Appium 更强的功能，我推荐使用 Appium 的纯命令行用法。通常我们会加一个 -g，代表把关键的一些日志进行存储。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4D/Cgq2xl5wZTGAF0mKAAUaAF6331Q902.png"/> 


<br />

现在我先什么都不加，简单启动一下。启动之后我们开始运行，最终发现这个 case 通过了。

<br />

接下来我们再写另外一个 case，前面提到过手势操作，这个功能也是比较常用的，所以我在这单独写一个叫 swipe 演示滑动的 case。

<br />

比如说我们模拟从进入首页开始滑动 5 次或者 10 次。滑动这个操作中需要调用 swipe 方法，swipe 方法里有很多参数，分别表示起点、终点以及滑动速度，所以我们可以主要使用它。

<br />

swipe 里面还有 start x、start y、 end x、 end y 以及时间参数。如果要去编写手势，首先需要一个起始的点，这个点是多少呢？

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4C/CgpOIF5wZTGANn-AAAJVxg2UHaM829.png"/> 


<br />

我们回到屏幕，举个例子，当我们从上往下或者从下往上滑动时，不同的屏幕，它的坐标值是不一样的。如果说我们写死这个值，遇到小屏幕就会失败，所以我们设置时更多的是根据屏幕的百分比。x 轴表示从左到右，我可以从中间开始。如果说从下往上滑，也就是 y 轴，y 轴的零值代表最上面。也就是说我从 y 轴的最大值，一直滑动到 y 轴的最小值。我用百分比代表滑动的多少。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4D/Cgq2xl5wZTGAUEdAAAB0n6WnbHY274.png"/> 


<br />

那么我可以这样去写，首先获取屏幕的大小，我们用 self.driver.get_windouw_size() 方法，它代表获取窗口的大小，size 会返回高度和宽度的词典。

<br />


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/76/4C/CgpOIF5wZTGAfuAQAAELOsiMYUI745.png"/> 


<br />

现在我们来编写滑动的范围。滑动的起始点 x 轴是 0.5，那么我们就用 0.5×size 的宽度。起始点的 y 轴是 0.8，我们用 0.8×size 的高度。在滑动过程中 x 轴基本上没什么变化，所以我们可以写成 0.5×size\['width'\] 。y 轴是 0.2，我们把它缩小一点，这就代表从下往上滑。最后还有一个参数：滑动速度，它代表滑动操作所花费的时间。我们假设是一秒。因为滑动一次很难看到效果，所以我们用一个循环 for i in range(5)，代表滑动 5 次。

<br />

现在我们来执行一下。在这个过程中 Appium 会启动，同时它会等待 App 启动，App启动后 Appium 会先帮我们解决升级框以及同意框的问题，解决完成之后才会进入滑动。

<br />

这就是关于滑动的 API，更多的 API，你可以自行探索，可以输入 self. driver，利用 API 的推导功能就可以发现更多的功能。你可以从这里去学习它的使用。

<br />

除此之外，Appium 官方文档里面也有一些关于各个 API 功能的介绍，你可以详细的去学习它们。

