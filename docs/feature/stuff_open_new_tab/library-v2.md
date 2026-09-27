# 新版 Library 新标签页打开：实现逻辑

本文记录 `library-island-page` 对应的实现。旧版设计保留在 [prd.md](prd.md)，文档入口见 [index.md](index.md)。

## 1. 目标与适用范围

新版 Library 的媒体卡片提供原生预览入口。扩展在可唯一匹配资源的卡片上添加“新标签页打开”按钮，打开生成该资源的会话位置，避免离开 Library 页面。

当前实现根据已捕获的音乐和图片 DOM、GraphQL 响应建立匹配规则。Documents 的原生链接保持原样；没有匹配缩略图或无法确认挂载位置的资源不添加按钮。DOM 与响应样例位于 `src/entrypoints/content/stuff-page/__fixtures__/`。

## 2. 整体链路

```text
library.content.ts（MAIN world，document_start，Chrome / Firefox 共用）
  → Fetch 拦截与响应观察
  → 解析 GraphQL 媒体记录
  → 写入启动回放缓存，并通过 CustomEvent 发送
  → stuff-page/index.ts（Content world）验证数据
  → 写入资源索引
  → 匹配页面图片，协调按钮与目标链接
```

拦截端与页面适配器独立工作：数据可以先于 DOM 到达，也可以在卡片渲染后到达。两种顺序都会触发按钮协调。

## 3. 接口拦截与解析

### 请求匹配

`src/utils/library/mediaParser.ts` 要求 origin 为 `https://gemini.google.com`，去除可选的数字账号前缀 `/u/{index}` 后，pathname 必须精确等于：

```text
/_/BardChatUi/graphql/schemas/GEMINI_WEB_GRAPHQL/executeQuery
```

查询参数不参与匹配。监听器仅处理成功的 GET 响应；相同端点下不含媒体连接的 GraphQL 响应会被忽略。扩展不主动发起接口请求或分页。

### 响应读取

`src/utils/fetchInterceptor.ts` 统一安装 Fetch 包装器，保留原请求参数、返回 Promise 和页面获得的 Response。订阅者读取独立的响应 clone。

新版 Library 同时通过 `src/utils/observeResponseBody.ts` 观察页面对原响应的读取，作为 clone 因取消而读取失败时的补充来源。观察器不主动消费原响应，也不替换原生读取方法返回的 Promise。支持 `text`、`json`、`arrayBuffer`、`blob` 以及默认 stream reader。

流中断时已读取的内容，只有构成完整 JSON 并通过同一媒体 schema 才会被接受。每次请求最多发送一次成功解析的数据，避免 clone 与页面读取重复发送。

### 数据结构

响应必须是 JSON 数组，从各 packet 的 `data.viewer.media.edges[].node` 提取：

| 字段 | 用途 |
| --- | --- |
| `responseIdentifier.conversationId` | 会话 ID，要求 `c_` 前缀 |
| `responseIdentifier.requestId` | 会话内定位 ID，要求 `r_` 前缀 |
| `responseId` | 资源记录去重的一部分，不用于链接 hash |
| `artifactType` | 资源记录去重的一部分 |
| `metadata.thumbnailUrl` | 可选，用于匹配页面图片 |

解析器使用 Zod 验证 envelope 和资源节点，跳过无效节点。响应文本长度超过 `MAX_LIBRARY_RESPONSE_BYTES`（`2 * 1024 * 1024`）时拒绝解析；此处实际比较的是字符串长度。原生流观察另有字节数上限。

## 4. 跨世界通信与双层缓存

MAIN world 通过 `gem-ext:library-media-data` CustomEvent 发送普通对象 `{ items, timestamp }`。Content 注册监听器后，使用 `libraryMediaDataSchema` 再次验证，并发出内部事件 `library-media:data-received`。两端不传递 DOM 元素。

两份缓存均使用 `LibraryMediaCache`，仅驻留内存，不持久化：

| 缓存 | 限制 | 职责 |
| --- | --- | --- |
| MAIN world 启动回放缓存 | 最多 500 条，60 秒 TTL | 补发 Content 监听器准备好之前捕获的数据 |
| Content 资源索引 | 最多 3000 条，无 TTL | 将图片匹配到资源，并生成按钮链接 |

