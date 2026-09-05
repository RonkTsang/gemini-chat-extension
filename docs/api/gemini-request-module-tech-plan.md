# Gemini 请求模块技术方案

## 1. 背景

GPK 当前主要通过 Gemini 页面 DOM 完成功能操作。例如 Bulk Delete 需要依次触发行菜单、Delete 菜单项和确认按钮。DOM 方案仍作为兼容性 fallback，但部分能力可以通过 Gemini 页面正在使用的内部 `batchexecute` 请求完成，以减少 DOM 层级依赖，并为后续能力扩展提供统一基础设施。

本文描述 GPK 内部的 Gemini 请求模块设计。这里的“Gemini 接口”指 `gemini.google.com` 页面使用的非公开 Web RPC，不是 Google 官方 Gemini API。该协议没有稳定性承诺，所有接入都必须保留输入校验、错误边界和必要的 DOM fallback。

## 2. 当前范围

本阶段约束如下：

- Gemini 目标请求均由 `XMLHttpRequest` 发起，暂不覆盖 `fetch`。
- 请求在 Main World 中执行，由浏览器自动携带当前 Gemini 登录态 Cookie。
- 不读取、不保存也不跨世界传递 Cookie。
- 只支持经过验证并注册的具名 Operation，不提供任意 `rpcId + args` 调用能力。
- `WIZ_global_data` 私有字段通过集中配置读取，不在业务代码中硬编码。
- 第一阶段同时支持 Chrome 和 Firefox。Chrome 沿用声明式 Main World 入口；Firefox MV2 通过 `document_start` Content Script 注入 Main World 脚本。

## 3. 设计目标

1. **职责分离**：业务 API、跨世界通信、RPC 协议和运行时参数相互隔离。
2. **业务易用**：功能模块通过 `geminiApi` 调用领域接口，不感知 `rpcId`、`f.req` 和 WIZ 字段。
3. **接口易扩展**：新增 RPC 主要通过注册 Operation 和增加业务 API 方法完成，不修改通用执行流程。
4. **运行时安全**：认证相关参数仅存在于 Main World 内存，不写入扩展存储或日志。
5. **失败可控**：区分请求未发送、明确拒绝和结果未知，避免破坏性请求被盲目重试。
6. **跨平台一致**：Chrome 和 Firefox 共用 Runtime、Operation 和业务 API，仅启动入口不同。

## 4. 总体结构

```text
┌─────────────────────────────────────────────────────────────┐
│ Feature                                                     │
│ Bulk Delete / Folder / 其他业务                              │
└────────────────────────────┬────────────────────────────────┘
                             │ 领域参数
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ geminiApi（业务公共接口）                                    │
│ conversations.delete() / conversations.list() / ...         │
└────────────────────────────┬────────────────────────────────┘
                             │ 具名 Operation
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Gemini RPC Client（Isolated World）                          │
│ requestId / timeout / AbortSignal / 结果关联                  │
└────────────────────────────┬────────────────────────────────┘
                             │ window.postMessage bridge
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ Gemini RPC Runtime（Main World）                             │
│ 输入校验 → 运行时参数 → Operation → 构造请求 → XHR → 解析响应 │
└────────────────────────────┬────────────────────────────────┘
                             │ credentials from browser
                             ▼
┌─────────────────────────────────────────────────────────────┐
│ gemini.google.com / batchexecute                            │
└─────────────────────────────────────────────────────────────┘
```

业务层只依赖 `geminiApi`。`gemini-rpc` 是内部基础设施，不应被普通功能模块直接导入。

### 4.1 双平台启动路径

```text
Chrome MV3
  xhr.content.tsx（world: MAIN, document_start）
                         │
                         ├──────────────┐
                         │              ▼
Firefox MV2              │   startGeminiRpcRuntime()
  Firefox loader         │              │
    → injectScript() ────┘              ▼
                                Gemini 页面 XHR
```

