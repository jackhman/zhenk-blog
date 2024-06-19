# 第27讲：实战入门GraphQL，如何将RESTAPI换成GraphQL

从本节开始将深入介绍 query-graphql-plugin 插件，我们会启动 SkyWalking Rocketbot 来查询 Trace 数据和 JVM 监控数据，这些用户查询请求最终都会路由到 query-graphql-plugin 插件中进行处理。

### GraphQL 简介

GraphQL 是一个用于 API 的查询语言，是一个使用基于类型系统来执行查询的服务端运行时。GraphQL 并没有和任何特定数据库或者存储引擎绑定。GraphQL 对服务端 API 中的数据提供了一套易于理解的完整描述，使得客户端能够准确地获得它需要的数据，而且没有任何冗余，也让 API 更容易地随着时间推移而演进，还能用于构建强大的开发者工具。使用 GraphQL 开发 API 有如下好处。

* 可描述：使用 GraphQL，你获取的都是你想要的数据，不多也不会少；

* 分级：GraphQL 天然遵循了对象间的关系，通过一个简单的请求，我们可以获取到一个对象及其相关的对象。

* 强类型：使用 GraphQL 的类型系统，能够清晰、准确的描述数据，这样就能确保从服务器获取的数据和我们查询的一致。

* 跨语言：GraphQL 并不绑定于某一特定的语言。

* 兼容性：GraphQL 不限于某一特定存储平台，GraphQL 可以方便地接入已有的存储、代码、甚至可以连接第三方的 API。

### GraphQL 类型系统

在一篇文章中完整介绍 GraphQL 本身，以及如何在 Java 服务端使用 GraphQL 几乎是不可能的，其中会涉及很多琐碎的细节需要说明，并且还需要列举一些示例。本课时并不是一篇完整的 GraphQL Java 教程，这里重点介绍 query-graphql-plugin 插件涉及的 GraphQL 知识点。

GraphQL 的类型系统与 Java 的类型系统非常相似，主要有下面 6 种类型：

1. Scalar，类似于 Java 中的基本变量。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image/M00/21/B6/CgqCHl7q_OOAPGBqAAPjNVHf5Xk878.png"/> 


2. Object，类似于 Java 中的对象，这里使用 GraphQL 定义一个 Book 类型，它就是 Object 类型，在 GraphQL Java 中对应的是 GraphQLObjectType。

```java
type Book {
    id: ID # 编号
    name: String #书名
    pageCount: Int #页数
    author: Author # 作者
}
```

3. Interface，类似于 Java 中的接口，在下面中的示例如下：

```java
interface ComicCharacter {
    name: String;
}
```

在 GraphQL Java 中对应的类型是 GraphQLInterfaceType。

4. Union，在 Java 中没有 Union 类型，但是在 C++ 中有 Union 类型，在 GraphQL Schema 中的示例如下：

```java
type Cat {
    name: String;
    lives: Int;
}
type Dog {
    name: String;
    bonesOwned: int;
}
union Pet = Cat | Dog
```

在 GraphQL Java 中对应的类型是 GraphQLUnionType。在使用 Interface 或 Union 时，如果需要获取对象真实类型，可以通过 TypeResolver 进行判断。

5. InputObject，主要用于封装方法参数，GraphQL Schema 中的定义与 Object 类似，主要区别是将 type 关键字换成 input 关键字。GraphQL Java 中对应的类型是 GraphQLInputObjectType。

6. Enum，类似于 Java 中的枚举，不再赘述。

### GraphQL Java 基础入门

SkyWalking OAP 中的 query-graphql-plugin 插件也使用了 GraphQL 开发其 API，这里就简单介绍如何在 Java 中使用 GraphQL。

#### 定义 GraphQL Schema

首先，我们需要定义一套 GraphQL Schema，似于要使用数据库存储数据之前，需要先建表，之后上层应用才能读写数据库。GraphQL Java 服务端要是响应用户的请求，也需要定义一个描述数据的结构，也就是这里的 GraphQL Schema。一般我们会将 GraphQL Schema 单独放到 resources 目录下，这里以图书信息管理的为例，resources/book.graphql 文件如下所示，其中定义了 Book、Author、Query 三个类型，其中 Book 和 Author 类似于普通的 JavaBean，Query 则类似于 Java 中的接口定义：

```java
type Book {
    id: ID # 编号
    name: String #书名
    pageCount: Int #页数
    author: Author # 作者
}
type Author {
  id: ID # 作者编号
  firstName: String # 作者姓名
  lastName: String
}
type QueryBook {
    # getById()类似于Java方法，根据Id查询书籍信息
    # id是方法参数，ID是类型，"!"表示非空
    # Book是返回值类型，这里返回的是一个Book对象
    getById(id: ID!): Book
    # 查询Book列表
    list: [Book]
}
```

