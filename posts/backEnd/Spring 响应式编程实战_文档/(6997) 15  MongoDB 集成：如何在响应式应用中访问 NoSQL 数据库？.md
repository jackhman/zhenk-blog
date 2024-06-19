# 15MongoDB集成：如何在响应式应用中访问NoSQL数据库？

上一讲开始，我们进入了响应式数据访问这一模块的学习，并且引出了 Spring 家族中专门用于实现数据访问的 Spring Data 框架及其响应式版本。我们知道 Spring Data 支持多种响应式 Repository 用来构建全栈响应式编程模型，而 MongoDB 就是其中具有代表性的一种数据存储库。今天，我就将结合案例来给出 Reactive MongoDB 的使用方式。

### Spring Data MongoDB Reactive 技术栈

在介绍 Spring Data MongoDB Reactive 的使用方式之前，我们先来简要分析它的基本组成结构和所使用的技术栈。

显然，ReactiveMongoRepository 是开发人员所需要面对的第一个核心组件，你已经在上一讲中看到过它的定义，如下所示。

```java
public interface ReactiveMongoRepository<T, ID> extends 
ReactiveSortingRepository<T, ID>, ReactiveQueryByExampleExecutor<T> {
 
  <S extends T> Mono<S> insert(S entity);
  <S extends T> Flux<S> insert(Iterable<S> entities);
  <S extends T> Flux<S> insert(Publisher<S> entities);
  <S extends T> Flux<S> findAll(Example<S> example);
  <S extends T> Flux<S> findAll(Example<S> example, Sort sort);
}
```

Spring Data MongoDB Reactive 模块只有一个 ReactiveMongoRepository 接口的实现类，即 SimpleReactiveMongoRepository 类。它为 ReactiveMongoRepository 的所有方法提供实现，并使用 ReactiveMongoOperations 接口处理针对 MongoDB 的数据访问操作。例如在 SimpleReactiveMongoRepository 类中有一个 findAllById 方法，如下所示。

```java
    @Override
    public Flux<T> findAllById(Publisher<ID> ids) {
 
        Assert.notNull(ids, "The given Publisher of Id's must not be null!");
        return Flux.from(ids).buffer().flatMap(this::findAllById);
    }
```

可以看到这个方法使用 buffer 操作符收集所有 ids，然后使用 findAllById(Iterable `<ID>` ids) 重载方法创建一个请求。该方法反过来构建 Query 对象并调用 findAll(Query query) 方法，这时候触发 ReactiveMongoOperations 实例的 mongoOperations.find (query,...) 方法。

而 ReactiveMongoOperations 接口的实现类就是 ReactiveMongoTemplate 类，在这个模板工具类中，基于 MongoDB 提供的 Java 驱动程序完成对数据库的访问。我们在 ReactiveMongoTemplate 类所引用的包结构中可以看到这些驱动程序的客户端组件，如下所示。

```java
import com.mongodb.client.model.UpdateOptions;
import com.mongodb.client.result.UpdateResult;
...
 
import com.mongodb.reactivestreams.client.MongoClient;
import com.mongodb.reactivestreams.client.MongoCollection;
...
```

Spring Data 中的响应式 MongoDB 连接基于 MongoDB 响应式流 Java 驱动程序（mongo-java-driver-reactivestreams）构建。该驱动程序提供具有非阻塞背压的异步流处理。另一方面，响应式驱动程序构建在 MongoDB 异步 Java 驱动程序（mongo-java-driver-async）之上。这个异步驱动程序是低级别的，并且具有基于回调的 API，因此它不像更高级别的响应式流驱动程序那样易于使用。下图展示了 Spring Data 中整个响应式 MongoDB 的技术栈。


<Image alt="图片1.png" src="https://s0.lgstatic.com/i/image6/M01/38/5F/Cgp9HWB5NlyAUZ8vAAEVEX4GDg4227.png"/> 
  
Spring Data MongoDB Reactive 技术栈

而下图展示了基于 Maven 依赖所找到的对应的组件库。


<Image alt="图片2.png" src="https://s0.lgstatic.com/i/image6/M01/38/68/CioPOWB5NmeAMPT_AAa3JDFhfRw228.png"/> 
  
Spring Data MongoDB Reactive 中的组件库

### 应用 Reactive MongoDB

