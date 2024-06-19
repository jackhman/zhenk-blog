# 第42讲：使用SpringHATEOAS增强REST服务的语义

从本课时开始，我们将介绍一些与云原生微服务开发相关的话题，这些话题之间相互独立，都围绕一个较小的主题来展开。本课时将介绍如何使用 Spring HATEOAS 增强 REST 服务的语义。

### HATEOAS

REST 是目前大部分 API 使用的架构，在实践 REST 架构时，不同的实现可能有不同的处理方式。很多 API 虽然号称采用 REST 架构，但是并没有遵循 REST 架构的约束要求，我们可以用 REST 成熟度模型来描述 REST 技术的成熟程度。

该模型把 REST 服务按照成熟度划分成 4 个层次：

* 第一个层次（Level 0）的 Web 服务只是使用 HTTP 作为传输方式，实际上它只是远程方法调用（RPC）的一种具体形式，SOAP 和 XML-RPC 都属于此类；

* 第二个层次（Level 1）的 Web 服务引入了资源（Resource）的概念，每个资源有对应的标识符和表达（Representation）；

* 第三个层次（Level 2）的 Web 服务使用不同的 HTTP 方法来进行不同的操作，并且使用 HTTP 状态码来表示不同的结果，比如 HTTP GET 方法来获取资源，HTTP DELETE 方法来删除资源；

* 第四个层次（Level 3）的 Web 服务使用 HATEOAS，在资源的表达中包含了链接信息，客户端可以根据链接来发现可以执行的动作。

从上述 REST 成熟度模型中可以看到，使用 HATEOAS 的 REST 服务是成熟度最高的。HATEOAS（Hypermedia as the Engine of Application State）是 REST 架构风格中最复杂的约束，也是构建成熟 REST 服务的核心。它的重要性在于打破了客户端和服务器之间严格的契约，使得客户端可以智能地发现服务所提供的功能，而 REST 服务本身的演化和更新也变得更加容易。

对于不使用 HATEOAS 的 REST 服务，客户端和服务器的实现之间是紧密耦合的，客户端需要根据服务器提供的相关文档来了解服务所暴露的资源和对应的操作。当服务的实现发生了变化时，比如修改了资源的 URI，客户端也需要进行相应的修改。

在使用 HATEOAS 的 REST 服务中，客户端通过服务提供的资源的表达来智能地发现可以执行的操作。当服务发生了变化时，客户端并不需要作出修改，因为资源的 URI 和其他信息都是动态发现的。

HATEOAS 和 OpenAPI 所要解决的问题不同，OpenAPI 规范提出了一种描述 API 的标准方式。开发者需要从 API 的文档中手动地查找到调用某个 API 的地址，还需要从文档中了解不同 API 之间的对应关系。以一个订单的 API 为例，当需要调用该 API 来支付订单时，需要从文档中找到相应的地址。HATEOAS 解决的是 API 的使用问题。如果订单 API 使用 HATEOAS 来实现，那么在获取到当个订单资源的表达之后，从中可以找到一个关系是 payment 的链接，其中就包含了支付订单 API 的地址。这样的使用方式，比从 API 文档中查找要方便很多。

### Spring HATEOAS

Spring 框架下的 spring-hateoas 子项目为 Spring Web 项目增加了 HATEOAS 支持，对于 Spring Boot 应用来说，只需要添加对 spring-boot-starter-hateoas 的依赖即可。下面介绍 Spring HATEOAS 的使用。

#### 链接

HATEOAS 中最重要的概念是**链接（Link）**，用来在不同的资源之间建立联系，链接由两个部分组成，分别是链接所指向的超文本的地址，以及链接所代表的关系的名称。链接的地址通常是同一服务中不同的 REST 资源的地址，而关系则根据当前资源和链接指向的资源之间的联系来确定。

IANA 定义了一些常用的关系名称，如下表所示。

|   **名称**   |         **含义**         |
|------------|------------------------|
| self       | 指向当前资源的链接              |
| edit       | 编辑当前资源的链接              |
| first      | 指向列表中的第一个资源的链接         |
| next       | 指向列表中的下一个资源的链接         |
| prev       | 指向列表中的上一个资源的链接         |
| last       | 指向列表中的最后一个资源的链接        |
| collection | 指向当前资源所在的集合的链接         |
| item       | 指向当前资源中所代表的集合中的一个元素的链接 |
| payment    | 对当前资源进行支付操作的链接         |

在开发中应该优先使用这些标准的关系，这些关系都在 IanaLinkRelations 中有常量定义。下面的代码给出了 Spring HATEOAS 中 Link 类的用法，通过 of 方法来创建 Link 对象。

```java
Link.of("/self"); //默认使用关系self 
Link.of("/edit", IanaLinkRelations.EDIT); //使用IANA定义的标准关系 
Link.of("/custom", "custom"); //使用自定义关系
```

