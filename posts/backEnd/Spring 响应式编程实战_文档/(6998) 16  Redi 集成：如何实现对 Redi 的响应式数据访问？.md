# 16Redi集成：如何实现对Redi的响应式数据访问？

上一讲，我们介绍了 Spring Data MongoDB Reactive 组件，它是 Spring Data MongoDB 的响应式版本。今天我们要讨论的是 Spring Data Redis Reactive 组件，它专门针对 Redis 这款 NoSQL 数据库提供了响应式编程能力。

使用该组件的步骤与 MongoDB 类似，我们同样围绕开发环境的初始化、Repository 的创建以及与 Service 层之间的集成这些步骤展开讨论，并结合 ReactiveSpringCSS 案例来集成这款主流的缓存中间件。

### Spring Data Redis Reactive 技术栈

我们可以通过导入 spring-boot-starter-data-redis-reactive 依赖来集成 Spring Data Reactive Redis 模块。与上一讲介绍的 MongoDB 不同，Redis 不提供响应式存储库，也就没有 ReactiveMongoRepository 这样的工具类可以直接使用。因此，ReactiveRedisTemplate 类成为响应式 Redis 数据访问的核心工具类。与 ReactiveMongoTemplate 和 ReactiveMongoOperations 之间的关系类似，ReactiveRedisTemplate 模板类实现了 ReactiveRedisOperations 接口定义的 API。

ReactiveRedisOperations 中定义了一批针对 Redis 各种数据结构的操作方法，如下所示。

```java
public interface ReactiveRedisOperations<K, V> {
 
    <HK, HV> ReactiveHashOperations<K, HK, HV> opsForHash();
	<K, HK, HV> ReactiveHashOperations<K, HK, HV> opsForHash(RedisSerializationContext<K, ?> serializationContext);
 
    ReactiveListOperations<K, V> opsForList();
	<K, V> ReactiveListOperations<K, V> opsForList(RedisSerializationContext<K, V> serializationContext);
 
    ReactiveSetOperations<K, V> opsForSet();
	<K, V> ReactiveSetOperations<K, V> opsForSet(RedisSerializationContext<K, V> serializationContext);
 
    ReactiveValueOperations<K, V> opsForValue();
	<K, V> ReactiveValueOperations<K, V> opsForValue(RedisSerializationContext<K, V> serializationContext);
 
    ReactiveZSetOperations<K, V> opsForZSet();
	<K, V> ReactiveZSetOperations<K, V> opsForZSet(RedisSerializationContext<K, V> serializationContext);
 
...
}
```

上述方法分别对应了 Redis 中 String、List、Set、ZSet 和 Hash 这五种常见的数据结构。同时，我们还看到了一个用于序列化管理的上下文对象 RedisSerializationContext。ReactiveRedisTemplate 提供了所有必需的序列化/反序列化过程，所支持的序列化方式包括常见的 Jackson2JsonRedisSerializer、JdkSerializationRedisSerializer、StringRedisSerializer 等。

除了序列化管理，ReactiveRedisTemplate 的另一个核心功能是完成自动化的连接过程管理。应用程序想要访问 Redis，就需要获取 RedisConnection，而获取 RedisConnection 的途径是通过注入 RedisConnectionFactory 到 ReactiveRedisTemplate 中，该 ReactiveRedisTemplate 就能获取 RedisConnection。

在 Redis 中，常见的 ConnectionFactory 有两种，一种是传统的 JedisConnectionFactory，而另一种就是新型的 LettuceConnectionFactory。LettuceConnectionFactory 基于 Netty 创建连接实例，可以在多个线程间实现线程安全，满足多线程环境下的并发访问要求。更为重要的是，LettuceConnectionFactory 同时支持响应式的数据访问用法，它是 ReactiveRedisConnectionFactory 接口的一种实现。Lettuce 也是目前 Redis 唯一的响应式 Java 连接器。Lettuce 4.x 版本使用 RxJava 作为底层响应式流实现方案。但是，该库的 5.x 分支切换到了 Project Reactor。

