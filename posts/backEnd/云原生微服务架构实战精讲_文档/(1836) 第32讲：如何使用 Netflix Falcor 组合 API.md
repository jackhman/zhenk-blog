# 第32讲：如何使用NetflixFalcor组合API

上一课时介绍了 API 组合的基本概念，以及如何用 Spring Cloud Gateway 来实现 API 组合，不过 Spring Cloud Gateway 的做法，本质上与一般的 REST API 并没有区别，REST API 的特点是，对于特定的请求，所对应的响应结构是固定的。在设计 REST API 时，就已经严格定义了请求和响应的结构，也是调用者和提供者之间的交互协议。这一点在 OpenAPI 规范中可以清楚地看到。这种结构上的确定性，虽然方便了使用者，但也带来了一定的局限性。

在大部分情况下，REST API 所返回的数据结构，与使用者对数据的要求并不完全匹配。当 API 所提供的数据多于使用者的需要时，处理方式还比较简单，只需要忽略多余的数据即可，但是传输多余的数据也会导致更长时间的网络延迟和更多的内存消耗。这些消耗对桌面客户端还可以接受，但是对移动客户端就不能轻易忽略，影响的不仅仅是流量，还包括电池消耗。

如果一个 API 所提供的数据不能满足需求，就需要使用第 31 课时介绍的技术来组合多个 API。Backend For Frontend 模式可以解决一部分的问题，但仍然免不了需要根据客户端的需求，对 API 进行调整和维护。

造成这种问题的根源在于 API 的使用者无法随意地控制 API 返回的数据，当使用者的需求发生变化时，总是需要 API 的提供者首先做出修改，然后使用者再消费新版本的 API。API 的版本化，并没有从根本上解决这个问题，只是让 API 的变化更加容易管理。从使用者的角度来说，如果能够根据使用的需要，自主的选择所要查询的数据，那么当使用的需求发生改变时，并不需要 API 提供者做出改变，这无疑可以极大地提升开发效率。这种需求催生了新技术的出现。

本课时要介绍的 Netflix Falcor 和下一课时要介绍的 GraphQL，它们的**特点都是允许使用者自主选择所要的数据**，这就给了使用者最大限度的灵活性。API 的提供者不再需要为了满足特定使用者的需求而做出改动，只是负责提供数据。这种做法在带来灵活性的同时，也增加了使用者的复杂度，下面举例说明。

以示例应用为例，乘客 App 中包含一个视图来显示当前乘客的基本信息。在这个视图中，只显示了用户地址的名称，如"家庭"和"公司"之类的。

在使用了 Backend For Frontend 模式之后，乘客 App 所使用的 API 仅提供了这些数据。如果在新版本中，需要增加显示完整的地址，如"北京市海淀区XX路XX号"，那么首先需要修改 API 来提供新增的数据，App 再进行修改。

但如果使用的是 Falcor 或 GraphQL 的模式，乘客 App 只需要修改它获取数据的查询即可，后端并不需要修改。

### Netflix Falcor------数据即 API

Netflix Falcor 的核心理念：数据即 API。这种理念描述起来也很简单，因为对于使用者来说，其根本在乎的是提供者所开放的数据，而 API 只是获取数据的一种方式。

一般的 REST API 虽然对使用者开放了提供者内部的数据，但从另外一个角度来说，也限制了对数据的使用方式，这种限制造成了使用者和提供者之间的紧密耦合。

但 Falcor 中所公开的是数据本身，以及通用的获取和更新数据的方式，具体的使用则完全由客户端来确定。

在 Falcor 的架构中，数据由一个抽象的 JSON 图来表示。这个 JSON 图中包含了提供者所能开放的全部数据，并以图的形式表示出来。这种图的表示形式，与数据库中的实体关系模型、面向对象中的对象关系图，以及领域驱动设计中的聚合的引用关系，在本质上都是相似的，**都是把数据抽象成实体，以及实体之间的引用关系**。这些实体及其关联关系，来自应用所在的领域，组成了应用的模型。

在示例应用中，我们抽象出了乘客、地址、司机、行程和行程派发等多个相互引用的实体，以及这些实体之间的关系。这些实体和关系组成了示例应用所能提供的数据。

Falcor 使用 JSON 来描述数据。由于 JSON 实际上是一种树形结构，无法直接表达图中的引用关系。Falcor 对 JSON 进行了扩展，增加了新的基本类型来描述图相关的信息。Falcor 实际上由对 JSON 图对象进行操作的一系列协议组成。

### JSON 图

#### 1. 路径

JSON 图（JSON Graph）中的每个实体都有唯一的**路径**（Path），这个路径是实体唯一的保存路径，也是其他实体进行引用时的路径，这个路径称为该实体的身份路径（Identity Path）。

* 键（Key）

JSON 图中的路径是一系列**键**的序列，从 JSON 对象的根开始。路径可以通过两种方式来表示，一种是键的数组，另外一种是字符串。数组的形式类似于 \["a", "b", "c"\]，而字符串的形式则类似于 a.b.c。

