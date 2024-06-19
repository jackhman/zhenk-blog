# 第28讲：AndroidGradle构建问题解析

想必我们做 Android App 开发的应该对 gradle 都不太陌生，因为 Android Studio 的帮助，Android 工程师使用 gradle 的门槛不算太高，基本的配置都大同小异，只要在 Android Studio 默认生成的 build.gradle 中稍加修改，都能满足项目要求。但是深入细致的了解 gradle 的基本知识，还是能够帮助我们更优雅地实现项目的配置工作。有些场景 gradle 甚至能帮助我们完成一些业务上的需要。这节课我们就来了解一下 gradle 那些需要掌握的基本知识。

### gradle Task

Task（任务）可以理解为 gradle 的执行单元，gradle 通过执行一个个 Task 来完成整个项目构建工作。

#### 自定义 Task

我们可以在 build.gradle 中使用关键字 task 来自定义一个 Task。比如创建 build.gradle 文件，并添加 task，如图所示：


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image/M00/26/49/Ciqc1F7xxgaAK7DzAAAhdClI9Ok777.png"/> 


上图中定义了一个简单的 Task A，然后在终端中使用以下命令行执行此 Task，即可看到打印结果，如图所示：


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image/M00/26/49/Ciqc1F7xxg2ASjrQAAA-wRdqLLE574.png"/> 


从结果中可以看出，打印日志是在 gradle 的配置（Configure）阶段执行的。gradle 的构建生命周期包含 3 部分：初始化阶段、配置阶段、执行阶段。在 task A 中添加 doFirst 闭包，如下所示：


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image/M00/26/55/CgqCHl7xxhSASqSaAABAuGydsVs250.png"/> 


再次执行 gradle A，打印结果如下所示：


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image/M00/26/49/Ciqc1F7xxhuAZu1aAAB3c1S1xIY247.png"/> 


gradle 在运行期会执行所有 task 的配置语句，然后执行指定的 Task。

#### **Task 之间可以存在依赖关系**

gradle 中的 Task 可以通过 dependsOn 来指定它依赖另一个 Task，如下所示：


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image/M00/26/49/Ciqc1F7xxiaAIQLqAACWHTcmKWM251.png"/> 


在 build.gradle 中，我新加了一个 Task B，并通过 dependsOn 关键字指定 task B 依赖于 task A。 在命令行中执行"gradle B"，结果如下所示：


<Image alt="Drawing 5.png" src="https://s0.lgstatic.com/i/image/M00/26/55/CgqCHl7xxiyAXQCyAACI5K6PU3A663.png"/> 


可以看出虽然我们只是执行了 task B，但是因为依赖关系的存在，task A 也会被执行。
> gradle 会在配置 Configure 阶段，确定依赖关系。对于 Android 项目来说即为执行各个 module 下的 build.gradle 文件，这样各个 build.gradle 文件中的 task 的依赖关系就被确认下来了，而这个依赖关系的确定就是在 Configuration 阶段。

#### **gradle 自定义方法**

我们可以在 build.gradle 中使用 def 关键字，自定义方法，比如以下代码中自定义了 getDate 方法，并在 task 中使用此方法。


<Image alt="Drawing 6.png" src="https://s0.lgstatic.com/i/image/M00/26/49/Ciqc1F7xxjOAJ75wAADeC1_69tw793.png"/> 


通过 gradle 命令执行上述 task，结果如下：


<Image alt="Drawing 7.png" src="https://s0.lgstatic.com/i/image/M00/26/4A/Ciqc1F7xxjqAcNFQAAI2WxDnREo876.png"/> 


#### **系统预置 task**

自定义 task 时，还可以使用系统提供的各种显示 task 来完成相应的任务。具体就是使用关键字 type 来指定使用的是哪一个 task。

比如我在当前目录下新建 2 个文件夹：src 和 dst。目录如下：


<Image alt="Drawing 8.png" src="https://s0.lgstatic.com/i/image/M00/26/55/CgqCHl7xxkOAcKW5AAA3oZfknVQ144.png"/> 


