# 18不只HTTP，玩转WebService接口测试

通过前面课时的讲解，我们已经对如何进行 UI 自动化和接口自动化测试有了相当深刻的理解。但是对于接口测试的分享，在前面课程的讲解中，我主要讲解了基于 HTTP 的 RESTFUL 的接口。

实际上，接口有很多形式，除了我们常见的 HTTP 形式的 RESTFUL 接口外，还有 Web Services 类型的接口，以及 RPC 接口。不同类型的接口测试方式各有不同。

今天我们就来看下，如何测试 Web Services 类型的接口，这节课的内容如下：


<Image alt="图片9.png" src="https://s0.lgstatic.com/i/image/M00/6A/99/Ciqc1F-pCv6AaQg5AAYAaUPRT5M790.png"/> 


### 什么是 Web Services？

Web Service 是一种跨编程语言和跨操作系统平台的远程调用技术。

通俗一点说，Web Service 就是一个应用程序，它**通过向外界暴露一个能够通过 Web 进行调用的 API 来对外提供服务**。WebService 可以跨编程语言和跨操作系统，即你的客户端程序和提供服务的服务端程序可以采用不同的编程语言，使用不同的操作系统。

举个例子来说，通过 WebServices，你运行在 windows 平台上的、以 C++ 编写的客户端程序就可以和运行在 Linux 平台上的，以 Java 编写的服务器程序进行通信。

### Web Services 构成及调用原理

Web Service 平台的构成，依赖以下技术：

* **UDDI**意为统一描述、发现和集成（Universal Description, Discovery, and Integration）,它是一种目录服务，通过它企业可注册并搜索 Web services，它是基于 XML 的跨平台描述规范。

* **SOAP**是一种简单的基于 XML 的协议，它使应用程序通过 HTTP 来交换信息。

* **WSDL**是基于 XML 的，用于描述 Web Services，以及如何访问 Web Services 的语言。

Web service 的调用原理如下：


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image/M00/6A/A3/CgqCHl-pCsSAD1CUAAFHQFINvZY722.png"/> 


* Step 1. 客户端想调用一个服务，但是不知道去哪里调用，于是它向 UDDI 注册中心（UDDI Registry）询问；

* Step 2. UDDI 注册中心，发现有个名字为 Web Service A 的服务器，可以提供客户端想要的服务；

* Step 3. 客户端向 Web Service A 发送消息，询问应该如何调用它需要的服务；

* Step 4. Web Service A 收到请求，发送给客户端一个 WSDL 文件。这里记录了 Web Service A 可以提供的各类方法接口；

* Step 5. 客户端通过 WSDL 生成 SOAP 请求（将 Web Service 提供的 xml 格式的接口方法，采用 SOAP 协议封装成 HTTP 请求），发送给 Web Service A，调用它想要的服务；

* Step 6. Web Service A 按照 SOAP 请求执行相应的服务，并将结果返回给客户端。

### Web Services 接口和 API（应用程序接口）的区别

Web Services 接口和我们常用的 API（应用程序接口）有哪些区别呢？下面的表格展示了它们的区别：  

<Image alt="图片3.png" src="https://s0.lgstatic.com/i/image/M00/6A/A4/CgqCHl-pCtaAIlaHAAGumDmnrfI772.png"/> 


在我们的日常工作中，接口是以 Web Service、API，还是 RESTFUL API 形式提供给我们测试，常常取决于业务的实际情况。

### Web Services 接口实战

通过前面的讲解我们了解，WSDL 是 Web Services 生成给客户端调用的接口服务描述。通过 WSDL，客户端就可以构造正确的请求发送给服务端。

在实际工作中也是如此，对于 Web Services 形式的接口，开发提供的往往就是一个 WSDL 格式的链接。比如，下面的一个链接就是一个公用的 Web Servbice 服务接口：

```java
# IP地址服务
http://www.webxml.com.cn/WebServices/IpAddressSearchWebService.asmx?wsdl
```

#### 1.suds - SOAP 客户端

在 Python 中，客户端调用 Web Service 可以通过 suds 这个库来实现。suds Client 类提供了用于使用 Web Service 的统一 API 对象，这个对象包括以下两个命名空间。

