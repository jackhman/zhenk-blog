# 第25讲：如何基于SpringSecurity和JWT实现访问控制

从本课时开始，我们将进入到本课程的第六部分，也就是满足微服务架构应用的**非功能性需求（Non-functional Requirements，NFR）**，非功能性需求与功能性需求相对应。功能性需求描述系统的行为或功能，而非功能性需求则与功能无关，用来描述系统的质量。系统的质量是一个很宽泛的概念，可以从很多不同的角度来描述，包括性能、安全性、可用性、可伸缩性、可靠性和可维护性等。实现相同功能的系统，它们在质量上的差别可能很大，或者说各有不同的侧重点。

由于非功能性需求与应用本身无关，在项目开发中积累的与非功能性需求相关的经验，可以更容易地在不同的项目中复用。不过非功能性需求所涵盖的内容很多，一个应用不可能满足全部的需求，而且有些非功能性需求也存在冲突。一个应用应该根据实际的需求，选择需要满足的非功能性需求。本课时将介绍与安全性相关的内容，使用 Spring Security 框架和 JWT。

### 认证

认证指的是验证用户的身份。在访问每个用户的私有资源时，访问者需要认证自己的身份，也就是证明你是你所声称的身份，这就需要提供用户的私有凭证，典型的凭证是密码。如果访问时提供的用户名和密码，与该用户注册时的记录相匹配，则完成了身份认证。由于 HTTP 请求和响应是无状态的，每次请求都需要带上认证信息，一般放在 HTTP 头 Authorization 中。

使用 HTTP 头来发送认证信息的做法，对 Web 应用来说不太适用。用户希望的体验是在输入用户名和密码登录了之后，在一段时间内都不需要再次登录，这是通过会话（Session）来实现的。每次登录之后，服务器端会为当前用户创建一个新的会话，并把会话的标识符以 Cookie 的形式返回并保存在浏览器中。浏览器在发送 HTTP 请求时会自动带上关联的 Cookie，其中就包括会话的标识符。如果该标识符对应的会话在服务器端仍然存在，那么该用户的身份认证成功，会话的标识符就等同于用户的身份。

除了 Web 应用之外，移动客户端和其他服务在发送 HTTP 请求时，一般通过 HTTP 头来发送认证信息。在最简单的 HTTP Basic 认证中，用户名和密码直接以 Base64 编码的形式来发送。Basic 认证实现起来最简单，但是安全系数比较低，如果 HTTP 请求被拦截，攻击者可以轻易获取到用户的密码。为了避免密码泄露，更好的做法是使用不透明的令牌（Token）来作为身份标识。从作用上来说，令牌与密码都是身份标识，如果令牌泄露，攻击者可以同样获取到一些数据。但是令牌可以提供更多的功能，令牌可以设置有效期，还可以被回收，每个令牌可以对应不同的权限。如果令牌泄露，可以把影响降到最低。

有很多认证方式都采用令牌，包括 OAuth 2 和 OpenID Connect。这些认证方式都需要对令牌进行管理，包括令牌的创建、刷新、回收和验证。客户端的使用则简单很多，只需要把令牌放在 HTTP 头中即可。通常使用的是 HTTP 头 Authorization，并在令牌前面添加前缀 Bearer。本课时介绍的是 JWT，也是目前非常流行的认证方式。

### JWT

JWT（JSON Web Token）的作用是在不同的参与者之间安全的传递申明（Claim）。JWT 本身是一系列申明的紧凑的、URL 安全的表示形式，JWT 中的申明以 JSON 对象的方式来进行编码。JWT 可以与JSON Web Signature（JWS）和 JSON Web Encryption（JWE）一块使用，使得申明可以添加数字签名、通过消息认证码（Message Authentication Code，MAC）来保证完整性，以及进行加密。JWT 和相关的规范都是 IETF 的标准。

#### 申明

申明是关于一个特定的参与者或对象的定义或主张，JWT 规范中定义了一些常用的申明，也可以使用公开或私有的申明。JWT 中的申明分成三种，分别是已注册的申明、公开申明和私有申明。