### 应用 Reactive Redis

在你对这一组件有一定的解了之后，接下来，我将要为你介绍使用 Spring Data Redis Reactive 进行系统开发的具体过程，首先要说的同样是初始化运行环境。

#### 初始化 Reactive Redis 运行环境

首先我们在 pom 文件中添加 spring-boot-starter-data-redis-reactive 依赖，如下所示。

```java
<dependency>
     <groupId>org.springframework.boot</groupId>
     <artifactId>spring-boot-starter-data-redis-reactive</artifactId>
</dependency>
```

然后我们通过 Maven 可以得到如下图所示的组件依赖图，可以看到 spring-boot-starter-data-redis-reactive 组件同时依赖于 spring-data-redis 和 luttuce-core 组件。


<Image alt="图片2.png" src="https://s0.lgstatic.com/i/image6/M01/3A/1D/Cgp9HWB-UKuAHIxRAA0aJtyWMgI410.png"/> 
  
spring-boot-starter-data-redis-reactive 组件依赖图

在上图中，我们同时看到 luttuce-core 组件中使用了 Project Reactor 框架中的 reactor-core 组件，这点与前面介绍的技术栈是完全一致的。

为了获取连接，我们需要初始化 LettuceConnectionFactory。LettuceConnectionFactory 类的最简单使用方法如下所示。

```java
@Bean
public ReactiveRedisConnectionFactory lettuceConnectionFactory() {
	    return new LettuceConnectionFactory();
}
	 
@Bean
public ReactiveRedisConnectionFactory lettuceConnectionFactory() {
        return new LettuceConnectionFactory("localhost", 6379);
}
```

当然，LettuceConnectionFactory 也提供了一系列配置项供我们在初始化时进行设置，示例代码如下所示，我们可以对连接的安全性、超时时间等参数进行设置。

```java
@Bean
public ReactiveRedisConnectionFactory lettuceConnectionFactory() {
        RedisStandaloneConfiguration redisStandaloneConfiguration = new RedisStandaloneConfiguration();
        redisStandaloneConfiguration.setDatabase(database);
        redisStandaloneConfiguration.setHostName(host);
        redisStandaloneConfiguration.setPort(port);
     redisStandaloneConfiguration.setPassword(RedisPassword.of(password));
        LettuceClientConfiguration.LettuceClientConfigurationBuilder lettuceClientConfigurationBuilder = LettuceClientConfiguration
               .builder();
        LettuceConnectionFactory factory = new LettuceConnectionFactory(redisStandaloneConfiguration,
               lettuceClientConfigurationBuilder.build());
	        return factory;
}
```

有了 LettuceConnectionFactory，就可以用它来进一步初始化 ReactiveRedisTemplate。ReactiveRedisTemplate 的创建方式如下所示。与传统 RedisTemplate 创建方式的主要区别在于，ReactiveRedisTemplate 依赖于 ReactiveRedisConnectionFactory 来获取 ReactiveRedisConnection。

```java
@Bean
ReactiveRedisTemplate<String, String> 
reactiveRedisTemplate(ReactiveRedisConnectionFactory factory) {
return new ReactiveRedisTemplate<>(factory, 
	RedisSerializationContext.string());
    }
 
    @Bean
    ReactiveRedisTemplate<String, Account> redisOperations(ReactiveRedisConnectionFactory factory) {
	Jackson2JsonRedisSerializer<Account> serializer = new 
	Jackson2JsonRedisSerializer<>(Account.class);
 
        RedisSerializationContext.RedisSerializationContextBuilder
	<String, Account> builder = RedisSerializationContext
        .newSerializationContext(new StringRedisSerializer());
 
    RedisSerializationContext<String, Account> context = 
	builder.value(serializer).build();
 
        return new ReactiveRedisTemplate<>(factory, context);
}
```

以上代码中，我们使用了 Jackson2 作为数据存储的序列化方式，并对 Account 对象映射的规则做了初始化。

#### 创建 Reactive Redis Repository

