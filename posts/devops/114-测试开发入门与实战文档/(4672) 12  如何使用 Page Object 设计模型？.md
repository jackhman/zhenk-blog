# 12如何使用PageObject设计模型？

到上节课为止，你不仅已经具备了测试开发的初级能力，而且能够搭建起融合 API 自动化测试和 UI 自动化测试的框架。

今天我将带你一起，使用 PageObject 模型，优化我们的框架代码，使我们的框架结构更加清晰，代码更加模块化，以便在迁移项目重用框架时成本更低。

下方是课程内容结构图，可供你学习参考：  

<Image alt="Lark20201019-184959.png" src="https://s0.lgstatic.com/i/image/M00/60/81/Ciqc1F-NcGWAZc7WAAUL4728Z-8331.png"/> 


### 什么是 PageObject 设计模型？

PageObject 设计模型是在自动化测试过程中普遍采用的一种设计模式。它通过对页面对象（实际的 UI 页面，或者是逻辑上的页面）进行抽象，使得你的代码能在页面元素发生改变时，**尽量少地更改，以最大程度地支持代码重用和避免代码冗余**。

### PageObject 设计模型的特征

目前，并没有一种统一的格式（format）来告诉你如何设计 PageObject，只要你设计的代码将页面元素和测试代码分离，你都可以说你使用了 PageObject。

一般情况下，实现了 PageObject 的代码往往具备如下特征：

**1.页面封装成 Page 类，页面元素为 Page 类的成员元素，页面功能放在 Page 类方法里。**

将一个页面（或者待测试对象）封装成一个类（Class），把它称作 Page 类。Page 类里包括了这个页面（或者待测试对象）上的所有的元素，以及针对页面元素的操作方法（单步操作或者多步操作，一般会定义类方法）。注意：这个Page 类里仅仅包括当前页面，一般不包括针对其他页面的操作。

**2.针对这个 Page 类定义一个测试类，在测试类调用 Page 类的各个类方法完成测试。**

也就是测试代码和被测试页面的页面代码解耦，当页面本身发生变化，例如元素定位发生改变、页面布局改变后，仅需要更改相对应的 Page 类的代码，而无须更改测试类的代码。

PageObject 模式减少了代码冗余，可以使业务流程变得清晰易读，降低了测试代码维护成本。

### PageObject 的实现

根据上述特点，我们来看下一个 PageObject 的经典设计：


<Image alt="Lark20201019-185002.png" src="https://s0.lgstatic.com/i/image/M00/60/8D/CgqCHl-NcHKALdY4AAFp3jzWIEU818.png"/> 


可以看到，在**测试类** 里，我们会定义许多**测试方法** ，这些测试方法里，会含有对**页面对象实例** 的调用；而**页面对象实例** ，是通过**页面对象类** 进行初始化操作生成的；对于许多**页面对象类** 都存在的通用操作，我们会提取到**页面对象基类**里。

通过这种方法，我们就实现了：

* 一个页面元素在整个项目中，仅存在一处定义，其他都是调用；

* Page 类通用的操作进一步提取到 BasePage 类，减少了代码冗余。

### PageObject 的 Python 库

在 Python 里，有专门针对 PageObject 的 Python 库 Page Objects。使用 Page Objects 可以迅速实现 PageObject 模式，下面来看下 Page Objects 库的使用。

* **安装：**

```python
pip install page_objects
```

* **应用：**

```python
# 以下为官方示例
>>> from page_objects import PageObject, PageElement
>>> from selenium import webdriver
>>> class LoginPage(PageObject):
        username = PageElement(id_='username')
        password = PageElement(name='password')
        login = PageElement(css='input[type="submit"]')
>>> driver = webdriver.PhantomJS()
>>> driver.get("http://example.com")
>>> page = LoginPage(driver)
>>> page.username = 'secret'
>>> page.password = 'squirrel'
>>> assert page.username.text == 'secret'
>>> page.login.click()
```

### 项目实战 ------ PageObject 应用

好，我们不仅了解了 PageObject 的理论，也了解了 page_objects 这个 Python 库的使用。

现在，我们给我们的项目应用 pageObject 模型。

#### 第一步：改造项目结构

我们来按照 PageObject 的实现来改造我们的项目结构。改造前，我们的目录结构：