* service：service 对象用来调用被消费的 web service 提供的方法。

* factory：提供一个工厂（factory），可用于创建 WSDL 中定义的对象和类型的实例。

下面来具体讲解下 suds 的使用。

* **suds 安装**

在 Python 官方停止支持 Python 2.X 版本并全面转到 Python 3.X 后，suds 原始项目的开发已经停滞了，但这不意味着 suds 不再支持 Python 3.X。suds-community fork 了原本的 suds 库，并开发了能够支持 Python 3.X的 版本，其安装也比较简单：

```java
pip install suds-community
```

* **简单使用**

```python
from suds.client import Client
if __name__ == "__main__":
    url = 'http://www.webxml.com.cn/WebServices/IpAddressSearchWebService.asmx?wsdl'
    # 初始化
    client = Client(url)
    # 打印出所有可用的方法
    print(client)
```

直接运行上述代码，你会发现执行结果如下：

```python
# 运行结果片段
Suds ( https://fedorahosted.org/suds/ )  version: 0.8.4
Service ( IpAddressSearchWebService ) tns="http://WebXml.com.cn/"
   Prefixes (1)
      ns0 = "http://WebXml.com.cn/"
   Ports (2):
      (IpAddressSearchWebServiceSoap)
         Methods (3):
            getCountryCityByIp(xs:string theIpAddress)
            getGeoIPContext()
            getVersionTime()
         Types (1):
            ArrayOfString
      (IpAddressSearchWebServiceSoap12)
         Methods (3):
            getCountryCityByIp(xs:string theIpAddress)
            getGeoIPContext()
            getVersionTime()
         Types (1):
            ArrayOfString
```

在这段代码中，我打印出来了 IpAddressSearchWebService 支持的所有方法。你可以看到， 它有三个方法（Methods(3) 显示出这个 Web Service 所提供的方法及参数）。

* **实际案例**

既然看出 IpAddressSearchWebService 这个 Web Service 支持 3 种方法，那么我们来应用下这些方法：

```python
from suds.client import Client
if __name__ == "__main__":
    url = 'http://www.webxml.com.cn/WebServices/IpAddressSearchWebService.asmx?wsdl'
    # 初始化
    client = Client(url)
    # 打印出所有支持的方法
    print(client)
    # 调用支持的方法， 使用client.service
    print(client.service.getVersionTime())
    print(client.service.getCountryCityByIp('192.168.0.1'))
```

执行上述代码，你会发现有如下输出：

```python
# 输出结果片段
#此为getVersionTime这个方法的输出
IP地址数据库，及时更新
# 此为getCountryCityByIp方法的输出
(ArrayOfString){
   string[] = 
      "192.168.0.1",
      "局域网 对方和您在同一内部网",
 }
```

注意，在代码里，我使用了 client.service 的方式，那是因为 service 对象用来调用被消费的 web service 提供的方法的。

在实际工作中，你遇见的 WSDL 接口将会比这个复杂得多。故正常情况下，我们会将 WSDL 的接口封装成类使用，然后针对每个类方法，编写相应的测试用例，如下所示：

```python
import pytest
from suds.client import Client

@pytest.mark.rmb
class WebServices(object):
    WSDL_ADDRESS = 'http://www.webxml.com.cn/WebServices/IpAddressSearchWebService.asmx?wsdl'
    def __init__(self):
        self.web_service = Client(self.WSDL_ADDRESS)
    def get_version_time(self):
        return self.web_service.service.getVersionTime()
    def get_country_city_by_ip(self, ip):
        return self.web_service.service.getCountryCityByIp(ip)

class TestWebServices:
    def test_version_time(self):
        assert WebServices().get_version_time() == "IP地址数据库，及时更新"
    @pytest.mark.parametrize('ip, expected', [('10.10.10.10', '10.10.10.10')])
    def test_get_country_city_by_ip(self, ip, expected):
        assert expected in str(WebServices().get_country_city_by_ip(ip))

if __name__ == "__main__":
    pytest.main(["-m", "rmb", "-s", "-v"])
```

#### 2.Zeep - SOAP 客户端

