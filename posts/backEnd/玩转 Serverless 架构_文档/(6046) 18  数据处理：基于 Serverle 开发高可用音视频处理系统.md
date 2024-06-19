# 18数据处理：基于Serverle开发高可用音视频处理系统

在推广 Serverless 的过程中，经常有同学问我：除了用来开发后端接口、服务端渲染应用等场景，Serverless 还能用来做什么呢？

其实，Serverless 的应用场景非常广泛，除了上述几种，它还可以用于大数据计算、物联网应用、音视频处理等。为了让你了解到更多的 Serverless 的应用场景，我准备了今天的内容。

音视频处理是一个 CPU 密集型的操作，非常消耗计算资源，以往我们处理视频就要采购大量的高性能服务器，财务成本和维护成本都很高。有了 Serverless 后，就不用再关心计算资源不足的问题，也不用担心服务器的维护，并且还能降低成本。

接下来，我先带你了解传统的音视频处理方案，然后在此基础上再带你学习并实践基于 Serverless 的音视频处理系统，这样你理解得会更加深入。

### 传统音视频处理方案

近几年，计算机技术和通信技术日新月异，信息传播的媒介也在不断演变，从文字到图片再到视频，各种短视频、直播甚至 AR、VR 等产品百花齐放。在这些产品的背后，离不开音视频处理技术。

得益于云计算的发展，有些云厂商推出了对应的视频解决方案，因此你现在要搭建一个视频处理程序是很容易的（下图就是一个典型的视频处理方案）：


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image6/M01/07/36/Cgp9HWAzRsKAW-EAAATCejrS5YI741.png"/> 
  
传统视频处理解决方案

在该方案中，我们用 OSS 来存储海量的视频内容，视频上传后用视频转码服务将不同来源的视频进行转码，以适配各种终端，然后利用 CDN 提升客户端访问视频的速度。

不过，虽然用了视频转码服务，但我们还是要购买大量的服务器，搭建自己的视频处理系统，对视频进行更高级的自定义处理，比如视频转码后将元数据存入数据库、生成视频前几秒的 GIF 图片用来做视频的封面，以及各种格式的音视频转换等。

除此之外，当我们已经在服务器上部署了一套视频处理系统后，可能还会遇到一些问题。比如，如何应对大量并发任务？能否让这个系统有更高的弹性和可用性？这些问题其实超出了视频处理本身的范围，我们的需求只是进行视频处理，但不得不面临繁重的运维工作。并且我们可能为了应对周期大量处理任务或瞬时流量，不得不购买大量的服务器，成本大幅增加，在服务器的闲置期间还造成了不必要的资源浪费。而且我们也无法 100% 利用机器的性能，这也是一种资源浪费。

而 Serverless 就能解决这些问题，基于 Serverless 你可以很轻松实现一个弹性、可扩展、低成本、免运维、高可用的音视频处理系统。

### 基于 Serverless 的音视频处理系统

从基础设施的角度来看，基于 Serverless 的音视频解决方案，**主要是替换了传统方案中的计算资源，也就是替换了服务器。**

此外，我们基于 Serverless 平台提供的丰富的触发器，也能简化编程模型。比如以往我们需要用户将视频上传到 OSS 后，再通过接口主动通知服务器进行视频处理，但在 Serverless 架构中，我们可以为函数设置 OSS 触发器，这样只要有文件被上传到 OSS 中，就可以触发函数执行，进而简化了业务逻辑。

下图就是基于 Serverless 的视频处理系统解决方案：


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M01/07/36/Cgp9HWAzRsuAb0gaAAGQSnOzXmk655.png"/> 
  
基于 Serverless 的视频处理系统

用户将视频上传后 OSS 后，触发函数计算中的视频转码函数执行，该函数对视频进行转码后，将元数据存入数据库，然后将转码后的视频再保存到 OSS 中。

接下来我们就实现一个基于 Serverless 的音视频处理系统，系统主要有以下几个功能：

* 获取视频时长；

* 获取视频元数据；

* 截取视频 GIF 图；

* 为视频添加水印；

* 对视频进行转码。