接下来，我要介绍使用 Spring Data MongoDB Reactive 进行系统开发的具体过程，将从开发环境的准备、Repository 的创建、数据的初始化以及与 Service 层之间的集成等几个步骤为你介绍。

首先要说的是需要初始化运行环境。

#### 初始化 Reactive MongoDB 运行环境

我们需要在 pom 文件中添加 spring-boot-starter-data-mongodb-reactive 依赖，如下所示。

```java
<dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-mongodb-reactive</artifactId>
</dependency>
```

然后我们通过 Maven 来查看组件依赖关系可以得到如下所示的组件依赖图。


<Image alt="图片3.png" src="https://s0.lgstatic.com/i/image6/M01/38/68/CioPOWB5NnOAFoIqAAhDv7J-DwA202.png"/> 
  
spring-boot-starter-data-mongodb-reactive 组件依赖图

可以看到 spring-boot-starter-data-mongodb-reactive 组件同时依赖于 spring-data-mongodb、mongodb-driver-reactivestreams 以及 reactor-core 等组件，这点与前面介绍的技术栈是完全一致的。

为了集成 Reactive MongoDB，在 Spring Boot 应用程序中，我们可以在它的启动类上添加 @EnableReactiveMongoRepositories 注解，包含该注解的 Spring Boot 启动类如下所示。

```java
@SpringBootApplication
@EnableReactiveMongoRepositories
public class SpringReactiveMongodbApplication {
 
  public static void main(String[] args) {
      SpringApplication.run(SpringReactiveMongodbApplication
	.class, args);
  }
}
```

事实上，默认情况下我们一般不需要在 Spring Boot 启动类中手工添加 @EnableReactiveMongoRepositories 注解。因为当添加 spring-boot-starter-data-mongodb-reactive 组件到 classpath 时，MongoReactiveRepositoriesAutoConfiguration 配置类会自动创建与 MongoDB 交互的核心类。MongoReactiveRepositoriesAutoConfiguration 类的定义如下所示。

```java
@Configuration
@ConditionalOnClass({ MongoClient.class, ReactiveMongoRepository.class })
@ConditionalOnMissingBean({ ReactiveMongoRepositoryFactoryBean.class,
      ReactiveMongoRepositoryConfigurationExtension.class })
@ConditionalOnProperty(prefix = "spring.data.mongodb.reactive-repositories", name = "enabled", havingValue = "true", matchIfMissing = true)
@Import(MongoReactiveRepositoriesAutoConfigureRegistrar.class)
@AutoConfigureAfter(MongoReactiveDataAutoConfiguration.class)
public class MongoReactiveRepositoriesAutoConfiguration {
 
}
```

可以看到这里引入了 MongoReactiveRepositoriesAutoConfigureRegistrar 类，如果 MongoDB 和 Spring Data 已经在 classpath 上，Spring Boot 会通过 MongoReactiveRepositoriesAutoConfigureRegistrar 类自动帮我们完成配置。MongoReactiveRepositoriesAutoConfigureRegistrar 类的定义如下。

```java
class MongoReactiveRepositoriesAutoConfigureRegistrar
      extends AbstractRepositoryConfigurationSourceSupport {
 
  @Override
  protected Class<? extends Annotation> getAnnotation() {
      return EnableReactiveMongoRepositories.class;
  }
 
  @Override
  protected Class<?> getConfiguration() {
      return EnableReactiveMongoRepositoriesConfiguration.class;
  }
 
  @Override
  protected RepositoryConfigurationExtension getRepositoryConfigurationExtension() {
      return new ReactiveMongoRepositoryConfigurationExtension();
  }
 
  @EnableReactiveMongoRepositories
  private static class EnableReactiveMongoRepositoriesConfiguration {
 
  }
}
```

在上述代码中，我们在最后部分看到了熟悉的 @EnableReactiveMongoRepositories 注解。显然，如果我们使用 Spring Boot 的默认配置，就不需要刻意在启动类上添加 @EnableReactiveMongoRepositories 注解。但如果希望修改 MongoDB 的配置行为，这个注解就可以派上用场。以下代码演示了 @EnableReactiveMongoRepositories 注解的使用方法。

