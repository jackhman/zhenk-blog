# 12安全生产（二）：如何提高Serverle应用的安全性？

今天我们继续聊一聊关于 Serverless 应用安全生产的话题。

上一讲，我们讨论了 Serverless 应用安全性面临的挑战，以及主要风险，相信你对 Serverless 应用的安全性已经有了初步的了解，这一讲我就带你针对性地规避这些风险。

我们先简单回顾一下上一讲中 10 个主要的风险：


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image/M00/92/44/Ciqc1GARKLOAQ01ZAAKkVYv1kfc133.png"/> 


针对这 10 个风险，我总结了一些应对措施，主要涉及减少代码漏洞、正确使用访问控制、增强数据安全防护、提升应用可观测性四个方面。

### 减少应用代码漏洞

和传统应用一样，Serverless 应用的很多安全风险都是代码漏洞导致的，因此正确编程、减少应用代码漏洞，就可以避免很多安全风险。接下来，我分享一些自己的实践经验，希望给你启发。

* **不要相信任何用户输入**

由于 Serverless 应用的攻击面更多，攻击手段更复杂，所以你永远不要相信任何输入，也不能对输入进行有效性假设。这就要求你验证用户输入或触发器数据（比如用户参数），或执行 SQL 时对参数进行预处理。

* **使用安全的第三方依赖**

为了避免第三方依赖带来的风险，你需要使用安全的依赖，做法包括：

1. 维护项目的依赖及版本，比如 pakcage.json 或 pom.xml 的作用都是维护依赖版本；

2. 扫描依赖项，找出并去掉存在漏洞的版本，并且我建议你将依赖版本扫描作为 CI/CD 的一部分，这样在发布时就可以去掉有漏洞的依赖；

3. 删除不必要的依赖，尤其是当 Serverless 应用不需要此依赖时；

4. 仅从可信赖的资源中使用第三方依赖；

5. 将不推荐使用的依赖更新到最新版本。

另外，你也可以从一些公开的安全漏洞披露平台中浏览某个依赖有没有安全漏洞，比如：