为了方便你实践，我为你提供了一份[示例代码](https://github.com/nodejh/serverless-class/tree/master/18/serverless-video)，你可以通过 git 下载查看：

```java
$ git clone https://github.com/nodejh/serverless-class
$ cd 18/serverless-video
```

代码结构如下：

```java
.
├── functions
│   ├── common
│   │   └── utils.js
│   ├── get_duration
│   │   └── index.js
│   └── get_meta
│       └── index.js
├── build.js
├── ffmpeg
├── ffprobe
├── package.json
└── template.yml
```

其中 functions 中是函数源代码，`common/utils.js`是一些公共方法，`get_duration`、`get_meta`等目录则分别对应的每个具体的功能。`build.js`是用来构建函数的脚本。在代码中，我们会使用 [FFmpeg](https://ffmpeg.org/) 进行视频处理，FFmpeg 是一款功能强大、用途广泛的开源软件，很多视频网站都在用它，比如 Youtube、Bilibili。ffmpeg 和 ffprobe 是 FFmpeg 的两个命令行工具，我们会将其作为依赖部署到 FaaS 平台（函数计算）上，这样在函数中就可以使用这两个命令来处理视频了。  

接下来就让我们学习具体如何实现。

由于这几个函数的逻辑基本类似，所以我主要针对"获取视频时长"函数进行讲解，学会了这个函数的实现就很容易理解其他函数了。另外，由于该视频处理系统用到了公共方法及依赖，所以我还会为你介绍如何部署这些函数。

#### 获取视频时长函数的实现

首先是获取视频时长的实现，也就是 get_duration 函数。我们可以通过 ffprobe 来获取视频时长，命令如下：

```c#
$ ffprobe -v quiet -show_entries format=duration -print_format json -i video.mp4
{
    "format": {
        "duration": "170.859000"
    }
}
```

其中`-print_format json`是指以 JSON 格式输出结果，`-i`是指定文件位置，可以是本地文件，也可以是网络上的远程文件。

**所以获取视频时长的函数逻辑就是：** 下载 OSS 中的文件到本地，然后运行 ffprobe 命令得到视频时长，最后返回视频时长。

为了让代码尽可能复用，所以我在`common/utils.js`中实现了一些公共方法，代码大致如下：

```javascript
// common/utils.js
// ...
/**
 * 运行 Linux 命令
 * @param {string} command 待运行的命令
 */
async function exec(command) {
  console.log(command)
  return new Promise((resolve, reject) => {
    child_process.exec(command, (err, stdout, stderr) => {
      if (err) {
        console.error(err)
        return reject(err);
      }
      if (stderr) {
        console.error(stderr)
        return reject(stderr);
      }
      console.log(stdout)
      return resolve(stdout);
    });
  });
}
/**
 * 获取 OSS Client
 * @param {object} context 函数上下文
 */
function getOssClient(context) {
  // 获取函数计算的临时访问凭证
  const accessKeyId = context.credentials.accessKeyId;
  const accessKeySecret = context.credentials.accessKeySecret;
  const securityToken = context.credentials.securityToken;
  // 初始化 OSS 客户端
  const client = oss({
    accessKeyId,
    accessKeySecret,
    stsToken: securityToken,
    bucket: OSS_BUCKET_NAME,
    region: OSS_REGION,
  });
  return client;
}
module.exports = {
  exec,
  getOssClient,
  OSS_VIDEO_NAME,
};
```

`common/utils.js`的代码主要就包含两个方法：`exec`和`getOssClient`，分别用来执行 Linux 系统命令和获取 OSS 客户端。

这样我们在`functions/get_duration/index.js`中就可以直接引入并使用了：

```javascript
// functions/get_duration/index.js
const { exec, getOssClient, OSS_VIDEO_NAME } = require("../common/utils");
/**
 * 获取视频元信息
 * @param {object} client OSS client
 */
async function getDuration(client) {
  const filePath = "/tmp/video.mp4";
  await client.get(OSS_VIDEO_NAME, filePath);
  const command = `./ffprobe -v quiet -show_entries format=duration -print_format json -i ${filePath}`;
  const res = await exec(command);
  return res;
}

module.exports.handler = function (event, context, callback) {
  // 获取 OSS 客户端
  const client = getOssClient(context);
  getDuration(client)
    .then((res) => {
      console.log("视频时长: \n", res);
      callback(null, res);
    })
    .catch((err) => callback(err));
};
```

首先注意第 20 行，我们通过 getOssClient 获取到 OSS 客户端，然后调用 getDuration 函数执行业务逻辑，也就是获取视频时长。

在 getDuration 中，我们先下载视频到临时目录`/tmp/video.mp4`中，临时目录是可以读写的，当前代码目录只能写不能读。然后在第 13 行，通过 exec 执行了获取视频时长的命令，最后将得到的结果返回。

这样获取视频时长的功能就开发完成了。

获取视频元数据等其他函数与获取视频时长的实现是非常类似的，不同之处主要在于执行的命令，也就是第 12 行的`command`变量。具体实现可以参考我的示例代码，这里就不赘述。

由于该系统包含多个函数，且函数不仅依赖了 ffmpeg ，还依赖了公共的`common/utils.js`，所以很多同学就犯难了，这些函数应该怎么部署呢？

#### 音视频处理系统的部署

让我们先回顾一下 "06 \| 依赖管理：Serverless 应用怎么安装依赖？"的内容，这一讲我们学习了函数的依赖需要一起打包上传到 FaaS 平台，所以我们需要将 ffmpeg 或 ffprobe 上传。看起来比较简单，我们直接将其放在函数代码目录并上传就可以了。

**不过这里需要注意的是，** 由于 ffmpeg 和 ffprobe 是可执行文件，最终我们需要用到这两个命令，所以在上传到 FaaS 平台之前，需要为其赋予可执行权限。

你可以通过`ls -l`来查看文件的权限：

```java
$ ls -l
-rwxr-xr-x    1 root  staff  39000328  2  9 20:59 ffmpeg
-rwxr-xr-x    1 root  staff  38906056  2  9 21:00 ffprobe
```

`-rwxr-xr-x`分为四部分：

* 第 0 位`-`表示文件类型；

* 第 1-3 位`rwx`表示文件所有者的权限；

* 第 4-6 位`r-x`是同组用户的权限；

* 第 7-9`r-x`位表示其他用户的权限。

r 表示读权限，w 表示写权限，x 表示执行权限。从文件权限可以看出，针对所有用户这两个文件都有可执行权限。

如果你的这两个文件没有执行权限，则需要通过下面的命令添加权限：

```java
$ chmod +x ffmpeg
$ chmod +x ffprobe
```

这样在 FaaS 平台上，Node.js 才可以执行这两个命令。  

解决了可执行文件的权限问题后，还有一个问题是函数的权限。

由于函数需要读写 OSS，所以我们需要为函数设置角色，并为该角色添加管理 OSS 的权限。如果你不清楚如何授权，可以复习一下 "10｜访问控制：如何授权访问其他云服务？"的内容。

在我提供的示例代码中，我在 template.yaml 的第 7 行设置了函数的角色`acs:ram::1457216987974698:role/aliyunfclogexecutionrole`，文件内容如下所示：

```yaml
ROSTemplateFormatVersion: '2015-09-01'
Transform: 'Aliyun::Serverless-2018-04-03'
Resources:
  serverless-video:
    Type: 'Aliyun::Serverless::Service'
    Properties:
      Role: acs:ram::1457216987974698:role/aliyunfclogexecutionrole
      Description: '基于 Serverless 开发高可用音视频处理系统'
    get_duration:
      Type: 'Aliyun::Serverless::Function'
      Properties:
        Handler: index.handler
        Runtime: nodejs12
        Timeout: 600
        MemorySize: 256
        CodeUri: ./.serverless/get_duration
    get_meta:
      Type: 'Aliyun::Serverless::Function'
      Properties:
        Handler: index.handler
        Runtime: nodejs12
        Timeout: 600
        MemorySize: 256
        CodeUri: ./.serverless/get_meta

      ......
```

细心的你可能发现了，在该 YAML 配置中，函数的 CodeUri 不是`./functions/get_durtion`，而是`./.serverless/get_meta`，这是为什么呢？

这主要是因为我们需要对函数代码进行构建，`./.serverless/get_duration`对应的是构建后的代码。之所以需要构建，是为了解决`common/utils.js`代码共用的问题。

如果不对代码进行构建，直接部署`functions/get_duration`中的代码，函数执行时就会报错：`Cannot find module '../common/utils`，因为`common/utils.js`不在入口函数目录中，没有部署到 FaaS 上。

要解决这个问题，就需要对代码进行构建，将函数及依赖的所有代码构建为单个文件，这样部署时就只需要部署一个文件，不涉及目录和依赖的问题了。

我们可以使用 [ncc](https://github.com/vercel/ncc) 这个工具对函数进行构建，使用方法如下：

```shell
$ ncc build ./functions/get_duration/index.js -o ./.serverless/get_duration/ -e ali-oss
```

该命令就会将`functions/get_duration/index.js`进行构建，最终会将`index.js`以及缩依赖的 exec、getOSSClient 等方法进行编译，最终合并为一个文件并输出到`./.serverless/get_duration/`目录中。

**这里还需要注意的是** `-e ali-oss`这个参数，含义是构建时，排除 ali-oss 这个依赖，也就是不将其编译到最终的`index.js`文件中。这是因为函数计算的 Node.js 运行时内置了 ali-oss 模块，所以我们的构建产物就不需要包含 ali-oss 的代码了。

处理对代码进行构建，我们还需要将 ffmpeg 和 ffprobe 复制到对应的函数目录中。最终我将这些步骤编写到了`build.js`中，内容如下：

```javascript
// build.js
const { exec } = require("./functions/common/utils");

async function build() {
  // 清空编译目录
  await exec("rm -rf .serverless/*");
  // 编译 get_duration 函数
  await exec("mkdir -p ./.serverless/get_duration");
  await exec(`ncc build ./functions/get_duration/index.js -o ./.serverless/get_duration/ -e ali-oss`);
  await exec("cp ./ffprobe ./.serverless/get_duration/ffprobe");
  // 编译 get_meta 函数
  await exec("mkdir -p ./.serverless/get_meta");
  await exec(`ncc build ./functions/get_meta/index.js -o ./.serverless/get_meta/ -e ali-oss`);
  await exec("cp ./ffprobe ./.serverless/get_meta/ffprobe");
 
  //...
}
build();
```

然后我在 package.json 中添加了两个命令：

* `build`构建函数

* `deploy`构建并部署

例如你开发完成后需要部署，就可以直接运行：

```shell
$ npm run deploy
> serverless-video@1.0.0 deploy
> npm run build && fun deploy
> serverless-video@1.0.0 build
> node build.js
rm -rf .serverless/*
mkdir -p ./.serverless/get_duration
ncc build ./functions/get_duration/index.js -o ./.serverless/get_duration/ -e ali-oss

using template: template.yml
Waiting for service serverless-video to be deployed...
    Waiting for function get_duration to be deployed...
        Waiting for packaging function get_duration code...
        The function get_duration has been packaged. A total of 2 files were compressed and the final size was 15.2 MB
    function get_duration deploy success
......
service serverless-video deploy success
```

部署成功后，我们就可以对函数进行测试了，可以直接在控制台上运行函数，也可以通过`fun invoke`执行函数：

```java
$ fun invoke get_duration
{
    "format": {
        "duration": "170.859000"
    }
}
```

### 总结

今天这一讲我们学习了怎么基于 Serverless 实现一个音视频处理系统，在代码中我们使用到了 FFmpeg 进行视频处理。同时我也为你介绍了如何通过 ncc 进行代码构建，通过 ncc 我们可以将分散在多个文件中的函数代码构建为单个文件，这样就不用担心单个函数部署后找不到依赖的问题，同时还能减小代码体积。

总的来说，我想要强调下面几点：

* Serverless 除了适合 Web 接口、服务端渲染等场景，还适合 CPU 密集型的任务；

* 基于 Serverless 开发的音视频处理系统，本身就具备弹性、可扩展、低成本、免运维、高可用的能力；

* 对于需要通过代码执行的命令行工具等依赖，部署到 FaaS 平台之前需要为其设置可执行权限；若函数依需要调用其他云产品的接口，需要为函数授予相应权限；

* 对于添加水印、视频转码等消耗资源的操作，需要为函数设置较大的内存和超时时间。

最后，本节课我留给你的作业是：亲自动手实现课上所学的视频处理程序。