然后在 src 中创建文件 Demo.java，代码如下


<Image alt="Drawing 9.png" src="https://s0.lgstatic.com/i/image/M00/26/4A/Ciqc1F7xxkqAObhEAABdjxnPB1E940.png"/> 


最后当前路径结构如下：


<Image alt="Drawing 10.png" src="https://s0.lgstatic.com/i/image/M00/26/55/CgqCHl7xxlOAZGmoAAA_nRw8Nyc087.png"/> 


修改 build.gradle，新添加一个 task copy 如下：


<Image alt="Drawing 11.png" src="https://s0.lgstatic.com/i/image/M00/26/55/CgqCHl7xxlmAFJTRAAAvcum9iVg859.png"/> 


然后在命令行中执行"gradle copy"，运行结束后，重新查看当前目录结构如下：


<Image alt="Drawing 12.png" src="https://s0.lgstatic.com/i/image/M00/26/55/CgqCHl7xxmCAcAt0AABFeaaAlQc750.png"/> 


可以看出 Demo.java 被拷贝了一份到 dst 目录中。

除了 Copy 之外，还有很多其他显示的 task 可用，比如我们可以通过自定义 task 实现编译 Demo.java 并将编译后的 .class 输出到某一特定路径，具体实现如下所示：


<Image alt="Drawing 13.png" src="https://s0.lgstatic.com/i/image/M00/26/55/CgqCHl7xxmaAIamAAAB21gyJhko466.png"/> 


解释说明：

1. 通过 type: JavaCompile 指定是编译 Java 类的 task；

2. source 指定需要编译类的文件路径；

3. include 指定需要编译哪一个 Java 类；

4. destinationDir 指定编译之后，生成 .class 文件的保存路径。

最后命令行中执行"gradle compile"，查看目录结构如下：


<Image alt="Drawing 14.png" src="https://s0.lgstatic.com/i/image/M00/26/4A/Ciqc1F7xxm-AGk5NAABYQ4efSLE744.png"/> 


### **gradle project**

在 Android 中每个 module 就对应着一个 project，gradle 在编译时期会为每一个 project 创建一个 Project 对象用来构建项目。这一过程是在初始化阶段，通过解析 settings.gradle 中的配置来创建相应的 Project。


<Image alt="Drawing 15.png" src="https://s0.lgstatic.com/i/image/M00/26/55/CgqCHl7xxneADC6uAAAwMY8f2jo857.png"/> 


上图 settings.gradle 中导入了 3 个 project，但是实际上还会有一个根 project，使用 ./gradlew project 查看，如下所示：


<Image alt="Drawing 16.png" src="https://s0.lgstatic.com/i/image/M00/26/4A/Ciqc1F7xxoCANfOBAAEhWOUbtnQ479.png"/> 


我们可以在根 project 中统筹管理所有的子 project，具体在 LagouGradle 路径下的 build.gradle 中进行设置，如下所示：


<Image alt="Drawing 17.png" src="https://s0.lgstatic.com/i/image/M00/26/55/CgqCHl7xxoqASIQyAAJT5Xo0vsE094.png"/> 


这样写的好处是项目中所有 module 的配置都统一写在一个地方，统筹管理。比如经常会在主项目的 build.gradle 中添加包过滤，解决依赖冲突，如下所示：


<Image alt="Drawing 18.png" src="https://s0.lgstatic.com/i/image/M00/26/4A/Ciqc1F7xxpOAT_XTAAKMtjb8INs789.png"/> 


### **buildSrc 统筹依赖管理**

随着项目越来越大，工程中的 module 越来越多，依赖的三方库也越来越多。一般情况下我们会在一个集中的地方统一管理这些三方库的版本。比如像谷歌官方推荐的使用 ext 变量，在根 module 的 build.gradle 中，使用 ext 集中声明各种三方库的版本，如下所示：


<Image alt="Drawing 19.png" src="https://s0.lgstatic.com/i/image/M00/26/56/CgqCHl7xxqWAEgffAAGk5hqywVA752.png"/> 