合法的键的类型包括字符串、布尔类型、数字和 null，可以使用数字来表示 JSON 数组的下标，如 \["passengers", 0, "name"\] 表示 passengers 数组中第一个元素的 name 属性。在开发中，推荐使用数组的形式，因为字符串形式实际上也是先转换为数组形式来使用的。直接使用数组可以避免额外的解析操作，因此性能更好。

* 路径集合（Path Set）

多个路径可以组成**路径集合**。路径集合除了可以简单地把多个路径组织在一起，还支持更加复杂的语法。除了键之外，还可以使用范围和键的数组。

在下面的代码中，第一个路径集合表示的是 addresses 数组中的第 1 和第 4 个元素，而第二个路径集合则表示的是 addresses 数组中的第 1 到第 4 个元素。

```java
["addresses", [0, 3], "addressLine"] //键的数组
["addresses", {from: 0, to: 3}, "addressLine"] // 范围
```

#### 2. 基本类型

JSON 图增加了 3 种基本类型，即引用（Reference）、原子（Atom）和错误（Error），这些类型实际上都是 JSON 图中的对象，只不过包含了表示类型的 $type 属性和表示具体值的 value 属性。这 3 个基本类型的值，只能作为一个整体来替换，不能进行修改。

基本类型的 $type 和 value 属性的说明，如下表所示：

| **类型** | **$type 属性** | **value 属性** |
|--------|--------------|--------------|
| 引用     | ref          | 表示路径的数组      |
| 原子     | atom         | JSON 中的值     |
| 错误     | error        | 错误消息         |

**（1）引用**

引用对象的作用是引用其他的实体，value 的值是被引用实体的身份路径。下面的代码是引用类型的示例。

```json
{
  "$type":"ref",
  "value":[
    "passengersById",
    "xyz123"
  ]
}
```

**（2）原子**

原子类型的作用是为 JSON 中的值添加元数据。客户端模型在处理数据时需要使用这些元数据。在下面的代码中，JSON 中的 string 类型的值被转换成原子类型。

```java
{
  "$type":"atom",
  "value":"home"
}
```

**（3）错误**

错误类型表示的是数据操作的错误。JSON 图中的数据可能来自远端的服务，因此数据操作可能出现与网络或后台相关的错误。当出现错误时，对应的值可以用错误对象来替代。如果需要对多个值进行操作，一个值的错误不会影响到其他正常完成的值。下面代码中是错误类型的示例。

```json
{
  "$type":"error",
  "value":"Resource not found"
}
```

#### 3. 操作

JSON 图支持 3 种不同的抽象操作，即读取（Get）、设置（Set）和调用（Call）。

读取操作从 JSON 图中获取基本类型的值。读取操作的输入是任意数量的路径，而输出则是 JSON 图的一个子集，包含这些路径所对应的值。读取操作会自动处理 JSON 图中的引用关系。

设置操作修改 JSON 图中的值。设置操作的输入是路径和值的对，而输出则是 JSON 图的一个子集，包含了被修改的路径和对应的值。

当需要对 JSON 图中的多个值进行复杂的修改时，应该使用调用操作。调用操作是作用于 JSON 图上的函数，也是 JSON 图的一部分，该函数在执行时可以接受 4 个参数，如下表所示。

|   **参数**   |        **说明**         |
|------------|-----------------------|
| callPath   | 需要调用的函数在 JSON 图对象中的路径 |
| args       | 函数调用时的参数              |
| refPaths   | 从函数调用的返回值中获取数据的路径     |
| extraPaths | 函数执行之后额外获取的数据的路径      |

调用函数的返回值是一个 JSON 对象，可以包含下表中给出的属性。

|   **属性**    |           **说明**            |
|-------------|-----------------------------|
| jsonGraph   | 包含执行结果 JSON 图的子集            |
| invalidated | 函数执行之后改变的路径，调用者需要作废这些路径的缓存值 |
| paths       | 执行结果的 JSON 图的子集中包含的全部路径     |

JSON 图是一个抽象的结构，在实际的开发中，需要使用的是具体的数据源、模型和路由器。接下来我会对这三者展开讲解。下图是 Falcor 中不同组成部分的架构图。


<Image alt="image (8).png" src="https://s0.lgstatic.com/i/image/M00/2B/C2/CgqCHl7-6leAYwDZAABWO8EqY4w340.png"/> 


### 数据源

数据源用来把 JSON 图暴露给模型，每个数据源都与一个 JSON 图关联。模型通过执行 JSON 图的抽象操作来访问数据源所提供的 JSON 图。

下表给出了数据源接口 DataSource 中的方法，这 3 个方法的返回值类型都是 Observable`<JSONGraphEnvelope>`。这 3 个操作与 JSON 图中的抽象操作相对应。

| **方法** |                            **参数**                            | **说明** |
|--------|--------------------------------------------------------------|--------|
| get    | pathSets: Array                                              | 读取     |
| set    | JSONGraphEnvelope                                            | 设置     |
| call   | callPath: Path args: Array refPaths: Array extraPaths: Array | 调用     |

### 模型