已注册的申明是 JWT 规范中直接定义的，目前一共有 7 种，如下表所示。为了内容紧凑，这些申明的名称都由 3 个字符组成。

| **JSON 属性名称** | **名称** | **说明**                             |
|:--------------|:-------|:-----------------------------------|
| iss           | 签发者    | 签发 JWT 的实体                         |
| sub           | 主体     | JWT 的主体，主体的值要么全局唯一，要么在其签发者的范围内是唯一的 |
| aud           | 接收者    | JWT 所预期的接收者                        |
| exp           | 过期时间   | 超过该时间之后，JWT 不能被处理                  |
| nbf           | 生效时间   | 在该时间之前，JWT 不能被处理                   |
| iat           | 签发时间   | JWT 的签发时间                          |
| jti           | 标识符    | JWT 的唯一标识符，用来防止 JWT 被重复处理          |

除了已注册的申明之外，JWT 对于申明的名称并没有限制。为了避免名称冲突，公开的申明需要在 IANA 注册，或是使用带名称空间的形式。私有申明的名称则比较随意，有可能产生冲突。

#### 格式

JWT 的格式非常简单，只是以英文句号分隔的多个部分所组成的字符串，每个部分都是 Base64-URL 编码的格式。Base64-URL 是 Base64 编码的一种变体，把 Base64 编码结果中的"+"替换成了"-"，而"/"替换成了"_"，也去掉了末尾的"="。

根据 JWT 的不同类型，所组成的部分也不相同，如下表所示。

| **JWT 类型** | **组成部分**               |
|:-----------|:-----------------------|
| 不安全 JWT    | 头、载荷                   |
| 已签名 JWT    | 头、载荷、签名                |
| 加密 JWT     | 头、已加密的密钥、初始化向量、加密数据、签名 |

JWT 头中包含的是关于 JWT 本身的申明，根据 JWT 的类型有不同的申明可以使用。载荷中包含的是需要传递的数据，头和载荷都是 JSON 对象，不安全的 JWT 在实际开发中不推荐使用。因此下面主要介绍已签名 JWT 和加密 JWT。

#### 已签名 JWT

已签名的 JWT 通过数字签名来防止数据被篡改，已签名 JWT 的头中需要包含申明 alg 来指定签名的算法。JWT 头和载荷都需要以 Base64-URL 进行编码，得到的结果以英文句点连接在一起之后，作为数字签名算法的输入，算法的输出结果也同样以 Base64-URL 编码，就得到了签名，最后把签名添加在末尾。JSON Web Algorithms 规范中定义了常用的算法，不同的 JWT 库所支持的算法不尽相同。只有 HS256，也就是 HMAC 加上 SHA-256，是必须支持的。

下面的代码中给出了已签名 JWT 的一个示例。

```yaml
eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiJ1c2VyIiwiaWF0IjoxNTkxNjAwMTAxLCJleHAiOjE1OTIwMzIxMDF9.mDgR0dIx2kYxR3Wq3CXI-u7bw5AE54JfIeQqnR7VTRC6m9POGMPG5LpOQbljP4Kt2GLbT1JYD7xD7JvtBFev-g
```

第一个部分的 JWT 头在解析之后的内容如下所示，声明了使用的签名算法是 HS512。

```json
{
  "alg": "HS512"
}
```

第二个部分的载荷在解析之后的内容如下所示，其中声明了 JWT 中的主体、签发时间和过期时间。

```json
{
  "sub": "user",
  "iat": 1591600101,
  "exp": 1592032101
}
```

#### 加密 JWT

加密 JWT 可以防止数据被读取。加密有两种模式：**使用共享密钥或使用公钥私钥**。共享密钥指的是所有参与者都拥有密钥，都可以进行加密和解密操作；在公钥私钥模式中，公钥的持有者可以加密数据，只有私钥的持有者可以解密和加密数据。