```python
|--lagouAPITest
    |--tests
        |--test_ones.py
        |--__init__.py
    |--common
        |--__init__.py
```

其中，test_ones.py 是我们上一节课\*\*《11\| 如虎添翼，API 和 UI 自动化测试融合》\*\*新建的文件，其余目录及 **init** .py 都是空目录、空文件。  

使用 PageObject 改造后，我们期望的目录结构：

```python
|--lagouAPITest
    |--pages
        |--ones.py
        |--base_page.py
    |--tests
        |--test_ones.py
        |--__init__.py
    |--common
        |--__init__.py
```

改造后，我们把原本的 tests 目录下的 test_ones.py 里关于页面元素的操作全部剥离到 pages 文件夹下的 ones.py 里，然后针对可能的公用的操作，我们进一步抽象到 base_page.py 里去。

下面先看下原来 tests 文件夹下 test_ones.py 的内容：

```python
# -*- coding: utf-8 -*-
import json
import requests
import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def cookie_to_selenium_format(cookie):
    cookie_selenium_mapping = {'path': '', 'secure': '', 'name': '', 'value': '', 'expires': ''}
    cookie_dict = {}
    if getattr(cookie, 'domain_initial_dot'):
        cookie_dict['domain'] = '.' + getattr(cookie, 'domain')
    else:
        cookie_dict['domain'] = getattr(cookie, 'domain')
    for k in list(cookie_selenium_mapping.keys()):
        key = k
        value = getattr(cookie, k)
        cookie_dict[key] = value
    return cookie_dict

class TestOneAI:
    # 在pytest里，针对一个类方法的setup为setup_method,
    # setup_method作用同unittest里的setUp()
    def setup_method(self, method):
        self.s = requests.Session()
        self.login_url = 'https://ones.ai/project/api/project/auth/login'
        self.home_page = 'https://ones.ai/project/#/home/project'
        self.header = {
            "user-agent": "user-agent: Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36",
            "content-type": "application/json"}
        self.driver = webdriver.Chrome()
    @pytest.mark.parametrize('login_data, project_name', [({"password": "iTestingIsGood", "email": "pleasefollowiTesting@outlook.com"}, {"project_name":"VIPTEST"})])
    def test_merge_api_ui(self, login_data, project_name):
        result = self.s.post(self.login_url, data=json.dumps(login_data), headers=self.header)
        assert result.status_code == 200
        assert json.loads(result.text)["user"]["email"].lower() == login_data["email"]
        all_cookies = self.s.cookies._cookies[".ones.ai"]["/"]
        self.driver.get(self.home_page)
        self.driver.delete_all_cookies()
        for k, v in all_cookies.items():
            print(v)
            print(type(v))
            self.driver.add_cookie(cookie_to_selenium_format(v))
        self.driver.get(self.home_page)
        try:
            element = WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, '[class="company-title-text"]')))
            assert element.get_attribute("innerHTML") == project_name["project_name"]
        except TimeoutError:
            raise TimeoutError('Run time out')
    # 在pytest里，针对一个类方法的teardown为teardown_method,
    # teardown_method作用同unittest里的dearDown()
    def teardown_method(self, method):
        self.s.close()
        self.driver.quit()
```

#### 第二步，创建 Page 类

首先把跟页面有关的全部操作都放到 Page 类里，pages/ones.py 的代码如下：

