# 14etcdwatch：etcd如何实现watch机制？

etcd v2 和 v3 版本之间发生的其中一个重要变化就是 watch 机制的优化。etcd v2 watch 机制采用的是基于 HTTP/1.x 协议的**客户端轮询机制**，历史版本则通过滑动窗口存储。在大量的客户端连接场景或集群规模较大的场景下，etcd 服务端的扩展性和稳定性都无法保证。etcd v3 在此基础上进行优化，满足了 Kubernetes Pods 部署和状态管理等业务场景诉求。

这一讲我们就来介绍 watch 的用法，包括如何通过 etcdctl 命令行工具及 clientv3 客户端实现键值对的监控。在了解基本用法的基础上，我们再来重点介绍 etcd watch 实现的原理和细节。

### watch 的用法

在具体讲解 watch 的实现方式之前，我们先来体验一下如何使用 watch。

#### etcdctl 命令行工具

通过 etcdctl 命令行工具实现键值对的监测：

```shell
$ etcdctl put hello aoho
$ etcdctl put hello boho
$ etcdctl watch hello -w=json --rev=1
{
	"Header": {
		"cluster_id": 14841639068965178418,
		"member_id": 10276657743932975437,
		"revision": 4,
		"raft_term": 4
	},
	"Events": [{
		"kv": {
			"key": "aGVsbG8=",
			"create_revision": 3,
			"mod_revision": 3,
			"version": 1,
			"value": "YW9obw=="
		}
	}, {
		"kv": {
			"key": "aGVsbG8=",
			"create_revision": 3,
			"mod_revision": 4,
			"version": 2,
			"value": "Ym9obw=="
		}
	}],
	"CompactRevision": 0,
	"Canceled": false,
	"Created": false
}
```

依次在命令行中输入上面三条命令，前面两条依次更新 hello 对应的值，第三条命令监测键为 hello 的变化，并指定版本号从 1 开始。最后的结果是输出了两条 watch 事件。

接着，我们在另一个命令行继续输入如下的更新命令：

```shell
$ etcdctl put hello coho
```

可以看到前一个命令行输出了如下的内容：

```shell
{
	"Header": {
		"cluster_id": 14841639068965178418,
		"member_id": 10276657743932975437,
		"revision": 5,
		"raft_term": 4
	},
	"Events": [{
		"kv": {
			"key": "aGVsbG8=",
			"create_revision": 3,
			"mod_revision": 5,
			"version": 3,
			"value": "Y29obw=="
		}
	}],
	"CompactRevision": 0,
	"Canceled": false,
	"Created": false
}
```

命令行输出的事件表明，键`hello`对应的键值对发生了更新，并输出了事件的详细信息。上述内容就是通过 etcdctl 命令行工具实现 watch 指定的键值对功能的全过程。

#### clientv3 客户端

下面我们继续来看在 clientv3 中如何实现 watch 功能。

etcd 的 MVCC 模块对外提供了两种访问键值对的实现方式，一种是键值存储 kvstore，另一种是 watchableStore，它们都实现了 KV 接口。clientv3 中很简洁地封装了 watch 客户端与服务端交互的细节，基于 watchableStore 即可实现 watch 功能，客户端使用的代码如下：

```go
func testWatch() {
    s := newWatchableStore()
    w := s.NewWatchStream()
    w.Watch(start_key: hello, end_key: nil)
    for {
        consume := <- w.Chan()
    }
}
```

在上述实现中，我们调用了 watchableStore。为了实现 watch 监测，我们创建了一个 watchStream，watchStream 监听的 key 为 hello，之后我们就可以消费`w.Chan()`返回的 channel。key 为 hello 的任何变化，都会通过这个 channel 发送给客户端。


<Image alt="Drawing 0.png" src="https://s0.lgstatic.com/i/image6/M00/19/19/Cgp9HWBJu_WAfdpGAAAef8_AVBQ682.png"/> 


