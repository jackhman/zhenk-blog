# 08如何基于Go-kit开发Web应用：从接口层到业务层再到数据层

在前面两个课时，我们回顾了 Go 的基础语法和 Go 的并发编程相关的知识，相信你对如何编写一个简单的 Go 程序已经有了足够的知识积累。但是你可能并没有完整开发过一个 Go 应用项目，因此本课时我们就通过开发一个 User Web 应用来学习如何进行 Go Web 项目开发。

### 使用 Go Modules 管理项目依赖

在前面的课时中，我们演示的 Go 例子基本都是一个简单的 main 函数，运行一小段逻辑代码，并没有涉及引入包外代码和组织 Go 项目内包依赖的方法。为了在编写项目代码时，能够引入其他开发者开源的优秀工具包，因此在进行具体的项目开发之前，我们有必要先介绍下 **Go 语言的依赖包管理工具------Go Modules** 。

在 Go Modules 被正式推出之前，我们一般是在**工作目录**下组织 Go 项目的开发代码。工作目录一般由 3 个子目录组成：

* src，项目的源代码或者外部依赖的源代码以包的形式存放于此，一个目录即一个包；

* pkg，编译后产生的类库存放于此；

* bin，编译后产生的可执行文件存放于此。

我们一般通过 GOPATH 环境变量指定 Go 项目的工作目录。GOPATH 默认是与 GOROOT 的值一致，指向 Go 的安装目录，在实际开发中可以根据项目需求指定不同的 GOPATH，从而隔离不同项目之间的开发空间。

Go 在 1.11 之后推出了依赖包管理工具 Go Modules，使得开发者可以在 GOPATH 指定的目录外组织项目代码。使用 Go Modules，Go 项目中无须包含工作目录中固定的 3 个子目录。**通过 go mod 命令即可创建一个新的 Module** ：

```go
go mod init moduleName
```

比如，我们在 micro-go-course 目录下创建一个新的 Moudule：

```go
go mod init github.com/longjoy/micro-go-course 
// output 
go: creating new go.mod: module github.com/longjoy/micro-go-course
```

后续的输出告诉我们名为 github.com/longjoy/micro-go-course 的 Module 生成成功，在 micro-go-course 目录下会生成一个 go.mod 的文件，内容如下：

```go
module github.com/longjoy/micro-go-course 
go 1.14
```

go.mod 文件生成之后，会被 go toolchain 掌控维护，在我们执行 go run、go build、go get、go mod 等各类命令时自动修改和维护 go.mod 文件中的依赖内容。

我们可以通过 Go Modules 引入远程依赖包，如 Git Hub 中开源的 Go 开发工具包。但可能会由于网络环境问题，我们在拉取 GitHub 中的开发依赖包时，有时会失败，在此我推荐使用**七牛云搭建的 GOPROXY**，可以方便我们在开发中更好地拉取远程依赖包。在项目目录下执行以下命令即可配置新的 GOPROXY：

```go
go env -w GOPROXY=https://goproxy.cn,direct
```

比如我们的项目需要引入 gorm 依赖连接 My SQL 数据库， 这时可以在 micro-go-course 目录下执行如下的 go get 命令 ：

```go
go get  github.com/jinzhu/gorm
```

go get 命令将会使用 Git 等代码工具远程获取代码包，并自动完成编译和安装到 GOPATH/bin 和 GOPATH/pkg 目录下。命令执行结束后我们会发现 go.mod 文件发生如下改变：

```go
module github.com/longjoy/micro-go-course 
go 1.14 
require github.com/jinzhu/gorm v1.9.14 // indirect
```

上述 require 关键字为项目引入版本是 v1.9.14 的 gorm 依赖包，该依赖包可以在开发中引入使用。在 go.mod 文件中，还存在 replace 和 exclude 关键字，它们分别用于替换依赖模块和忽略依赖模块。

除了 **go mod init** ，还有 **go mod download** 和 **go mod tidy** 两个 Go Modules 常用命令。其中，go mod download 命令可以在我们手动修改 go.mod 文件后，手动更新项目的依赖关系；go mod tidy 与 go mod download 命令类似，但不同的是它会移除掉 go.mod 中没被使用的 require 模块。

### 一个基于 Go-kit 简单的 User 应用

接下来我们就基于 Go-kit 框架开发一个简单的 User 应用，提供用户注册、登录等 HTTP 接口，项目详细代码我已经放到 GitHub 上了（<https://github.com/longjoy/micro-go-course>），你可以参考下。

在前面的课程中，我们介绍过 Go-kit **是一套强大的微服务开发工具集**，用于指导开发人员解决分布式系统开发过程中所遇到的问题，帮助开发人员更专注于业务开发。Go-kit 推荐使用 transport、endpoint 和 service 3 层结构来组织项目，它们的作用分别为：

