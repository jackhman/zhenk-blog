# 第33讲：如何使用GraphQL组合API

在第 32 课时中介绍了 REST API 在使用上的局限性。由于请求和响应格式的固定，当 API 的使用者的需求发生改变时，需要 API 提供者先做出修改，API 使用者才能进行所需的改动。这种耦合关系降低了整体的开发效率，对于开放 API 来说，这种情况会更加严重。当 API 的使用者很多时，不同使用者的需求可能会产生冲突。从 API 实现者的角度来说，只能在这些冲突的需求中进行取舍，客观上也造成了部分 API 使用者的困难。Backend For Frontend 模式和 API 版本化可以解决一部分问题，但也使得 API 的维护变得更加复杂。

对于 REST API 的问题，我们需要新的解决方案，[GraphQL](https://graphql.org/) 和 Netflix Falcor 都是可以替代的方案，这两种方案对客户端都提供了更高的要求。REST API 的优势在于对客户端的要求很低，使得它有很强的兼容性，这也是 REST API 流行的一个重要原因。随着 JavaScript 的广泛使用，客户端可以承担更多的职责，这使得 GraphQL 这样的技术有了流行起来的基础。本课时将对 GraphQL 进行基本的介绍，并用 GraphQL 实现乘客管理界面所需的 API。

### GraphQL

GraphQL 这个名称的含义是**图查询语言**（Graph Query Language），其中的图与 Netflix Falcor 中的 JSON 图，有着异曲同工之妙。图这种数据结构，表达能力强，适用于各种不同的场景。

GraphQL 是为 API 设计的查询语言，提供了完整的语言来描述 API 所提供的数据的模式（Schema）。模式在 GraphQL 中扮演了重要的作用，类似于 REST API 中的 OpenAPI 规范。有了模式之后，客户端可以方便地查看 API 所提供的查询，以及数据的格式；服务器可以对查询请求进行验证，并根据模式来对查询的执行进行优化。

根据 GraphQL 的模式，客户端发送查询到服务器，服务器验证并执行查询，同时返回相应的结果。查询的结果完全由请求来确定，这就意味着客户端对获取的数据有完全的控制。

GraphQL 使用图来描述实体与实体之间的关系，还可以自动处理实体之间的引用关系。在一个查询中可以包含相互引用的多个实体。

GraphQL 使得 API 的更新变得容易。在 API 的 GraphQL 模式中可以增加新的类型和字段，也可以把已有的字段声明为废弃的。已经废弃的字段不会出现在模式的文档中，可以鼓励使用者使用最新的版本。

GraphQL 非常适用于微服务架构应用的 API 接口，可以充分利用已有微服务的 API。GraphQL 最早由 Facebook 开发，目前有开源的规范和不同平台上的前端和后端的实现，而且已经被 Facebook、GitHub、Pinterest、Airbnb、PayPal、Twitter 等公司采用。

#### 查询和修改

GraphQL 中定义了类型和类型中的字段。在示例应用中，我们可以定义乘客和地址等类型，以及类型中的字段，最简单的查询是选择对象中的字段。如果对象中有嵌套的其他对象，可以同时选择嵌套对象中的字段。

下面是一个 GraphQL 的查询代码示例，其中，passengers 表示查询乘客对象的列表，内嵌的字段 id、name、email 和 mobilePhoneNumber 用来查询乘客对象中的属性；userAddresses 是乘客对象中内嵌的用户地址列表，嵌套的 name 字段用来查询用户地址的名称。

```java
{
  passengers {
    id
    name
    email
    mobilePhoneNumber
    userAddresses {
      name
    }
  }
}
```

该查询的执行结果如下面的代码所示，从中可以看出来，查询结果的格式与查询是完全匹配的。如果从查询中删除掉 passengers 中的 email 和 mobilePhoneNumber，那么对应的查询结果也不会包含这两个字段。

```json
{
  "data": {
    "passengers": [
      {
        "id": "ae31bb42-540e-4cdc-a088-1bc6e2f9f78d",
        "name": "bob",
        "email": "bob@test.com",
        "mobilePhoneNumber": "13400003413",
        "userAddresses": [
          {
            "name": "test"
          },
          {
            "name": "new"
          }
        ]
      },
      {
        "id": "4d609afe-a193-4c4f-a062-146dd3c6c86b",
        "name": "alex",
        "email": "alex@test.com",
        "mobilePhoneNumber": "13455353535",
        "userAddresses": [
          {
            "name": "home"
          },
          {
            "name": "office"
          }
        ]
      }
    ]
  }
}
```

在上述的 GraphQL 查询中，我们实际上省略了 query 关键词和查询的名称，query 关键词表示操作的类型。GraphQL 中支持 3 种不同类型的操作，分别是查询（Query）、修改（Mutation）和订阅（Subscription），对应的关键词分别是 query、mutation 和 subscription。操作的名称由客户端提供，作为操作的描述，可以增强查询的可读性。

在操作上可以声明变量，并在执行时提供实际的值，这与编程语言中的函数或方法中的参数是相似的。在下面代码的 GraphQL 查询中，操作的名称是 passengerById，并且有一个类型为 ID 的变量 passengerId，该变量作为字段 passenger 的参数 id 的值。

```java
query passengerById($passengerId: ID!) {
  passenger(id: $passengerId) {
    name
    email
    mobilePhoneNumber
  }
}
```

在执行查询时，需要提供变量的实际值，变量一般以 JSON 的格式传递，如下面的代码所示：

```json
{
  "passengerId": "ae31bb42-540e-4cdc-a088-1bc6e2f9f78d"
}
```

查询的结果如下面的代码所示：

```json
{
  "data": {
    "passenger": {
      "name": "bob",
      "email": "bob@test.com",
      "mobilePhoneNumber": "13400003413"
    }
  }
}
```

在查询时，有些字段的组合可能会重复出现多次。为了复用这些字段的组合，可以使用 GraphQL 中的片段（Fragment）。在下面的代码中，fragment 用来声明片段，on 表示片段对应的对象类型，片段可以直接用在查询中。

```java
query passengerById($passengerId: ID!) {
  passenger(id: $passengerId) {
    ...passengerFields
  }
}
fragment passengerFields on Passenger {
  name
  email
  mobilePhoneNumber
}
```

#### 模式和类型

GraphQL 使用语言中性的模式语言来描述数据的结构，每个 GraphQL 服务都通过这个模式语言来定义所开放的数据的类型系统。GraphQL 规范中已经定义了一些内置的类型，每个服务提供者也需要创建自己的类型。

GraphQL 中的类型分成下表中给出的几类，不同的类型使用不同的关键词来创建。

| **分类** |  **关键词**  |            **说明**            |
|--------|-----------|------------------------------|
| 对象类型   | type      | 服务所提供的对象，对象类型定义了对象中包含的字段及其类型 |
| 标量类型   | scalar    | 表示具体的值，不包含字段                 |
| 枚举类型   | enum      | 限定了类型的可选值                    |
| 接口类型   | interface | 定义了对象类型中必须包含的字段              |
| 联合类型   | union     | 多个具体类型的联合                    |
| 输入类型   | input     | 作为参数传递的复杂对象                  |

GraphQL 中最基本的类型是对象类型以及其中包含的字段。对象类型通常表示 API 中的不同实体，其中的字段则与实体中的属性相对应。每个字段需要声明名称和类型，字段的类型可以是标量类型、枚举类型或是其他自定义的类型。

GraphQL 中提供了内置的标量类型 Int、Float、String、Boolean 和 ID，也允许不同的实现提供自定义的标量类型。ID 表示唯一的标识符，在使用上类似 String。

GraphQL 中的枚举类型与 Java 中的枚举类型是相似的。下面的代码给出了枚举类型的示例。

```java
enum TrafficColor {
    RED
    GREEN
    YELLOW
}
```

除了对象、标量和枚举类型之外，还可以通过感叹号来声明**非空（Non-Null）类型**，如 String! 表示值不能为 null 的 String 类型。非空类型可以用在字段中声明该字段的值不可能为 null，也可以用在参数声明中，用来声明该参数的实际值不能为 null。

当以方括号来封装某个类型时，就得到了该类型的列表形式，如 \[String\] 表示 String 列表，而 \[String!\] 表示元素为非空 String 的列表。

GraphQL 中的接口与 Java 中的接口作用类似，用来声明不同对象类型所共有的字段。联合类型则把多个具体的对象类型组合在一起，其值可以是任何一个对象类型。对于一个联合类型的对象，可以使用 __typename 字段来查看其实际的类型，在查询时，可以使用内联片段来根据不同的类型，选择相应的字段。

GraphQL 中的参数可以使用复杂对象，这些对象的类型通过输入类型来声明，如下面的代码所示：

```js
input CreateUserAddressRequest {
    name: String!,
    addressId: ID!
}
```

#### 查询执行

当 GraphQL 的查询发送到服务器时，由服务器负责查询的执行，查询的执行结果的结构与查询本身的结构相匹配。查询在执行时需要依靠类型系统的支持。GraphQL 查询中的每个字段都可以看成是它类型上的一个函数或方法，该函数或方法会返回一个新的类型。

每个类型的每个字段，在服务器上都有一个函数与之对应，称为**解析器（Resolver）**。当需要查询某个字段时，这个字段对应的解析器会被调用，从而返回下一个需要处理的值，这个过程会递归下去，直到解析器返回的是标量类型的值。GraphQL 的查询过程，总是以标量值作为结束点。

如果字段本来就是对象中的属性，那么获取这些字段的解析器的实现非常简单，并不需要开发人员显式提供。大部分的 GraphQL 服务器的实现库，都提供了对这种解析器的支持。如果一个字段没有对应的解析器，则默认为读取对象中同样名称的属性值。

### 实现 GraphQL 服务

下面介绍如何使用 GraphQL 来实现乘客管理界面的 API。后台实现使用的是 Java 语言，基于 GraphQL 的 Java 实现库 [graphql-java](https://www.graphql-java.com/)，以及相应的 Spring Boot 集成库 [graphql-spring-boot](https://github.com/graphql-java-kickstart/graphql-spring-boot)。在实际的数据获取时，使用的是不同微服务 API 的 Java 客户端。完整的实现请参考 GitHub 上源代码中示例应用的 happyride-passenger-web-api-graphql 模块。下图是 GraphQL 服务的架构示意图。


<Image alt="image (5).png" src="https://s0.lgstatic.com/i/image/M00/2E/CF/Ciqc1F8Fpv-AZk1NAABk0f47qTs188.png"/> 


#### 模式

在实现之前，需要先定义服务的 GraphQL 模式，下面的代码是 API 的 GraphQL 模式文件的内容。在模式中，首先定义了乘客、用户地址、地址和区域等 4 个对象类型，对应于 API 所提供的数据中的实体；接下来的 Query 类型中定义了 API 所提供的查询操作，包括查询乘客列表、查询单个乘客和地址，以及搜索地址；最后的 Mutation 类型中定义了 API 所提供的修改操作，即添加新的用户地址。Query 和 Mutation 类型中定义的字段，是整个 GraphQL 服务的入口。

```js
type Passenger {
    id: ID!
    name: String!
    email: String!
    mobilePhoneNumber: String
    userAddresses: [UserAddress!]
}
type UserAddress {
    id: ID!
    name: String!
    address: Address!
}
type Address {
    id: ID!
    areaId: Int!
    addressLine: String!
    lat: Float!
    lng: Float!
    areas: [Area!]
}
type Area {
    id: Int!
    level: Int!
    parentCode: Int!
    areaCode: Int!
    zipCode: String!
    cityCode: String!
    name: String!
    shortName: String!
    mergerName: String!
    pinyin: String!
    lat: Float!
    lng: Float!
    ancestors: [Area!]
}
type Query {
    passengers(page: Int = 0, size: Int = 10): [Passenger]
    passenger(id: ID!): Passenger
    address(id: ID!, areaLevel: Int = 0): Address
    searchAddress(areaCode: String!, query: String!): [Address]
}
input CreateUserAddressRequest {
    name: String!,
    addressId: ID!
}
type Mutation {
    addUserAddress(passengerId: ID!, request: CreateUserAddressRequest!): Passenger
}
```

#### 查询

为了实现查询操作，需要提供 Query 类型的解析器。下面代码中的 Query 类实现了 GraphQLQueryResolver 接口，其中的每个方法都对应查询模式中的一个字段。以获取乘客列表的 passengers 方法为例，它的参数 page 和 size 对应于字段的同名参数，而返回值类型 List 则与字段的类型 \[Passenger\] 相对应。在 passengers 方法的实现中，使用了乘客管理服务提供的 Java 客户端 PassengerApi 对象来调用 API 并获取结果。Query 类中的其他方法的实现，也采用类似的方式，与查询模式中的其他字段相对应。  

```java
@Component
public class Query implements GraphQLQueryResolver {
  @Autowired
  PassengerApi passengerApi;
  @Autowired
  AddressApi addressApi;
  public List<Passenger> passengers(final int page, final int size)
      throws ApiException {
    return this.passengerApi.listPassengers(page, size).stream()
        .map(ServiceApiHelper::fromPassengerVO)
        .collect(Collectors.toList());
  }
  public Passenger passenger(final String id) throws ApiException {
    return Optional.ofNullable(this.passengerApi.getPassenger(id))
        .map(ServiceApiHelper::fromPassengerVO)
        .orElse(null);
  }
  public AddressVO address(final String id, final int areaLevel)
      throws io.vividcode.happyride.addressservice.client.ApiException {
    return this.addressApi.getAddress(id, areaLevel);
  }
  public List<AddressVO> searchAddress(final String areaCode,
      final String query)
      throws io.vividcode.happyride.addressservice.client.ApiException {
    return this.addressApi.searchAddress(Long.valueOf(areaCode), query);
  }
}
```

#### 修改

对于模式中的修改操作，需要提供 Mutation 类型的解析器。下面代码中的 Mutation 类实现了 GraphQLMutationResolver 接口，其中的 addUserAddress 方法对应于修改模式中的同名字段。

```java
@Component
public class Mutation implements GraphQLMutationResolver {
  @Autowired
  PassengerApi passengerApi;
  public Passenger addUserAddress(final String passengerId,
      final CreateUserAddressRequest request)
      throws ApiException {
    return ServiceApiHelper
        .fromPassengerVO(this.passengerApi.createAddress(passengerId, request));
  }
}
```

#### 自定义解析器

在查询模式的解析器中，字段对应的方法直接返回了 Passenger 和 AddressVO 对象。对于 GraphQL模式中的 Passenger 和 Address 类型中的字段，如果对应的 Java 对象中有同名的属性，那么 GraphQL 服务器可以自动进行解析。比如，Passenger 类型中的 name 和 email 字段，会直接解析成对应的 Java 中的 Passenger 对象中的 name 和 email 属性。

在 GraphQL 模式中，UserAddress 类型中的 address 字段的类型是 Address，而乘客管理服务 API 只提供了地址的标识符，需要调用地址管理服务的 API 才能获取到实际的地址信息。在这种情况下，需要使用自定义的解析器来获取 address 字段的值。

下面的代码是 Address 对象类型对应的 Java 类，其中的 getAddress 方法用来解析 address 字段，该方法的 DataFetchingEnvironment 类型的参数表示的是获取数据时的上下文环境。当 GraphQL 服务器执行该字段的查询时，会提供 DataFetchingEnvironment 接口的实现对象。

DataFetchingEnvironment 接口的 getContext 方法可以获取到与本次查询相关的上下文对象。从该上下文对象中获取到包含了 DataLoader 对象的 DataLoaderRegistry 对象，再查找到对应的 DataLoader 对象来进行实际的地址获取操作。DataLoader 是 GraphQL 服务器实现中获取数据的通用接口。需要注意的是，getAddress 方法返回的是 CompletableFuture`<AddressVO>`对象，表示这是一个异步获取操作。

```java
@Data
public class UserAddress {
  private String id;
  private String name;
  private String addressId;
  public CompletableFuture<AddressVO> getAddress(
      final DataFetchingEnvironment environment) {
    final GraphQLContext context = environment.getContext();
    return context.getDataLoaderRegistry()
        .map(
            registry -> registry.
                <String, AddressVO>getDataLoader(USER_ADDRESS_DATA_LOADER)
                .load(this.addressId))
        .orElse(CompletableFuture.completedFuture(null));
  }
```

下面代码中的 UserAddressLoader 类是获取地址操作的 BatchLoader 接口的实现。数据加载是异步完成的，同时也是批量进行的。这里通过 AddressApi 的异步调用方法 getAddressesAsync 来调用 API。

```java
@Component
public class UserAddressLoader implements BatchLoader<String, AddressVO> {
  @Autowired
  AddressApi addressApi;
  @SneakyThrows(ApiException.class)
  @Override
  public CompletionStage<List<AddressVO>> load(final List<String> keys) {
    final CompletableFuture<List<AddressVO>> future = new CompletableFuture<>();
    this.addressApi.getAddressesAsync(
        new AddressBatchRequest(keys),
        new ApiCallback<List<AddressVO>>() {
          @Override
          public void onFailure(final ApiException e, final int statusCode,
              final Map<String, List<String>> responseHeaders) {
            future.completeExceptionally(e);
          }
          @Override
          public void onSuccess(final List<AddressVO> result,
              final int statusCode,
              final Map<String, List<String>> responseHeaders) {
            future.complete(result);
          }
          @Override
          public void onUploadProgress(final long bytesWritten,
              final long contentLength, final boolean done) {
          }
          @Override
          public void onDownloadProgress(final long bytesRead,
              final long contentLength, final boolean done) {
          }
        });
    return future;
  }
}
```

#### Spring 配置

为了启动 GraphQL 服务，需要通过 Spring 的配置来创建 GraphQLSchema 类型的 bean，如下面的代码所示。首先使用 SchemaParser 来解析 GraphQL 模式文件，然后设置查询和修改的两个解析器，最后创建出 GraphQLSchema 对象。其他的相关工作，由 Spring Boot 的自动配置功能来完成。

```java
@Configuration
public class SchemaConfig {
  @Autowired
  Query query;
  @Autowired
  Mutation mutation;
  @Bean
  public GraphQLSchema graphQLSchema() {
    return SchemaParser.newParser()
        .file("passenger-api.graphqls")
        .resolvers(this.query, this.mutation)
        .build()
        .makeExecutableSchema();
  }
}
```

在启动 Spring Boot 应用之后，通过路径 /graphql 可以访问 GraphQL 服务。除此之外，如果添加了对 GraphQL 的工具 GraphiQL 的依赖，还可以通过路径 /graphiql 来访问该工具。很多工具都提供了对 GraphQL 的支持，可以在开发中使用，包括 Postman 和 Insomnia。

下图是使用 Insomnia 查询 GraphQL 时的截图。


<Image alt="insomnia.png" src="https://s0.lgstatic.com/i/image/M00/2E/CF/Ciqc1F8Fp3yAHFszAAMallAEM2s704.png"/> 


### 总结

作为一个新的开放 API 的方式，GraphQL 释放了客户端的查询能力，已经得到了广泛的流行。通过本课时的学习，你可以了解 GraphQL 中的基本概念，包括查询和修改，以及如何编写 GraphQL 模式，还可以掌握如何使用 Java 来实现基于 Spring Boot 的 GraphQL 服务器。