#### 加载 GraphQL Schema 文件

在 GraphQL Java 中加载并解析 GraphQL Schema 文件的方式如下：

```java
@Component
public class GraphQLProvider {
    private GraphQL graphQL;
    @Bean
    public GraphQL graphQL() {
        return graphQL;
    }
    @PostConstruct
    public void init() throws IOException {
        // 读取 GraphQL Schema文件并创建 GraphQL实例，
        // 该GraphQL实例会通过上面的 graphQL()方法暴露给Spring，
        // 默认情况下，请求到"/graphql"这个path上的请求都会由该GraphQL实例处理
        URL url = Resources.getResource("book.graphqls");
        String sdl = Resources.toString(url, Charsets.UTF_8);
        GraphQLSchema graphQLSchema = buildSchema(sdl);
        this.graphQL = GraphQL.newGraphQL(graphQLSchema).build();
    }
    private GraphQLSchema buildSchema(String sdl) {
        // GraphQL Schema文件被解析之后，就是这里的 TypeDefinitionRegistry对象
        TypeDefinitionRegistry typeRegistry = new SchemaParser().parse(sdl);
        // 注册DataFetcher，DataFetcher的介绍以及buildWiring()方法实现在后面马上会进行介绍
        RuntimeWiring runtimeWiring = buildWiring();
        SchemaGenerator schemaGenerator = new SchemaGenerator();
        // 将GraphQL Schema中定义的与 DataFetcher关联起来
        return schemaGenerator.makeExecutableSchema(typeRegistry, runtimeWiring);
    }
    // 这哪是省略buildWiring()方法
}
```

这里我们接触到了几个新类型。

* GraphQL：它默认将处理"/graphql"这个 path 上的全部请求；

* TypeDefinitionRegistry：它是 GraphQL Schema 文件的解析结果；

* SchemaGenerator: 它关联了 TypeDefinitionRegistry 对象和后面要介绍的 DataFetcher 对象，并生成一个 GraphQLSchema 对象；

* RuntimeWiring：后面介绍的 DataFetcher 对象将注册到 RuntimeWiring 中，具体的注册方式在 buildWiring() 方法中（后面分析）。

#### 关联 DataFetcher

DataFetcher 是在 GraphQL Java 服务端中比较重要的概念之一。DataFetcher 的核心功能是：获取查询字段的相应数据。DataFetcher 接口的实现如下：

```java
public interface DataFetcher<T> {
    // DataFetchingEnvironment中记录了很多信息，例如：
    // 该 DataFetcher对应的字段以及类型、查询的外层对象以及根对象、当前上下文信息等等一系列信息
    T get(DataFetchingEnvironment dataFetchingEnvironment) throws Exception;
}
```

在 GraphQLProvider.buildWiring() 方法中，我们为 Query.getById 方法与 Book.author 字段绑定了自定义的 DataFetcher 实现，具体实现如下：

```java
@Autowired
GraphQLDataFetchers graphQLDataFetchers;
private RuntimeWiring buildWiring() {
    return RuntimeWiring.newRuntimeWiring()
            // 将Query.getById与getBookByIdDataFetcher()方法返回的DataFetcher实现关联
            .type(newTypeWiring("Query").dataFetcher("getById", 
                            graphQLDataFetchers.getBookByIdDataFetcher())
                            .dataFetcher("list", graphQLDataFetchers.listDataFetcher()))
            // 将Book.author字段与getBookByIdDataFetcher()方法返回的DataFetcher实现关联
            .type(newTypeWiring("Book").dataFetcher("author", 
                            graphQLDataFetchers.getAuthorDataFetcher()))
            .build();
}
```

GraphQLDataFetchers 的定义如下，GraphQLDataFetchers 中定义了 books 和 authors 两个集合来模拟数据源，getBookByIdDataFetcher() 方法和 getAuthorDataFetcher() 方法返回的自定义 DataFetcher 实现会分别查询这两个集合返回相应数据：