两端进入 Main World 后执行同一个 `startGeminiRpcRuntime()`。平台适配层不包含 WIZ 解析、Operation 或业务逻辑。

## 5. 目录结构图

```text
src/
├── common/
│   └── event.ts                         # 跨世界消息名及公共事件类型
├── entrypoints/
│   ├── xhr.content.tsx                  # Chrome document_start Main World 入口
│   ├── gemini-rpc-firefox-loader.content.ts # Firefox document_start 注入器
│   ├── gemini-rpc-main-world.ts         # Firefox 注入的 Main World 入口
│   └── main-world/
│       └── stuff-monitor.ts             # 现有 Stuff 响应监听
├── integrations/
│   └── gemini-rpc/
│       ├── config.ts                    # Endpoint、WIZ 字段路径、公共配置
│       ├── types.ts                     # Operation、桥接协议、错误类型
│       ├── operations.ts                # 具名 RPC Operation 注册表
│       ├── main-world-runtime.ts        # 参数捕获、桥接服务、XHR 执行
│       └── client.ts                    # Isolated World 类型化 RPC 客户端
└── services/
    └── gemini-api/
        ├── index.ts                     # 统一导出 geminiApi
        ├── conversations.ts             # 会话相关业务接口封装
        └── types.ts                     # 业务输入、输出类型

docs/
└── api/
    └── gemini-request-module-tech-plan.md
```

当业务接口较少时，`services/gemini-api/` 可以只有 `index.ts` 和 `types.ts`。当资源类型增多时，再按 `conversations.ts`、`gems.ts`、`folders.ts` 拆分，外部调用形式保持不变。

## 6. 模块职责

| 模块 | 职责 | 不应承担 |
| --- | --- | --- |
| `gemini-api` | 暴露领域化、可复用的业务接口 | 解析 WIZ、拼装 `f.req`、操作 DOM |
| `client.ts` | 跨世界请求、超时、取消、响应关联 | 保存认证参数、理解具体 RPC 数组结构 |
| `operations.ts` | 定义 `rpcId`、参数构造、响应解析 | 业务队列、UI 状态、DOM fallback |
| `main-world-runtime.ts` | 捕获运行时参数、校验命令、发送 XHR | 暴露任意 RPC、持久化认证数据 |
| `config.ts` | 私有字段映射和通用请求配置 | 具体业务流程 |
| Chrome/Firefox 启动入口 | 将共享 Runtime 放入页面 Main World 并报告 ready | WIZ 解析、请求构造、业务逻辑 |

## 7. WIZ 字段配置

`WIZ_global_data` 的字段名是 Gemini 私有实现，必须只在 `config.ts` 中定义：

```ts
export const GEMINI_RPC_CONFIG = {
  endpoint: '/_/BardChatUi/data/batchexecute',
  runtimeMaxAgeMs: 5 * 60 * 1000,

  wizGlobalData: {
    roots: ['WIZ_global_data'],
    fields: {
      at: ['SNlM0e'],
      fSid: ['FdrFJe'],
      bl: ['cfb2h'],
    },
  },
} as const
```

数组表示按优先级排列的候选字段。字段发生变化时，只修改配置：

```ts
fields: {
  at: ['newAtField', 'SNlM0e'],
  fSid: ['newSidField', 'FdrFJe'],
  bl: ['newBuildField', 'cfb2h'],
}
```

除字段候选配置外，任何文件都不应直接出现 `SNlM0e`、`FdrFJe` 或 `cfb2h`。

## 8. 运行时参数获取

Main World Runtime 维护最近一次完整的运行时参数快照：

```ts
export interface GeminiRuntimeParameters {
  at: string
  fSid: string
  bl: string
  capturedAt: number
  source: 'xhr' | 'wiz-global-data'
}
```

获取顺序：

```text
最近一次有效的原生 batchexecute XHR
                  │
                  ├─ 完整且未过期 → 使用该快照
                  │
                  └─ 不存在或已过期
                           ▼
              按配置读取 WIZ_global_data
                           │
                           ├─ 完整 → 使用该快照
                           └─ 不完整 → runtime_parameters_unavailable
```

