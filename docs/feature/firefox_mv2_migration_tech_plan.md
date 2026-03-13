# Firefox MV2 迁移技术方案（Chrome/Firefox 双实现隔离）

| **文档版本** | **V1.0** |
| :--- | :--- |
| **功能名称** | Firefox MV2 迁移（XHR 拦截链路） |
| **创建日期** | Mar 8, 2026 |
| **状态** | 🟡 方案评审中 |

## 1. 背景与目标

当前扩展在 Gemini 页面通过 `document_start + MAIN world` 的 content script 拦截 XHR（`src/entrypoints/xhr.content.tsx`），该方案在 Chrome 工作稳定。

迁移到 Firefox 时，核心目标是：

1. **功能等价**：继续拿到 `/_/BardChatUi/data/batchexecute?rpcids=jGArJ&source-path=%2Fmystuff` 的响应内容，驱动 Stuff 页面能力。
2. **平台最优**：Chrome 保留现有方案；Firefox 使用 `webRequest` 方案，降低页面注入时机竞争。
3. **产物隔离**：构建 Chrome 包时不包含 Firefox 代码；构建 Firefox 包时不包含 Chrome 专用代码，避免互相影响。
4. **保持现有业务接口**：尽量复用 `stuffMediaParser`、`stuffDataCache` 与事件总线。
5. **API 风格统一**：代码层统一使用 `browser.*` + Promise 风格，清理遗留 `chrome.*` 回调式调用。

## 2. 现状梳理

### 2.1 当前入口与链路

- 页面早期拦截：`src/entrypoints/xhr.content.tsx`
- 页面上下文监控：`src/entrypoints/main-world/stuff-monitor.ts`
- 接收与消费事件：`src/entrypoints/content/stuff-page/index.ts`
- 解析器（可复用）：`src/utils/stuffMediaParser.ts`
- 当前构建脚本已具备 Firefox 目标：
  - `pnpm dev:firefox`
  - `pnpm build:firefox`
  - `pnpm zip:firefox`

### 2.2 问题点

1. 当前拦截能力依赖页面上下文注入链路，不是 Firefox 的最优路径。
2. 尚未引入后台拦截入口（目前无 `background` entrypoint）。
3. Chrome 与 Firefox 逻辑尚未在入口层彻底拆分，后续维护存在耦合风险。
4. 仍有 `chrome.*` 遗留调用，命名空间和异步风格不统一。

### 2.3 `chrome.*` 现状清单（2026-03-08）

通过 `rg -n "\\bchrome\\." src wxt.config.ts` 扫描到：

1. `src/entrypoints/content/lagecy/content.ts:1003`
2. `src/entrypoints/content/lagecy/content.ts:1054`
3. `src/entrypoints/popup/storage.ts:3`（注释文本，不是实际 API 调用）

## 3. 目标架构（双实现并存，按浏览器裁剪）

### 3.1 架构原则

1. **Chrome**：保留现有 `xhr.content.tsx`（`MAIN + document_start`）。
2. **Firefox MV2**：新增 `background` 中的 `webRequest.filterResponseData` 拦截。
3. **统一数据契约**：两端最终都输出 `StuffMediaDataEvent` 结构，消费层保持一致。
4. **入口级裁剪**：通过 WXT `include/exclude` 控制入口是否参与当前浏览器构建。

### 3.2 数据流

#### Chrome（保持现状）

`MAIN world XHR hook -> window.CustomEvent(gem-ext:stuff-media-data) -> stuff-page 模块`

#### Firefox MV2（新增）

`background webRequest.filterResponseData -> parse -> runtime.sendMessage(tab) -> stuff-page 模块`

## 4. 迁移方案（分阶段）

## Phase 0：基线保护

1. 保留现有 `xhr.content.tsx` 不改行为，仅后续加浏览器限定。
2. 先确保当前构建矩阵可用：
   - `pnpm build`（Chrome）
   - `pnpm build:firefox`（Firefox MV2）

交付物：基线构建日志、基线功能录屏（Stuff 页面）。

## Phase 1：入口拆分与裁剪

### 4.1 Chrome 入口显式限定

在 `src/entrypoints/xhr.content.tsx` 增加浏览器限定：

```ts
export default defineContentScript({
  include: ['chrome'],
  matches: ['*://gemini.google.com/*'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    startStuffMonitor()
  },
})
```

### 4.2 新增 Firefox MV2 后台入口

新增：`src/entrypoints/firefox/background.ts`（路径含 `firefox` 标识，便于后续扩展其他浏览器专用实现）