在加密 JWT 中，需要区分两种不同的密钥：**内容加密密钥（Content Encryption Key，CEK）和 JWE 加密密钥**。内容加密密钥是对 JWT 中的载荷进行加密时使用的密钥，而 JWE 加密密钥则是对内容加密密钥进行加密的密钥。在共享密钥模式中，JWE 加密密钥是不需要的，内容加密密钥就是共享密钥。

在公钥私钥模式中，由于这种不对称的加密方式在输入过大时，其性能不太好，一般的做法是首先随机产生一个密钥作为内容加密密钥，以对称加密的方式对 JWT 载荷进行加密，再用公钥把内容加密密钥进行加密，并作为 JWT 的一部分。JWT 的接收者首先使用私钥解密之后，得到内容加密密钥，再用得到的内容加密密钥来对载荷进行解密。这种做法兼顾了安全性和性能。

这里需要注意的是签名 JWT 和加密 JWT 的区别。签名 JWT 只能保证 JWT 的内容不被篡改，其中包含的内容可以被任何人读取。所以签名 JWT 中不能包含敏感的数据，可以把它与 Cookie 做类比。加密 JWT 中的内容无法读取，安全性更高，但是加密和解密的成本比较高。大部分情况下，签名 JWT 已经可以满足需求。

#### JWT 使用

JWT 有很多实际的应用场景：一种场景是作为客户端数据的格式，另外一种是在联合身份管理（Federated Identity Management）中作为令牌，如 OpenID Connect 和 OAuth 2。本课时主要介绍第一种应用场景。

当需要在浏览器端保存数据时，最常用的方式是 Cookie。服务器端在 HTTP 响应的 Set-Cookie 头中设置指定 Cookie 的值。浏览器在每次发送 HTTP 请求时，会自动以 HTTP 头 Cookie 来发送当前域名和路径所对应的 Cookie 值。Cookie 一般用来保存用户的当前会话的标识符，如 Java 应用常用的 JSESSIONID。

由于会话标识符是很难猜测的随机字符串，不用担心被轻易伪造，可以作为用户的标识。如果应用直接使用用户名作为 Cookie 的值，那么只需要以暴力尝试的方式猜测出用户名，就可以冒名顶替成其他用户。

HTTP 会话是目前解决用户身份认证的常用做法，既方便了用户的使用，又保证了安全性。HTTP 会话也可以保存一些与会话相关的数据，Java 的 Servlet API 中就提供了相关的方法来在会话中保存数据。但是会话有一个最大的问题是可扩展性比较不好，这也是有状态服务的通病。在一个集群中，需要使用分布式会话实现，或是会话复制，或是**黏性会话（Sticky Session）**。这些做法都会增加实现和管理的复杂度。更好的做法是使用无状态的会话，这样可以更简单地实现水平扩展。

JWT 很好地解决了这个问题。在经过数字签名之后，可以保证 JWT 中的内容不被篡改，这样就避免了安全性的问题。除了用户标识符之外，其他会话相关的数据也可以保存在 JWT 中。这样就把状态相关的信息迁移到了客户端，免去了服务器端维护状态信息所带来的复杂度。

### Spring Security

