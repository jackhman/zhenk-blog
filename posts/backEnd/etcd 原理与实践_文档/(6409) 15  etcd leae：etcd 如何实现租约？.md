# 15etcdleae：etcd如何实现租约？

上一讲我们介绍了 etcd Watch 实现的机制，今天我们继续分析 etcd 的另一个重要特性：Lease 租约。它类似 TTL（Time To Live），用于 etcd 客户端与服务端之间进行活性检测。在到达 TTL 时间之前，etcd 服务端不会删除相关租约上绑定的键值对；超过 TTL 时间，则会删除。因此我们**需要在到达 TTL 时间之前续租，以实现客户端与服务端之间的保活**。

Lease 也是 etcd v2 与 v3 版本之间的重要变化之一。etcd v2 版本并没有 Lease 概念，TTL 直接绑定在 key 上面。每个 TTL、key 创建一个 HTTP/1.x 连接，定时发送续期请求给 etcd Server。etcd v3 则在 v2 的基础上进行了重大升级，每个 Lease 都设置了一个 TTL 时间，**具有相同 TTL 时间的 key 绑定到同一个 Lease**，实现了 Lease 的复用，并且基于 gRPC 协议的通信实现了连接的多路复用。

下面我们就来介绍 etcd Lease 的基本用法以及分析 Lease 实现的原理。

### 如何使用租约

Lease 意为租约，类似于分布式系统的中的 TTL（Time To Live）。在介绍 Lease 的实现原理之前，我们先通过 etcdctl 命令行工具来熟悉 Lease 的用法。依次执行如下的命令：

```shell
$ etcdctl lease grant 1000
lease 694d77aa9e38260f granted with ttl(1000s)
$ etcdctl lease timetolive 694d77aa9e38260f
lease 694d77aa9e38260f granted with ttl(1000s), remaining(983s)
$ etcdctl put foo bar --lease 694d77aa9e38260f
OK
# 等待过期，再次查看租约信息
$ etcdctl lease timetolive 694d77aa9e38260f
lease 694d77aa9e38260f already expired
```

如上的命令中，我们首先创建了一个 Lease，TTL 时间为 1000s；接着根据获取到的 LeaseID 查看其存活时间；然后写入一个键值对，并通过`--lease`绑定 Lease；最后一条命令是在 1000s 之后再次查看该 Lease 对应的存活信息。

通过 etcdctl 命令行工具的形式，我们创建了指定 TTL 时间的 Lease，并了解了 Lease 的基本使用。下面我们具体介绍 Lease 的实现。

### Lease 架构

Lease 模块对外提供了 Lessor 接口，其中定义了包括 Grant、Revoke、Attach 和 Renew 等常用的方法，lessor 结构体实现了 Lessor 接口。Lease 模块涉及的主要对象和接口，如下图所示：


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image6/M01/1D/0B/Cgp9HWBPGqaAOSvBAAApAR0Pn5s728.png"/> 
  
Lease 模块涉及的主要对象和接口

除此之外，lessor 还启动了两个异步 goroutine：RevokeExpiredLease 和 CheckpointScheduledLease，分别用于撤销过期的租约和更新 Lease 的剩余到期时间。

下图是客户端创建一个指定 TTL 的租约流程，当 etcd 服务端的 gRPC Server 接收到创建 Lease 的请求后，Raft 模块首先进行日志同步；接着 MVCC 调用 Lease 模块的 Grant 接口，保存对应的日志条目到 ItemMap 结构中，接着将租约信息存到 boltdb；最后将 LeaseID 返回给客户端，Lease 创建成功。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M01/1D/08/CioPOWBPGq6AbSSHAAAmYqC-FLA568.png"/> 
  
客户端创建一个指定 TTL 租约流程图

那么 Lease 与键值对是如何绑定的呢？

客户端根据返回的 LeaseID，在执行写入和更新操作时，可以绑定该 LeaseID。如上面示例的命令行工具 etcdctl 指定`--lease`参数，MVCC 会调用 Lease 模块 Lessor 接口中的 Attach 方法，将 key 关联到 Lease 的 key 内存集合 ItemSet 中，以完成键值对与 Lease 租约的绑定。

### 实现细节

我们继续来看 etcd Lease 实现涉及的主要接口和结构体。