从原生 XHR 中提取：

- URL query：`bl`、`f.sid`。
- Form body：`at`。

一次请求的字段必须组成一个原子快照，不应将不同请求或不同来源的字段拼接在一起。快照只保存在 Main World 内存中，并在账号切换、页面销毁或认证失败时失效。

`hl`、账号路径和 `_reqid` 不由 WIZ 配置提供：

- `hl`：根据当前页面语言解析，并提供默认值。
- 账号路径：从 `/u/{number}/...` 中解析。
- `source-path`：由具体 Operation 定义。
- `_reqid`：由 Runtime 生成，保证当前文档生命周期内递增或唯一。

## 9. XHR 拦截与主动调用

复用现有 `xhrInterceptor`，不再增加第二套 XHR monkey patch。现有 `send()` 需要补充请求通知：

```ts
xhr.send = function (data) {
  self.notifyRequest(requestUrl, requestMethod, data)
  return originalSend.call(xhr, data)
}
```

Runtime 注册一个通用 `batchexecute` 请求监听器，仅提取运行时参数，不持久化完整请求体。

主动调用同样使用 `XMLHttpRequest`：

```ts
function sendXHR(request: BatchExecuteRequest): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.open('POST', request.url)
    xhr.setRequestHeader(
      'Content-Type',
      'application/x-www-form-urlencoded;charset=UTF-8',
    )

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.responseText)
        return
      }

      reject(new GeminiRpcError('http_error', xhr.status))
    }

    xhr.onerror = () => reject(new GeminiRpcError('network_error'))
    xhr.send(request.body)
  })
}
```

同源请求由浏览器自动携带当前页面 Cookie，不需要 `cookies` 权限，也不需要读取 Cookie 值。GPK 主动发出的 XHR 可能再次被拦截，但监听器只更新参数快照，不会触发新的调用，因此不会形成递归请求。

## 10. Operation 扩展机制

Operation 是内部 RPC 的唯一扩展点：

```ts
export interface GeminiOperation<Input, Output> {
  inputSchema: z.ZodType<Input>
  rpcId: string
  risk: 'read' | 'write' | 'destructive'
  sourcePath(input: Input): string
  buildArgs(input: Input): unknown[]
  parseResponse(responseText: string): Output
}
```

注册示例：

```ts
export const geminiOperations = {
  'conversation.delete': defineGeminiOperation({
    rpcId: 'verified-rpc-id',
    risk: 'destructive',

    inputSchema: z.object({
      conversationId: z.string().min(1),
    }),

    sourcePath() {
      return getCurrentGeminiSourcePath()
    },

    buildArgs(input) {
      return [input.conversationId]
    },

    parseResponse(responseText) {
      return parseDeleteConversationResponse(responseText)
    },
  }),
} as const
```

示例中的 RPC ID 和参数仅表示代码结构。实际值必须经过原生请求差分与副作用验证后才能写入生产配置。

当前已根据 [`delete-request.md`](../../delete-request.md) 注册 `conversation.delete`：

- RPC ID：`GzXR5e`。
- 输入：Gemini 内部会话资源 ID（`c_...`），而不是侧栏链接中的路由 ID。
- 参数数组：`[conversationId]`。
- `source-path`：当前页面路由；它不是被删除的会话 ID。
- 成功信号：响应中存在对应的 `wrb.fr / GzXR5e / []` 确认帧。

同一原生删除流程中的 `qWymEb` 是删除后的会话任务查询，`ESY5D` 是设置读取；两者不属于删除 Operation，不能一并重放。

Runtime 统一执行 Operation，不针对具体业务编写 `if` 或 `switch`：

```text
查找 Operation
  → Zod 校验输入
  → 获取 Runtime Parameters
  → buildArgs()
  → 构造 batchexecute URL 和 form body
  → 发送 XHR
  → parseResponse()
  → 返回清洗后的结果
```