```ts
export default defineBackground({
  include: ['firefox'],
  persistent: true, // Firefox MV2
  main() {
    // 注册 webRequest 监听
  },
})
```

### 4.3 消费端统一桥接

修改 `src/entrypoints/content/stuff-page/index.ts`：

1. 保留 `window.addEventListener(GEM_EXT_EVENTS.STUFF_MEDIA_DATA, ...)`（Chrome）。
2. 新增 `browser.runtime.onMessage.addListener(...)`（Firefox）。
3. 两条路径进入同一个 `handleStuffMediaData(eventLike)` 处理函数，避免逻辑分叉。

交付物：Chrome/Firefox 双浏览器均可触发相同 UI 结果。

## Phase 1.5：API 命名空间与异步风格统一

### 4.4 改造原则

1. 所有扩展 API 统一使用 `import { browser } from 'wxt/browser'`。
2. 优先 Promise 写法，避免 callback 风格。
3. 存储访问尽可能统一为 WXT `storage.defineItem`（已有模块直接复用，不重复封装）。

### 4.5 文件级改造

1. `src/entrypoints/content/lagecy/content.ts`
   - `chrome.storage.sync.get(...)` -> `await browser.storage.sync.get(...)`
   - `chrome.storage.onChanged.addListener(...)` -> `browser.storage.onChanged.addListener(...)`
2. `src/entrypoints/popup/storage.ts`
   - 更新注释文案，避免继续引导 `chrome.storage` 心智。

### 4.6 验收标准

1. `rg -n "\\bchrome\\." src` 结果为 0（如需保留兼容层，必须在文档中注明例外文件）。
2. TypeScript 编译通过：`pnpm run compile`。
3. Chrome/Firefox 构建通过：`pnpm build && pnpm build:firefox`。

## Phase 2：Firefox webRequest 实现

### 4.7 拦截策略

在 Firefox `background` 入口实现：

1. 监听目标请求（`urls: ["*://gemini.google.com/_/BardChatUi/data/batchexecute*"]`）。
2. 校验查询参数 `rpcids=jGArJ` 且 `source-path=/mystuff`。
3. 使用 `filterResponseData(requestId)` 读取响应流，拼接文本。
4. 复用 `parseMediaResponse` / `isStuffMediaRequest` 进行解析与校验。
5. 通过 `tabs.sendMessage(tabId, { type: 'stuff-media:data-received', payload })` 投递给 content script。
6. 数据透传写回过滤器（保证页面原请求行为不受影响）。

### 4.8 错误与健壮性

1. 任意解析错误仅记录日志，不中断原始响应透传。
2. `tabId < 0` 或无活动 content script 时静默降级。
3. 对重复数据继续依赖 `stuffDataCache` 去重。

交付物：Firefox 下无需 MAIN world 注入即可稳定获取数据。

## Phase 3：Manifest 与权限按浏览器收敛

修改 `wxt.config.ts` 中 `manifest(env)`：

1. 基础权限保留：`storage`。
2. 仅 Firefox 追加：
   - `webRequest`
   - （如实现需要）`webRequestBlocking`
   - 对应 host 权限：`*://gemini.google.com/*`
3. Firefox 发布参数建议补齐：
   - `browser_specific_settings.gecko.id`
   - `browser_specific_settings.gecko.strict_min_version`
   - `browser_specific_settings.gecko.data_collection_permissions`（按 AMO 政策填写）

注意：权限和 gecko 配置必须放在 `env.browser === 'firefox'` 条件分支内，避免进入 Chrome 产物。

`browser_specific_settings.gecko` 模板（示例）：

```ts
manifest: (env) => {
  const manifest: any = {
    // ...base
    permissions: ['storage'],
  }

  if (env.browser === 'firefox') {
    manifest.permissions.push('webRequest', 'webRequestBlocking')
    manifest.host_permissions = ['*://gemini.google.com/*']
    manifest.browser_specific_settings = {
      gecko: {
        id: 'gemini-power-kit@ronktsang.dev',
        strict_min_version: '128.0',
        data_collection_permissions: {
          required: [],
          optional: [],
        },
      },
    }
  }

  return manifest
}
```

交付物：Chrome 包不含 Firefox 权限；Firefox 包具备 webRequest 能力。

## Phase 4：验证、发布与回滚

### 4.9 验收清单

命令验收（必须全部成功）：

1. `pnpm test`（或 CI 使用 `pnpm test:run`）
2. `pnpm check:i18n`
3. `pnpm build && pnpm build:firefox`