```java
@Configuration
@EnableReactiveMongoRepositories(basePackageClasses = 
	OrderRepository.class)
public class MongoConfig extends AbstractReactiveMongoConfiguration {
 
    @Bean
    @Override
    public MongoClient reactiveMongoClient() {
        return MongoClients.create();
    }
 
    @Override
    protected String getDatabaseName() {
        return "order_test";
    }

    @Bean
public ReactiveMongoTemplate mongoTemplate() throws Exception {
        return new ReactiveMongoTemplate(mongoClient(), getDatabaseName());
    }
}
```

以上代码中，我们通过 @EnableReactiveMongoRepositories 注解指定了"basePackageClasses"为OrderRepository，同时修改所要访问的数据库名为"order_test"，这样就相当于对 Repository 类以及数据库的名称做了人为的指定，而在默认情况下系统会自动扫描 Repository 类，并默认使用领域实体的名称作为数据库名。

#### 创建 Reactive MongoDB Repository

接下来，我们来创建一个 Reactive MongoDB Repository。在这里，我们定义了一个领域实体 Account，并使用 @Document 和 @Id 等 MongoDB 相关的注解。Account 实体代码如下所示。

```java
@Document
public class Account {
    @Id
    private String id;
    private String accountCode;
	private String accountName;
	//省略 getter/setter
}
```

我们可以通过上一讲介绍的三种方式中的的任何一种来创建 Reactive MongoDB Repository。我们可以定义继承自 ReactiveMongoRepository 接口的 AccountReactiveMongoRepository 接口，同时该接口还继承了 ReactiveQueryByExampleExecutor 接口。

AccountReactiveMongoRepository 接口定义的代码如下所示，可以看到我们完全基于 ReactiveMongoRepository 和 ReactiveQueryByExampleExecutor 接口的默认方法来实现业务功能。

```java
@Repository
public interface AccountReactiveMongoRepository
extends ReactiveMongoRepository<Account, String>, 
	ReactiveQueryByExampleExecutor<Account> {
}
```

#### 使用 CommandLineRunner 初始化 MongoDB 数据

对于 MongoDB 等数据库而言，我们通常需要执行一些数据初始化操作。接下来我将介绍如何通过 Spring Boot 提供的 CommandLineRunner 来实现这一常见场景。

很多时候我们希望在系统运行之前执行一些前置操作，为了实现这样的需求，Spring Boot 提供了一个方案，即 CommandLineRunner 接口，定义如下所示。

```java
public interface CommandLineRunner {
        void run(String... args) throws Exception;
}
```

Spring Boot 应用程序在启动后，会遍历所有已定义的 CommandLineRunner 接口的实例并运行它们的 run() 方法。

此外，正如我在前面所介绍的，在 MongoDB 客户端组件中存在一个 MongoOperations 工具类。相对于 Repository 接口而言，MongoOperations 提供了更多方法，也更接近于 MongoDB 的原生态语言。基于 CommandLineRunner 和 MongoOperations，我们就可以对 MongoDB 进行数据初始化，示例代码如下所示。

```java
public class InitDatabase {
    @Bean
    CommandLineRunner init(MongoOperations operations) {
        return args -> {
           operations.dropCollection(Account.class);
 
           operations.insert(new Account("A_" + UUID.randomUUID().toString(),"account1", "jianxiang1"));
           operations.insert(new Account("A_" + UUID.randomUUID().toString(),"account2", "jianxiang"));

           operations.findAll(Account.class).forEach(
                   account -> {
                       System.out.println(account.getId()
                   );}
           );
        };
    }
}
```

在这个例子中，我们先通过 MongoOperations 的 dropCollection() 方法清除整个 Account 数据库中的数据，然后往该数据库中添加了两条记录，最后我们通过 findAll() 方法执行查询操作，获取新插入的两条数据并打印在控制台上。

#### 在 Service 层中调用 Reactive Repository

完成 AccountReactiveMongoRepository 并初始化数据之后，我们就可以创建 Service 层组件来调用 AccountReactiveMongoRepository。这里我们创建了 AccountService 类作为 Service 层组件，代码如下所示。