不得提供以下公共能力：

```ts
executeRaw(rpcId, args)
```

否则跨世界桥接会成为任意 Gemini RPC 代理。

## 11. 跨世界协议

Client 注册消息监听后，通过 ping/ready 确认 Runtime 已初始化：

```ts
export interface GeminiRpcPingMessage {
  protocolVersion: 1
  type: 'gemini-rpc:ping'
}

export interface GeminiRpcReadyMessage {
  protocolVersion: 1
  type: 'gemini-rpc:ready'
}
```

Runtime 启动时可以主动广播 ready，但 Client 不能依赖这一次消息，因为 Chrome Runtime 在 `document_start` 启动，ready 可能早于 Content Client 的监听。Client 初始化和首次调用时发送 ping，Runtime 对每次合法 ping 回复 ready。

Firefox MV2 的 `injectScript()` 是异步过程，首个 ping 也可能早于 Runtime 注入。Client 在限定时间内重试 ping；收到 ready 后停止重试并允许业务命令。超过初始化时限则返回 `runtime_unavailable`，不无限积压请求。

Content Script 通过 `window.postMessage(message, location.origin)` 发送命令，消息中只包含业务输入：

```ts
export interface GeminiRpcCommand {
  protocolVersion: 1
  requestId: string
  operation: GeminiOperationName
  input: unknown
}
```

返回结果：

```ts
export type GeminiRpcResult<T> =
  | {
      requestId: string
      ok: true
      data: T
    }
  | {
      requestId: string
      ok: false
      code: GeminiRpcErrorCode
      outcome: 'not-sent' | 'rejected' | 'unknown'
    }
```

桥接需要执行以下检查：

- `event.source === window`。
- `event.origin === location.origin`。
- `protocolVersion` 匹配。
- Operation 位于允许列表。
- 输入通过对应 Zod schema。
- `requestId` 唯一，并设置 pending 数量上限和 timeout。
- Client 只在 ping 收到相同协议版本的 ready 响应后发送业务命令。

跨世界响应不包含 `at`、`f.sid`、`bl`、Cookie、完整请求体或未经处理的原始响应。

## 12. geminiApi 业务公共层

`src/services/gemini-api/` 是唯一推荐给业务模块使用的入口。它把内部 Operation 转换为稳定、领域化的方法，便于 Bulk Delete、Folder 等多个业务复用。

```ts
// src/services/gemini-api/conversations.ts
import { geminiRpcClient } from '@/integrations/gemini-rpc/client'

export interface DeleteConversationInput {
  conversationId: string
}

export async function deleteConversation(
  input: DeleteConversationInput,
  options?: { signal?: AbortSignal },
) {
  return geminiRpcClient.execute(
    'conversation.delete',
    input,
    options,
  )
}
```

统一导出：

```ts
// src/services/gemini-api/index.ts
import * as conversations from './conversations'

export const geminiApi = {
  conversations,
}
```

业务调用方式：

```ts
import { geminiApi } from '@/services/gemini-api'

const result = await geminiApi.conversations.delete(
  { conversationId },
  { signal },
)
```

业务模块不直接导入 `gemini-rpc/client`，也不使用 Operation 名称。这样底层 RPC ID、参数数组或 Operation 名称发生变化时，只需修改 `gemini-api` 与 `gemini-rpc`，多个业务调用方不需要同步调整。

## 13. Bulk Delete 接入示例

Bulk Delete 保留删除队列和 DOM fallback，只替换单项删除的首选执行方式：

```ts
const result = await geminiApi.conversations.delete(
  { conversationId },
  { signal },
)

if (result.ok) {
  await waitForConversationToDisappear(row)
  return
}

if (result.outcome === 'not-sent') {
  await deleteConversationThroughDom(row, signal)
  return
}

await verifyConversationStateBeforeRetrying(conversationId)
```

错误结果的含义：

