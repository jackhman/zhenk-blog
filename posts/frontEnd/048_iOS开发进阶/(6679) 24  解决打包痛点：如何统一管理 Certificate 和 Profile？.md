# 24解决打包痛点：如何统一管理Certificate和Profile？

一个优秀的 iOS 开发者所需要做的工作不仅仅是编写代码那么简单，还要管理证书（Certificates）和 Provisioning Profile、打包和签名 App、上架与分发等。你如果做过这些操作的话应该知道，单纯通过手工的方式来完成，每个步骤都需要花费大量的时间，而且十分容易出错。

那有没有什么办法能帮我们节省这些手工操作的时间呢？答案当然是肯定的。我们可以**通过 fastlane 来自动化这些操作**，所以，在这一讲中我们就来介绍下如何通过 fastlane 来统一管理证书和 Provisioning Profiles。

### 什么是证书和 Provisioning Profile

刚接触 iOS 的开发者可能都会有一个疑惑：为什么在 iOS 开发过程中需要管理私钥、证书、Provisioning Profile 以及设备列表等信息呢？

这是因为**苹果要给 App 的终端用户提供安全和稳定的体验**。而要达到这一效果，苹果就得要求所有开发者在用户安装之前必须为 App 进行打包和签名。有了这些签名，苹果就知道这些 App 到底是谁开发的，签名以后 App 是否被修改过。

这里的打包和签名操作就涉及私钥、证书和 Provisioning Profile 等组件，我们可以结合下面这张图看看这些组件之间的关系：


<Image alt="图片4.png" src="https://s0.lgstatic.com/i/image6/M00/3E/F6/Cgp9HWCbpROAFzsfAAbfDL-IX24841.png"/> 


那这些组件到底都有什么作用呢？下面我们来分别说明下。

* **苹果证书机构**。世界上有好多证书机构（CA），但当我们通过 App Store Connect 发布 App 的时候，苹果公司只认它自己的证书机构。因为苹果证书机构归苹果公司所有，所以苹果公司对安装到设备上的所有 iOS App 都有最终的控制权。

* **私钥**。这是生成签名证书所需的私钥文件，通常是一个后缀名为 .p12 的文件。私钥是证明我们身份的唯一信息源，假如丢失了这个私钥，那其他人就能伪装成我们了，非常不安全。当我们手工生成证书时，会通过 Keychain Access 程序生成一个后缀为 .certSigningRequest 的 Certificate Signing Request 文件和私钥文件，然后把 .certSigningRequest 文件上传到苹果开发者网站，苹果公司就可以通过这个请求，并使用苹果证书机构来为我们发行一个证书。

* **签名证书**。签名证书是由苹果证书机构通过提供的 .certSigningRequest 文件所签发的，因此苹果公司知道这个证书的所有人。苹果公司会把这个证书作为签名主体。签名证书通常是一个后缀名为 .cer 的文件，该 .cer 文件包含了开发者 ID、团队 ID 和公钥信息。

* **发布渠道**。我们可以把 App 通过不同渠道发布出去，目前支持的渠道有 Development、Ad Hoc、Enterprise 和 App Store。当我们在 Xcode 上把 App 部署到设备进行 Debug 时，一般会使用 Development 渠道。当我们把 App 分发给内部测试用户时，可以使用 Ad Hoc 渠道。如果开发企业内的 App，可以使用 Enterprise 渠道来发布。而对于要上传到 App Store 的 App，就必须使用 App Store 渠道了。

* **App ID**。每个 App 都有唯一的 ID。根据不同的用途，我们为 Moments App 建立了三个 App ID，分别用于开发与调试、内部测试和上架 App Store。

* **设备列表**。当我们通过 Ad Hoc 渠道来发布 App 时，要把需要安装 App 的设备添加到设备列表中，只有在设备列表中的设备才能安装 Ad Hoc 渠道的 App。

* **Provisioning Profile**。有了证书以后，我们可以为不同的 App ID 以及不同的发布渠道来生成不同的 Provisioning profile，通常是一个后缀名为 .mobileprovision 或 .provisionprofile 的文件。该文件包含 App ID 所指向的 Entitlements 信息，以及发布渠道、团队 ID 和设备列表信息。我们通常为不同用途的 App 生成不同的 Provisioning Profile，例如我们为 Moments App 的 App Store 版本生成一个 Provisioning Profile，然后再为 Moments App 的 Internal 版本生成另外一个 Provisioning Profile。

### 搭建管理证书和 Provisioning Profile 的环境