因为没有直接可用的 Reactive Repository，所以在创建针对 Redis 的响应式 Repository 时，我们将采用"14 \| 响应式全栈：响应式编程能为数据访问过程带来什么样的变化"中介绍的第三种方法，即自定义数据访问层接口。这里创建了 AccountRedisRepository 接口，代码如下。

```java
public interface AccountRedisRepository {
    Mono<Boolean> saveAccount(Account account);

    Mono<Boolean> updateAccount(Account account);

    Mono<Boolean> deleteAccount(String accountId);

    Mono<Account> findAccountById(String accountId);

    Flux<Account> findAllAccounts();
}
```

然后我们创建了 AccountRedisRepositoryImpl 类来实现 AccountRedisRepository 接口中定义的方法，这里就会用到前面初始化的 ReactiveRedisTemplate。AccountRedisRepositoryImpl 类代码如下所示。

```java
Repository
public class AccountRedisRepositoryImpl implements AccountRedisRepository{
 
  @Autowired
  private ReactiveRedisTemplate<String, Account> reactiveRedisTemplate;
 
  private static final String HASH_NAME = "Account:";
 
  @Override
  public Mono<Boolean> saveAccount(Account account) {
      return reactiveRedisTemplate.opsForValue().set(HASH_NAME + account.getId(), account);
  }
 
  @Override
  public Mono<Boolean> updateAccount(Account account) {
      return reactiveRedisTemplate.opsForValue().set(HASH_NAME + account.getId(), account);
  }
 
  @Override
  public Mono<Boolean> deleteAccount(String accountId) {
      return reactiveRedisTemplate.opsForValue().delete(HASH_NAME + accountId);
  }
 
  @Override
  public Mono<Account> findAccountById(String accountId) {
      return reactiveRedisTemplate.opsForValue().get(HASH_NAME + accountId);
  }
 
  public Flux<Account> findAllAccounts() {
      return reactiveRedisTemplate.keys(HASH_NAME + "*").flatMap((String key) -> {
          Mono<Account> mono = reactiveRedisTemplate.opsForValue().get(key);
          return mono;
      });
  }
}
```

上述代码中的 reactiveRedisTemplate.opsForValue() 方法将使用 ReactiveValueOperations 来实现对 Redis 中数据的具体操作。与传统的 RedisOperations 工具类一样，响应式 Redis 也提供了 ReactiveHashOperations、ReactiveListOperations、ReactiveSetOperations、ReactiveValueOperations 和 ReactiveZSetOperations 类来分别处理不同的数据类型。

同时，在最后的 findAllAccounts() 方法中，我也演示了如何使用"07 \| Reactor 操作符（上）：如何快速转换响应式流"中介绍的 flatMap 操作符，来根据 Redis 中的 Key 获取具体实体对象的处理方式，这种处理方式在响应式编程过程中应用非常广泛。

#### 在 Service 层中调用 Reactive Repository

在 Service 层中调用 AccountRedisRepository 的过程比较简单，我们创建了对应的 AccountService 类，代码如下所示。

```java
@Service
public class AccountService {
    @Autowired
	private AccountRedisRepository 
	accountRepository;
 
    public Mono<Boolean> save(Account account) {
        return accountRepository.saveAccount(account);
    }
 
    public Mono<Boolean> delete(String id) {
         return accountRepository.deleteAccount(id);
    }
 
    public Mono<Account> findAccountById(String id) {
        return accountRepository
	.findAccountById(id).log("findOneAccount");
    }

    public Flux<Account> findAllAccounts() {
         return accountRepository
	.findAllAccounts().log("findAllAccounts");
    }
}
```

可以看到，这些方法都只是对 AccountRedisRepository 中对应方法的简单调用。在每次调用中，我们也通过 log 操作符进行了日志的记录。

### 案例集成：在 ReactiveSpringCSS 案例中整合 Redis