#### Lessor 接口

Lessor 接口是 Lease 模块对外提供功能的核心接口，定义了包括**创建、绑定和延长租约**等常用方法：

```go
// 位于 lease/lessor.go:82
type Lessor interface {
    //...省略部分
    // 将 lessor 设置为 Primary，这个与 raft 会出现网络分区有关
    Promote(extend time.Duration)
	// Grant 创建了一个在指定时间过期的 Lease 对象
	Grant(id LeaseID, ttl int64) (*Lease, error)
	// Revoke 撤销指定 LeaseID，绑定到其上的键值对将会被移除，如果该 LeaseID 对应的 Lease 不存在，则会返回错误
	Revoke(id LeaseID) error
	// Attach 绑定给定的 LeaseItem 到 LeaseID，如果该租约不存在，将会返回错误
	Attach(id LeaseID, items []LeaseItem) error
	// GetLease 返回 LeaseItem 对应的 LeaseID
	GetLease(item LeaseItem) LeaseID
	// Detach 将 LeaseItem 从给定的 LeaseID 解绑。如果租约不存在，则会返回错误
	Detach(id LeaseID, items []LeaseItem) error
	// Renew 刷新指定 LeaseID，结果将会返回刷新后的 TTL
	Renew(id LeaseID) (int64, error)
	// Lookup 查找指定的 LeaseID，返回对应的 Lease
	Lookup(id LeaseID) *Lease
	// Leases 方法列出所有的 Leases
	Leases() []*Lease
	// ExpiredLeasesC 用于返回接收过期 Lease 的 channel
	ExpiredLeasesC() <-chan []*Lease
}
```

Lessor 接口定义了很多方法，租约相关的方法都在这里面。常用的方法有：

* Grant 创建一个在指定时间过期的 Lease 对象；

* Revoke 撤销指定 LeaseID，绑定到其上的键值对将会被移除；

* Attach 绑定给定的 leaseItem 到 LeaseID；

* Renew 刷新指定 LeaseID，结果将会返回刷新后的 TTL。

#### Lease 与 lessor 结构体

下面我们来看租约相关的 Lease 结构体：

```go
// 位于 lease/lessor.go:800
type Lease struct {
	ID           LeaseID
	ttl          int64 // 存活时间，单位秒
	remainingttl int64 // 剩余的存活时间，如果为 0，则被认为是未设置，这种情况下该值与 TTL 相等
	// expiry 的并发锁
	expiryMu sync.RWMutex
	// expiry 是 Lease 过期的时间，当expiry.IsZero() 为 true 时，则没有过期时间
	expiry time.Time
	// ItemSet 并发锁
	mu      sync.RWMutex
	itemSet map[LeaseItem]struct{}
	revokec chan struct{}
}
```

租约 Lease 的定义中包含了 LeaseID、TTL、过期时间等属性。其中**LeaseID 在获取 Lease 的时候生成**。

lessor 实现了 Lessor 接口，我们继续来看 lessor 结构体的定义。lessor 是对租约的封装，其中对外暴露出一系列操作租约的方法，比如创建、绑定和延长租约的方法：

```go
type lessor struct {
	mu sync.RWMutex
	demotec chan struct{}
	leaseMap             map[LeaseID]*Lease
	leaseExpiredNotifier *LeaseExpiredNotifier
	leaseCheckpointHeap  LeaseQueue
	itemMap              map[LeaseItem]LeaseID
	// 当 Lease 过期，lessor 将会通过 RangeDeleter 删除相应范围内的 keys
	rd RangeDeleter
	cp Checkpointer
	// backend 目前只会保存 LeaseID 和 expiry。LeaseItem 通过遍历 kv 中的所有键来恢复
	b backend.Backend
	// minLeasettl 是最小的 TTL 时间
	minLeasettl int64
	expiredC chan []*Lease
	// stopC 用来表示 lessor 应该被停止的 channel
	stopC chan struct{}
	// doneC 用来表示 lessor 已经停止的 channel
	doneC chan struct{}
	lg *zap.Logger
	checkpointInterval time.Duration
	expiredLeaseRetryInterval time.Duration
}
```

lessor 实现了 Lessor 接口，lessor 中维护了三个数据结构：LeaseMap、ItemMap 和 LeaseExpiredNotifier。