```python
# -*- coding: utf-8 -*-
import json
import requests
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from page_objects import PageObject, PageElement

def cookie_to_selenium_format(cookie):
    cookie_selenium_mapping = {'path': '', 'secure': '', 'name': '', 'value': '', 'expires': ''}
    cookie_dict = {}
    if getattr(cookie, 'domain_initial_dot'):
        cookie_dict['domain'] = '.' + getattr(cookie, 'domain')
    else:
        cookie_dict['domain'] = getattr(cookie, 'domain')
    for k in list(cookie_selenium_mapping.keys()):
        key = k
        value = getattr(cookie, k)
        cookie_dict[key] = value
    return cookie_dict

class OneAI(PageObject):
    # 使用page_objects库把元素locator， 元素定位，元素操作分离
    # 元素定位的字符串
    PROJECT_NAME_LOCATOR = '[class="company-title-text"]'
    NEW_PROJECT_LOCATOR = '.ones-btn.ones-btn-primary'

    # 元素定位
    new_project = PageElement(css=NEW_PROJECT_LOCATOR)
    # 通过构造函数初始化浏览器driver，requests.Session()
    # 通过api_login方法直接带登录态到达待测试页面开始测试
    def __init__(self, login_credential, target_page):
        self.login_url = 'https://ones.ai/project/api/project/auth/login'
        self.header = {
            "user-agent": "user-agent: Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36",
            "content-type": "application/json"}
        self.s = requests.Session()
        self.driver = webdriver.Chrome()
        self.api_login(login_credential, target_page)
    # 融合API测试和UI测试，并传递登录态到浏览器Driver供使用
    def api_login(self, login_credential, target_page):
        target_url = json.loads(json.dumps(target_page))
        try:
            result = self.s.post(self.login_url, data=json.dumps(login_credential), headers=self.header)
            assert result.status_code == 200
            assert json.loads(result.text)["user"]["email"].lower() == login_credential["email"]
        except Exception:
            raise Exception("Login Failed, please check!")
        all_cookies = self.s.cookies._cookies[".ones.ai"]["/"]
        self.driver.get(target_url["target_page"])
        self.driver.delete_all_cookies()
        for k, v in all_cookies.items():
            self.driver.add_cookie(cookie_to_selenium_format(v))
        self.driver.get(target_url["target_page"])
        return self.driver
    # 功能函数
    def get_project_name(self):
        try:
            project_name = WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, self.PROJECT_NAME_LOCATOR)))
            return project_name.get_attribute("innerHTML")
        except TimeoutError:
            raise TimeoutError('Run time out')
```

我们来看下这个 ones.py 文件：

* 首先，我在其中定义了一个方法 cookie_to_selenium_format，这个方法是把通过 requests.Session() 拿到的 cookies 转换成 Selenium/WebDrvier 认可的格式，这个函数跟我们的 Page 类无关，所以我把它放在 Page 类外；

* 接着，我定义了 OneAI 这个 Page 类，并且按照 page_objects 这个库的推荐写法写了元素的定位。注意，我把元素的 Locator 本身，以及元素、元素操作都分离开了。这样当有任意一个修改时，都不影响另外两个；

* 然后我又写了类方法，一个是用于拿登录态直接通过浏览器访问页面的函数 api_login，还有一个就是获取 project_name 的文本的函数 get_project_name。

至此，我的第一版 Page 类就创建完毕，**但注意我这个 Page 类里是不包括测试的方法的。**

#### 第三步， 更新 TestPage 类

Page 类创建好，我们就要创建 Page 类对应的测试类。更改 tests 文件夹下的 test_ones.py 文件，更改后的内容如下：

```python
# -*- coding: utf-8 -*-
import pytest
from pages.ones import OneAI

class TestOneAI:
    # 注意，需要email和密码需要更改成你自己的账户密码
    @pytest.mark.parametrize('login_data, project_name, target_page', [({"password": "iTestingIsGood", "email": "pleasefollowiTesting@outlook.com"}, {"project_name":"VIPTEST"}, {"target_page": "https://ones.ai/project/#/home/project"})])
    def test_project_name_txt(self, login_data, project_name, target_page):
        print(login_data)
        one_page = OneAI(login_data, target_page)
        actual_project_name = one_page.get_project_name()
        assert actual_project_name == project_name["project_name"]
```

你可以看到，这个测试类就变得非常简洁。它只包括一个测试方法，即 test_project_name_txt。这个函数用来测试我们拿到的 project name 是不是等于我们提供的那个值，即 VIPTEST。

**你需要注意，在测试类中，应该仅仅包括对 Page 类的各种方法的调用，而不能在测试类中直接去操作测试类对象生成新的功能。**

我们在命令行运行下，输入以下命令：

```python
D:\_Automation\lagouAPITest>pytest tests/test_ones.py
```

测试运行结束后，查看运行结果如下：


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image/M00/60/82/Ciqc1F-NcJuAfRgwAAC13CMIBCs725.png"/> 


至此，Page 类和 TestPage 类的解耦已经完成。

#### 第四步， 提炼 BasePage 类

至此，PageObject 模式我们已经应用到我们的项目中了，不过你发现没有，我们的 Page 类里还有很多可以优化的地方，比如 cookie_to_selenium_format 这个方法，它不属于某一个具体的 Page 类，但又可以被多个 Page 类调用。