```java
@Component
public class GraphQLDataFetchers {
    private static List<ImmutableMap<String, String>> books = Arrays.asList(
            ImmutableMap.of("id", "book-1","name", "Harry Potter and the Philosopher's Stone","pageCount", "223","authorId", "author-1"),
    );
    private static List<ImmutableMap<String, String>> authors = Arrays.asList(
            ImmutableMap.of("id", "author-1","firstName", "Joanne","lastName", "Rowling"),
    );
    public DataFetcher getBookByIdDataFetcher() {
        return dataFetchingEnvironment -> {
            // 获取 id参数，然后根据id查找 books集合并返回相应的 Book信息
            String bookId = dataFetchingEnvironment.getArgument("id");
            return books.stream().filter(book -> book.get("id").equals(bookId))
                    .findFirst().orElse(null);
        };
    }
    public DataFetcher getAuthorDataFetcher() {
        return dataFetchingEnvironment -> {
            // DataFetcher 会按照 GraphQL Schema定义从外层向内层调用
            // 这里可以直接通过 DataFetchingEnvironment获取外层 DataFetcher查找到的数据(即关联的Book）
            Map<String, String> book = dataFetchingEnvironment.getSource();
            String authorId = book.get("authorId");  // 根据 authorId查找作者信息
            return authors.stream().filter(author -> author.get("id").equals(authorId))
                    .findFirst().orElse(null);
        };
    }
    public DataFetcher listDataFetcher() {
       return dataFetchingEnvironment -> books;
    }
}
```

GraphQL Schema 中的每个字段都会关联一个 DataFetcher，如果未通过 RuntimeWiring 方式明确关联的自定义 DataFetcher ，会默认关联 PropertyDataFetcher。PropertyDataFetcher 会有多种方式从外层结果中为关联字段查找正确的值：

1. 如果外层查找结果为 null，则直接返回 null，否则执行步骤 2；

2. 通过 function 从外层查询结果中提起对应字段值，该 function 是在 PropertyDataFetcher 初始化时指定，若未指定 function 则执行步骤 3；

3. 如果外层查询结果为 Map，则从该 Map 中直接获取字段值；

4. 如果外层查询结果是 Java 对象，则调用相应的 getter 方法获取字段值。

最后我们回顾整个示例项目，其核心逻辑如下图：


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image/M00/21/AB/Ciqc1F7q_W-AJHWvAALYJGT3C0E099.png"/> 


#### 启动

启动该 Spring 项目之后，可以使用 GraphQL Playground 这个工具访问"/graphql"，并传入查询 Book 的请求，如下图所示：


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image/M00/21/AB/Ciqc1F7q_b2ASlkPAAG_Pnp7t9o721.png"/> 


如果想查看 Http 请求，可以点击 COPY CURL 按钮获取相应的 curl 命令，如下所示：

```java
curl 'http://localhost:8080/graphql' -H 'Content-Type: application/json' --data-binary '{"query":"\n{\n      getById(id:\"book-1\") {\n        id\n        name\n        pageCount\n        author{\n        \tfirstName\n        \tlastName\n        }\n    }\n}"}' --compressed
```

list 请求如下图所示：


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image/M00/21/AB/Ciqc1F7q_ciALYuxAAKZFgwrgvo996.png"/> 


到此为止，GraphQL Java Demo 项目的涉及的基础知识就全部介绍完了。

### GraphQL Java Tools 入门

在使用 GraphQL Java 开发服务端 API 的时候，需要手写前文介绍的 DataFetcher 实现、GraphQLSchema 解析逻辑以及 GraphQL 对象的实例化过程。

GraphQL Java Tools 可以帮助我们屏蔽底层的 GraphQL Java 中的复杂概念和重复代码，GraphQL Java Tools 能够从 GraphQL Schema 定义（即 .graphqls 文件）中构建出相应的 Java 的 POJO 类型对象，GraphQL Java Tools 将读取 classpath 下所有以 .graphqls 为后缀名的文件，然后创建 GraphQL Schema 对象。GraphQL Java Tools 也是依赖于 GraphQL Java 实现的。

这里依然以上面图书管理的 demo 为例来介绍 GraphQL Java Tools 的使用，前文示例的GraphQL Schema 定义的 Book 、Author 以及 Query 三种类型我们保持不变。Query 接口是 GraphQL 查询的入口，我们可以通过 extend 的方式扩展 Query，如下所示：

```java
extend type Query{ # 扩展 Query
    getAuthorById(id: ID!): Author # 根据 id查询作者信息
}
```

GraphQL Schema 中还可以定义 Mutation 类型作为修改数据的入口，如下所示，启动定义了 createBook 和 createAuthor 两个方法，分别用来新增图书信息和作者信息：

```java
type Mutation {
    createBook(input : BookInput!) : Book!
    createAuthor(firstName:String!, lastName:String!) : ID!
}
input BookInput {  # input 表示入参
    name : String!
    pageCount : String!
    authorId: String!
}
```

这里引入了一个 BootInput 类型，将需要传递到服务端的数据封装起来，GraphQL 中返回类型和输入类型（input）是不能共用的，所以加上 input 后缀加以区分。