在创建 Link 对象时，使用的链接地址通常不是固定的，而是基于某种特定的模板来创建的，比如 /order/{orderId} 这样的模板。Spring HATEOAS 提供了对 URI 模板的支持。

在下面的代码中，我们直接使用带路径参数的 URI 模板来创建 Link 对象，通过 expand 方法可以用实际值来替代模板中的变量，从而得到实际的链接地址。Link 对象是不可变的，对该对象的方法的调用，都会创建一个新的 Link 对象。

```java
Link link = Link.of("/order/{orderId}"); 
link = link.expand(ImmutableMap.of("orderId", "123")); // 链接的地址为 "/order/123"
```

如果需要对 URI 模板进行更复杂的操作，可以使用 UriTemplate 类。在下面的代码中，我们使用 UriTemplate.of 方法来创建 UriTemplate 对象，再通过 with 方法来添加新的查询参数，Link 对象在创建时可以使用 UriTemplate 对象作为参数。

```java
UriTemplate uriTemplate = UriTemplate.of("/customer/{customerId}/orders") 
    .with(TemplateVariable.requestParameter("start")) 
    .with(TemplateVariable.requestParameterContinued("end")); 
Link link = Link.of(uriTemplate, "order") 
    .expand(ImmutableMap.of("customerId", "123", "start", "s", "end", "e")); 
// 链接的地址为 "/customer/123/orders?start=s&end=e"
```

#### 表达模型

为了在资源的超文本表达中添加链接，需要对应用中已有的模型进行封装，这些链接并不属于应用模型的一部分，可以使用标准的方式来进行封装。Spring HATEOAS 提供了进行封装所使用的模型，包括 RepresentationModel 类及其子类。

下面是 RepresentationModel 类及其子类的结构图。


<Image alt="1.png" src="https://s0.lgstatic.com/i/image/M00/3E/BC/CgqCHl8tFzaAcnP-AAA8DI88jKY723.png"/> 


这些模型的说明如下表所示。

|       **模型**        |       **说明**        |
|---------------------|---------------------|
| RepresentationModel | 基础的模型，包含 Link 对象的列表 |
| CollectionModel     | 用来封装实体集合的模型         |
| EntityModel         | 用来封装单个实体的模型         |
| PagedModel          | 包含了分页信息的模型          |

这些表达模型的使用方式取决于超文本模型与应用模型的匹配程度。如果表达模型仅用一个应用模型就可以完全表示，那么使用 EntityModel 来封装即可；否则需要创建新的模型类并继承自 RepresentationModel 类。

下面代码中的 getAddress 方法来自地址管理服务的 AddressController 类，与之前的实现相比，该方法增加了对 HATEOAS 的支持。该方法的返回值中包含的对象类型，从 AddressVO 类变成了 EntityModel 类，也就是用 EntityModel 来进行封装。在 getAddress 方法的实现中，EntityModel.of 方法用来封装已有的 AddressVO 对象，并添加新的关系为 self 的 Link 对象。  

```java
@GetMapping("/address/{addressId}") 
public ResponseEntity<EntityModel<AddressVO>> getAddress( 
    @PathVariable("addressId") String addressId, 
    @RequestParam(value = "areaLevel", required = false, defaultValue = "1") int areaLevel) { 
  return this.addressService.getAddress(addressId, areaLevel) 
      .map(address -> EntityModel.of(address, 
          linkTo(methodOn(AddressController.class).getAddress(addressId, areaLevel)).withSelfRel())) 
      .map(ResponseEntity::ok) 
      .orElseGet(() -> ResponseEntity.notFound().build()); 
}
```

在创建 Link 对象时，我们并没有直接指定超文本的链接，而是从控制器的方法调用中创建。上述代码中使用的 methodOn 和 linkTo 方法都来自 WebMvcLinkBuilder 类，用来从 Spring MVC 控制器的方法中创建链接。methodOn 方法的作用是捕获对 AddressController 类的 getAddress 方法的调用，并传递了与当前方法一样的参数值；methodOn 方法的返回值被传递给 linkTo 方法来创建链接，withSelfRel 方法的作用是使用 self 作为链接的关系。

下面代码中的 JSON 文本是 getAddress 方法的返回值，从中可以看到 _links 属性中包含的链接。

```json
{ 
    "id": "a8530c62-d837-4aa3-9078-4b47f3c20c6b", 
    "areaId": 16, 
    "addressLine": "王府井社区居委会-0", 
    "lng": 116.414943, 
    "lat": 39.914146, 
    "areas": [], 
    "_links": { 
        "self": { 
            "href": "http://localhost:8502/address/a8530c62-d837-4aa3-9078-4b47f3c20c6b?areaLevel=0" 
        } 
    } 
}
```

