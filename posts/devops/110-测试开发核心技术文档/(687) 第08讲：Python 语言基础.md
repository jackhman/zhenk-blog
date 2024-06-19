# 第08讲：Python语言基础

本课时我们主要学习 Python 语言的一些基础知识，来为后续的学习打好基础。

###### 语言特点

事实上 Python 语言之所以能够被测试行业所普遍采用，是因为它具有以下几个特点：

* Python 是一种动态语言，虽然它比 Java、C/C++ 的执行速度慢，但作为解析型的动态语言它的语法非常简单灵活，没有什么约束。

* Python 是通用型的大众语言，使用群体广泛，应用在程序研发的各个领域，比如数据分析、系统编程、自动化等领域都大量应用了 Python 语言。

* Python 是高级编程语言，具备高级语言的诸多特性，比如数据结构、面向对象、函数式编程等都有支持，3.6 版本以后还新增了类型支持，弥补了之前的短板。

正是因为 Python 具有以上几个特性，才可以成为一门国民性的编程语言，接下来我们来安装 Python 环境。

###### Python 安装

我们想要安装 Python，首先需要根据自己平台的系统下载对应的安装包，安装包的下载地址是 https://www.python.org/downloads/，

你还可以浏览入门文档来学习 Python 的基础知识，入门文档的地址是 https://docs.python.org/3/tutorial/index.html，有了它学习 Python 就会非常的简单。

其次，Python 主要有两个版本，一个版本是 Python 2，另一个版本是 Python 3。目前，Python 3 已经成为了行业标准，这里推荐你直接使用 Python 3 版本，其中 Python 3.6 版本是最稳定的。你可以在课后根据自己的系统下载对应的版本。

然后我们对 Python 进行基础环境的配置，首先我们来安装 Python，你可以通过 Pyenv 工具来安装 Python 的所有版本。 
<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/CgpOIF3yFUGAdG7_AAGSzbPs2f4283.png"/> 


比如输入 pyenv install -l 指令，可以打印出 Python 的所有版本。你可以选择自己感兴趣的版本进行安装，还可以通过工具对 Python 进行管理，你可以看到列表中包含了 Python 的所有变种版本和原生版本。

安装完成之后，可以通过前面课时讲过的 PATH 变量来切换不同的 Python 环境，还可以通过 pyenv local 与 global 命令来实现同样的效果。

除此之外，Python 还有一个特别重要的知识点叫作虚拟环境，用以达到环境隔离的目的。当我们在使用 Python 时，因为项目中不同的组件依赖的版本可能不同，这时就需要我们在不同的环境与不同的项目之间进行隔离。如果它们都共用一套 Python 环境，就可能会相互影响。Python 提供的虚拟环境叫作 VirtualEnv，它允许我们创建一套隔离环境，在隔离环境中配置 Python 相关的依赖库，所以你可以使用 VirtualEnv 来创建属于自己的虚拟环境，有了虚拟环境后就不会影响到本地的 Python 环境了。

###### 通过指令新建项目

接下来，我们来新建一个项目，首先从简单的命令入手，最后再切换到 IDE。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/Cgq2xl3yFUKAUjILAAEtlT3HPd4840.png"/> 


输入 python 指令，会自动进入 Python 环境，你可以看到这个环境是一个交互式的环境，在这个环境中你可以运行 Python 的相关语法。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/CgpOIF3yFUKAe9hlAAERa_mHK8U085.png"/> 


比如随便输入 2\*3、5/2，你可以看到在这里输出了正确的结果。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/Cgq2xl3yFUKAIZcBAAESetMPBRY569.png"/> 


你还可以输入 print("hello wolrd")，简单打印 hello world。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/CgpOIF3yFUKAUhveAAETkY6kkuc074.png"/> 


可以使用 Ctrl + D 组合键退出 Python 环境。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/Cgq2xl3yFUOAdNz_AAD2Bbjx_l8240.png"/> 


你还可以编写一个 Python 脚本，比如输入 vim /tmp/1.python 创建脚本，并在脚本中输入 print("hello world")，保存之后输入 python /tmp/1.py 运行它，你可以看到输出了 hello world，但这种模式非常低效，我们平时并不会经常使用。

###### 使用 PyCharm 新建项目

平时工作中我们更多使用的是一个叫作 PyCharm 的 IDE 工具来创建项目，PyCharm 可以让我们更好地获得 Python 的综合开发环境。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/Cgq2xl3yFUOAQvRpAAGUkmgkCsk774.png"/> 


首先我们打开 PyCharm，你可以看到左侧是你创建的项目，右侧是项目的管理入口，比如现在我们创建一个自己的项目，点击 New Project。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/CgpOIF3yFUOAB3w0AAB_gFtBIf4241.png"/> 


你会发现地址栏会自动生成一个路径，我们起个简单的名字，比如叫作 LagouTesting，一个属于 Lagou 的测试开发项目。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/Cgq2xl3yFUOASgthAAFBA4li-0E528.png"/> 


点击地址栏下面的箭头展开信息，你可以看到默认使用的是 Virtualenv，当然其他本版也各有不同，Virtualenv 会在你的项目下面自动创建一个 venv 的子目录，这个目录下会自动配置你的 Python 和相应的依赖库。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/CgpOIF3yFUSAQMjVAAHQju3q3j8012.png"/> 


然后点击 Create 键就可以了，其他的都不用管，这时就创建了一个崭新的开发环境，在这个环境中我们可以看到 IDE 的所有功能都是具备的。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/Cgq2xl3yFUSAIYN7AAK6APzE9OI273.png"/> 


接下来，我们创建一个 Python 文件，命名为 demo，然后就可以在文件中编写 Python 的相关代码了。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/CgpOIF3yFUSAAXigAAJRbdjkNAE937.png"/> 


比如输入 print，它后面会跟一些相关的代码提示。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2D/Cgq2xl3yFUSAI_-4AAMxl3nPLDM522.png"/> 


写完之后点击鼠标右键，然后再点击 Run，你就可以运行程序了，后面我们所有的演练都会在这个项目中进行。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/57/2E/Cgq2xl3yFu6AZIKCAAIOJYWXuQA156.png"/> 


除此之外，我们可能会遇到一些特殊情况需要添加依赖库，这时便可以在项目设置中进行添加，目前默认使用的是 pip 和 setuptools 工具，如果你想增加一些第三方库，可以在搜索栏中进行搜索，搜索完成之后添加到项目中，此时加载速度比较慢是因为大部分三方库的服务器都在海外，如果你想加载更快一些可以把豆瓣和阿里云的镜像添加进去，这样安装速度就会快很多。  

<br />