* transport 层，指定项目提供服务的方式，比如 HTTP 或者 gRPC 等 。

* endpoint 层，负责接收请求并返回响应。对于每一个服务接口，endpoint 层都使用一个抽象的 Endpoint 来表示 ，我们可以为每一个 Endpoint 装饰 Go-kit 提供的附加功能，如日志记录、限流、熔断等。

* service 层，提供具体的业务实现接口，endpoint 层中的 Endpoint 通过调用 service 层的接口方法处理请求。

User 应用的项目结构如下图所示：


<Image alt="image (8).png" src="https://s0.lgstatic.com/i/image/M00/37/B7/CgqCHl8aeCmARuM4AADVx9E2eA4809.png"/> 


由图我们可以看到 User 应用的项目结构分别由以下"包"组成：

* dao 包，提供 MySQL 数据层持久化能力；

* endpoint 包，负责接收请求，并调用 service 包中的业务接口处理请求后返回响应；

* redis 包，提供 Redis 数据层操作能力；

* service 包，提供主要业务实现接口；

* transport 包，对外暴露项目的服务接口；

* main，应用主入口。

在具体进行开发之前，建议你使用 go mod 初始化项目，并使用 go get 引入以下依赖包：

```go
github.com/go-kit/kit@v0.10.0 // Go -k it 框架 
github.com/go-redsync/redsync@v1.4.2 // Redis 分布式锁 
github.com/go-sql-driver/mysql@v1.5.0 // mysql 驱动 
github.com/gomodule/redigo@v2.0.0+incompatible // redis 客户端 
github.com/gorilla/mux@v1.7.4 // mux 路由 
github.com/jinzhu/gorm@v1.9.14 // gorm mysql orm 框架
```

接下来我们就按照 service、endpoint、transport 和 main 的顺序构建整个项目。

**service** 包中主要提供用户服务的业务接口方法。Go 中可以通过 type 和 interface 关键字定义接口，接口代表了调用方和实现方共同遵守的协议，其内定义一系列将要被实现的函数。在 Go 中，一般使用结构体实现接口，如 service 包中定义的 UserService 接口由 UserServiceImpl 结构体实现：

```go
type UserService interface { 
// 登录接口 
Login(ctx context.Context, email, password string)(*UserInfoDTO, error) 
// 注册接口 
Register(ctx context.Context, vo *RegisterUserVO)(*UserInfoDTO, error) 
} 
type UserInfoDTO struct { 
ID int64 `json:"id"` 
Username string `json:"username"` 
Email string `json:"email"` 
} 
type UserServiceImpl struct { 
userDAO dao.UserDAO 
} 
func (userService *UserServiceImpl) Login(ctx context.Context, email, password string)(*UserInfoDTO, error)  { 
// ... 
} 
func (userService *UserServiceImpl)  Register(ctx context.Context, vo *RegisterUserVO)(*UserInfoDTO, error){ 
// ... 
}
```

在 Go 中，我们可以为一个函数指定其唯一的**接收器** ，接收器可以为任意类型，具备接收器的函数在 Go 中被称作方法。接收器类似面向对象语言中的 this 或者 self，我们可以在方法内部直接使用和修改接收器中的相关属性。**接收器可以分为指针类型和非指针类型**，在方法内部对指针类型的接收器修改将会直接反馈到原接收器，而非指针类型的接收器在方法中被操作的数据为原接收器的值拷贝，对其修改并不会影响到原接收器的数据。

在具体使用时可以根据需要指定接收器的类型，比如当接收器占用内存较大或者需要对原接收器的属性进行修改时，可以使用指针类型接收器；当接收器占用内存较小，且方法只会读取接收器内的属性时，可以采用非指针类型接收器。在上面 UserService 接口的实现中，我们指定了 UserServiceImpl 接收器类型为指针类型。

Go 中接口属于非侵入式设计，要实现接口仅需满足以下两个条件：

* 接口中所有方法均被实现；

* 接收器添加的方法签名和接口的方法签名完全一致。

在上述代码中，UserServiceImpl 结构体就完全实现了 UserService 接口中定义的方法，因此可以说 UserServiceImpl 结构体实现了 UserService 接口。

在 UserInfoDTO 结构体的定义中，我们还使用了 StructTag 为结构体内的字段添加额外的信息。StructTag 一般由一个或者多个键值对组成，用来表述结构体中字段可携带的额外信息。UserInfoDTO 中 json 键类的 StructTag 说明了该字段在 JSON 序列化时的名称，比如 ID 在序列化时会变为 id。