```java
@Service
public class AccountService{

    @Autowired
    private final AccountReactiveMongoRepository accountRepository;
    public Mono<Account> save(Account account) {
        return accountRepository.save(account);
    }
 
    public Mono<Account> findOne(String id) {
        return accountRepository
	.findById(id).log("findOneAccount");
    }
 
    public Flux<Account> findAll() {
        return accountRepository.findAll().log("findAllAccounts");
    }
 
    public Mono<Void> delete(String id) {
        return accountRepository
	.deleteById(id).log("deleteOneAccount");
    }

    public Flux<Account> getAccountsByAccountName(String accountName) {
      Account account = new Account();
      account.setAccountName(accountName);
 
      ExampleMatcher matcher = ExampleMatcher.matching()
          .withIgnoreCase()
          .withMatcher(accountName, GenericPropertyMatcher.of(StringMatcher.STARTING))
          .withIncludeNullValues();
 
      Example<Account> example = Example.of(account, matcher);

      Flux<Account> accounts = accountRepository.findAll(example).log("getAccountsByAccountName");

      return accounts;
	}
}
```

AccountService 类中的 save()、findOne()、findAll() 和 delete() 方法都来自 ReactiveMongoRepository 接口，而最后的 findByAccountName() 方法则使用了 ReactiveQueryByExampleExecutor 接口所提供的 QueryByExample 机制。

QueryByExample 可以翻译成按示例查询，是一种用户友好的查询技术。它允许动态创建查询，并且不需要编写包含字段名称的查询方法。实际上，QueryByExample 不需要使用特定的数据库查询语言来编写查询语句。从组成结构上讲，QueryByExample 包括 Probe、ExampleMatcher 和 Example 这三个基本组件。其中 Probe 包含对应字段的实例对象；ExampleMatcher 携带有关如何匹配特定字段的详细信息，相当于匹配条件；而 Example 则由 Probe 和 ExampleMatcher 组成，用于构建具体的查询操作。

在上述示例代码中，我们首先构建了一个 ExampleMatcher 用于初始化匹配规则，然后通过传入一个 Account 对象实例和 ExampleMatcher 实例构建了一个 Example 对象，最后通过 ReactiveQueryByExampleExecutor 接口中的 findAll() 方法实现了 QueryByExample 机制。

同时，你也应该注意到，在 AccountService 的 findOne()、findAll()、delete() 以及 findByAccountName() 这四个方法的最后都调用了 log() 方法，该方法使用了 Reactor 框架中的日志操作符，我们在"08 \| Reactor 操作符（下）：如何多样化裁剪响应式流"中有详细介绍。

通过添加 log() 方法，在执行这些数据操作时就会获取 Reactor 框架中对数据的详细操作日志信息。在这个示例中，我们启动服务并执行这四个方法，会在控制台中看到对应的日志。其中一部分日志展示了服务启动时通过 CommandLineRunner 插入初始化数据到数据库的过程，另一部分则分别针对各个添加了 log() 方法的操作打印出数据流的执行效果。在 Service 层通过 log() 方法添加日志是一种常见的开发技巧，你可以自己做一些尝试。

### 案例集成：构建基于 MongoDB 的数据访问层

在介绍完如何使用 Spring Data MongoDB Reactive 构建基于 MongoDB 的数据访问组件之后，让我们来到 ReactiveSpringCSS 案例中。针对案例中的数据访问场景，本讲所介绍的相关技术都可以直接进行应用。

事实上，在前面的介绍中，我们已经构建了 account-service 中的数据访问层，而其他两个服务中的数据访问层也类似，这里就不再细说了，你可以参考放在 Github 上的案例代码进行学习。

### 小结与预告

MongoDB 是一款主流的 NoSQL 数据库，其提供了实现响应式流的驱动程序，因此非常适合作为响应式系统中的持久化数据库。而 Spring 家族中的 Spring Data MongoDB Reactive 组件则提供了以响应式流的方法访问 MongoDB 的高效开发模式，本讲结合案例对这一组件的使用方式进行了详细的讨论。

这里给你留一道思考题：在使用 Spring Data MongoDB Reactive 时，针对查询操作可以使用哪些高效的实现方法？

在今天内容的基础上，下一讲我们将基于 Spring Data 框架中的 Spring Data Redis 组件来访问缓存数据库 Redis，并同样结合 ReactiveSpringCSS 案例完成对现有实现方式的重构。
> 点击链接，获取课程相关代码 ↓↓↓  
> [https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git](https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git?fileGuid=xxQTRXtVcqtHK6j8)