| outcome | 典型情况 | 业务处理 |
| --- | --- | --- |
| `not-sent` | 输入非法、运行时参数不可用 | 可以直接使用 DOM fallback |
| `rejected` | 服务端明确拒绝请求 | 根据错误类型决定 fallback |
| `unknown` | XHR 发出后超时或连接中断 | 先验证对话是否已删除，不得立即重试 |

HTTP 200 或空 RPC 响应不等同于业务操作一定成功。破坏性操作仍应通过对话从侧栏消失、重新读取列表等可观察状态确认结果。

## 14. 如何新增一个接口

新增 Gemini 接口的标准步骤：

1. 使用临时数据执行原生操作，确认候选 `rpcId`。
2. 通过多组输入差分确认参数数组的含义和动态位置。
3. 单独重放候选请求，以页面实际状态验证副作用。
4. 在 `operations.ts` 中增加具名 Operation。
5. 添加输入 schema、`buildArgs()` 和 `parseResponse()`。
6. 在 `services/gemini-api/` 中增加领域方法并统一导出。
7. 业务模块通过 `geminiApi` 使用，不直接调用 RPC Client。
8. 为请求构造、响应解析、错误分类和业务 fallback 添加测试。

新增接口时，通用 XHR 拦截、WIZ 解析、跨世界协议和 Runtime 执行流程均无需修改。

## 15. 生命周期与安全约束

- 运行时参数仅保存在 Main World 内存中。
- 不将认证参数写入 `localStorage`、扩展 storage、IndexedDB 或日志。
- 不通过 DOM attribute、`CustomEvent.detail` 或 runtime message 发送认证参数。
- 页面销毁后快照自然释放。
- 账号前缀变化时清除参数快照。
- 收到 401、403 或明确认证错误时使快照失效，下次调用重新解析。
- Runtime 不接受任意 Endpoint、HTTP method、RPC ID 或参数数组。
- 破坏性 Operation 必须保留业务侧结果验证，不能仅依据网络成功状态。

## 16. 平台边界

Gemini RPC 第一阶段同时支持 Chrome 和 Firefox。两端仅 Main World 启动方式不同。

### 16.1 Chrome MV3

现有 `src/entrypoints/xhr.content.tsx` 直接声明 Main World：

```ts
include: ['chrome']
world: 'MAIN'
runAt: 'document_start'
```

该入口启动共享 Runtime 和现有 Stuff Monitor：

```ts
main() {
  startGeminiRpcRuntime()
  startStuffMonitor()
}
```

### 16.2 Firefox MV2

WXT 的声明式 `world: 'MAIN'` 不支持 MV2。Firefox 使用一个 Isolated World loader：

```ts
// src/entrypoints/gemini-rpc-firefox-loader.content.ts
export default defineContentScript({
  include: ['firefox'],
  matches: ['*://gemini.google.com/*'],
  runAt: 'document_start',

  async main() {
    await injectScript('/gemini-rpc-main-world.js', {
      keepInDom: true,
    })
  },
})
```

被注入脚本只负责启动共享 Runtime：

```ts
// src/entrypoints/gemini-rpc-main-world.ts
export default defineUnlistedScript(() => {
  startGeminiRpcRuntime()
})
```