* leaseMap 是一个 map 结构，其定义为 map\[LeaseID\]\*Lease，用于根据 LeaseID 快速查询对应的 Lease；

* ItemMap 同样是一个 map 结构，其定义为  

  map\[LeaseItem\]LeaseID，用于根据 LeaseItem 快速查找 LeaseID，从而找到对应的 Lease；

* LeaseExpiredNotifier 是对 LeaseQueue 的一层封装，使得快要到期的租约保持在队头。

其中 LeaseQueue 是一个优先级队列，每次插入都会根据**过期时间** 插入到合适的位置。优先级队列，普遍都是用堆来实现，etcd Lease 的实现基于**最小堆** ，比较的依据是**Lease 失效的时间**。我们每次从最小堆里判断堆顶元素是否失效，失效就 Pop 出来并保存到 expiredC 的 channel 中。etcd Server 会定期从 channel 读取过期的 LeaseID，之后发起 revoke 请求。

那么集群中的其他 etcd 节点是如何删除过期节点的呢？

通过 Raft 日志将 revoke 请求发送给其他节点，集群中的其他节点收到 revoke 请求后，首先获取 Lease 绑定的键值对，接着删除 boltdb 中的 key 和存储的 Lease 信息，以及 LeaseMap 中的 Lease 对象。

### 核心方法解析

Lessor 接口中有几个常用的核心方法，包括**Grant 申请租约、Attach 绑定租约以及 Revoke 撤销租约**等。下面我们具体介绍这几个方法的实现。

#### Grant 申请租约

客户端要想申请一个租约 Lease，需要调用 Lessor 对外暴露的 Grant 方法。Grant 用于申请租约，并在指定的 TTL 时长之后失效。具体实现如下：

```go
// 位于 lease/lessor.go:258
func (le *lessor) Grant(id LeaseID, ttl int64) (*Lease, error) {
  // TTL 不能大于 MaxLeasettl
	if ttl > MaxLeasettl {
		return nil, ErrLeasettlTooLarge
	}
	// 构建 Lease 对象
	l := &Lease{
		ID:      id,
		ttl:     ttl,
		itemSet: make(map[LeaseItem]struct{}),
		revokec: make(chan struct{}),
	}
	le.mu.Lock()
	defer le.mu.Unlock()
    // 查找内存 LeaseMap 中是否有 LeaseID 对应的 Lease
	if _, ok := le.leaseMap[id]; ok {
		return nil, ErrLeaseExists
	}
	if l.ttl < le.minLeasettl {
		l.ttl = le.minLeasettl
	}
	if le.isPrimary() {
		l.refresh(0)
	} else {
		l.forever()
	}
    // 将 l 存放到 LeaseMap 和 LeaseExpiredNotifier 
	le.leaseMap[id] = l
	item := &LeaseWithTime{id: l.ID, time: l.expiry.UnixNano()}
	le.leaseExpiredNotifier.RegisterOrUpdate(item)
	l.persistTo(le.b)
	leaseTotalttls.Observe(float64(l.ttl))
	leaseGranted.Inc()
	if le.isPrimary() {
		le.scheduleCheckpointIfNeeded(l)
	}
	return l, nil
}
```

可以看到，当 Grant 一个租约 Lease 时，Lease 被同时存放到 LeaseMap 和 LeaseExpiredNotifier 中。在队列头，有一个 goroutine revokeExpiredLeases 定期检查队头的租约是否过期，如果过期就放入 expiredChan 中。只有当发起 revoke 操作之后，才会从队列中删除。

#### Attach 绑定租约

Attach 用于绑定键值对与指定的 LeaseID。当租约过期，且没有续期的情况下，该 Lease 上绑定的键值对会被自动移除。

```go
// 位于 lease/lessor.go:518
func (le *lessor) Attach(id LeaseID, items []LeaseItem) error {
	le.mu.Lock()
	defer le.mu.Unlock()
  // 从 LeaseMap 取出 LeaseID 对应的 lease
	l := le.leaseMap[id]
	if l == nil {
		return ErrLeaseNotFound
	}
	l.mu.Lock()
	for _, it := range items {
		l.itemSet[it] = struct{}{}
		le.itemMap[it] = id
	}
	l.mu.Unlock()
	return nil
}
```