* [Node.js 模块中的已知漏洞](https://nodesecurity.io/advisories)；

* [Java 中的已知漏洞](https://cve.mitre.org/cgi-bin/cvekey.cgi?keyword=java)；

* [Python 相关技术中的已知漏洞](https://cve.mitre.org/cgi-bin/cvekey.cgi?keyword=python)。

* **正确地处理程序异常**

对于生产环境中的代码，需要避免打印冗长的错误信息。在可以自定义错误的场景下（比如通过 API 提供 HTTP 请求响应），建议你只为用户提供简单的错误消息，不要显示有关任何内部实现的堆栈或环境变量的详细信息。

此外应用也要进行合适的错误处理，当出现意外输入时，也要确保代码不会 "挂起"，并且需要严格测试所有边界情况，考虑所有可能导致函数超时的输入。

* **通过 API 网关确保 API 安全**

使用 Serverless 最常见的场景之一就是构建 API。

**基于 Serverless 构建 API 时，我建议你将函数和 API 网关一起使用。** API 网关可以用来创建、发布、维护、监控和保护 API，通过 API 网关可以很容易实现 API 的流量控制、监控报警、版本记录等功能。几乎所有 FaaS 平台都支持通过 API 网关触发函数执行。基于 API 网关触发器时，用户发起一个请求后，请求首先会被 API 网关处理，然后 API 网关将请求转发到函数，这样就达到了保护 API 的目的。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image/M00/90/4F/Ciqc1GAKr9uAM8zoAAGDujlP-TA203.png"/> 
  
API 网关触发器

### 正确使用访问控制

访问控制是使用云产品时非常重要的功能，尤其是在规模比较大的团队中，访问控制可以用来限制不同用户能够操作的资源。

但很多同学对访问控制使用得不合理，这会增加 Serverless 应用的安全风险。接下来，我带你学习怎么正确使用访问控制，进而提升 Serverless 应用的安全性。

* **为用户和角色配置最小的权限**

为了减少访问凭证泄漏带来的风险，建议你使用访问控制来管理每个函数具有的权限，并确保每个函数都有且仅有运行时所需要的最小权限。这个过程可能会很复杂，但对应用安全是十分必要的。要正确地配置函数的权限，你需要对云厂商的访问控制有深入的了解（我在 10 讲已经介绍了，如果你忘了，可以复习一下）。

除了人工配置每个函数的权限，你也可以使用一些开源的工具来保证函数的最小权限，比如 PureSec 的最小权限插件 [serverless-puresec-cli](https://github.com/puresec/serverless-puresec-cli/)，不过该插件只适用于 AWS Lambda。

* **使用临时访问凭证**

当使用代码对云产品进行编程访问时，就会用到访问凭证（即 AccessKeyId 和 AccessKeySecret）。在 Serverless 函数中，建议你尽可能使用临时访问凭证，而不是直接在代码中配置固定的访问凭证。因为临时访问凭证有过期时间，这样就降低了访问凭证泄漏后的风险，进而提高 Serverless 安全性。

举个例子，假如你需要在函数中访问读写存储中的文件，可以使用固定访问凭证，代码如下：

```javascript
/**
 * 使用固定访问凭证
 */
const accessKeyId = 'xxx';
const accessKeySecret = 'xxx';
module.exports.handler = function (event, context, callback) {
    // 初始化 OSS 客户端
    const store = oss({
        accessKeyId,
        accessKeySecret,
        stsToken: securityToken,
        bucket: 'role-test',
        region: 'oss-cn-beijing'
    });
    // 获取文件
    const result = await store.get('hello.txt');
    return result.content.toString();
};
```

也可以使用函数执行时的临时访问凭证，代码如下：

```javascript
/**
 * 使用临时访问凭证
 */
module.exports.handler = function (event, context, callback) {
    // 获取函数计算的临时访问凭证
    const accessKeyId = context.credentials.accessKeyId;
    const accessKeySecret = context.credentials.accessKeySecret;
    const securityToken = context.credentials.securityToken;
    // 初始化 OSS 客户端
    const store = oss({
        accessKeyId,
        accessKeySecret,
        stsToken: securityToken,
        bucket: 'role-test',
        region: 'oss-cn-beijing'
    });
    // 获取文件
    const result = await store.get('hello.txt');
    return result.content.toString();
};
```

由于固定访问凭证是写在代码中的，代码泄漏了，访问凭证就泄漏了。而临时访问凭证是每次执行时生成的，所以更安全。

### 增强数据安全防护

在上一讲中，我提到了云上安全责任分担模型，应用所有者要负责运行在云上的应用、代码、数据......的安全，所以接下来我就带你了解几种云上数据安全防护的方案。

* **对云上的数据进行加密**

云上的数据主要有两部分：云上存储的数据（比如存放在云存储中的数据）；云上传输的数据(比如函数间进行数据通信)。

为了避免敏感数据从云存储等基础云服务中泄漏，很多云厂商强化了云存储的配置，提供了多重身份认证、数据加密等功能。比如 AWS S3 支持 KMS 加密、阿里云对象存储也支持阿里云 KMS 加密。

为了避免中间人攻击，导致传输过程中的数据泄漏，建议你使用 TLS 协议对函数通信、网络请求等传输数据进行加密。

* **对应用配置进行加密**

几乎每个应用都会有很多配置，比如数据库账号密码、访问凭证等，这些信息会在不同的应用、代码、环境变量中进行传输，只要其中有一个环节有漏洞，就会导致数据泄漏。应用配置数据泄漏，会造成很严重的后果， 因此一定要避免在代码中定义明文配置，要对这些配置进行加密。那么如何对配置进行加密呢？你可以使用云厂商提供的一些密钥管理服务，例如：

1. AWS Secrets Manager；

2. Azure 密钥保管库；

3. 阿里云密钥管理服务；

4. Google Cloud KMS。

* **使用 Serverless 相关的身份认证服务**

为了避免没有权限的用户访问数据，你也需要对访问请求进行身份认证。我上一讲一直强调： Serverless 应用由成百上千离散的函数组成，身份认证十分复杂，所以我不建议你构建自己的身份认证方案，建议用 Serverless 相关运行身份验证功能，比如：

1. AWS Cognito 或单点登录；

2. AWS API Gateway；

3. 阿里云 API 网关；

4. 腾讯云 API 网关；

5. Azure 应用服务身份认证和授权；

6. Google Firebase 身份认证。

另外，在不能进行交互式身份认证（比如通过 API 认证）的情况下，你应该使用安全的访问凭证、客户端证书等方式进行身份认证。

### 提升应用可观测性

由于 Serverless 应用可观测性不足，遇到安全攻击可能难以第一时间发现，发现安全问题也难以快速定位并恢复，所以导致 Serverless 面临着比传统应用更大的安全风险。下面就为你介绍如何提升 Serverless 应用的可观测性。

* **记录函数日志并设置报警**

传统应用直接运行在服务器上，你可以直接将日志输出到机器上，遇到问题后可以直接登录机器查看日志。但 Serverless 屏蔽了底层机器，所以你需要将日志输出到统一的日志存储服务，这样才能更方便查看问题。比如 Lambda 可以将日志输出到 CloudWatch Logs，函数计算可以将日志输出到日志服务。

统一记录日志后，建议你对日志配置报警，这样才能及时发现问题。为了实时了解函数的运行情况，你需要针对函数的并发、节流、超时等异常情况设置报警。另外我也强烈建议你针对云账号的账单设置报警，尽可能避免预期外的费用。

* **使用配置审计监控资源的配置变化**

由于 Serverless 函数是在云上运行的，函数本身就有很多配置，比如内存、CPU 和并发限制等。此外，函数依赖的云服务也有很多配置，比如数据库规格等。一旦某个配置发生变化，很可能对应用运行造成影响，**所以我建议你**使用云厂商提供的配置审计功能来检测云资源的配置变化，比如 AWS Config 和阿里云配置审计。

基于配置审计，你可以持续监控函数配置或代码更改，并通过规则判断配置更改是否符合预期，我总结了一些常见的规则，希望给你启发。

1. **检测函数是否通过控制台创建：** 对于复杂的 Serverless 应用，通常会有一套完善的 CI/CD 流程，而不是直接在控制台上创建函数，因此可以使用此规则找出在控制台上创建的不合规的函数。

2. **检测使用同一个角色的多个函数：** 通常我们会保持一个函数一个角色的原则，这样才能更好地实现函数权限最小化。

3. **检测配置了多个不同触发器的函数：** 通常我们会保持一个函数一个触发器，这样才能保证函数单一职责，如果函数有多个触发器，则会增加函数的攻击面。

4. **检测使用通配符 (\*) 权限的函数：** 通配符通常意味着更多的权限，这就违背了函数最低权限的原则。

除了上面 4 条，你还可以定义很多自己的规则。总的来说，基于配置审计，你可以持续发现资源配置的变化，一旦某个资源配置不符合预期，你能及时发现并进行改进了。

* **使用操作审计记录云上所有操作事件**

对于云上的函数，除了配置变化，你还要关注资源本身的变化，比如函数创建删除，以及其他任何资源的创建、删除和更新。如果某个用户误删或恶意删除了某个资源，你要及时收到报警并处理，尽可能避免影响变大。**这时你就可以使用云厂商的操作审计服务了，比如 AWS**CloudTrail、阿里云操作审计。

操作审计持续记录了云账号在云上的所有操作日志，操作日志通常包含了资源的变更时间以及操作者，你可以对这些数据进行实时导出并进行分析处理，这样基于操作日志，你就可以对敏感操作（比如删除函数）进行报警，并且也能基于操作日志进行问题排查。

### 总结

今天，我针对 11 讲提及的10个主要风险，分享了一些实践经验，希望让你有所收获，因为11 讲和 12 讲的信息偏多，所以我整理了一张导图，帮你回顾上两讲的重点内容：


<Image alt="Serverless 安全生产-竖.png" src="https://s0.lgstatic.com/i/image/M00/92/40/CgqCHmARAaKAdEvcAAzvYrkQgpQ210.png"/> 


由于国外 Serverless 技术起步比较早，大家对安全性也比较重视，所以国外已经有一些第三方的 Serverless 安全性相关的产品，比如 [Prisma Cloud](https://www.paloaltonetworks.com/prisma/cloud/cloud-workload-protection-platform)、[CloudGuard](https://www.checkpoint.com/products/cloudguard-serverless-security/)、[Aquasec](https://www.aquasec.com/products/serverless-container-functions/)，而国内目前几乎是一片空白，很多安全防护方案都需要开发者自己建设，所以"怎么提高 Serverless 应用的安全性？ "在我看来，就是多了解云厂商 Serverless 相关产品的功能和使用方式，**用好，用对才是最重要。**


<Image alt="玩转 Serverless 架构11金句.png" src="https://s0.lgstatic.com/i/image/M00/92/4F/CgqCHmARKJiAS7WoAAE8KFXevfk360.png"/> 


本节课我留给你的作业是，除了本节课中讲到的，你还知道哪些针对 Serverless 架构中的安全风险的解决方案呢？感谢你的阅读，我们下一讲见。