在 **endpoint** 包中，我们需要构建 RegisterEndpoint 和 LoginEndpoint，将请求转化为 UserService 接口可以处理的参数，并将处理的结果封装为对应的 response 结构体返回给 transport 包。如下代码所示：

```go
type UserEndpoints struct { 
RegisterEndpoint  endpoint.Endpoint 
LoginEndpoint endpoint.Endpoint 
} 
type LoginRequest struct { 
Email string 
Password string 
} 
type LoginResponse struct { 
UserInfo *service.UserInfoDTO 
} 
func MakeLoginEndpoint(userService service.UserService) endpoint.Endpoint { 
// ... 解析LoginRequest中的参数传递给 UserService.Login 方法处理并将处理结果封装为 LoginResponse 返回 
} 
type RegisterRequest struct { 
Username string 
Email string 
Password string 
} 
type RegisterResponse struct { 
UserInfo *service.UserInfoDTO 
} 
func MakeRegisterEndpoint(userService service.UserService) endpoint.Endpoint { 
// ... 解析RegisterRequest中的参数传递给 UserService.Register 方法处理并将处理结果封装为 RegisterResponse 返回 
}
```

Endpoint 代表了一个通用的函数原型，负责接收请求，处理请求，并返回结果。因为 Endpoint 的函数形式是固定的，所以我们可以在外层给 Endpoint 装饰一些额外的能力，比如熔断、日志、限流、负载均衡等能力，这些能力在 Go-kit 框架中都有相应的 Endpoint 装饰器。

在 **transport** 包中，我们需要将构建好的 Endpoint 通过 HTTP 或者 RPC 的方式暴露出去。如下代码所示：

```go
func MakeHttpHandler(ctx context.Context, endpoints *endpoint.UserEndpoints) http.Handler { 
r := mux.NewRouter() 
// ... 日志和错误处理相关配置 
r.Methods("POST").Path("/register").Handler(kithttp.NewServer( 
endpoints.RegisterEndpoint, 
decodeRegisterRequest, 
encodeJSONResponse, 
options..., 
)) 
r.Methods("POST").Path("/login").Handler(kithttp.NewServer( 
endpoints.LoginEndpoint, 
decodeLoginRequest, 
encodeJSONResponse, 
options..., 
)) 
return r 
} 
func decodeRegisterRequest(_ context.Context, r *http.Request) (interface{}, error) { 
// ... 读取 HTTP 请求体中的注册名、注册邮箱和注册密码，封装为 RegisterRequest 请求体 
} 
func decodeLoginRequest(_ context.Context, r *http.Request) (interface{}, error) { 
// ... 读取 HTTP 请求体中的登录邮箱和密码，封装为 LoginRequest 请求体 
} 
func encodeJSONResponse(ctx context.Context, w http.ResponseWriter, response interface{}) error { 
w.Header().Set("Content-Type", "application/json;charset=utf-8") 
return json.NewEncoder(w).Encode(response) 
}
```

在上述代码中，我们使用 mux 作为 HTTP 请求的路由和分发器，相比 Go 中原生态的 HTTP 路由包，mux 的路由代码可读性高、路由规则更清晰。上述代码分别将 RegisterEndpoint 和 LoginEndpoint 暴露到 HTTP 的 /register 和 /login 路径下，并指定对应的解码方法和编码方法。解码方法会将 HTTP 请求体中的请求数据解析封装为 XXXRequest 结构体传给对应的 Endpoint 处理，而编码方法会将 Endpoint 处理返回的 XXXResponse 结构体编码为 HTTP 响应返回客户端。

最后是在 **main** 函数中依次组建 service、endpoint 和 transport，并启动 Web 服务器，代码如下所示：

```go
func main()  { 
	var ( 
		// 服务监听端口 
		servicePort = flag.Int("service.port", 10086, "service port")) 
	flag.Parse() 
	ctx := context.Background() 
	errChan := make(chan error) 
	err := dao.InitMysql("127.0.0.1", "3306", "root", "root", "user") 
	if err != nil{ 
		log.Fatal(err) 
	} 
	err = redis.InitRedis("127.0.0.1","6379", "" ) 
	if err != nil{ 
		log.Fatal(err) 
	} 
	userService := service.MakeUserServiceImpl(&dao.UserDAOImpl{}) 
	userEndpoints := &endpoint.UserEndpoints{ 
		endpoint.MakeRegisterEndpoint(userService), 
		endpoint.MakeLoginEndpoint(userService), 
	} 
	r := transport.MakeHttpHandler(ctx, userEndpoints) 
	go func() { 
		errChan <- http.ListenAndServe(":"  + strconv.Itoa(*servicePort), r) 
	}() 
	go func() { 
		// 监控系统信号，等待 ctrl + c 系统信号通知服务关闭 
		c := make(chan os.Signal, 1) 
		signal.Notify(c, syscall.SIGINT, syscall.SIGTERM) 
		errChan <- fmt.Errorf("%s", <-c) 
	}() 
	error := <-errChan 
	log.Println(error) 
}
```

