# 第29讲：MVP中preenter生命周期的管理

我们经常在 Android MVP 架构中的 Presenter 层做一些耗时操作，比如请求网络数据等。然后根据请求后的结果刷新 View。但是如果按返回结束 Activity，而 Presenter 依然在执行耗时操作，那么就有可能造成内存泄漏，严重时甚至会造成程序崩溃，因为 Presenter 中的 View 已经变为 null。为了解决这个问题，我们需要将 Activity 的某些生命周期方法与 Presenter 保持一致。

### Lifecycle 绑定 Presenter 生命周期

LifeCycle 的使用很简单，Activity 通过继承 AppCompatActivity 会自动继承来自父类 ComponentActivity 的方法 getLifeCycle。具体使用如图所示：


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image/M00/29/5A/Ciqc1F76sXWAU2fEAAFd2jgikoo339.png"/> 


onStateChanged 方法会在 Activity 的生命周期发生变化时被触发，比如打开 LoginActivity 时就会显示如下日志：


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image/M00/29/5A/Ciqc1F76sX2AGVLQAAA53rZPZY8354.png"/> 


在 LoginActivity 中按下返回键，则打印如下日志：


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image/M00/29/66/CgqCHl76sYWAO5QQAAAuVJEi7Xo379.png"/> 


LifeCycle 还提供了注解的方式供使用，因此我们可以很容易地创建一个接口 IPresenter 类，在这个接口中声明对各种 Activity 生命周期的回调，如图所示：


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image/M00/29/66/CgqCHl76sY-AaBSDAAGjNld-ecw742.png"/> 


上图中 IPresenter 接口通过注解的方式，将 Activity 的生命周期绑定到相应的方法上，我们只要在 BasePresenter 中实现上述方法，并在方法中做数据绑定与取消的操作即可，具体如图所示：


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image/M00/29/5A/Ciqc1F76sZeANG8VAAI_wiUZACI480.png"/> 


注意：上图中的代码存在一点问题，使用了 Android 中的 Log 来打印日志信息。严格来说在 Presenter 层应该禁止出现任何 Android 中的类，这里为了快速演示效果，所以直接使用 Log 打印日志。

接下来只要再修改 LoginActivity，将 BasePresenter 注册到 LifeCycle 中即可，如图所示：


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image/M00/29/5A/Ciqc1F76saGAKsUeAAEGqubUz7M368.png"/> 


重新打开 LoginActivity，显示日志结果如图所示：


<Image alt="Drawing 6.png" src="https://s0.lgstatic.com/i/image/M00/29/66/CgqCHl76samASHhKAAAptxyq1jg160.png"/> 


关闭 LoginActivity，显示日志如图所示：


<Image alt="Drawing 7.png" src="https://s0.lgstatic.com/i/image/M00/29/5A/Ciqc1F76sbGAflpvAAAxIyHcIv0551.png"/> 


可以看出当 Activity 执行 onDestroy 时，BasePresenter 的 onDestroy 方法也会被执行。

在 LoginActivity 方法中有 login 方法，此方法会执行 BasePresenter 中的 login 方法，如图所示：


<Image alt="Drawing 8.png" src="https://s0.lgstatic.com/i/image/M00/29/66/CgqCHl76sb2AL1RKAAJ9Hs2OSvo468.png"/> 


在 BasePresenter 的 login 方法中，模拟执行了一段耗时操作。如果在 Activity onDestroy 时，BasePresenter 还没有处理完耗时操作，则会造成内存泄漏。解决办法就是在 BasePresenter 的 onDestroy 方法中停止正在执行的耗时操作，如图所示：


<Image alt="Drawing 9.png" src="https://s0.lgstatic.com/i/image/M00/29/66/CgqCHl76scmAC6zfAADyKev5-FM249.png"/> 


### 合理使用 Presenter 生命周期

并不是所有的 Activity 的生命周期都需要通知 Presenter。举一个例子，新增的需求是根据 GPS 定位，展示用户的位置。但是为了节省电量，有可能会在灭屏之后，解绑定 GPS 定位的接收事件。

如果使用 MVP 架构，需要有一个 TrackingActivity 实现 MVP 的接口 TrackingView，并在生命周期方法中调用 presenter 的相应方法，如图所示：


<Image alt="SzZhF94eX4vy46bm.png" src="https://s0.lgstatic.com/i/image/M00/2F/BD/CgqCHl8HzvqADrFUAACluyFCOBU894.png"/> 


TrackingPresenter 是 presenter 层的实现，内部实现了 GPS 定位的监听事件，并分别在 resume 和 stop 方法中绑定和解绑定 GPS。如图所示：


<Image alt="Drawing 11.png" src="https://s0.lgstatic.com/i/image/M00/29/66/CgqCHl76sd2AR4vHAADL68PR5NQ751.png"/> 


上述写法是常规的 MVP 写法，但是存在 2 个问题：

1. GpsTracker 实际的控制周期是跟 Activity 有关的，因为亮屏和灭屏事件是在 Activity 中接收的，中间多了一层 Presenter 层其实是多余的。

2. 从重构的角度看，TrackingPresenter 其实违反了职责单一原则（Single Responsibility），因为 Presenter 层的主要作用是用来刷新 View，但是上述代码中 TrackingPresenter 还负责对 GpsTracker 进行管理。

这种情况下，我们可以将 GpsTracker 初始化在 Activity 中，将 GpsTracker 的绑定与解绑定都在 Activity 中管理。最后将 GpsTracker 传给 TrackingPresenter 执行业务上的逻辑，具体实现如下：

#### TrackingActivity


<Image alt="Drawing 12.png" src="https://s0.lgstatic.com/i/image/M00/29/66/CgqCHl76seaAOlj6AAFQQYDhPMc483.png"/> 


TrackingActivity 中对 tracker 进行管理，并且根据 Presenter 层的逻辑处理，回调 showCurrentPosition 方法。

#### TrackingPresenter


<Image alt="Drawing 13.png" src="https://s0.lgstatic.com/i/image/M00/29/66/CgqCHl76se-AaHR6AAE4XwfWPA8657.png"/> 


TrackingPresenter 只负责对 GPS 事件的监听，并根据结果刷新 View。
> 这样 View 层和 Presenter 层的职责单一原则就完成了，在完成实际需求的前提下，也丝毫不影响 Presenter 层的单元测试。当然，并没有绝对正确或者错误的架构，说到底代码具体要怎样写，功能具体应该怎样实现，最终还是要看实际业务场景。

### 总结

这节课我主要对 MVP 架构中 Presenter 层的使用做了 2 点优化介绍：

1. 如何支持 Presenter 的生命周期，使其在 Activity 被销毁时也能取消相应的耗时请求。

2. 合理使用 Presenter 的生命周期，Activity 中所有的方法都委托给 Presenter 来处理是不合理的，这样会造成 Presenter 层极其庞大，也难以维护，有时也会违反职责单一原则。