GraphQL Java Tools 可以将 GraphQL 对象的方法和字段映射到 Java 对象。一般情况下，GraphQL Java Tools 可以通过 POJO 的字段或是相应的 getter 方法完成字段读取，对于复杂字段，则需要定义相应的 Resolver 实现。例如，下面为 GraphQL Schema 定义对应了 Book 和 Author 两个 POJO（以及 BookInput）：

```java
public class Book {
    private String id;
    private String name;
    private int pageCount;
    private String authorId;
    // 省略 getter/setter 方法
}
public class Author {
    private String id;
    private String firstName;
    private String lastName;
    // 省略 getter/setter 方法
}
public class BookInput {
    private String name;
    private int pageCount;
    private String authorId;
    // 省略 getter/setter 方法
}
```

很明显，这里定义的 Book.java 中大部分字段都与 GraphQL Schema 中的 Book 一一对应，但是 authorId 字段与 GraphQL Schema 中 Book 的 author 字段是无法直接完成映射的，这里就需要一个 GraphQLResolver 实现来完成该转换，例如下面的 BookResolver 实现：

```java
@Component
class BookResolver implements GraphQLResolver<Book> {
@Autowired
private AuthorService authorService;
    public Author author(Book book) {
        return authorService.getAuthorById(book.getAuthorId());
    }
}
```

在 GraphQL Java Tools 需要将 Java 对象映射成 GraphQL 对象的时候，首先会尝试使用相应 GraphQLResolver（示例中的 BookResolver） 的相应方法完成映射（示例中的 author() 方法），如果在 GraphQLResolver 没有方法才会使用相应的 getter 方法或是直接访问字段。

BookResolver.author() 方法的实现也可以看出，被映射的 Java 对象需要作为参数传入。

<br />


在 GraphQL Schema 中定义的 Query 和 Mutation 是 GraphQL 查询和修改数据的入口，它们对应的 Resolver 实现需要实现 GraphQLQueryResolver 或 GraphQLMutationResolver。例如下面定义的 BookService 以及 AuthorService：

```java
public interface BookService extends GraphQLQueryResolver, GraphQLMutationResolver {
    Book getBookById(String id);
    List<Book> list();
    Book createBook(BookInput input);
} 
public interface AuthorService extends GraphQLQueryResolver, GraphQLMutationResolver {
    String createAuthor(String firstName, String lastName);
    Author getAuthorById(String id);
}
```

GraphQL Java Tools 会根据方法名将上述 GraphQLQueryResolver 或 GraphQLMutationResolver 与 GraphQL Schema 中的 Query 和 Mutation 进行映射。

BookService 和 AuthorService 的具体实现如下：

```java
@Service
public class BookServiceImpl implements BookService {
    // 使用递增方式生成 id后缀
    private AtomicLong idGenerator = new AtomicLong(0L);
    // 这里并没有使用持久化存储，而是使用该 List将图书信息保存在内存中
    private static List<Book> books = Lists.newCopyOnWriteArrayList();
    @Override
    public Book getBookById(String id) {
    return books.stream().filter(b -> b.getId().equals(id))
    .findFirst().orElse(null);
}
    @Override
    public List<Book> list() {
    return books;
    }
    @Override
    public Book createBook(BookInput input) {
        String id = "book-" + idGenerator.getAndIncrement();
        Book book = new Book();
        book.setId(id);
        book.setName(input.getName());
        book.setPageCount(input.getPageCount());
        book.setAuthorId(input.getAuthorId());
        books.add(book);
        return book;
    } 
}
@Component
public class AuthorServiceImpl implements AuthorService {
    private AtomicLong idGenerator = new AtomicLong(0L);
    private static List<Author> authors = Lists.newCopyOnWriteArrayList();
@Override
public String createAuthor(String firstName, String lastName) {
    String id = "author-" + idGenerator.getAndIncrement();
    Author author = new Author();
    author.setId(id);
    author.setFirstName(firstName);
    author.setLastName(lastName);
    authors.add(author);
    return id;
}
@Override
public Author getAuthorById(String id) {
    return authors.stream().filter(a -> a.getId().equals(id))
    .findFirst().orElse(null);
    }
}
```

最后，我们启动该 Demo 项目，使用 GraphQL Playground 分别请求 Query 和 Mutation 中定义的接口，如下图所示：


<Image alt="Drawing 7.png" src="https://s0.lgstatic.com/i/image/M00/21/B7/CgqCHl7q_i-AIWISAAH5fsYHv6s340.png"/> 



<Image alt="Drawing 8.png" src="https://s0.lgstatic.com/i/image/M00/21/B7/CgqCHl7q_jWAYBBBAAH-aJOU-Zk683.png"/> 


到此为止，GraphQL 入门示例分析就结束了。

