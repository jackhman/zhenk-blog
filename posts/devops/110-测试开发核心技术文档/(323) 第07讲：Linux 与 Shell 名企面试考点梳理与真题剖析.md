# 第07讲：Linux与Shell名企面试考点梳理与真题剖析

本课时我们主要梳理和剖析 Linux 与 Shell 相关的名企面试考题，来帮助你能够顺利通过面试。

### 基础知识

在名企的面试中通常会考核你对 Linux 和 Shell 相关知识掌握的广度和深度来摸底你的个人能力。而在整个面试过程中通常第一关你需要回答以下两个问题。

* 用过哪些命令？

* 有没有写过脚本？

这两个问题看似都非常简单，但如果你对它们不够重视就会陷入非常艰难的境地，因为面试官会通过这两个非常开放的问题考察你对知识的掌握程度，如果回答得好就能在面试官心中留下非常好的第一印象。

首先，来看第一个问题，你使用过哪些命令，如果你是一个 Linux 高手或是有一定工作经验，那么这个问题一定难不住你，你可以根据命令的用途来进行分类回答，首先是常用的 Linux 基本操作命令，需要你从文件、网络、进程三个方面进行回答，然后是常用的数据分析工具，包括：Linux 三剑客、sort、uniq、head 等命令。每个方面都需要你掌握常用的命令并在面试过程中熟练的回答问题。

第二个问题是有没有写过脚本，这个问题考察你对 Linux 与 Shell 掌握的深度，体现你用脚本都能做哪些有价值的事情，同样也是一个开放问题但能很好地摸底一个人的能力，那么如何回答这个问题呢？

在我们测试日常工作中，主要包括这几大类工作，第一类是自动化测试，比如通过脚本调度自动化的程序编译我们的 App，跑单元测试、接口测试并保存它们的测试记录，这里需要你能够回答在常用的自动化测试、环境部署、任务调度等领域你写过哪些脚本。然后是数据分析，能够通过保存的测试记录完成相关的数据分析工作。

只有你在日常的工作中使用过它们才能够完美地回答面试官的这两个考题，它们可以全面的考察一个人的综合能力，面试官也可以根据你回答中的某个点来深挖细节，但如果你还不能很好地回答这两个问题就需要你认真的学习这门课程，在课程的学习中这些知识点都会讲解并举例说明。

### 文件检索

过了第一关之后是第二关，主要考察你在 Linux 中的具体执行能力，也是对知识深度的挖掘。这里列出这样两个问题：

* 如何找到特定目录下后缀为 .jar 的所有文件？

* 如何在特定目录下找到包含特定数据的文件？

第一个问题可以通过 find 指令解决，比如 find $ANDROID_HOME -name "\*.jar" 就是搜索 Android SDK 中的 .jar 后缀名的文件。

而第二个问题在特定目录下找到特定数据的文件，则可以通过 find 与 grep 配合的方式解决，答案中展示的命令就可以查找到包含 java 的执行命令脚本，当然你也可以通过 while read line 循环来实现相同的功能。

### 网络统计

上面的问题考察的都是你对 Linux 和 Shell 的一些基本功，接下来的问题会逐渐增加难度，对网络统计的考察也是面试中的重点，这里主要涉及两个问题，比如：

* 如何查看当前开放的端口和进程？

* 压测时如何统计当前机器的连接数？   

虽然网络的知识很重要，但这块的命令并不多，通常只有 netstat 是核心考察点，如果你能够熟练掌握 netstat 的知识基本上就能够回答网络统计相关的问题了。而关于 netstat 相关命令的使用已经在 02 课时详解讲解过，如果你还没有熟练掌握希望你课后能够回顾 02 课时的知识。

### 性能统计

最后是进阶问题，如何进行性能分析，前面的两关，第一关是摸底，第二关是考察你对具体命令的熟悉程度，第三关则重点考察你的综合能力，以及对性能的分析能力。比如，你如何统计某个进程的 CPU 和内存的增长情况？


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AD/Cgq2xl3oo2qAT5Q9AAP9QW1unW4571.png"/> 


