# 第01讲：Linux与Shell环境搭建及介绍

本课时我们主要讲解操作系统简史，以及 Linux 与 Shell 的环境搭建等内容。

###### 操作系统简史


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/A9/2F/CgotOV3OcR2AGGnhAAFTLJlqgys080.png"/> 


首先，我们来看一下整个操作系统的简史，整个操作系统可以分为四大时代：

* 第一个时代是 OS 时代，这个时候操作系统才刚刚成型，最早是 1973 年由贝尔实验室开发的UNIX 系统，以及 1982 年与 1991年在 UNIX 系统基础上进行扩展定制的若干变种。

* 第二个时代是 PC 时代，PC 时代崛起于 1975 年，当年乔布斯开发了 Apple 系统，随后 1980 年，比尔盖茨开发了 DOS 系统，从这时起更多的人开始接触操作系统，个人计算机得以普及。

* 第三个时代是 GUI 时代，GUI 时代的代表作是 1979 年乔布斯开发的 Mac 系统与 1990 年比尔盖茨开发的 Windows 系统，以及 1994 年的 Linux 系统，这三个系统影响了整个时代，一直到现在仍被广泛使用。

* 第四个时代是移动 OS 时代，随着移动互联网的发展，移动 OS 也变得越来越重要，在移动 OS 时代，最知名的是 Google 的 Android 系统，以及乔布斯的 iOS 系统。

可以看到，从 PC 时代到移动 OS 时代，乔布斯在产品设计、用户体验方面给人类带来了前所未有领先时代的理念，在这里我们也向乔布斯致敬。

###### Bash 是什么


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/A9/0F/CgoB5l3OcR2AV-1_AARjoDt0imA774.png"/> 


了解完操作系统简史，我们接下来学习什么是 Bash？我想你一定看过《黑客帝国》这部电影，在电影中有一个镜头是女主角崔妮蒂为了拯救尼奥入侵某个电站时，在交互界面显示了一行行的命令，其实这个交互界面就是 UNIX 系统界面，而这一行行指令便是 Linux Shell 指令，那么 Shell 是指什么呢？它其实是 UNIX 系统下的一个解析器，可以解析这些指令并完成相关操作。而在 Shell 出现之前，人们则需要通过编程的方式输入指令来操作系统，效率非常的底下，往往需要提前设计好大量的程序，才可以正常地操作系统，而有了 Shell 以后，用户操作系统就变得非常便捷。


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/A9/2F/CgotOV3OcR6AXUcsAACOQHI_BVM743.png"/> 


在 1989 年，随着 Bash 的诞生，标志着一个真正属于 Shell 的时代的来临，Bash 提供了更优秀的语法支持，同时还是开源、开放的项目。从 1989 年起，更多的系统默认使用 Bash 作为主机交互界面。

###### Shell 的价值

那么对于我们测试工程师而言，Shell 的价值体现在哪里呢？

<br />

首先，人机交互经历了这样一个阶段的发展：

* 第一个阶段，我们需要通过 API 调用系统功能。

* 第二个阶段，通过 Shell 完成人机交互。

* 第三个阶段，以 Windows 和 Mac 系统为代表的 GUI 时代，人们可以通过图形界面进行人机交互。

* 第四个阶段，便是未来可能普及的 VR\&AR 交互时代。

到目前为止，虽然我们日常以 GUI 人机交互为主，但在测试领域，我们更多地使用 Shell 脚本自动化应用于常见的 Linux、Mac、Android、iOS 等系统，因为 GUI 自动化没有提供很好的编程和调用接口，且存在不稳定的情况，GUI 自动化更多地用于测试 GUI 本身。  

而 Shell 作为一款非常优秀的命令解析器，非常适合作为测试工作的黏合剂来处理一些文件处理、环境搭建、测试脚本调度等工作，我们接下来介绍 Shell 的种类。

###### Shell 的种类

在 Linux 系统中你可以通过 cat 指令来查看 etc/ 下的 shells，可以看到本地支持的 Shell 种类非常多，常见的有 bash、csh、ksh、sh，等等。其中，sh 是 Bash 的早期形态，因为 sh 不是 GNU 项目，所以后期又开发了 Bash。  

<br />

在 Windows 系统中，是没有 Shell 环境的，Windows 下的 Shell 其实叫作 command，现在升级为 PowerShell，但是 Windows 指令与 Linux 系统并不兼容，因为它本身不是从 Linux/Unix 系统衍生出来的，所以导致 Windows 与目前的OS，如：Mac、Linux、Android、iOS 的命令不兼容。为了解决这个问题，在 Windows 中你可以使用 Git bash，以及 Cygwin 来模拟 Shell 环境。

<br />

如果你的系统是 Mac，那么恭喜你，Mac 系统自带了 Terminal，你还可以安装 iTerm2，它们都是标准的 Shell 环境。在 Linux 环境下，建议你使用 Bash，Bash 是目前行业内使用最广泛的 Shell 环境，在 Windows 环境下，建议你使用 Git bash，它几乎包含了 Linux 常用的全部指令。


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/A9/0F/CgoB5l3OcR6ASe74AADtcorq_Jc477.png"/> 


如果你想更全面地掌握 Shell，不受限于自己电脑的操作系统，那么可以购买云服务器，目前国内主流的云服务器厂商有阿里云、腾讯云、华为云。国外云服务器厂商有 DigitalOccean 和 Lincode，拥有一台属于自己的云服务器也是一个 IT 工程师的成年礼。

在配置云服务器时，推荐使用 Linux 体系下的 CentOS 和 Ubuntu 系统，CentOS 是红帽发布的一个免费的、开源的系统，Ubuntu 也是非常知名的 Linux 体系下的操作系统，整体配置时，CentOS 可以作为服务器，而 Ubuntu 作为个人工作机。

###### Hello world


<Image alt="" src="http://s0.lgstatic.com/i/image2/M01/A9/2F/CgotOV3OcR6AOiCPAAELnbG0Gnc303.png"/> 


最后，带你演示如何完成我们的第一行命令，我自己的演示电脑是 Mac 系统，并安装了 iTerm2，我们先输入一个简单的 echo 指令，echo指令用于回显，你输入什么系统就输出什么 ，我们输入一个 echo hello world，你可以看到输出显示了 hello world，你也可以使用 Terminal 终端，虽然与 iTerm2 界面不一样，但本质是一样的。输入 echo hello world 也输出了 hello world。除此以外，你还可以登录自己的云服务器，比如我输入账户和密码后，登录自己的云服务器，也可以支持 echo hello world。

<br />

好了，本课时的全部内容就讲完了，通过本课时的学习我们对操作系统简史有了一定的了解，接下来需要你配置好自己的环境，Windows 环境下推荐使用 Git bash，Mac 环境推荐使用 iTerm2 工具，而如果你想体验更丰富的内容也可以通过 ssh 登录云端服务器，进行相关指令的练习。