在 ReactiveSpringCSS 中，Redis 的作用是实现缓存，这里就需要考虑它的具体应用场景。我们知道，在整体架构上，customer-service 一般会与用户服务 account-service 进行交互，但因为用户账户信息的更新属于低频事件，所以我们设计的实现方式是 account-service 通过消息中间件的方式将用户账户变更信息主动推送给 customer--service。而在这个时候，customer--service 就可以把接收到的用户账户信息保存在 Redis 中，两者之间的交互过程如下图所示。


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image6/M00/39/FD/CioPOWB9VM-AZWmYAADG17Qg_-g409.png"/> 
  
customer-service 服务与 account-service 服务交互图

在"10 \| WebFlux（上）：如何使用注解编程模式构建异步非阻塞服务"中，我们已经梳理了 customer-service 中用于生成客户工单的 generateCustomerTicket 方法的整体流程，我带你回顾一下其伪代码。

```java
generateCustomerTicket {
 
    创建 CustomerTicket 对象
 
	从远程 account-service 中获取 Account 对象
 
	从远程 order-service 中获取Order对象
 
	设置 CustomerTicket 对象属性
 
	保存 CustomerTicket 对象并返回
}
```

现在，customer-service 已经可以从 Redis 缓存中获取变更之后的用户账户信息了。但如果用户信息没有变更，那么 Redis 中就不存在相关数据，我们还是需要访问远程服务。因此，整体流程需要做相应的调整，如下所示。

```java
generateCustomerTicket {
 
    创建 CustomerTicket 对象
 
    if(Redis 中已存在目标 Account 对象) {
        从 Redis 中获取 Account 对象
	} else {
	    从远程 account-service 中获取 Account 对象
	}
 
	从远程 order-service 中获取 Order 对象
 
	设置 CustomerTicket 对象属性
 
	保存 CustomerTicket 对象并返回
}
```

让我们把上述流程的调整反映在案例代码上。针对上述流程，我先基于第 10 讲中的实现方法给出原始 ReactiveAccountClient 类的实现过程，如下所示。

```java
@Component
public class ReactiveAccountClient {
 
    public Mono<AccountMapper> findAccountById(String accountId) {
     Mono<AccountMapper> account = WebClient.create()
            .get()
            .uri("http://127.0.0.1:8082/accounts/{accountId}", accountId) 
            .retrieve()
            .bodyToMono(AccountMapper.class).log("getAccountFromRemote");
     return account;
    }
}
```

可以看到这里直接使用 WebClient 类完成了对 account-service 的远程调用。现在，流程做了调整，我们需要在进行远程调用之前，先访问 Redis。因此，我们先在 ReactiveAccountClient 类中添加针对访问 Redis 的相关代码。

```java
@Autowired
private AccountRedisRepository accountRedisRepository;

private Mono<AccountMapper> getAccountFromCache(String accountId) {

        return accountRedisRepository.findAccountById(accountId);
}
```

可以看到这里使用AccountRedisRepository完成数据的查询。然后，我们再基于该方法来重构 ReactiveAccountClient 中的 findAccountById 方法。

```java
public Mono<AccountMapper> findAccountById(String accountId){

     //先从 Redis 中获取目标 Account 对象
     Mono<AccountMapper> accountMonoFromCache = getAccountFromCache(accountId); 

     //如果 Redis 中没有目标 Account 对象，则进行远程获取
     Mono<AccountMapper> accountMono = accountMonoFromCache.switchIfEmpty(getAccountFromRemote(accountId));
     return accountMono;
}
```

这里用到了 Reactor 提供的switchIfEmpty 操作符来判断是否能够从 Redis 中获取目标 Account 对象，如果不能则再调用getAccountFromRemote 进行远程获取。getAccountFromRemote 方法如下所示。

```java
public Mono<AccountMapper> getAccountFromRemote(String accountId) {
     //远程获取 Account 对象
     Mono<AccountMapper> accountMonoFromRemote= WebClient.create()
            .get()
            .uri("http://127.0.0.1:8082/accounts/{accountId}", accountId) 
            .retrieve()
            .bodyToMono(AccountMapper.class).log("getAccountFromRemote");
     //将获取到的 Account 对象放入 Redis 中
     return accountMonoFromRemote.flatMap(this::putAccountIntoCache);
}
```