然后在子 module 中，引用这些版本信息。


<Image alt="Drawing 20.png" src="https://s0.lgstatic.com/i/image/M00/26/56/CgqCHl7xxq6AL2vaAAHwPPKyVNo666.png"/> 


但是这种写法有点小瑕疵：不支持 AS 的自动补充功能，也无法使用代码自动跟踪，因此可以考虑使用 buildSrc。

buildSrc 是 Android 项目中一个比较特殊的 project，在 buildSrc 中可以编写 Groovy 语言，但是现在谷歌越来也推荐使用 Kotlin 来编写编译语句。

先在根路径下创建目录 buildSrc，结构如下：


<Image alt="Drawing 21.png" src="https://s0.lgstatic.com/i/image/M00/26/4A/Ciqc1F7xxriAUHEZAABrS7D3W5Y817.png"/> 

> **注意**：这个工程的只能有一个，并且名字必须为 buildSrc。

创建好之后，在 buildSrc 中创建 build.gradle.kts 文件，并添加 Kotlin 插件。


<Image alt="Drawing 22.png" src="https://s0.lgstatic.com/i/image/M00/26/4A/Ciqc1F7xxsGAMYgAAABS_wU3BLs527.png"/> 


编译工程有可能会报错，如下所示：


<Image alt="Drawing 23.png" src="https://s0.lgstatic.com/i/image/M00/26/4A/Ciqc1F7xxsiAXosXAAG9tqr61q0366.png"/> 


只要添加 repositories { jcenter() } 仓库即可。

接下来在 buildSrc 中创建 src/main/java 目录，并在此目录下创建 Dependencies.kt（名字可随意取）。在 Dependencies.kt 中创建两个 object，分别用来管理工程中的版本信息以及依赖库。


<Image alt="Drawing 24.png" src="https://s0.lgstatic.com/i/image/M00/26/4A/Ciqc1F7xxtCAVD7QAABV55LwZYk087.png"/> 


我们可以在 Versions 中添加各种项目中可能会引用到的版本。


<Image alt="Drawing 25.png" src="https://s0.lgstatic.com/i/image/M00/26/4A/Ciqc1F7xxtiAOo-fAAHpeqvEX5Q157.png"/> 


然后在 Deps 中引用 Versions 中的变量。


<Image alt="Drawing 26.png" src="https://s0.lgstatic.com/i/image/M00/26/56/CgqCHl7xxt-ADJo0AAIfd9-Y62o105.png"/> 


最后我们就可以在各个 module 中的 build.gradle 中直接使用 Deps 中的变量用来声明依赖，比如在 app module 的 build.gradle 中添加如下依赖。


<Image alt="Drawing 27.png" src="https://s0.lgstatic.com/i/image/M00/26/4A/Ciqc1F7xxuWAFi1dAACYA6J2oxs814.png"/> 


上图中分别是使用 buildSrc 前后的对比，并且在使用 Deps 的过程中，studio 会给出自动提示，如下：


<Image alt="image.gif" src="https://s0.lgstatic.com/i/image/M00/26/56/CgqCHl7xx4GAZqZQAHlyz8uwUhg260.gif"/> 


### 总结

这节课主要介绍了 gradle 构建中的 task 和 project。

task 与大部分的开发者开发是最为紧密的，它是 gradle 构建的基本单元。我们每次编译工程时，Android studio 会在控制台打印出执行的 task 名称，类似下图中的格式。


<Image alt="Drawing 29.png" src="https://s0.lgstatic.com/i/image/M00/26/4B/Ciqc1F7xx0WAI7WuAAe7RivnMag830.png"/> 


我们也可以自定义 task 实现相同的构建需求。

project 对应的项目中的 module，每个 module 中包含一个 build.gradle，每个 build.gradle 都会被 gradle 编译成 Project 字节码。我们在 build.gradle 中所写的所有逻辑，实际上最终都会被映射成此 Project 字节码内的实现逻辑。