在有了数据源之后，客户端理论上可以直接使用数据源提供的接口来访问 JSON 图。不过更好的做法是通过模型作为视图与数据源之间的中介。模型在数据源的基础上，提供了一些实用的功能，包括把 JSON 图中的数据转换成 JSON 对象，在内存中缓存数据以及进行批量处理。相对于数据源，模型所提供的接口更加易用。

下面代码给出了作为示例 JSON 图的内容，其中包含了乘客和地址两类实体。

```json
{
  "passengersById": {
    "p1": {
      "name": "Passenger 1",
      "email": "passenger1@test.com",
      "userAddresses": [
        {
          "id": "ua1",
          "name": "Home",
          "address": {
            "$type": "ref",
            "value": ["addressesById", "a1"]
          }
        }
      ]
    },
    "p2": {
      "name": "Passenger 2",
      "email": "passenger2@test.com"
    }
  },
  "addressesById": {
    "a1": {
      "addressLine": "Address 1",
      "lat": 0,
      "lng": 0
    },
    "a2": {
      "addressLine": "Address 2",
      "lat": 1,
      "lng": 1
    }
  }
}
```

模型在创建时需要提供一个 DataSource 接口的对象，或者作为缓存的 JSON 对象。在下面的代码中，从 JSON 对象中创建了一个 Model 对象。

```javascript
const falcor = require('falcor');
const jsonGraph = require('./sample_json_graph.json');
const model = new falcor.Model({
  cache: jsonGraph
});
```

下面代码是基本的获取和设置操作的示例，第二个 getValue 方法的调用，展示了 JSON 图中引用对象的自动解析功能。

```javascript
model.getValue(["passengersById", "p1", "name"]).then(debug); // "Passenger 1"
model.getValue(["passengersById", "p1", "userAddresses", 0, 'address', 'addressLine']).then(debug); // "Address 1"
model.setValue(jsong.pathValue(["passengersById", "p1", "name"], "new name")).then(debug); // "new name"
```

### 路由器

路由器是 DataSource 接口的实现，一般运行在服务器端用来给模型提供数据。在微服务架构的应用中，路由器扮演了 API 组合的角色。路由器由一系列的路由组成，每个路由匹配 JSON 图中的路径集合，对于每个路由，需要定义它所支持的操作，以及每个操作具体的实现。

Falcor 提供了基于 Node.js 的路由器实现库，本课时通过 Falcor 来实现乘客管理 API 的组合，完整的代码请参考 GitHub 上源代码中的 happyride-passenger-web-api-falcor 模块。

下面的代码给出了路由器中两个重要路由的实现，每个路由的 route 属性表示匹配的路径。与 REST API 中的路由不同的是，Falcor 中的路由匹配的是 JSON 图的路径，而不是 URI 路径。除了 route 属性之外，还可以添加 get、set 或 call 属性来声明该路由支持的操作。

第一个路由的路径用来获取乘客的基本信息，比如路径 passengersById\['p01'\].name 用来获取标识符为 p01 乘客的 name 属性的值。在实现这个路由时，使用 getPassenger 方法调用乘客管理服务的 API，再把得到的返回值中的属性值提取出来，保存在 JSON 图中。函数 toEntityJsonGraph 封装了相关的逻辑。

第二个路由实现了 call 操作来为乘客添加新的地址，调用时需要提供 3 个参数，即乘客标识符、地址名称和地址标识符。实际的添加操作通过 addUserAddress 方法调用地址管理服务的 API 来完成。需要注意的是返回值中的 invalidated 属性声明了缓存中需要作废的路径。

```javascript
app.use(
  "/model.json",
  falcorExpress.dataSourceRoute(function (req, res) {
    return new Router([
      {
        route:
          "passengersById[{keys:ids}]['name', 'email', 'mobilePhoneNumber', 'userAddresses']",
        get: function (pathSet) {
          return toEntityJsonGraph(
            "passengersById",
            pathSet.ids,
            pathSet[2],
            getPassenger
          );
        },
      },
      {
        route: "passengersById.addUserAddress",
        call: function (callPath, args) {
          return addUserAddress(args[0], args[1], args[2]).then(
            (response) => {
              return {
                jsonGraph: {},
                paths: [],
                invalidated: [["passengersById", response.id, "userAddresses"]],
              };
            }
          );
        },
      },
    ]);
  })
);
```

下面的代码展示了在模型中如何调用路由器中的函数来添加用户地址。第一个参数是函数的路径，第二个参数是调用时的参数，第三个参数为空，第四个参数是返回值中需要额外获取的路径。当函数调用成功之后，返回值中会包含乘客的全部地址，包括新添加的地址。

```javascript
model
  .call(
    ["passengersById", "addUserAddress"],
    [passengerId, addressName, addressId],
    [],
    [[passengerId, "userAddresses"]]
  )
  .then(successCallback)
  .catch(errorCallback);
```

### 总结

Netflix Falcor 把后端的数据以 JSON 图的形式来开放，允许客户端以更加灵活的方式来对数据进行查询和修改。通过本课时的学习，你可以了解如何更好地让客户端来使用开放数据，以及 Falcor 中的基本概念，并使用 Falcor 来设计和实现复杂的 API。