产物隔离验收（Chrome 与 Firefox 互不包含对方逻辑）：

1. Chrome 产物检查（默认目录 `.output/chrome-mv3`）
   - 不应出现 Firefox 后台拦截入口（例如 `background.js` 中的 `webRequest.filterResponseData` 逻辑）。
   - `manifest.json` 不应包含 Firefox 专属 `browser_specific_settings.gecko`。
2. Firefox 产物检查（默认目录 `.output/firefox-mv2`）
   - 不应包含 Chrome 专用 `xhr.content` 入口产物。
   - `manifest.json` 应包含 `browser_specific_settings.gecko` 和 Firefox 所需权限。

建议检查命令：

```bash
# 1) 先构建两端
pnpm build
pnpm build:firefox

# 2) 检查 manifest 差异
cat .output/chrome-mv3/manifest.json
cat .output/firefox-mv2/manifest.json

# 3) 检查 Chrome 产物不含 gecko / webRequest 专属逻辑
rg -n "browser_specific_settings|gecko|filterResponseData|webRequest" .output/chrome-mv3

# 4) 检查 Firefox 产物不含 Chrome 专用 xhr.content 入口
rg -n "content-scripts/xhr|startStuffMonitor|world\":\"MAIN\"" .output/firefox-mv2
```

功能验收（手动）：

1. Chrome：Stuff 页面功能与当前行为一致。
2. Firefox：翻页、多次进入 `/mystuff`、会话切换后仍可获取媒体数据。
3. 无明显性能退化（页面交互和请求时延无感知变慢）。

回滚策略：

1. Firefox 端保留开关位（例如 `ENABLE_FIREFOX_WEBREQUEST_MONITOR`）。
2. 如出现线上异常，可临时关闭 Firefox webRequest 逻辑并回退到旧链路（若保留）。

## 5. 代码改动清单（计划）

新增文件：

1. `src/entrypoints/firefox/background.ts`（Firefox MV2 webRequest 入口）
2. `src/services/firefoxStuffRequestMonitor.ts`（可选，后台逻辑拆分）
3. `src/types/runtime-messages.ts`（可选，消息协议集中定义）

修改文件：

1. `src/entrypoints/xhr.content.tsx`（`include: ['chrome']`）
2. `src/entrypoints/content/stuff-page/index.ts`（新增 runtime message 监听并统一处理）
3. `src/entrypoints/content/lagecy/content.ts`（`chrome.storage` -> `browser.storage` + Promise）
4. `src/entrypoints/popup/storage.ts`（注释与风格统一）
5. `wxt.config.ts`（按浏览器注入权限与 gecko 配置）

可复用文件（无需重写）：

1. `src/utils/stuffMediaParser.ts`
2. `src/common/event.ts`
3. `src/entrypoints/content/stuff-page/dataCache.ts`

## 6. 产物隔离策略（重点）

为确保“各平台功能均实现但产物互不影响”，采用三层隔离：

1. **入口隔离**：`include/exclude` 控制入口只在目标浏览器生效。
2. **配置隔离**：`manifest(env)` 内按 `env.browser` 分支注入权限/配置。
3. **代码隔离**：必要时使用 `import.meta.env.FIREFOX/CHROME` 常量做编译期分支，让无关分支被 tree-shaking 移除。

## 7. 风险与对策

1. 风险：`filterResponseData` 流处理不当导致页面请求异常。
   对策：先实现“只透传+旁路解析”，保证 `write/close/disconnect` 完整。
2. 风险：请求体/响应体格式随 Gemini 调整导致解析失败。
   对策：保持 `stuffMediaParser` 的容错路径，记录采样日志并可快速热修。
3. 风险：Firefox 权限增加影响商店审核。
   对策：权限最小化，仅声明当前拦截所需域名与 API。
4. 风险：双实现长期漂移。
   对策：统一数据契约与消费层，单测覆盖 parser 与消息协议。

## 8. 实施建议（执行顺序）

1. 先做入口裁剪（Phase 1），确保构建产物隔离。
2. 再做 Firefox webRequest（Phase 2），保留日志观测。
3. 完成 manifest 与发布配置（Phase 3）。
4. 最后做联调、回归、打包发布（Phase 4）。

## 9. Definition of Done

1. Chrome 与 Firefox（MV2）都能在 `/mystuff` 可靠获取媒体数据。
2. 双浏览器产物互不包含对方专用实现。
3. 文档化完成：构建命令、权限说明、回滚策略可被维护者直接执行。
4. 代码通过现有 `lint/test/build` 基线（至少 `build` + `build:firefox`）。