绑定键值对时，Attach 首先用 LeaseID 去 leaseMap 中查询租约是否存在。如果在 LeaseMap 中找不到给定的 LeaseID，将会返回错误；如果对应的租约存在，则会将 Item 保存到对应的租约下，随后将 Item 和 LeaseID 保存在 ItemMap 中。

#### Revoke 撤销租约

Revoke 方法用于撤销指定 LeaseID 的租约，同时绑定到该 Lease 上的键值都会被移除。

```go
// 位于 lease/lessor.go:311
func (le *lessor) Revoke(id LeaseID) error {
	le.mu.Lock()
	l := le.leaseMap[id]
	if l == nil {
		le.mu.Unlock()
		return ErrLeaseNotFound
	}
	defer close(l.revokec)
	// 释放锁
	le.mu.Unlock()
	if le.rd == nil {
		return nil
	}
	txn := le.rd()
	// 对键值进行排序，使得所有的成员保持删除键值对的顺序一致
	keys := l.Keys()
	sort.StringSlice(keys).Sort()
	for _, key := range keys {
		txn.DeleteRange([]byte(key), nil)
	}
	le.mu.Lock()
	defer le.mu.Unlock()
	delete(le.leaseMap, l.ID)
	// 键值删除操作需要在一个事务中进行
	le.b.BatchTx().UnsafeDelete(leaseBucketName, int64ToBytes(int64(l.ID)))
	txn.End()
	leaseRevoked.Inc()
	return nil
}
```

想要实现 Revoke 方法，首先要根据 LeaseID 从 LeaseMap 中找到对应的 Lease 并从 LeaseMap 中删除，然后从 Lease 中找到绑定的 Key，并从 Backend 中将 KeyValue 删除。

#### 调用 Lessor API

上面我们介绍了 Lessor 接口中几个常用方法的实现。下面我们将基于上面三个接口，通过调用 Lessor API 创建 Lease 租约，将键值对绑定到租约上，到达 TTL 时间后主动将对应的键值对删除，实现代码如下：

```go
func testLease() {
    le := newLessor()    // 创建一个 Lessor
    le.Promote(0)        
    Go func() {   // 开启一个协程，接收过期的 key，主动删除
        for {  
           expireLease := <-le.ExpiredLeasesC()  
           for _, v := range expireLease {  
              le.Revoke(v.ID)    // 通过租约 ID 删除租约，删除租约时会从 backend 中删除绑定的 key
           }  
        }
    }()
    ttl = 5         
    lease := le.Grant(id, ttl)   // 申请一个租约
    le.Attach(lease, "foo")      // 将租约绑定在"foo"上
    time.Sleep(10 * time.Second)
}
```

上述代码展示了如何使用 Lessor 实现键值对申请、绑定和撤销租约操作。首先申请了一个过期时间设置为 5s 的 Lease；接着将 key`foo`绑定到该 Lease 上，为了方便看到结果，阻塞 10s。

同时有一点需要你注意，我们这里直接调用了 Lessor 对外提供的接口，**Lessor 不会主动删除过期的租约，而是将过期的 Lease 通过一个 channel 发送出来，由使用者主动删除**。clientv3 包中定义好了 Lease 相关的实现，基于客户端 API 进行调用会更加简单。

### 小结

这一讲我们主要介绍了 etcd Lease 的实现，首先通过 etcdctl 命令行工具介绍了客户端如何使用 Lease 的使用方法；接着介绍了 Lease 实现的主要架构，描述了 Lease 申请、绑定以及过期撤销的过程；随后介绍了 Lease 实现涉及的主要接口、结构体；最后介绍了 Lessor 对外提供的常见方法，包括：Grant 申请租约、Attach 绑定租约以及 Revoke 撤销租约，并通过一个测试用例介绍了如何直接使用 Lessor 对外提供的方法。

本讲内容总结如下：


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image6/M00/1D/0B/Cgp9HWBPGsqAJAozAAE8kcN24Nw326.png"/> 


学习完这一讲，我想给大家留一个问题，你知道在 etcd 重启之后，Lease 与键值对的绑定关系是如何重建的吗？欢迎你在留言区和我分享自己的想法。下一讲，我们将从整体来梳理 etcd 启动的过程。