如何解答这个问题呢？首先，我们通过 top 命令给大家列举机器的所有进程，你可以看到里面有一个 AliYunDun 的进程，它的 PID 是 705，我们便以它为例来一步步解答这个问题。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AD/CgpOIF3oo3OAamVXAAGmDLd3sfQ915.png"/> 


输入 top -p 705 指令，它会列举这个进程的数据，此时的数据是可交互的。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AD/Cgq2xl3oo3uAK4O1AAHoIk6W5bA925.png"/> 


我们此时需要不可交互的数据，可以给指令加入一个 -b 命令，-b 表示非交互模式，加入 -b 后系统会每隔 3 秒打印一份内容。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AD/Cgq2xl3oo4WATWv7AAPT15q6zb0718.png"/> 


而我们只需要关注核心数据，就可以在指令中加入 -n 1 命令，让系统只输出一次，那我们如何获取最后一行核心数据呢？


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AE/Cgq2xl3oo46AbVlXAAP41ALHjEk157.png"/> 


通过 \| tail -1 命令实现只打印最后一行核心数据。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AD/CgpOIF3oo5aAMQfFAAPcJ8rwxrk401.png"/> 


我们继续通过 \| awk 打印 $9 $10 的参数显示 CPU 和内存的使用情况。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AD/CgpOIF3oo56ALxWwAAHZ_GW0g9E684.png"/> 


你也可以使用 while 循环每隔 1 秒统计一次使用情况。当然使用 for 循环也可以实现相同的功能。

### 数据统计分析

最后是数据统计分析，考察的是你如何使用基本命令配合管道和三剑客来完成数据分析工作的，

比如有一份 Nginx 日志文件，第一列是 IP，如何给出访问量前三的 IP 地址？


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AD/CgpOIF3oo6eADjVvAATco8oWqcQ886.png"/> 


通常在回答这个问题时，你首先需要知道这份日志的格式是什么，可以通过 less nginx.log 指令查看日志格式，你可以看到第一个信息是 IP，后面是以空格隔开的其他字段，这是一份服务器日志访问记录，那么我们如何在繁杂的数据中找出访问量最高的那 3 个 IP 呢？


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AD/CgpOIF3oo7GAP4yxAAGIJe043rs272.png"/> 


我们首先输入 awk '{print $1}' nginx.log \| less 指令，第一列输出了所有的 IP。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AD/CgpOIF3oo7qAN0rBAAGafa7tPPg079.png"/> 


但我们只需要统计前三，这时需要对它进行一个排序，通过 awk '{print $1}' nginx.log \| sort \| less 完成排序。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AD/CgpOIF3oo8aAAz8bAAG1lMxKy2s763.png"/> 


然后加入 uniq 命令，它可以把相同的数据整合成一个，-c 命令可以再进行数据整合时记录相同数据有几个重复项。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AE/CgpOIF3oo9CAT9AfAAHPAHniQQQ244.png"/> 


然后我们发现它的排序是有问题的，它是按照 ASCII 码进行排序的。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AE/CgpOIF3oo9qAICpMAAHs7iA9Wig257.png"/> 


而我们想按照数字进行排序，我们可以用 sort -n 命令，它就可以按照从小到大的顺序进行了排序。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AE/Cgq2xl3oo-OAXpmiAAM7_6RNUxc216.png"/> 


这个时候我们加入 tail -3 命令，就列举访问量最高的三个数据。


<Image alt="" src="https://s0.lgstatic.com/i/image3/M01/54/AE/CgpOIF3oo-yAXKDeAAMOJudQ9kQ423.png"/> 


当然也可以使用 sort -nr\|head -3 命令，r 代表逆序，这样就可以打印出前三的数据。   

以上这些只是列举了面试过程中面试官经常问到的问题，当然在实际面试中你可能还会遇到各种各样的考题，但万变不离其宗，只要你对 Linux 与 Shell 的基础知识掌握的够扎实，并能够在日常的工作中多总结经验，灵活运用所掌握的知识，一定能够很好地回答面试中的考题，如果你对如何解答问题没有把握，也要将你的解题思路阐述给面试官，让面试官看到你对问题的思考能力。  