Content 先注册数据监听，再发送无载荷的 `gem-ext:library-media-request` Event。MAIN world 收到后发送仍保留的记录；这是内存数据补发，不是重新请求接口。超过回放 TTL 或容量上限的早期记录不能通过回放恢复。

记录以 `conversationId + requestId + responseId + artifactType` 的组合为键。接口响应增量合并到缓存，不整批替换；同键的新记录更新缩略图映射，较旧时间戳的数据不能覆盖较新记录。超过容量时淘汰最早插入或更新的记录。

资源索引不按时间过期，避免页面停留较久后，仍显示的卡片因为索引过期丢失按钮。离开页面根节点只停止当前注入器，保留索引供后续挂载；`stuffPageModule.stop()` 才清空资源索引。MAIN monitor 的清理函数会清空回放缓存并注销订阅。

## 5. 页面识别与图片匹配

`libraryAdapters.ts` 观察页面节点变化，通过 `dom.ts` 识别结构：

1. 存在 `library-island-page` 时，要求页面节点唯一，其内部 `[data-library-island-root]` 也唯一，才启动新版适配器。
2. 没有新版页面节点时，要求 `library-sections-overview-page` 唯一，才启动旧版适配器。
3. 新版节点存在但结构不明确时，不回退到旧版。页面根节点或适配器变化时，先停止旧注入器，再启动对应注入器。

新版只扫描已确认根节点内的 `img[src]`。图片的绝对 `src` 必须以 API 的 `thumbnailUrl` 开头，剩余部分为空或以 `=` 开头，允许 Google 图片尺寸变换后缀，同时避免匹配相似资源 URL。

只有唯一资源候选才接受匹配。随后沿已观察到的所有权链确定挂载点：

```text
匹配的 img → 最近的原生 button → button 的 parentElement
```

挂载点必须属于 Library 根节点。若同一挂载点的图片指向不同目标链接，则放弃该挂载点。`jslog`、按钮数量和本地化文字不参与资源身份判断。

## 6. 按钮协调与导航

收到媒体数据、初次挂载或根节点内发生相关 DOM 变化时，`reconcileIslandButtons()` 重新计算目标。注入器监听子节点变化和图片 `src` 变化，过滤扩展按钮自身的添加、移除，避免重复协调。

- 新匹配卡片：添加定位 class 和按钮。
- 已有按钮：更新 `data-open-url`，不重复插入。
- 图片不再匹配或出现歧义：移除按钮及定位 class。
- 停止新版注入器：断开观察器，移除该根节点内的扩展按钮及定位 class。

按钮位于原生预览按钮外部，与原生操作入口并列；卡片 hover 或 focus-within 时显示。点击及 Enter / Space 激活会阻止事件继续冒泡，读取按钮当前保存的 URL，避免复用卡片后打开旧目标。

链接格式为：

```text
https://gemini.google.com{accountPrefix}/app/{conversationId 去除 c_}#{requestId 去除 r_}
```

`accountPrefix` 从当前页面路径提取，例如 `/u/1/library` 生成 `/u/1/app/...#...`。Chrome 调用 `window.open(url, '_blank')`；Firefox 请求 background 创建标签页，消息发送失败时回退到 `window.open`。

## 7. 验证与诊断

相关自动化测试覆盖解析、请求匹配、缓存更新与容量、回放 TTL、长时间停留后的按钮保留、数据与 DOM 到达顺序、卡片复用、歧义拒绝及新旧适配器切换：

```sh
pnpm compile
pnpm test:run src/utils/library src/utils/fetchInterceptor.test.ts src/entrypoints/main-world/library-monitor.test.ts src/entrypoints/content/stuff-page
pnpm build
pnpm build:firefox
```

自动化测试不能代替真实浏览器中的响应取消、跨世界通信和点击目标验证。开发构建（`pnpm dev` / `pnpm dev:firefox`）可在 Gemini 页面控制台过滤 `[LibraryTrace]`，追踪请求捕获、解析、事件传递、索引更新和按钮注入。生产构建不输出这些诊断日志，运行时错误警告仍保留。