再比如，初始化浏览器 Driver 的代码，和初始化 requests.Session() 的代码也不属于某一个具体的 Page，但是我们把它放入了 Page 里，所以，我们继续优化，在 pages 文件夹下创建 base_page 类，把跟 page 无关的操作都提炼出来。

pages/base_page.py 文件的内容如下：

```python
# -*- coding: utf-8 -*-
import json
import requests
from selenium import webdriver
from page_objects import PageObject, PageElement

def cookie_to_selenium_format(cookie):
    cookie_selenium_mapping = {'path': '', 'secure': '', 'name': '', 'value': '', 'expires': ''}
    cookie_dict = {}
    if getattr(cookie, 'domain_initial_dot'):
        cookie_dict['domain'] = '.' + getattr(cookie, 'domain')
    else:
        cookie_dict['domain'] = getattr(cookie, 'domain')
    for k in list(cookie_selenium_mapping.keys()):
        key = k
        value = getattr(cookie, k)
        cookie_dict[key] = value
    return cookie_dict

class BasePage(PageObject):
    def __init__(self, login_credential, target_page):
        self.login_url = 'https://ones.ai/project/api/project/auth/login'
        self.header = {
            "user-agent": "user-agent: Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36",
            "content-type": "application/json"}
        self.s = requests.Session()
        self.driver = webdriver.Chrome()
        self._api_login(login_credential, target_page)
    def _api_login(self, login_credential, target_page):
        target_url = json.loads(json.dumps(target_page))
        try:
            result = self.s.post(self.login_url, data=json.dumps(login_credential), headers=self.header)
            assert result.status_code == 200
            assert json.loads(result.text)["user"]["email"].lower() == login_credential["email"]
        except Exception:
            raise Exception("Login Failed, please check!")
        all_cookies = self.s.cookies._cookies[".ones.ai"]["/"]
        self.driver.get(target_url["target_page"])
        self.driver.delete_all_cookies()
        for k, v in all_cookies.items():
            self.driver.add_cookie(cookie_to_selenium_format(v))
        self.driver.get(target_url["target_page"])
        return self.driver
```

在 BasePage 这个类里，我把跟具体的某一个 page 的操作都剔除掉，仅仅留下共用的部分，比如初始化浏览器 driver、初始化 requests.Session()，然后我把用于登录后传递登录态的方法 api_login 改成一个类保护方法_api_login（即只允许 BasePage 的类实例和它的子类实例能访问_api_login 方法）。

这个时候，我们的 pages 文件夹下的 ones.py 也要做相应更改，更新后的 pages/ones.py 的内容如下：

```python
# -*- coding: utf-8 -*-
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from page_objects import PageObject, PageElement
from pages.base_page import BasePage

class OneAI(BasePage):
    PROJECT_NAME_LOCATOR = '[class="company-title-text"]'
    NEW_PROJECT_LOCATOR = '.ones-btn.ones-btn-primary'
    new_project = PageElement(css=NEW_PROJECT_LOCATOR)
    def __init__(self, login_credential, target_page):
        super().__init__(login_credential, target_page)
    def get_project_name(self):
        try:
            project_name = WebDriverWait(self.driver, 30).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, self.PROJECT_NAME_LOCATOR)))
            return project_name.get_attribute("innerHTML")
        except TimeoutError:
            raise TimeoutError('Run time out')
```

可以看到。我们的 Page 类进一步简化，只包括 Page 本身的元素、对象和操作，而不包括其他的部分，比如对浏览器 Driver 的初始化、对 requests.Session() 的初始化、登录等操作了。

这个时候再回到《02 \| 反复践行的 13 条自动化测试框架设计原则》里最初提问的那个问题，当你有了新的项目，你老板会说："你不是有框架吗？快上个自动化"，这个时候你要怎么回答？

学习了 Page Object 模型后的你这时候是不是可以一边心里窃喜，一边脸上还要装作工作量很大很为难的样子，说"好的老板我尽量这周给到"。

实际上，你只要把 Pages 和 Tests 这两个文件夹下的文件删除，换成你新项目的文件就好了。所以，你说 Page Object 模型好不好啊？根据《02 \| 反复践行的 13 条自动化测试框架设计原则》的指导来设计测试框架，是不是事半功倍啊！

#### 第五步， 打造通用性测试框架