在 Java 平台上，Spring Security 是流行的实现安全相关的功能框架。下面介绍示例应用中的乘客管理服务如何使用 Spring Security 和 JWT 进行身份认证，使用的 JWT 库是 [Java JWT](https://github.com/jwtk/jjwt)。

#### 用户登录

目前流行的 Web 应用一般以 REST API 的方式来进行登录，传统的基于表单的登录方式使用较少。这主要是因为表单登录需要进行页面跳转，而目前很多应用都是单页面应用，跳转式登录影响用户体验。很多的应用都允许以匿名的方式浏览，只有当需要进行用户相关的操作时，才需要进行登录。在单页面应用中，当需要登录时，可以用路由切换或对话框的形式弹出登录界面，JavaScript 代码以 XHR 的方式发送登录请求。XHR 也支持以 HTTP 头来发送认证信息。

下面代码中的 JWTAuthenticationFilter 类是处理登录请求的 Spring Security 中的过滤器。在登录时，把用户名和密码以 JSON 格式发送到路径为 /login 的 API。在 attemptAuthentication 方法中，从请求内容中获取到用户登录信息，并使用 AuthenticationManager 的 authenticate 方法来认证用户。如果身份认证通过，那么 successfulAuthentication 方法会被调用。在这个方法中，创建了一个新的 JWT 令牌，其中的主体设置为当前用户，并设置了签发日期和过期日期。JWT 令牌同时添加在 HTTP 响应的头和 Cookie 中。

```java
public class JWTAuthenticationFilter extends
    UsernamePasswordAuthenticationFilter {
  private final AuthenticationManager authenticationManager;
  private final ObjectMapper objectMapper = new ObjectMapper();
  public JWTAuthenticationFilter(
      final AuthenticationManager authenticationManager) {
    this.authenticationManager = authenticationManager;
  }
  @Override
  public Authentication attemptAuthentication(final HttpServletRequest request,
      final HttpServletResponse response) throws AuthenticationException {
    try {
      final LoginRequest loginRequest = this.objectMapper
          .readValue(request.getInputStream(), LoginRequest.class);
      return this.authenticationManager.authenticate(
          new UsernamePasswordAuthenticationToken(
              loginRequest.getUsername(),
              loginRequest.getPassword()));
    } catch (final IOException e) {
      throw new AuthenticationServiceException(e.getMessage(), e);
    }
  }
  @Override
  protected void successfulAuthentication(final HttpServletRequest request,
      final HttpServletResponse response, final FilterChain chain,
      final Authentication authResult) {
    final String token = Jwts.builder()
        .setSubject(((User) authResult.getPrincipal()).getUsername())
        .setIssuedAt(new Date())
        .setExpiration(Date.from(OffsetDateTime.now().plusDays(5).toInstant()))
        .signWith(JWTKeyHolder.KEY, SignatureAlgorithm.HS512)
        .compact();
    response.addHeader(AUTHORIZATION_HEADER, TOKEN_PREFIX + token);
    response.addCookie(new Cookie(SecurityConstants.AUTH_COOKIE, token));
  }
}
```

下面代码中的 JWTFilter 是处理访问请求的过滤器。对于每个请求，getToken 方法尝试从 Cookie 和 HTTP 头中获取到 JWT 令牌，对于 JWT 令牌，通过 JWT 库进行解析并验证。如果验证通过，则从令牌中获取到用户名，再使用 UserDetailsService 来检查用户是否存在，最后把用户信息设置到 Spring Security 的上下文对象中，使得当前用户通过身份认证。

```java
public class JWTFilter extends BasicAuthenticationFilter {
  private final UserDetailsService userDetailsService;
  public JWTFilter(final AuthenticationManager authenticationManager,
      final UserDetailsService userDetailsService) {
    super(authenticationManager);
    this.userDetailsService = userDetailsService;
  }
  @Override
  protected void doFilterInternal(final HttpServletRequest request,
      final HttpServletResponse response, final FilterChain filterChain)
      throws ServletException, IOException {
    final String token = this.getToken(request);
    if (!StringUtils.hasText(token)) {
      filterChain.doFilter(request, response);
      return;
    }
    final Claims claims = Jwts.parserBuilder()
        .setSigningKey(JWTKeyHolder.KEY)
        .build()
        .parseClaimsJws(token)
        .getBody();
    final UserDetails userDetails = this.userDetailsService
        .loadUserByUsername(claims.getSubject());
    SecurityContextHolder.getContext()
        .setAuthentication(new UsernamePasswordAuthenticationToken(
            userDetails.getUsername(), null, userDetails.getAuthorities()
        ));
    filterChain.doFilter(request, response);
  }
  private String getToken(final HttpServletRequest request) {
    if (request.getCookies() != null) {
      for (final Cookie cookie : request.getCookies()) {
        if (Objects.equals(cookie.getName(), SecurityConstants.AUTH_COOKIE)) {
          if (StringUtils.hasText(cookie.getValue())) {
            return cookie.getValue();
          }
        }
      }
    }
    final String header = request.getHeader(AUTHORIZATION_HEADER);
    if (header != null && header.startsWith(TOKEN_PREFIX)) {
      return header.substring(TOKEN_PREFIX.length());
    }
    return null;
  }
}
```

下面代码中的 SecurityConfig 是 Spring Security 的配置类。这里需要注意的是 JWT 相关的两个过滤器的添加方式，以及把会话的创建策略设置为无状态。

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig extends WebSecurityConfigurerAdapter {
  @Override
  protected void configure(final HttpSecurity http) throws Exception {
    http.csrf().disable()
        .authorizeRequests()
        .antMatchers("/login").permitAll()
        .anyRequest().authenticated()
        .and()
        .addFilter(new JWTAuthenticationFilter(this.authenticationManager()))
        .addFilterBefore(new JWTFilter(this.authenticationManager(), this.userDetailsService()),
            UsernamePasswordAuthenticationFilter.class)
        .sessionManagement()
        .sessionCreationPolicy(SessionCreationPolicy.STATELESS);
  }
  @Override
  protected void configure(final AuthenticationManagerBuilder auth)
      throws Exception {
    auth.inMemoryAuthentication()
        .withUser("admin")
        .password(this.passwordEncoder().encode("password"))
        .roles("ADMIN")
        .and()
        .withUser("user")
        .password(this.passwordEncoder().encode("password"))
        .roles("USER");
  }
  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }
}
```

#### 授权

在用户通过身份认证之后，另外一个相关的话题是**如何进行授权** 。**认证解决的问题是证明用户的身份，而授权解决的是用户能做什么事情**。在一个应用中，不同用户的权限是不同的。通常的做法是创建不同的角色，然后为用户分配不同的角色，每个角色有与之对应的权限。这就是基于角色的访问控制（Role-based Access Control，RBAC)。在上面代码 SecurityConfig 中，可以看到 ADMIN 和 USER 这样的角色名称。

在定义了用户及其关联的角色之后，另外一个问题是在什么层次上应用授权控制。最直接的做法是在 API 路径上进行控制，比如 /admin 这个路径，只允许具有 ADMIN 角色的用户来访问。通过 Spring Security 的 Java 配置 API 就可以完成，如下面的代码所示。

```java
http.antMatchers("/admin").hasRole("ADMIN")
```

如果 API 路径的访问控制的粒度太粗，可以使用方法级别的授权控制。通过 @EnableGlobalMethodSecurity 注解可以启用方法级别的访问控制，其属性 securedEnabled 的作用是启用 Spring Security 的 @Secured 注解，如下面的代码所示。

```java
@EnableGlobalMethodSecurity(securedEnabled = true)
public class SecurityConfig extends WebSecurityConfigurerAdapter {
}
```

下面代码中 ProtectedService 类的 doSomething 方法通过 @Secured 注解来声明了只有具有 ADMIN 角色的用户可以访问。

```java
@Service
public class ProtectedService {
  @Secured("ROLE_ADMIN")
  public void doSomething() {
    System.out.println("Do this");
  }
}
```

如果需要更加灵活的访问控制，可以使用 Spring AOP 来完成。通过 SecurityContextHolder.getContext 方法可以获取到当前的 SecurityContext 对象，从中可以得知当前用户的身份信息。通过 AOP 可以检查每个方法调用的参数，并根据当前用户的身份信息，来执行特定的检查逻辑。

本课时介绍的访问控制主要与外部的 Web 应用和移动客户端相关。实际上，在微服务架构应用的内部，不同的微服务之间也有访问控制的需求。这一部分的内容将在第 38 课时介绍服务网格 Istio 时介绍。

### 总结

非功能性需求在应用开发中也扮演了非常重要的角色。本课时对安全性相关的话题进行了介绍，着重介绍了 JWT 和如何使用 Spring Security 进行用户认证和授权管理。通过本课时的学习，你可以充分了解 JWT，以及如何把 JWT 和 Spring Security 结合起来使用。

