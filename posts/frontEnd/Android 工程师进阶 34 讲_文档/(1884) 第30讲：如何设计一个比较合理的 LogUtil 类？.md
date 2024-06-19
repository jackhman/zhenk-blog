# 第30讲：如何设计一个比较合理的LogUtil类？

我们在项目中经常会打印各种 Log 信息，用来查看程序运行中的详细情况。因此打印日志俨然已经成了程序开发工作中的一部分，而设计一个合理的 LogUtils 也成了一个好的程序员的必选条件之一。

### 设置 Debug 开关

有时候为了调试方便，我们甚至会将用户的账号、密码、余额等信息也打印到控制台，但是如果这部分 Log 信息也出现在线上版本中，那用户的私密信息，或者程序相关核心实现都会被暴露；除此之外，打印日志的代码并不属于业务需求的必要代码，复杂的 Log 信息还会造成一定的性能损耗，所以这部分代码都不应该出现在线上版本的 App 中。因此我们需要设置一个开关来控制是否打印 Log 日志，只有在 Debug 版本才会打开此开关，如图所示：


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image/M00/2B/32/Ciqc1F79yuOAKRc0AACn5J73xWc380.png"/> 


通常情况下我们会使用 BuildConfig.DEBUG 来作为是否要打印日志的开关。但是使用这个变量具有一定的局限性。比如现场突然发现一个异常现象，而我们需要现场抓取异常的日志信息加以分析。因为是 release 版本，所有不会有任何 log 信息被打印。因此这个开关的设置最好具有一定的灵活性，比如可以再加一层 System Property 的设置，如图所示：


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image/M00/2B/32/Ciqc1F79yuuASf4RAAEC0G7d1i8786.png"/> 


上述代码打印结果如下所示：


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image/M00/2B/32/Ciqc1F79yvGAWzgGAAAydEsKlLQ971.png"/> 


使用 System Property 的好处是一旦设置之后，即使重启 App，System Property 中的变量依旧是设置之后的值，与 Android 中的 SharedPreference 非常相似。开发者只要定义好通过何种方式将这种属性打开即可，建议仿照 Android 系统设置中的"开发者选项"来实现，当用户快速连续点击某 item 时，才将此属性打开。

另外，我们还可以通过 ProGuard 在打包阶段清除某些 Log 日志、打印代码，具体规则如下：


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image/M00/2B/3D/CgqCHl79yviAcvLDAABHPRbfCl0210.png"/> 


### 设置 log 日志本地保存

有时候我们需要将部分 log 日志以文件的形式保存在手机磁盘中，因此我们还需要设置开关，控制日志是打印在控制台还是保存到文件中。如下所示：


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image/M00/2B/32/Ciqc1F79ywGAUMaFAAHDevPE_DI210.png"/> 


因为涉及文件的写操作，所以最好是在子线程中完成日志的保存。因此在 LogUtils 中可以使用线程池控制子线程完成日志保存，如下所示：


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image/M00/2B/3D/CgqCHl79ywiAETP_AAI_AuTvNC0527.png"/> 


### Config 文件统一配置

如果 LogUtils 中的开关较多，再加上还有其他配置项，比如日志保存为文件的路径等。这种情况可以使用一个全局的 Config 来配置 LogUtils 中所有的配置项，如下所示：


<Image alt="Drawing 6.png" src="https://s0.lgstatic.com/i/image/M00/2B/32/Ciqc1F79yxCAZsaGAALTVgPeDRg031.png"/> 


#### 特殊格式转换

我们经常会处理一些特殊格式的数据，比如 JSON、XML。为了打印这部分数据，还需要在 LogUtils 类中做一些格式转换的操作：


<Image alt="Drawing 7.png" src="https://s0.lgstatic.com/i/image/M00/2B/3D/CgqCHl79yxmAaF8EAAKcSdHKQ3Y185.png"/> 


#### 借助于三方库打印 log

如果感觉自己封装一个 LogUtils 类比较麻烦，或者没有好的实现思路，那就不妨尝试使用行内内已经成熟的 log 日志库。

**XLog**

XLog 是比较常用的打印日志开源库，GitHub 地址参考 [XLog github](https://github.com/elvishew/XLog/blob/master/README_ZH.md)。XLog 基本囊括了我们上文介绍的所有功能：

* 全局配置或基于单条日志的配置；

* 支持打印任意对象以及可自定义的对象格式化器；

* 支持打印数组；

* 支持打印无限长的日志（没有 4K 字符的限制）；

* XML 和 JSON 格式化输出；

* 线程信息（线程名等，可自定义）；

* 调用栈信息（可配置的调用栈深度，调用栈信息包括类名、方法名、文件名和行号）；

* 支持日志拦截器；

* 保存日志文件（文件名和自动备份策略可灵活配置）。

XLog 使用比较简单，先调用 init 方法进行初始化，最好是在 Application 中。


<Image alt="Drawing 8.png" src="https://s0.lgstatic.com/i/image/M00/2B/32/Ciqc1F79yyOAXOcKAAFJcacSgv8868.png"/> 


然后就可以直接调用 Xlog 的静态方法打印相应日志即可：


<Image alt="Drawing 9.png" src="https://s0.lgstatic.com/i/image/M00/2B/3D/CgqCHl79yyqATI2zAACuVSGDEV8600.png"/> 


也可以在打印日志时，添加局部的配置信息：


<Image alt="Drawing 10.png" src="https://s0.lgstatic.com/i/image/M00/2B/3D/CgqCHl79yzmAZ3OIAABv32_jBIU173.png"/> 


打印结果类似下图所示：


<Image alt="Drawing 11.png" src="https://s0.lgstatic.com/i/image/M00/2B/32/Ciqc1F79yz-AQZIZAADeZb8f9-Y734.png"/> 


可以看出，除了打印日志的类和方法，XLog 还能打印线程信息以及调用栈信息。

### 总结

这节课主要介绍了项目开发中对 LogUtils 类的配置，因为项目中会在很多地方打印各种日志信息，所以为了方便统一管理，我们应该将所有日志打印的工作都集中到一个 Utils 类中。LogUtils 应该对外部提供相应的开关，用来设置是否需要打印日志，以及打印日志的通道，如果是将日志保存在文件中等耗时操作，还应该考虑在子线程中完成。