在表达一个集合时，可以使用 CollectionModel 来封装。下面的代码是添加了 HATEOAS 支持之后的 AddressController 类的 search 方法，该方法的返回值类型从 List`<AddressVO>` 变成了 CollectionModel\<EntityModel`<AddressVO>`\>，其中 CollectionModel 用来封装 List`<AddressVO>` 对象，而 EntityModel 用来封装单个的 AddressVO 对象。

对于 AddressService 类的 search 方法返回的 List`<AddressVO>` 对象，把其中包含的每个 AddressVO 对象都用 EntityModel.of 方法来封装，并添加相关的链接。整个集合再通过 CollectionModel.of 方法来封装。

```java
@GetMapping("/search") 
public CollectionModel<EntityModel<AddressVO>> search( 
    @RequestParam("areaCode") Long areaCode, 
    @RequestParam("query") String query) { 
  return CollectionModel 
      .of(this.addressService.search(areaCode, query) 
              .stream() 
              .map(address -> EntityModel.of(address, 
                  linkTo( 
                      methodOn(AddressController.class) 
                          .getAddress(address.getId(), 1)) 
                      .withSelfRel()) 
              ).collect(Collectors.toList()), 
          linkTo(methodOn(AddressController.class).search(areaCode, query)) 
              .withSelfRel()); 
}
```

下面代码中的 JSON 文本是 search 方法的返回值，该 JSON 文本的结构与不使用 HATEOAS 之前存在很大差异，AddressVO 对象的列表被移到了 _embedded 属性中，这是因为 Spring HATEOAS 默认使用的是 HAL 格式，这种格式的改变会对使用者产生影响。值得一提的是 AddressVO 对象中增加了链接，这个链接的存在，使得客户端在解析了列表中的对象之后，可以自动发现访问每个对象的地址，而不再需要查看文档。

```json
{ 
  "_embedded": { 
    "addressVOList": [ 
      { 
        "id": "2f934c5f-7e08-4902-a4c7-4df752361e42", 
        "areaId": 16, 
        "addressLine": "王府井社区居委会-0", 
        "lng": 116.414938, 
        "lat": 39.914294, 
        "areas": [], 
        "_links": { 
          "self": { 
            "href": "http://localhost:8502/address/2f934c5f-7e08-4902-a4c7-4df752361e42?areaLevel=1" 
          } 
        } 
      } 
    ] 
  }, 
  "_links": { 
    "self": { 
      "href": "http://localhost:8502/search?areaCode=110101001015&query=%E7%8E%8B%E5%BA%9C%E4%BA%95%E7%A4%BE%E5%8C%BA%E5%B1%85%E5%A7%94%E4%BC%9A" 
    } 
  } 
}
```

#### EntityLinks

在创建链接时，我们之前的做法是从 Spring MVC 的控制器方法中来生成链接。在很多时候，控制器的方法只是对某个领域模型 LCRUD 操作的集合，在这种情况下，可以使用 EntityLinks 对象来生成链接，并使用控制器方法更简单。

如果要使用 EntityLinks 对象，控制器需要遵循一定的规范，如下所示：

* 在控制器类上使用 @ExposesResourceFor 注解来声明领域对象的类型；

* 在控制器类上声明访问集合资源的路径；

* 在控制器类的某个方法上有访问单个资源路径的映射。

下面是乘客管理服务中 PassengerController 类的部分代码。在 PassengerController 类上通过 @ExposesResourceFor 注解声明了对象类型 PassengerVO，并通过 @RequestMapping 注解声明了访问集合资源的路径。在 getPassenger 方法中，我们使用 EntityLinks 对象的 linkToItemResource 方法来生成访问单个 PassengerVO 资源的链接。

```java
@RestController 
@ExposesResourceFor(PassengerVO.class) 
@RequestMapping("/passenger") 
public class PassengerController { 
  @Autowired 
  PassengerService passengerService; 
  @Autowired 
  EntityLinks entityLinks; 
  @GetMapping("{id}") 
  public ResponseEntity<EntityModel<PassengerVO>> getPassenger( 
      @PathVariable("id") String passengerId) { 
    return this.passengerService.getPassenger(passengerId) 
        .map(passenger -> EntityModel 
            .of(passenger, 
                this.entityLinks 
                    .linkToItemResource(PassengerVO.class, passengerId) 
                    .withSelfRel())) 
        .map(ResponseEntity::ok) 
        .orElse(ResponseEntity.notFound().build()); 
  } 
}
```

EntityLinks 对象中还包含了一个 linkToCollectionResource 方法来生成访问集合资源的链接。

#### 组装模型

在之前 AddressController 类的实现中，getAddress 和 search 方法都需要创建封装 AddressVO 对象的 EntityModel。为了减少代码重复，可以把模型的创建统一起来。