结合这张图，我们可以看到：watchStream 实现了在大量 KV 的变化事件中，**过滤出当前所指定监听的 key，并将键值对的变更事件输出**。

### watchableStore 存储

在第 10 讲["etcd 存储：如何实现键值对的读写操作？"](https://kaiwu.lagou.com/course/courseInfo.htm?courseId=613#/detail/pc?id=6404)中我们已经介绍过 kvstore，这里我们具体介绍一下 watchableStore 的实现。

**watchableStore 负责了注册、管理以及触发 Watcher 的功能**。我们先来看一下这个结构体的各个字段：

```go
// 位于 mvcc/watchable_store.go:47
type watchableStore struct {
	*store
	// 同步读写锁
	mu sync.RWMutex
	// 被阻塞在 watch channel 中的 watcherBatch
	victims []watcherBatch
	victimc chan struct{}
	// 未同步的 watchers
	unsynced watcherGroup
	// 已同步的 watchers
	synced watcherGroup
	stopc chan struct{}
	wg    sync.WaitGroup
}
```

watchableStore 组合了 store 结构体的字段和方法，除此之外，还有两个 watcherGroup 类型的字段，watcherGroup 管理多个 watcher，并能够根据 key 快速找到监听该 key 的一个或多个 watcher。

* unsynced 表示 watcher 监听的数据还未同步完成。当创建的 watcher 指定的版本号小于 etcd server 最新的版本号时，会将 watcher 保存到 unsynced watcherGroup。

* synced 表示 watcher 监听的数据都已经同步完毕，在等待新的变更。如果创建的 watcher 未指定版本号或指定的版本号大于当前最新的版本号，它将会保存到 synced watcherGroup 中。

根据 watchableStore 的定义，我们可以结合下图描述前文示例 watch 监听的过程。


<Image alt="Drawing 1.png" src="https://s0.lgstatic.com/i/image6/M01/19/17/CioPOWBJvWKAN2GEAAArY0rVWO4011.png"/> 
  
watch 监听流程

watchableStore 收到了所有 key 的变更后，将这些 key 交给 synced（watchGroup），synced 使用了 map 和 ADT（红黑树），能够快速地从所有 key 中找到监听的 key，将这些 key 发送给对应的 watcher，这些 watcher 再通过 chan 将变更信息发送出去。

在查找监听 key 对应的事件时，如果只监听一个 key：

```java
watch(start_key: foo, end_key: nil)
```

则对应的存储为`map[key]*watcher`。这样可以根据 key 快速找到对应的 watcher。但是 watch 可以监听一组范围的 key，这种情况应该如何处理呢？

```java
watch(start_key: hello1, end_key: hello3)
```

上面的代码监听了从 hello1→hello3 之间的所有 key，这些 key 的数量不固定，比如：key=hello11 也处于监听范围。这种情况就无法再使用 map 了，因此 etcd 用 ADT 结构来存储一个范围内的 key。

watcherGroup 是由一系列范围 watcher 组织起来的 watchers。在找到对应的 watcher 后，调用 watcher 的 send() 方法，将变更的事件发送出去。

### syncWatchers 同步监听

在初始化一个新的 watchableStore 时，etcd 会创建一个用于同步 watcherGroup 的 goroutine，会在 syncWatchersLoop 函数中**每隔 100ms 调用一次 syncWatchers 方法**，将所有未通知的事件通知给所有的监听者：

```go
// 位于 mvcc/watchable_store.go:334
func (s *watchableStore) syncWatchers() int {
  //...
	// 为了从 unsynced watchers 中找到未同步的键值对，我们需要查询最小的版本号，利用最小的版本号查询 backend 存储中的键值对
	curRev := s.store.currentRev
	compactionRev := s.store.compactMainRev
	wg, minRev := s.unsynced.choose(maxWatchersPerSync, curRev, compactionRev)
	minBytes, maxBytes := newRevBytes(), newRevBytes()
	// UnsafeRange 方法返回了键值对。在 boltdb 中存储的 key 都是版本号，而 value 为在 backend 中存储的键值对
	tx := s.store.b.ReadTx()
	tx.RLock()
	revs, vs := tx.UnsafeRange(keyBucketName, minBytes, maxBytes, 0)
	var evs []mvccpb.Event
  // 转换成事件
	evs = kvsToEvents(s.store.lg, wg, revs, vs)
	var victims watcherBatch
	wb := newWatcherBatch(wg, evs)
	for w := range wg.watchers {
		w.minRev = curRev + 1
    //...
		if eb.moreRev != 0 {
			w.minRev = eb.moreRev
		}
    // 通过 send 将事件和 watcherGroup 发送到每一个 watcher 对应的 channel 中
		if w.send(WatchResponse{WatchID: w.id, Events: eb.evs, Revision: curRev}) {
			pendingEventsGauge.Add(float64(len(eb.evs)))
		} else {
      // 异常情况处理
			if victims == nil {
				victims = make(watcherBatch)
			}
			w.victim = true
		}
    //...
		s.unsynced.delete(w)
	}
  //...
}
```

简化后的 syncWatchers 方法中有三个核心步骤，首先是根据当前的版本从未同步的 watcherGroup 中选出一些待处理的任务，然后从 BoltDB 中获取当前版本范围内的数据变更，并将它们转换成事件，事件和 watcherGroup 在打包之后会通过 send 方法发送到每一个 watcher 对应的 channel 中。


<Image alt="Drawing 2.png" src="https://s0.lgstatic.com/i/image6/M01/19/17/CioPOWBJvXaAJROAAAAlohW0T4M993.png"/> 
  
syncWatchers 方法调用流程图

### 客户端监听事件

客户端监听键值对时，调用的正是`Watch`方法，`Watch`在 stream 中创建一个新的 watcher，并返回对应的 WatchID。

```go
// 位于 mvcc/watcher.go:108
func (ws *watchStream) Watch(id WatchID, key, end []byte, startRev int64, fcs ...FilterFunc) (WatchID, error) {
	// 防止出现 key >= end 的错误 range
	if len(end) != 0 && bytes.Compare(key, end) != -1 {
		return -1, ErrEmptyWatcherRange
	}
	ws.mu.Lock()
	defer ws.mu.Unlock()
	if ws.closed {
		return -1, ErrEmptyWatcherRange
	}
	if id == AutoWatchID {
		for ws.watchers[ws.nextID] != nil {
			ws.nextID++
		}
		id = ws.nextID
		ws.nextID++
	} else if _, ok := ws.watchers[id]; ok {
		return -1, ErrWatcherDuplicateID
	}
	w, c := ws.watchable.watch(key, end, startRev, id, ws.ch, fcs...)
	ws.cancels[id] = c
	ws.watchers[id] = w
	return id, nil
}
```

AutoWatchID 是 WatchStream 中传递的观察者 ID。当用户没有提供可用的 ID 时，如果又传递该值，etcd 将自动分配一个 ID。**如果传递的 ID 已经存在，则会返回 ErrWatcherDuplicateID 错误**。watchable_store.go 中的 watch 实现是监听的具体实现，实现代码如下：

```go
// 位于 mvcc/watchable_store.go:120
func (s *watchableStore) watch(key, end []byte, startRev int64, id WatchID, ch chan<- WatchResponse, fcs ...FilterFunc) (*watcher, cancelFunc) {
	// 构建 watcher
	wa := &watcher{
		key:    key,
		end:    end,
		minRev: startRev,
		id:     id,
		ch:     ch,
		fcs:    fcs,
	}
	s.mu.Lock()
	s.revMu.RLock()
	synced := startRev > s.store.currentRev || startRev == 0
	if synced {
		wa.minRev = s.store.currentRev + 1
		if startRev > wa.minRev {
			wa.minRev = startRev
		}
	}
	if synced {
		s.synced.add(wa)
	} else {
		slowWatcherGauge.Inc()
		s.unsynced.add(wa)
	}
	s.revMu.RUnlock()
	s.mu.Unlock()
	// prometheus 的指标增加
	watcherGauge.Inc()
	return wa, func() { s.cancelWatcher(wa) }
}
```

对 watchableStore 进行操作之前，需要加锁。如果 etcd 收到客户端的 watch 请求中携带了 revision 参数，则**比较请求的 revision 和 store 当前的 revision**，如果大于当前 revision，则放入 synced 组中，否则放入 unsynced 组。

### 服务端处理监听

当 etcd 服务启动时，会在服务端运行一个用于处理监听事件的 watchServer gRPC 服务，客户端的 watch 请求最终都会被转发到 Watch 函数处理：

```go
// 位于 etcdserver/api/v3rpc/watch.go:140
func (ws *watchServer) Watch(stream pb.Watch_WatchServer) (err error) {
	sws := serverWatchStream{
    // 构建 serverWatchStream
	}
	sws.wg.Add(1)
	go func() {
		sws.sendLoop()
		sws.wg.Done()
	}()
	errc := make(chan error, 1)
  // 理想情况下，recvLoop 将会使用 sws.wg 通知操作的完成，但是当  stream.Context().Done() 关闭时，由于使用了不同的 ctx，stream 的接口有可能一直阻塞，调用 sws.close() 会发生死锁
	go func() {
		if rerr := sws.recvLoop(); rerr != nil {
			if isClientCtxErr(stream.Context().Err(), rerr) {
        // 错误处理
			}
			errc <- rerr
		}
	}()
	select {
	case err = <-errc:
		close(sws.ctrlStream)
	case <-stream.Context().Done():
		err = stream.Context().Err()
		if err == context.Canceled {
			err = rpctypes.ErrGRPCNoLeader
		}
	}
	sws.close()
	return err
}
```

如果出现了更新或者删除操作，相应的事件就会被发送到 watchStream 的通道中。客户端可以通过 Watch 功能监听某一个 Key 或者一个范围的变动，在每一次客户端调用服务端时都会创建两个 goroutine，其中一个协程 sendLoop 负责向监听者发送数据变动的事件，另一个协程 recvLoop 负责处理客户端发来的事件。

sendLoop 会通过**select 关键字** 来监听多个 channel 中的数据，将接收到的数据封装成 pb.WatchResponse 结构，并通过 gRPC 流发送给客户端；recvLoop 方法调用了 MVCC 模块暴露出的**watchStream.Watch 方法**，该方法会返回一个可以用于取消监听事件的 watchID；当 gRPC 流已经结束或者出现错误时，当前的循环就会返回，两个 goroutine 也都会结束。

### 异常流程处理

我们来考虑一下异常流程的处理。消息都是通过 channel 发送出去，但如果消费者消费速度慢，channel 中的消息形成堆积，但是空间有限，满了之后应该怎么办呢？带着这个问题，首先我们来看 channel 的默认容量：

```go
var (
	// chanBufLen 是发送 watch 事件的 buffered channel 长度
   chanBufLen = 1024
	// maxWatchersPerSync 是每次 sync 时 watchers 的数量
	maxWatchersPerSync = 512
)
```

在实现中设置的 channel 的长度是 1024。channel 一旦满了，etcd 并不会丢弃 watch 事件，而是会进行如下的操作：

```go
// 位于 mvcc/watchable_store.go:438
func (s *watchableStore) notify(rev int64, evs []mvccpb.Event) {
	var victim watcherBatch
	for w, eb := range newWatcherBatch(&s.synced, evs) {
		if eb.revs != 1 {
      // 异常
		}
		if w.send(WatchResponse{WatchID: w.id, Events: eb.evs, Revision: rev}) {
			pendingEventsGauge.Add(float64(len(eb.evs)))
		} else {
			// 将 slow watchers 移动到 victims
			w.minRev = rev + 1
			if victim == nil {
				victim = make(watcherBatch)
			}
			w.victim = true
			victim[w] = eb
			s.synced.delete(w)
			slowWatcherGauge.Inc()
		}
	}
	s.addVictim(victim)
}
```

从 notify 的实现中可以知道，此 watcher 将会从 synced watcherGroup 中删除，和事件列表保存到一个名为 victim 的 watcherBatch 结构中。watcher 会记录当前的 Revision，并将自身标记为**受损**，变更操作也会被保存到 watchableStore 的 victims 中。我使用如下的示例来描述上述过程：

channel 已满的情况下，有一个写操作写入 foo = bar。监听 foo 的 watcher 将从 synced 中移除，同时 foo=bar 也被保存到 victims 中。


<Image alt="Drawing 3.png" src="https://s0.lgstatic.com/i/image6/M01/19/1A/Cgp9HWBJvY6AFDZcAAAvIEpMXI4453.png"/> 
  
channel 已满时的处理流程

接下来该 watcher 不会记录对 foo 的任何变更。那么这些变更消息怎么处理呢？

我们知道在 channel 队列满时，变更的 Event 就会放入 victims 中。在 etcd 启动的时候，WatchableKV 模块启动了 syncWatchersLoop 和 syncVictimsLoop 两个异步协程，这两个协程用于处理不同场景下发送事件。

```java
// 位于 mvcc/watchable_store.go:246
// syncVictimsLoop 清除堆积的 Event
func (s *watchableStore) syncVictimsLoop() {
	defer s.wg.Done()
	for {
		for s.moveVictims() != 0 {
			//更新所有的 victim watchers
		}
		s.mu.RLock()
		isEmpty := len(s.victims) == 0
		s.mu.RUnlock()
		var tickc <-chan time.Time
		if !isEmpty {
			tickc = time.After(10 * time.Millisecond)
		}
		select {
		case <-tickc:
		case <-s.victimc:
		case <-s.stopc:
			return
		}
	}
}
```

syncVictimsLoop 则负责堆积的事件推送，尝试清除堆积的 Event。它会不断尝试让 watcher 发送这个 Event，一旦队列不满，watcher 将这个 Event 发出后，该 watcher 就被划入了 unsycned 中，同时不再是 victim 状态。

至此，syncWatchersLoop 协程就开始起作用。由于该 watcher 在 victim 状态已经落后了很多消息。为了保持同步，协程会根据 watcher 保存的 Revision，查出 victim 状态之后所有的消息，将关于 foo 的消息全部给到 watcher，当 watcher 将这些消息都发送出去后，watcher 就由 unsynced 变成 synced。

### 小结

watch 可以用来监听一个或一组 key，key 的任何变化都会发出事件消息。某种意义上讲，etcd 也是一种发布订阅模式。

这一讲我们通过介绍 watch 的用法，引入对 etcd watch 机制实现的分析和讲解。watchableStore 负责了注册、管理以及触发 Watcher 的功能。watchableStore 将 watcher 划分为 synced 、unsynced 以及异常状态下的 victim 三类。在 etcd 启动时，WatchableKV 模块启动了 syncWatchersLoop 和 syncVictimsLoop 异步 goroutine，用以负责不同场景下的事件推送，并提供了事件重试机制，保证事件都能发送出去给到客户端。

本讲内容总结如下：


<Image alt="Drawing 4.png" src="https://s0.lgstatic.com/i/image6/M01/19/1A/Cgp9HWBJvZyAFPLNAAIuCsjxWZQ162.png"/> 


刚刚我们说 etcd 也实现了发布订阅模式，那么它和消息中间件 Kafka 有什么异同，是否能够替换呢？欢迎你在留言区和我交流自己的想法。下一讲，我们将继续介绍 etcd Lease 租约的实现原理。