假如你手工生成过私钥、证书和 Provisioning Profile 文件，并在苹果开发者网站上进行过上传、下载和安装的话，就知道这些操作过程有多麻烦。

* 有些团队会为每个成员生成多个不同的证书来进行签名，这将导致大量证书和 Provisioning Profile 文件的出现，十分难管理。

* 证书都是有期限的，每次延展期限都需要手工更新所有的 Provisioning Profiles。

* 当添加新增设备时，也需要更新 Ad Hoc 的 Provisioning Profiles。

* 当搭建 CI 的时候，又需要花大量时间来下载、安装私钥、证书和 Provisioning Profiles 文件。

那有没有什么办法来简化证书和 Provisioning Profiles 的管理工作呢？幸运的是**fastlane 为我们提供了一个名叫 match 的 Action 来为整个团队统一管理并共享所有证书和 Provisioning Profile**。

下面我们就来看一下如何使用 fastlane 的 match Action 搭建所需的环境吧。

#### 建 GitHub 私有 Repo

为了把证书共享给整个团队使用，fastlane match 需要把私钥和证书保存在云端的存储服务上。目前支持的云存储服务有亚马逊的 S3、谷歌云和微软的 Azure 等。但**我推荐使用 GitHub 私有 Repo 来存储私钥和证书，因为 GitHub 私有 Repo 是免费的，而且有详细的修改历史**。Moments App 的证书就保存在 GitHub 的私有 Repo 里面，下面我们讲一下如何搭建 GitHub 私有 Repo。

我们可以点击 GitHub 网站右上角的加号（+）按钮，然后选择 New repository 菜单来新建私有 Repo。因为该 Repo 用于签名，所以我会以"\<项目名称\>-codesign"的方式来命名，例如叫 moments-codesign。具体页面情况如下图所示：


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M00/3D/C3/CioPOWCWMc2ASbGgAAEeGAfOCoA064.png"/> 


这里需要注意：**我们必须把 Repo 设置为 Private，因为该 Repo 保存了私钥等关键信息**，一旦设置为 Public 的话，所有人都可以访问它了。

#### 生成 GitHub Access Token

**那怎样才能让整个团队都能访问这个私有 Repo 呢？答案是使用 GitHub Access Token。**

我推荐的做法是为每一个 App 新建一个 GitHub 账户，例如新建一个叫作 momentsci 的账户，然后把该账户添加到私有 Repo 的贡献者列表里面。如下图所示：


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image6/M00/3D/C3/CioPOWCWMdSAYvK7AADj0dRNEHo360.png"/> 


这样子，momentsci 用户就能访问和更新该私有 Repo 了。

下一步是为 momentsci 用户生成 GitHub Access Token。当我们通过 momentsci 登录到 GitHub 以后，点击 Settings -\> Developer settings -\> Personal access tokens 来打开来配置页面，接着再点击 Generate new token 按钮，在 Note 输入框填写 Token 的用途，比如写上"用于 Moments App 的 CI"，然后在 Select scopes 选上 repo，如下图所示：


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image6/M00/3D/C3/CioPOWCWMdyAGRYeAAGmH0NcYDk620.png"/> 


因为我们选择了 Full controll of private repositories（能完全控制所有私有 Repo），所以使用该 Token 的应用程序（例如 fastlane）就有权限访问 momentsci 用户所能访问的所有 Repo，并且能 push commit 到这些 Repo 去。当我们点击 Generate token 按钮以后就生成一个如下图所示的 Token：


<Image alt="图片5.png" src="https://s0.lgstatic.com/i/image6/M01/3E/F6/Cgp9HWCbpVKAIJRSAAQzSVGBgVk131.png"/> 


这里需要注意，我们**一定要好好保存这个 Token**，因为一旦关闭该页面以后就无法再从 GitHub 上找到该 Token 了。为了使得团队所有人都可以使用到这个 Token，我推荐把它存放在团队密码共享服务里面，目前比较流行的密码共享服务有 LastPass、OnePassword 等。

有了这个 Token 以后，我们还需要生成一个 BASE64 字符串提供给 fastlane 使用，命令如下：

```java
$> echo -n your_github_username:your_personal_access_token | base64
```

不过需要把 your_github_username 替换为 GitHub 用户名，例如 momentsci 用户，然后把 your_personal_access_token 替换成刚才所生成的 Token。

接着就可以在 Shell 里把 BASE64 赋值给环境变量`MATCH_GIT_BASIC_AUTHORIZATION`，如下所示：