下面代码中的 AddressModel 类继承自 RepresentationModel 类，作为 AddressVO 对象的表达模型。表达模型只是属性的简单集合，并没有复杂的逻辑，因此所有的字段都是声明为 public 的。

```java
public class AddressModel extends RepresentationModel<AddressModel> { 
  public String id; 
  public Integer areaId; 
  public Long areaCode; 
  public String addressLine; 
  public BigDecimal lng; 
  public BigDecimal lat; 
}
```

下面代码中的 AddressModelAssembler 类用来把 AddressVO 对象转换成 AddressModel 对象，相关的转换操作在 toModel 方法中实现，最主要的工作是添加相关的链接。

```java
public class AddressModelAssembler extends 
    RepresentationModelAssemblerSupport<AddressVO, AddressModel> { 
  public AddressModelAssembler() { 
    super(AddressController.class, AddressModel.class); 
  } 
  @Override 
  public AddressModel toModel(AddressVO entity) { 
    AddressModel model = new AddressModel(); 
    model.add(linkTo( 
        methodOn(AddressController.class) 
            .getAddress(entity.getId(), 1)) 
        .withSelfRel()); 
    model.id = entity.getId(); 
    model.areaId = entity.getAreaId(); 
    model.areaCode = entity.getAreaCode(); 
    model.addressLine = entity.getAddressLine(); 
    model.lat = entity.getLat(); 
    model.lng = entity.getLng(); 
    return model; 
  } 
}
```

需要注意的是，在 RepresentationModelAssemblerSupport 类中有一个 createModelWithId 方法，可以创建 AddressModel 对象并添加关系为 self 的链接，这个方法通过控制器类上的 @RequestMapping 注解来计算出引用单个资源的路径。不过这种方式对 AddressController 类并不适用，因为在 AddressController 类中，访问单个资源的路径模板是 /address/{addressId}，而不是 /{addressId}。对于其他控制器类来说，如果遵循 RepresentationModelAssemblerSupport 类的惯例，那么使用 createModelWithId 方法会更简单。

在使用 AddressModelAssembler 类之后，进行模型转换的代码可以大大简化。在下面的代码中，AddressController 类的 search 方法使用 AddressModelAssembler 类的 toCollectionModel 方法来转换列表。

```java
@GetMapping("/search") 
public CollectionModel<AddressModel> search( 
    @RequestParam("areaCode") Long areaCode, 
    @RequestParam("query") String query) { 
  return this.assembler 
      .toCollectionModel(this.addressService.search(areaCode, query)); 
}
```

#### 处理模型

我们一般在创建表达模型的同时，就完成了对链接的创建。在有些情况下，可能会需要对某些表达模型进行独立的处理，相应的处理方式可能不适合放在某个模型中，比如根据配置在运行时动态调整。这个时候，就可以实现 RepresentationModelProcessor 接口来添加对任意模型的处理。

在下面的代码中，AreaProcessor 类添加了对 AddressModel 的处理，并添加了关系为 area 的链接，指向获取地址所在的区域的详细信息 API。Spring HATEOAS 可以自动识别 RepresentationModelProcessor 类型的 bean，并应用其中包含的对模型的修改。

```java
@Component 
public class AreaProcessor implements 
    RepresentationModelProcessor<AddressModel> { 
  @Override 
  public AddressModel process(AddressModel model) { 
    model.add( 
        linkTo(methodOn(AddressController.class).getArea(model.areaCode, 1)) 
            .withRel("area")); 
    return model; 
  } 
}
```

#### 媒体类型

媒体类型的作用是把 HATEOAS 模型转换成特定的超文本表达形式，大部分的表达形式以 JSON 作为基本的格式，只不过具体的格式有所不同。Spring HATEOAS 默认使用超文本应用语言（Hypertext Application Language，HAL）作为表达模型时的格式。HAL 使用 application/hal+json 作为媒体类型，其中最基本的概念是资源和链接。资源中可以包含链接和内嵌资源，内嵌资源包含在 _embedded 属性中，而链接信息则包含在 _links 属性中。

除了 HAL 之外，Spring HATEOAS 还支持其他不同的媒体类型，应用也可以开发自己的媒体类型。

### 总结

HATEOAS 可以增强 REST 服务的语义，从而方便客户端更好地使用服务，自动发现服务所提供的功能。通过本课时的学习，你可以了解 REST 成熟度模型、HATEOAS 的基本概念，以及如何使用 Spring HATEOAS 为 Spring Boot 微服务增加 HATEOAS 支持。

最后呢，成老师邀请你为本专栏课程进行结课评价，因为你的每一个观点都是我们最关注的点。[点击链接，即可参与课程评价](https://wj.qq.com/s2/6902680/3fb2/)。