在上述代码中，我们依次构建了 service、endpoint 和 transport，并在 10086 端口启动了 Web 服务器，最后通过监听对应的 ctrl + c 系统信号关闭服务。

通过上述流程，我们就详细介绍完了如何基于 Go-kit 开发一个 Web 项目，在配置好相应的 Go Modules 代理、MySQL 数据库和 Redis 数据库后即可通过 go run 命令启动，启动后可以通过请求相应的 HTTP 接口验证效果，如下 curl 命令例子所示：

```powershell
// 注册 
curl -X POST \ 
  http://localhost:10086/register \ 
  -H 'content-type: application/x-www-form-urlencoded' \ 
  -d 'email=aoho%40mail.com&password=aoho&username=aoho' 

// 登录 
curl -X POST \ 
  http://localhost:10086/login \ 
  -H 'content-type: application/x-www-form-urlencoded' \ 
  -d 'email=aoho%40mail.com&password=aoho'
```

### 使用 gorm 连接 My SQL 数据库

在日常的业务开发中，使用数据库对业务数据进行持久化操作是必不可少的。在前面的 User 服务中，我们使用了 Go 中流行的 gorm ORM 库为服务提供 My SQL 数据库操作能力。gorm 是采用 Go 实现的，几乎全功能的 ORM，通过它，我们可以将数据库中的表结构与 Go 中的结构体进行映射，这样既提升了开发的便利性，也降低了 SQL 注入攻击的可能性。

在使用 gorm 前可以使用 Go Modules 或者 go get 引入相应的依赖 github.com/jinzhu/gorm。

gorm 的使用十分简单，通过 gorm.Open 函数即可建立一个相关数据库连接池，如下代码所示：

```go
package dao 
import ( 
"fmt" 
_ "github.com/go-sql-driver/mysql" 
"github.com/jinzhu/gorm" 
"log" 
) 
var db *gorm.DB 
func InitMysql(host, port, user, password, dbName string) (err error) { 
db, err = gorm.Open("mysql", fmt.Sprintf("%s:%s@(%s:%s)/%s?charset=utf8&parseTime=True&loc=Local", user, password, host, port, dbName)) 
if err != nil{ 
log.Println(err) 
return 
} 
db.SingularTable(true) 
return 
}
```

这里需要指定数据库地址、端口、用户、密码和数据库名等基本信息。在建立好相应数据库的连接池后，即可通过面向对象的方式操作数据库中的表数据，我们需要首先定义相关的表结构体，如 UserEntity 结构体，它对应数据库中的 user 表：

```go
type UserEntity struct { 
ID int64 
Username string 
Password string 
Email string 
CreatedAt time.Time 
}
```

gorm 同样支持 StructTag，可以使用 StructTag 为结构体中的字段添加相应的表字段限制，如指定映射表字段名称、类型等。gorm 中直接调用 gorm.DB.Create 方法即可插入新的数据，如下例子所示：

```go
func (userDAO *UserDAOImpl) Save(user *UserEntity) error { 
return db.Create(user).Error 
}
```

gorm 提供了丰富的查询方法，基本可以实现所有的复杂查询功能，如下面例子所示的使用 Where 查询语句根据 email 查询用户信息：

```go
func (userDAO *UserDAOImpl) SelectByEmail(email string)(*UserEntity, error) { 
user := &UserEntity{} 
err := db.Where("email = ?", email).First(user).Error 
return user, err 
}
```

小结
---

项目开发是作为开发人员必须掌握的能力，虽然 Go 的工程化能力不及 Java、C++ 等"老大哥"，但是也提供了相当大的工程项目开发便捷性。

在本节课程，我们主要介绍了如何进行 Go 项目的开发，主要包含：

* Go Modules 项目依赖管理；

* 基于 Go -k it 开发 User Web 应用；

* 使用 gorm ORM 库操作 My SQL 数据库。

随着 Go 的快速发展和应用，Go 被越来越多地应用到大型项目的开发中，Go 的工程化经验和能力也在不断积累和提升。通过本节课的学习，希望你能够掌握基本的 Go 项目开发能力，为后续微服务应用的开发实践打下良好的基础。

最后，关于 Go-kit 开发，你有什么经验和想法？欢迎你在留言区和我交流分享。