好了，本节课到现在，我们已经把 PageObject 模式的应用全部掌握了。现在来看看我们的框架，你觉得还有改进的空间吗？

```python
|--lagouAPITest
    |--pages
        |--ones.py
        |--base_page.py
    |--tests
        |--test_ones.py
        |--__init__.py
    |--common
        |--__init__.py
```

当然有改进空间了， 再看看 base_page.py 这个文件。既然是 base_page，那么只应该跟 page 有关系，可是我们把初始化浏览器 driver、初始化 requests.Session() 这样的操作也放进去了，是不是不太合理？还有万一以后的浏览器测试不用 Selenium/WebDriver 了呢？
> 我个人估计这个进程会很快，现在前端自动化这边 Cypress 发展迅猛，而且上手非常简单。一个人通过简单学习很快就能通过 Cypress 来搭建基于持续集成的自动化测试框架。关于 Cypress，你可以参考我的新书《前端自动化测试框架 Cypress 从入门到精通》。

那么假设以后我们的浏览器测试不用Selenium/webDriver了，还有，万一有比 requests 更好用的HTTP库了呢？所以，有必要进一步拆分。

于是，我们的框架结构就变成如下的样子：

```python
|--lagouAPITest
    |--pages
        |--ones.py
        |--base_page.py
    |--tests
        |--test_ones.py
        |--__init__.py
    |--common
        |--__init__.py
        |--selenium_helper.py
        |--requests_helper.py
```

把 BasePage 这个类里的关于 Selenium/WebDriver 和 Requests 的操作分别拆分到 selenium_helper.py 里和 requests_helper.py 里去。

selenium_helper.py 的内容如下：

```python
__author__ = 'kevin'
from selenium import webdriver

class SeleniumHelper(object):
    @staticmethod
    def initial_driver(browser_name='chrome'):
        browser_name = browser_name.lower()
        if browser_name not in {'chrome', 'firefox', 'ff', 'ie'}:
            browser_name = 'chrome'
        if browser_name == 'chrome':
            browser = webdriver.Chrome()
        elif browser_name in ('firefox', 'ff'):
            browser = webdriver.Firefox()
        elif browser_name == 'ie':
            webdriver.Ie()
        browser.maximize_window()
        browser.implicitly_wait(60)
        return browser
    @staticmethod
    def cookie_to_selenium_format(cookie):
        cookie_selenium_mapping = {'path': '', 'secure': '', 'name': '', 'value': '', 'expires': ''}
        cookie_dict = {}
        if getattr(cookie, 'domain_initial_dot'):
            cookie_dict['domain'] = '.' + getattr(cookie, 'domain')
        else:
            cookie_dict['domain'] = getattr(cookie, 'domain')
        for k in list(cookie_selenium_mapping.keys()):
            key = k
            value = getattr(cookie, k)
            cookie_dict[key] = value
        return cookie_dict
```

selenium_helper.py 里包括了所有针对 Selenium 的操作，以后针对浏览器的各种操作全部都放在这个文件。

requests_helper.py 里的代码，更新后如下：

```python
import json
import traceback
import requests
from requests.packages.urllib3.exceptions import InsecureRequestWarning
# Disable https security warning
requests.packages.urllib3.disable_warnings(InsecureRequestWarning)

class SharedAPI(object):
    def __init__(self):
        self.s = requests.session()
        self.login_url = 'https://ones.ai/project/api/project/auth/login'
        self.header = {
            "user-agent": "user-agent: Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36",
            "content-type": "application/json"}
    def login(self, login_credential):
        try:
            result = self.s.post(self.login_url, data=json.dumps(login_credential), headers=self.header, verify=False)
            if int(result.status_code) == 200:
                pass
            else:
                raise Exception('login failed')
            return result
        except RuntimeError:
            traceback.print_exc()
    def post_api(self, url, **kwargs):
        return self.s.post(url, **kwargs)
    def get_api(self, url, **kwargs):
        return self.s.get(url, **kwargs)
```

requests_helper.py 里包括所有对 requests 这个库的操作。

最后，我们还需要更新下 base_page.py，base_page.py 更新后，内容如下：