Zeep 是 Python 中的一个现代化的 SOAP 客户端。Zeep 通过检查 WSDL 文档并生成相应的代码，来使用 WSDL 文档中的服务和类型。这种方式为 SOAP 服务器提供了易于使用的编程接口。

下面来具体讲解下 Zeep 的使用：

* **Zeep 安装**

```python
pip install zeep
```

* **Zeep 查询 WSDL 中可用的方法**

相对于 suds 来说，想要查看一个 WSDL 描述中有哪些方法可用，Zeep 无须进行初始化动作。直接在命令行中输入如下命令即可：

```python
python -mzeep http://www.webxml.com.cn/WebServices/IpAddressSearchWebService.asmx?wsdl
```

执行后，会发现输出如下：


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image/M00/6A/6D/CgqCHl-o-M2AMf3RAAC1Nxb0gQc472.png"/> 


从结果中可以看出，IpAddressSearchWebService 提供了 3 个 method，分别是 getCountryCityByIp，getGeoIPContext 和 getVersionTime。

* **简单使用**

在得出有哪些方法可用后，我们就可以像直接调用可用的方法：

```python
import zeep
if __name__ == "__main__":
    wsdl = 'http://www.webxml.com.cn/WebServices/IpAddressSearchWebService.asmx?wsdl'
    client = zeep.Client(wsdl=wsdl)
    print(client.service.getCountryCityByIp('10.10.10.10'))
```

* **实际案例**

现在我们把上面用 suds 实现的测试 IpAddressSearchWebService 的代码更改为使用 Zeep 测试：

```python
import pytest
import zeep
@pytest.mark.rmb
class WebServices(object):
    WSDL_ADDRESS = 'http://www.webxml.com.cn/WebServices/IpAddressSearchWebService.asmx?wsdl'
    def __init__(self):
        self.web_service = zeep.Client(wsdl=self.WSDL_ADDRESS)
    def get_version_time(self):
        return self.web_service.service.getVersionTime()
    def get_country_city_by_ip(self, ip):
        return self.web_service.service.getCountryCityByIp(ip)

class TestWebServices:
    def test_version_time(self):
        assert WebServices().get_version_time() == "IP地址数据库，及时更新"
    @pytest.mark.parametrize('ip, expected', [('10.10.10.10', '10.10.10.10')])
    def test_get_country_city_by_ip(self, ip, expected):
        assert expected in str(WebServices().get_country_city_by_ip(ip))

if __name__ == "__main__":
    pytest.main(["-m", "rmb", "-s", "-v"])
```

可以看到，使用 Zeep 来调用 Web Service 服务同样很简单。

#### 3.Zeep 和 suds 的比较

suds 是一个老牌的 SOAP 客户端，而 Zeep 是当前特别流行的一个 SOAP 客户端。那么我们应该如何选用呢？ 这里列出来几点两者的区别，供你参考：  

<Image alt="图片5.png" src="https://s0.lgstatic.com/i/image/M00/6A/99/Ciqc1F-pCu2AbMxCAAF3kfMvMmE625.png"/> 


综上所述，Zeep 对最新版本的 Python 支持的更好，而且没有性能问题。如果你的项目是新设立的，在选用Web Service客户端时，不妨直接使用Zeep。

### 总结

本章节中我们重点介绍了 Web Service 及 Web Service 接口，尤其是以 WSDL 格式提供的接口应该如何测试。 并且介绍了两个测试Web Service的Python 库suds和Zeep， 以及在日常工作中，我们是如何使用suds或者Zeep来封装Web Services接口的。

因为很难找到免费、复杂的 Web Service 接口供调用并演示，故本节内容中，代码比较简单。在此布置一个课后作业给你：请你询问下自己公司的开发，请他提供给你一个基于你公司业务的 WSDL 接口，并且根据今天所讲的内容，采用 suds 或者 Zeep 库来执行 Web Service 接口测试，巩固所学。

好的，我是蔡超，我们下节课再见。

在我的公众号 iTesting 中，也有关于 Web Service 接口调用的实例，其中包括对 service 和 factory 的调用。你可以关注 iTesting 并回复 WebService 查看。

*** ** * ** ***

[课程评价入口，挑选 5 名小伙伴赠送小礼品～](https://wj.qq.com/s2/7506053/9b01)