`gemini-rpc-main-world.js` 必须加入 Firefox 产物的 `web_accessible_resources`。WXT 的 `injectScript()` 支持 MV2 和 Firefox，但 MV2 下通过异步读取脚本内容完成注入，不能保证与 loader 的 `document_start` 同时执行。参考 [WXT Content Scripts](https://wxt.dev/guide/essentials/content-scripts.html#isolated-world-vs-main-world)。

该时序可能漏掉 Gemini 页面启动阶段最早的 XHR，因此必须保留以下兜底：

1. Runtime 注入后持续监听后续 `batchexecute` XHR。
2. 没有有效 XHR 快照时，按配置即时读取 `WIZ_global_data`。
3. Client 通过可重试的 ping/ready 握手等待 Runtime，ready 消息不会因监听器启动较晚而永久丢失。
4. Runtime 参数仍不可用时返回 `runtime_parameters_unavailable`，由业务决定 DOM fallback。

Firefox 现有 Background `webRequest/filterResponseData` 继续用于 Stuff 等被动响应拦截，不负责主动 RPC 调用，也不复制 `gemini-rpc` 的 Operation 或业务 API。

### 16.3 共享边界

以下模块必须保持双平台共用：

- `integrations/gemini-rpc/config.ts`。
- `integrations/gemini-rpc/types.ts`。
- `integrations/gemini-rpc/operations.ts`。
- `integrations/gemini-rpc/main-world-runtime.ts`。
- `integrations/gemini-rpc/client.ts`。
- `services/gemini-api/`。

不得在业务层出现 `import.meta.env.FIREFOX` 或 `import.meta.env.CHROME`。平台差异只允许存在于启动入口和 manifest 资源声明。

## 17. 测试范围

### 单元测试

- WIZ 候选字段按优先级解析。
- 任一必填字段缺失时拒绝生成快照。
- 原生 XHR URL 和 form body 参数解析。
- `f.req` 和请求 URL 构造。
- Operation 输入 schema 与参数数组构造。
- `batchexecute` 响应解码。
- `not-sent`、`rejected`、`unknown` 错误分类。
- `geminiApi` 正确映射到对应 Operation。

### 集成测试

- Content Client 与 Main World Runtime 的 request/response 关联。
- Client 通过 ping/ready 等待 Runtime，并在初始化超时后返回 `runtime_unavailable`。
- Runtime 晚于 Client 启动时，Client 重试 ping 后能够恢复连接。
- 并发请求使用不同 `requestId`。
- timeout 和 AbortSignal 能清理 pending 状态。
- 桥接拒绝未知 Operation 和非法输入。
- 跨世界消息不包含认证参数或完整原始响应。

### 真实页面验证

- 使用临时对话验证请求参数和副作用。
- 验证账号前缀、不同语言和 SPA 页面切换。
- 分别验证 Chrome 声明式 Main World 与 Firefox 注入式 Main World 能完成同一个只读 Operation。
- 验证 Firefox 漏过初始 XHR 时可以通过 `WIZ_global_data` 完成首次调用。
- 验证 RPC 不可用时仍可进入现有 DOM fallback。
- 破坏性请求发生 timeout 时，先确认页面状态再决定是否重试。

### 构建产物验证

- `pnpm build`：Chrome manifest 包含声明式 Main World XHR 入口，不包含 Firefox loader。
- `pnpm build:firefox`：Firefox manifest 包含 loader，并将 `gemini-rpc-main-world.js` 声明为 web-accessible resource。
- 两端产物均只包含一份共享 Runtime、Operation 和 `gemini-api` 实现。

## 18. 实施顺序

1. 修正 `xhrInterceptor` 的 `onRequest` 通知。
2. 建立 `gemini-rpc` 配置、类型、Runtime 和 Client。
3. 在 Chrome `xhr.content.tsx` 中启动共享 Runtime。
4. 增加 Firefox `document_start` loader、Main World unlisted script 和 web-accessible resource。
5. 增加可重试的 ping/ready 握手和 Firefox 初始化超时处理。
6. 建立 `services/gemini-api/` 公共封装层。
7. 接入一个无副作用、容易验证的只读 Operation，并在 Chrome 和 Firefox 分别验证。
8. 完成参数失效、错误分类和跨世界安全测试。
9. 验证删除 RPC 后，再将 Bulk Delete 接入 `geminiApi.conversations.delete()`。
10. 保留现有 DOM 删除流程作为 fallback。

## 19. 核心原则

```text
Operation 决定调用哪个内部 RPC 以及如何解释参数和响应。
Runtime 决定如何取得当前页面参数并发送 XHR。
geminiApi 向业务暴露稳定、可复用的领域接口。
Feature 负责业务流程、可观察结果验证与 DOM fallback。
```