```java
$> export MATCH_GIT_BASIC_AUTHORIZATION=<YOUR BASE64 KEY>
```

为了提高安全性，我们还可以配置环境变量`MATCH_PASSWORD`来加密私钥、证书和 Provisioning Profile 文件。但是需要注意：**一定要记住这个密码，因为使用这些文件的机器都需要使用到该密码**。

```java
$> export MATCH_PASSWORD=<YOUR MATCH PASSWORD>
```

#### 生成 App Store Connect API Key

因为生成证书和 Provisioning Profile 的过程需要与苹果开发者网站进行交互，所以 fastlane 也需要具备访问苹果开发者网站的权限。

目前 fastlane 提供了几种办法来访问苹果开发者网站，例如，输入登录所需的用户名和密码等。但**我推荐使用 App Store Connect API Key 的方式**，因为 API Key 既能有效控制访问权限，也可以随时让该 Key 失效。

我们可以在 App Store Connect 网站上生成该 Key，在网站上选择 Users and Access -\> Keys -\> App Store Connect API，然后点击加号（+）来生成 Key，会弹出下面的输入框：


<Image alt="图片7.png" src="https://s0.lgstatic.com/i/image6/M01/3E/F7/Cgp9HWCbpZiAbIChAAC_Yq3o-fE466.png"/> 


Key 的名称可以填写其用途，例如使用到 CI 上我们就填 "Moments CI"，然后在 Access 里选择 App Manager。需要注意：**必须选择 App Manager 以上的权限**，因为使用 App Manager 以下的权限，fastlane 在执行过程中会出错。这是 fastlane 的一个已知的问题，假如以后解决了该问题，我们就可以选择 Developer 权限，原则上是该 Key 的 Access 权限越低就越安全。

当 Key 生成完毕后，我们需要把它保存起来，并在 Shell 里把该 Key 赋值给环境变量`APP_STORE_CONNECT_API_CONTENT`，如下所示：

```java
$> export APP_STORE_CONNECT_API_CONTENT=<App Store Connect API>
```

到这里，管理证书和 Provisioning Profile 的环境就配置完了。配置的步骤虽然有点多，但是**每个项目只需配置一次就好了，其他项目成员无须重复配置**。为了进一步简化环境变量的赋值操作，我推荐在项目根目录下建立一个名叫 local.keys 的文件，然后把所有环境变量都放在该文件里面，如下所示：

```java
APP_STORE_CONNECT_API_CONTENT=<App Store Connect API for an App Manager>
GITHUB_API_TOKEN=<GitHub API token for accessing the private repo for certificates and provisioning profiles>
MATCH_PASSWORD=<Password for certificates for App signing on GitHub private repo>
```

接着在根目录执行以下的命令：

```java
$> source ./scripts/export_env.sh
```

这样就能把所有环境变量一次性导入当前的 Shell 里面，不过注意，这里需要使用`source`命令，否则环境变量只会导出到子 Shell 里面。

这里还需要提醒一下，因为我们不应该把机密信息上传到 Git 服务器上，所以该 local.keys 文件需要配置到 .gitignore 文件里面。

### 使用 fastlane 管理证书和 Provisioning Profile

有了上述的环境搭建与配置，我们就可以使用 fastlane 来统一管理证书和 Provisioning Profile 了。

#### 生成证书和 Provisioning Profile

第一步是生成证书和 Provisioning Profile，每个项目也只需执行一次这样的操作。

为了简化，我把生成证书和 Profile 的操作都封装在`create_new_profiles`Lane 里面，只需要执行`bundle exec fastlane create_new_profiles`命令即可，该 Lane 的具体代码如下：

```ruby
desc "Create all new provisioning profiles managed by fastlane match"
lane :create_new_profiles do
  api_key = get_app_store_connect_api_key
  keychain_name = "TemporaryKeychain"
  keychain_password = "TemporaryKeychainPassword"
  create_keychain(
    name: keychain_name,
    password: keychain_password,
    default_keychain: false,
    timeout: 3600,
    unlock: true,
  )
  match(
    type: "adhoc",
    keychain_name: keychain_name,
    keychain_password: keychain_password,
    storage_mode: "git",
    git_url: "https://github.com/JakeLin/moments-codesign",
    app_identifier: "com.ibanimatable.moments.internal",
    team_id: "6HLFCRTYQU",
    api_key: api_key
  )
  match(
    type: "appstore",
    keychain_name: keychain_name,
    keychain_password: keychain_password,
    storage_mode: "git",
    git_url: "https://github.com/JakeLin/moments-codesign",
    app_identifier: "com.ibanimatable.moments",
    team_id: "6HLFCRTYQU",
    api_key: api_key
  )
end
```