```python
# -*- coding: utf-8 -*-
import json
import traceback
import requests
from selenium import webdriver
from page_objects import PageObject, PageElement
from common.requests_helper import SharedAPI
from common.selenium_helper import SeleniumHelper

class BasePage(PageObject):
    def __init__(self, login_credential, target_page):
        self.api_driver = SharedAPI()
        self.loginResult = self.api_driver.login(login_credential)
        self.driver = SeleniumHelper.initial_driver()
        self._api_login(login_credential, target_page)
    def _api_login(self, login_credential, target_page):
        target_url = json.loads(json.dumps(target_page))
        assert json.loads(self.loginResult.text)["user"]["email"].lower() == login_credential["email"]
        all_cookies = self.loginResult.cookies._cookies[".ones.ai"]["/"]
        self.driver.get(target_url["target_page"])
        self.driver.delete_all_cookies()
        for k, v in all_cookies.items():
            self.driver.add_cookie(SeleniumHelper.cookie_to_selenium_format(v))
        self.driver.get(target_url["target_page"])
        return self.driver
```

可以看到，在更新后的 base_page.py 里，我们初始化 requests.Session() 和浏览器的 Driver 的方式是通过调用 SharedAPI 和 SeleniumHelper 这两个类。然后 BasePage 这个类里现在只包括各个 Page 类可以共用的函数，而不再包括无关的操作。

其他文件无须更改。

通过如下命令运行：

```python
D:\_Automation\lagouAPITest>pytest --alluredir=./allure_reports
```

然后使用命令行进入到你的项目根目录下，执行如下语句：

```python
D:\_Automation\lagouAPITest>allure serve allure_reports
```

接着你的默认浏览器会自动打开测试报告，看下运行结果：


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image/M00/60/82/Ciqc1F-NcfmAFQfWAABpixBpo-E991.png"/> 


好的，大功告成。

你发现没有，通过这个方式，我们就把自动化测试框架进行了框架代码和业务代码的剥离。此后我们的框架不仅看起来结构清晰，而且也变得跟业务松耦合。当你需要在新项目应用自动化的时候，仅仅把 pages 和 tests 这两个文件夹更换，便能够一"秒"搭建新的测试框架。

我们的《测试开发入门与实战》课程，直到这里才有了一点点测试开发的味道。迄今为止， 我们通过学习，已经能够搭建一套融合 API 测试和 UI 测试，并且具备现代测试框架雏形的框架。

### 小结

本节课我主要讲解了 PageObject 模式，PageObject 模式是自动化测试里的一个经典设计模式。通过 PageObject 我们可以实现元素定位、元素、元素操作的分离，从而让自己的自动化测试框架更加具备可重用性。

在实现 PageObject 的同时，我主要通过展现思维的方式，向你一步步讲解如何把一个什么都耦合在一起的测试框架，一点点地剥离开。

在练习本节课的过程中，我希望你不仅仅是 copy 下代码执行，我希望你能多关注我在这一课时"**项目实战------PageObject 应用"这一小节**中展示出来的思维过程，并在以后的学习中，刻意锻炼自己这种发现问题---解决问题的能力。

唯有此，你才能在测试开发的道路上越走越远。

**好了，本节课最后给大家布置一个课后作业：按照本节课所讲，把我们第 7、8 课时"你的第一个 Web 测试框架"学习的两个测试文件 test_baidu.py 和 test_lagou.py 应用至 PageObject 模型中。**

最后，你会发现我们的项目就会从下面这个样子：

```python
|--lagouAPITest
    |--pages
        |--ones.py
        |--base_page.py
    |--tests
        |--test_ones.py
        |--__init__.py
    |--common
        |--__init__.py
        |--selenium_helper.py
        |--requests_helper.py
```

变成：

```python
|--lagouAPITest
    |--pages
        |--baidu.py
        |--lagou.py
        |--ones.py
        |--base_page.py
    |--tests
        |--test_ones.py
        |--test_baidu.py
        |--test_lagou.py
        |--__init__.py
    |--common
        |--__init__.py
        |--selenium_helper.py
        |--requests_helper.py
```

好的，本节课就到这里，也别忘完成课后作业哦～  

我是蔡超，我们下节课再见，下节课我将带你走入数据驱动的世界。

更多关于测试框架的知识，请关注测试公众号 iTesting， 并回复 "测试框架"查看。

*** ** * ** ***

[课程评价入口，挑选 5 名小伙伴赠送小礼品～](https://wj.qq.com/s2/7506053/9b01)