这里我们先从 account-service 中远程获取 Account 对象，然后再把获取到的对象通过 putAccountIntoCache 方法放入 Redis 中以便下次直接从缓存中进行获取。putAccountIntoCache 方法实现如下。

```java
private Mono<AccountMapper> putAccountIntoCache(AccountMapper account) {
	 
	return accountRedisRepository.saveAccount(account).flatMap( saved -> {
        Mono<AccountMapper> savedAccount = accountRedisRepository.findAccountById(account.getId());

        return savedAccount;
     });
}
```

上述代码中我们首先通过 accountRedisRepository 的 saveAccount 方法将对象保存到 Redis 中，然后再通过 findAccountById 从 Redis 中获取所保存的数据进行返回。**请注意，accountRedisRepository 的 saveAccount 方法的返回值是 Mono`<Boolean>`，而我们想要获取的目标对象类型是 Mono`<AccountMapper>`，所以这里使用了 flatMap 操作符完成了两者之间的转换**。这也是 flatMap 操作符非常常见的一种用法。

最后，让我们确认一下重构之后的 ReactiveAccountClient 的完整代码，如下所示。

```java
@Component
public class ReactiveAccountClient {

    @Autowired
    private AccountRedisRepository accountRedisRepository;

    private Mono<AccountMapper> getAccountFromCache(String accountId) {

        return accountRedisRepository.findAccountById(accountId);
    }

    private Mono<AccountMapper> putAccountIntoCache(AccountMapper account) {

     return accountRedisRepository.saveAccount(account).flatMap( saved -> {
        Mono<AccountMapper> savedAccount = accountRedisRepository.findAccountById(account.getId());

        return savedAccount;
     });
    }
 
    public Mono<AccountMapper> findAccountById(String accountId){

     //先从 Redis 中获取目标 Account 对象
     Mono<AccountMapper> accountMonoFromCache= getAccountFromCache(accountId); 

     //如果 Redis 中没有目标 Account 对象，则进行远程获取
     Mono<AccountMapper> accountMono = accountMonoFromCache.switchIfEmpty(getAccountFromRemote(accountId));

        return accountMono;
    }

    public Mono<AccountMapper> getAccountFromRemote(String accountId) {
     //远程获取 Account 对象
     Mono<AccountMapper> accountMonoFromRemote= WebClient.create()
            .get()
            .uri("http://127.0.0.1:8082/accounts/{accountId}", accountId) 
            .retrieve()
            .bodyToMono(AccountMapper.class).log("getAccountFromRemote");

     //将获取到的 Account 对象放入 Redis 中
     return accountMonoFromRemote.flatMap(this::putAccountIntoCache);
    }
}
```

现在，当我们访问 customer-service 里面 CustomerTicketService 中的 generateCustomerTicket 方法时，就会从 Redis 中获取数据从而提高访问效率。

### 小结与预告

Redis 是一款主流的缓存数据库，和 MongoDB 一样提供了实现响应式流的驱动程序。而 Spring 家族中的 Spring Data Redis Reactive 组件则提供了以响应式流的方法访问 Redis 的高效开发模式，本讲结合案例对这一组件的使用方式进行了详细的讨论。

最后给你留一道思考题：在使用 Spring Data Redis Reactive 时，如果想要实现一个自定义的响应式 Repository 应该怎么做？

在 Spring Data 中，除了 MongoDB 和 Redis 之外，还针对 Cassandra 和 CouchBase 提供了响应式驱动程序，对于关系型数据库而言则没有直接的解决方案。因此，如何在系统中为关系型数据库添加响应式数据访问机制，从而确保全栈式的响应式数据流是一大挑战。下一讲，我们将深入讨论这一话题。
> 点击链接，获取课程相关代码 ↓↓↓  
> [https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git](https://github.com/lagoueduCol/ReactiveProgramming-jianxiang.git?fileGuid=xxQTRXtVcqtHK6j8)