该 Lane 主要由三部分组成。

第一部分是调用`create_keychain`Action 来生成 Keychain。因为 fastlane 所生成的私钥和证书都需要保存在 Keychain 里，所以我们要生成一个 Keychain 来保存它们。为了不影响默认的 Keychain，我们把`false`传递给`default_keychain`参数，表示生成的 Keychain 不是默认的 Keychain。

第二部分是通过指定 Ad Hoc 作为发布渠道来为 Internal App 生成证书和 Provisioning Profile，并把它们上传到 GitHub 私有 Repo，这样我们就能使用这个 Provisioning Profile 为 Internal App 进行签名和打包。

第三部分与第二部分非常类似，也是用于生成证书和 Provisioning Profile。不同的是它生成了发布渠道为 Appstore 类型的 Provisioning Profile，有了该 Provisioning Profile，我们就能为 AppStore 版本的 App 进行签名和打包。

你可能发现，我们调用了私有 Lane`get_app_store_connect_api_key`来获取`api_key`变量的值。该私有 Lane 的定义如下：

```ruby
desc 'Get App Store Connect API key'
  private_lane :get_app_store_connect_api_key do
    key_content = ENV["APP_STORE_CONNECT_API_CONTENT"]
    api_key = app_store_connect_api_key(
      key_id: "D9B979RR69",
      issuer_id: "69a6de7b-13fb-47e3-e053-5b8c7c11a4d1",
      key_content: "-----BEGIN EC PRIVATE KEY-----\n" + key_content + "\n-----END EC PRIVATE KEY-----",
      duration: 1200,
      in_house: false
    )
    api_key 
  end
```

该私有 Lane 从环境变量中读取了`APP_STORE_CONNECT_API_CONTENT`的值，然后通过调用`app_store_connect_api_key`Action 来获取临时的 App Store Connect API Key。其中，`key_id`和`issuer_id`的值都可以在 App Store Connect 的 Keys 配置页面上找到。

如果你没有为 GitHub 配置全局的用户名和邮箱，那么在执行`bundle exec fastlane create_new_profiles`命令时可能会出错。你可以通过下面的命令来解决这个问题，在命令执行完之后还可通过`git config --global --edit`命令把这些配置删掉。

```java
$> git config --global user.email "MomentsCI@lagou.com"
$> git config --global user.name "Moments CI"
```

当`create_new_profiles`命令成功执行以后，你可以在私有 Repo 上看到两个新的文件夹，如下图所示：


<Image alt="图片8.png" src="https://s0.lgstatic.com/i/image6/M01/3E/F7/Cgp9HWCbpdWASXy9AAJKo3Mqtpg236.png"/> 


其中，**certs 文件夹用于保存私钥（.p12）和证书（.cer）文件，而 profiles 文件夹则用来保存 adhoc 和 appstore 两个 Provisioning Profile 文件**。

你也可以在苹果开发者网站查看新的证书文件：


<Image alt="图片9.png" src="https://s0.lgstatic.com/i/image6/M01/3E/F7/Cgp9HWCbpfqAKc17AAFyb88k84o360.png"/> 


同时还可以看到 Provisioning Profile 文件：


<Image alt="图片10.png" src="https://s0.lgstatic.com/i/image6/M00/3E/FF/CioPOWCbpheAOxNSAAFxbPkMv1o580.png"/> 


除此之外，你还可以在 Keychain App 里面找到新增的私钥和证书，如下图所示：


<Image alt="Drawing 9.png" src="https://s0.lgstatic.com/i/image6/M00/3D/C3/CioPOWCWMyeAQN7wAAOKWo3am2o738.png"/> 


#### 下载证书和 Provisioning Profile

一个项目只需要执行一次生成证书和 Provisioning Profile 的操作，其他团队成员可通过`bundle exec fastlane download_profiles`命令来下载证书和 Provisioning Profile。该 Lane 的代码如下：

```ruby
desc "Download certificates and profiles"
lane :download_profiles do
  keychain_name = "TemporaryKeychain"
  keychain_password = "TemporaryKeychainPassword"
  create_keychain(
    name: keychain_name,
    password: keychain_password,
    default_keychain: false,
    timeout: 3600,
    unlock: true,
  )
  match(
    type: "adhoc",
    readonly: true,
    keychain_name: keychain_name,
    keychain_password: keychain_password,
    storage_mode: "git",
    git_url: "https://github.com/JakeLin/moments-codesign",
    app_identifier: "com.ibanimatable.moments.internal",
    team_id: "6HLFCRTYQU"
  )
  match(
    type: "appstore",
    readonly: true,
    keychain_name: keychain_name,
    keychain_password: keychain_password,
    storage_mode: "git",
    git_url: "https://github.com/JakeLin/moments-codesign",
    app_identifier: "com.ibanimatable.moments",
    team_id: "6HLFCRTYQU"
  )
end
```

你会发现`download_profiles`和`create_new_profiles`两个 Lane 的实现非常类似，都是由三部分组成，包括生成 Keychain、下载 Internal App 的证书和 Provisioning Profile 以及 AppStore 版本 App 的证书和 Provisioning Profile。不同的地方是`download_profiles`Lane 不需要更新 App Store Connect，所以无须使用 App Store Connect 的 API Key；并且`download_profiles`Lane 也不需要更新私有 Repo 的内容，所以在调用`match`Action 时，我们会把`true`传递给`readonly`参数。

#### 新增设备

当我们通过 Ad Hoc 的方式来分发 App 时，必须把需要安装 App 的设备 ID 都添加到设备列表里面，你可以在苹果开发者网站的"Certificates, Identifiers \& Profiles"的 Devices 下查看所有设备信息。如下图所示：


<Image alt="图片11.png" src="https://s0.lgstatic.com/i/image6/M00/3E/FF/CioPOWCbpj2AYt-xAAFbLA-2M_0002.png"/> 


但是手工更新设备列表的操作比较麻烦，而且更新完以后还需要再更新 Provisioning Profile。幸运的是 fastlane 能帮我们自动化这些操作，我们把这些操作都封装在`add_device`Lane 里面，具体代码如下：

```ruby
desc "Add a new device to provisioning profile"
lane :add_device do |options|
  name = options[:name]
  udid = options[:udid]
  # Add to App Store Connect
  api_key = get_app_store_connect_api_key
  register_device(
    name: name,
    udid: udid,
    team_id: "6HLFCRTYQU",
    api_key: api_key
  )
  # Update the profiles to Git private repo
  match(
    type: "adhoc",
    force: true,
    storage_mode: "git",
    git_url: "https://github.com/JakeLin/moments-codesign",
    app_identifier: "com.ibanimatable.moments.internal",
    team_id: "6HLFCRTYQU",
    api_key: api_key
  )
end
```

首先调用`register_device`Action 把设备更新到苹果开发者网站上的设备列表里面，然后把`true`传递给`force`参数来调用`match`Action，这个操作能强制更新 Ad Hoc 的 Provisioning Profile 并上传到私有 Repo 里。这样当其他机器在调用`download_profiles`命令的时候，就能获取最新的 Provisioning Profile 了。

### 总结

在这一讲中，我们讲述了如何使用 fastlane 的 match Action 来帮我们统一管理签名和打包所需的私钥、证书和 Provisioning Profile 文件。

在实际项目中，我们只需要**一次性完成搭建的任务** ，例如生成私钥 Repo、导出 Github Access Token 和 App Store Connect API Key，以及调用`create_new_profiles`来生成所需的证书和 Provisioning Profile。其他团队成员和 CI 服务器就可以通过调用`download_profiles`来下载证书。当需要为 Ad Hoc 发布渠道添加新设备时，只需要执行`add_device`即可。

有了`download_profiles`和`add_device`等命令，团队里任何人都可以轻松地下载打包和签名所需的私钥、证书和 Provisioning Profile 文件，无须手工使用 Keychain Access 程序来管理私钥，无须登录到苹果开发者网站下载和安装证书，无须到苹果开发者网站上手工添加设备，无须重新生成 Provisioning Profile 等。这样能减少大量无聊而且容易出错的手工操作工作，让我们把有效的时间都花在功能开发与迭代上。

**思考题**
> 在 Moments App 中，我们为 Debug Target 使用了 Automatically manage signing 的方式来管理证书和 Provisioning Profile。这里请你思考一下，这样做有什么好处呢？

可以把你的答案写到留言区哦。下一讲我将介绍如何使用自动化构建来解决大量重复性工作的问题。

**源码地址**
> Fastfile 文件地址：[https://github.com/lagoueduCol/iOS-linyongjian/blob/main/fastlane/Fastfile#L72-L207](https://github.com/lagoueduCol/iOS-linyongjian/blob/main/fastlane/Fastfile#L72-L207?fileGuid=xxQTRXtVcqtHK6j8)

