# Slice-6 测试质量审计报告

- 审计对象：`.tmp/audit/slice-6.txt` 列出的 23 个测试文件（2765 行；153 个 `it` 声明，`it.each` 展开后约 168 个运行用例）
- 审计方式：只读。逐个通读 23 个测试文件 + 对应生产实现（`src/utils/*`、`src/integrations/gemini-rpc/*`、`src/services/shortcuts/*`、`src/domain/folder/schemas.ts`、相关 scripts），辅以 grep/静态检查确认调用方与产物；未运行 vitest 或任何脚本
- 判定原则：删掉该断言/用例后若能说出一个会漏掉的真实回归，则至多标“低价值但有效”；否则按 A–F 归类。当前代码状态（`package.json`/`vitest.config.ts`、`.gitignore`、`.output/` 构建产物）用于确认“是否死代码 / 是否只在本机可运行”

---

## 1. 概要

| 项目 | 数量 |
| --- | --- |
| 发现总数 | **14** |
| 高（建议删除/重写） | **1** |
| 中（建议合并/加强） | **5** |
| 低（可选清理） | **8** |
| 涉及文件数 | **10 / 23** |
| 干净文件 | **13**（其中 fetchInterceptor / xhrInterceptor / definitions 的部分断言在 §5 说明为有效） |

最值得处理的 3 件事（与发给 Lead 的 Top5 一致）：

1. `src/utils/stuffMediaParser.test.ts:37-41`：模块顶层读取 gitignore 的 `.original/library/request.md`，干净 checkout / CI 会直接加载失败（假绿）。
2. `src/utils/stuffMediaParser.test.ts` 约 20/24 用例测的是**无生产调用方**的导出；且类型数组断言用生产同源常量做 oracle（A+F）。
3. `src/services/shortcuts/definitions.test.ts` 有 4 个用例 + 3 条断言与其它用例 100% 重复，可直接删除而不损失覆盖。

---

## 2. 发现列表

### 高严重度

#### F1. 测试依赖被 gitignore 的本机抓包文件，干净环境无法加载
- **严重度/类别**：高 / E（测试缺陷）
- **位置**：`src/utils/stuffMediaParser.test.ts:37-41`（模块顶层）；直接相关用例 `stuffMediaParser > Response Parsing > should parse current Library media response data`（L197-208）
- **证据**：
  ```ts
  const LIBRARY_REQUEST_PATH = path.resolve(__dirname, '../../.original/library/request.md');
  const libraryRequestMarkdown = fs.readFileSync(LIBRARY_REQUEST_PATH, 'utf-8');
  const libraryResponse = libraryRequestMarkdown.match(/```([\s\S]*?)```/)?.[1]?.trim() ?? '';
  ```
- **判定理由**：`.original` 在 `.gitignore:31` 被忽略（HEAD 中即如此，非本次改动），仓库里不存在该文件；`readFileSync` 在 **import 阶段**执行，新 clone / CI 上整个测试文件 loading error，而不是该用例失败。若目录恰好存在但代码块抽取为空，L200 `expect(result).not.toBeNull()` 也会以误导性方式失败。当前“946 全绿”仅在本机有抓包文件时成立。
- **能捕获的真实回归**：无（反向：干净环境无法运行，属于“假绿”）。
- **建议**：把该抓包文本提交到 `test/samples/`（与已跟踪的 `test/samples/media-response.txt` 同目录），测试改为读取 tracked fixture；若必须保留本机抓包，用 `fs.existsSync` guard + `it.skipIf(!exists)`，避免顶层抛错。
- **置信度**：高

---

### 中严重度

#### F2. 约 20/24 用例覆盖无生产调用方的导出；类型数组断言用生产同源常量做 oracle（A+F）
- **严重度/类别**：中 / F（死代码覆盖），其中类型数组部分属 A（恒真断言）
- **位置/用例**（均在 `stuffMediaParser` describe 内）：
  - `identifyStuffRequestType`（L45-57）：`should identify Media type requests`、`should identify Docs type requests`、`should return null for invalid type arrays`
  - `isStuffMediaRequest`（L59-121）：6 个用例
  - `Request Parameter Parsing`（L124-168）：`should parse first page request parameters`、`should parse request parameters with page token`、`should handle invalid f.req`、`should build next page request`
  - `Response Parsing > should extract page token from real response`（L215-219）
  - `Utility Functions`（L236-317）：`should format item with image`、`should format item with title`、`should group by date`、`should return items with images only`、`should return items with titles only`
- **证据**：
  ```ts
  expect(identifyStuffRequestType(STUFF_REQUEST_TYPES.MEDIA as any)).toBe('media');
  // 生产实现 L131 也是 arraysEqual(typeArray, STUFF_REQUEST_TYPES.MEDIA)
  [['jGArJ', JSON.stringify([STUFF_REQUEST_TYPES.MEDIA, 30]), null, 'generic']],
  ```
- **判定理由**：
  1) 生产代码（`src/entrypoints/background/firefox.ts`、`src/entrypoints/main-world/stuff-monitor.ts`、`stuff-page/*`）只 import `parseMediaResponse` / `isStuffMediaSourcePath` / `MediaItemStatus` / `MediaItem`；`identifyStuffRequestType`、`isStuffMediaRequest`、`parseRequestParams`、`buildNextPageRequest`、`extractPageToken`、`formatMediaItem`、`groupMediaItemsByDate`、`filter*` 在模块外没有任何调用方（模块内 `identifyStuffRequestType`/`parseRequestParams` 仅被同为无调用方的 `isStuffMediaRequest` 使用），属于遗留/未接线代码；grep 源码与 `.output/` 构建产物也确认这些符号没有进入发布包（`parseMediaItem` 除外，它被 `parseMediaResponse` 内部使用）。
  2) 这些用例把 `STUFF_REQUEST_TYPES.MEDIA/DOCS` 既当输入又当实现比对基准：即使把 MEDIA 常量改成 Docs 的 `[1,1,1,1,1,0,1]`，`identifyStuffRequestType(STUFF_REQUEST_TYPES.MEDIA)` 仍然返回 `'media'`，测试照样绿；真实 wire 约定 `[1,1,1,0,0,0,1]` 从未被断言。
- **能捕获的真实回归**：无（死代码，不影响发布行为）；若未来把这些 helper 接回生产，则“请求类型数组错误”不会被这些测试发现。
- **建议**：删除这些无调用方导出及其测试（保留 `parseMediaResponse` / `isStuffMediaSourcePath` / `MediaItemStatus` 相关用例）。若决定保留 API，至少把类型数组期望改为字面量 `[1,1,1,0,0,0,1]` / `[1,1,1,1,1,0,1]`，再断言 `parseRequestParams` / `buildNextPageRequest` 的完整结构。
- **置信度**：高（死代码与同源常量均已用 grep/构建产物确认）

#### F3. 4 个用例 + 3 条断言与其它用例完全重复（D）
- **严重度/类别**：中 / D（重复）
- **位置/用例**：`src/services/shortcuts/definitions.test.ts`
  - L36-44 `shortcut definitions > allows cycle model to run while a contenteditable is focused`
  - L73-81 `shortcut definitions > assigns default shortcuts to Prompt tools`
  - L156-164 `shortcut definitions > uses the Power Kit modifier for Upload Files`
  - L166-174 `shortcut definitions > allows speech dictation to run while the prompt editor is focused`
  - L24-33（`allows every action except Focus Input...` 尾部的 openLibrary/openGems/toggleSidebar 默认绑定断言）
- **证据**：
  ```ts
  expect(cycleModel).toMatchObject({
    defaultShortcut: { default: 'alt+m', mac: 'ctrl+shift+m' },
    enableOnContentEditable: true,
    enableOnFormTags: ['textbox'],
  })
  ```
  同文件的 L12-22 循环已对**每个** definition 断言 `enableOnContentEditable` 与 `enableOnFormTags` 包含 `textbox`；L92-131 `resolves the complete default key map for each platform` 已用 `toEqual` 精确覆盖全部 17 个 action 的 default/mac 绑定（含 `alt+m`/`ctrl+shift+m`、`alt+shift+i`/`ctrl+i`、`alt+u`/`ctrl+u`、`alt+d`/`ctrl+d`）。
- **判定理由**：上述 4 个用例的全部断言都是 L12-22 与 L92-131 的子集；删除后对本文件的覆盖与误报能力没有任何变化，只减少维护点（新增 action 时要同步改的地方更少）。L24-33 的三条默认绑定断言同理。
- **能捕获的真实回归**：无额外（同一文件已有更强、更全的断言）。
- **建议**：删除 L36-44、L73-81、L156-164、L166-174 四个 `it`，删除 L24-33 三条默认绑定断言；保留 L133-154 中的 `ignoreEventWhen` 行为断言（L143-153 是唯一覆盖），其余 `category`/默认绑定断言可删。
- **置信度**：高

#### F4. toolbox 测试断言内部 dev 日志事件名与诊断负载（C）
- **严重度/类别**：中 / C（实现细节耦合：内部日志/文案键）
- **位置/用例**：
  - `toolboxActions > launchGeminiTool > reports when the uploader appears before a tool drawer is ready`（L120-160，断言 L146-156）
  - `toolboxActions > launchGeminiTool > cancels the tool waiter when the menu trigger is unavailable`（L209-225，断言 L216-221）
- **证据**：
  ```ts
  expect(logDevEventMock).toHaveBeenCalledWith('warn', '[Shortcut Tools]',
    'launch-aborted-tool-ready-timeout',
    expect.objectContaining({ tool: 'canvas', timeoutMs: 1_500, uploadFilesButtonVisible: true, drawerCount: 0 }))
  ```
  ```ts
  expect(logDevEventMock).not.toHaveBeenCalledWith('warn', '[Shortcut Tools]', 'launch-aborted-tool-ready-timeout', expect.anything())
  ```
- **判定理由**：`logDevEvent` 是内部诊断日志，`'launch-aborted-tool-ready-timeout'`、`'[Shortcut Tools]'`、`drawerCount` 等只在本模块出现，用户不可见。用户可见行为 `resolves.toBe(false)` 已在 L144/L213 断言。改日志名/字段（等价重构）会误报；反过来，该断言无法捕获任何真实用户回归。负向断言更弱：事件改名后它自动通过，基本恒真。
- **能捕获的真实回归**：无（行为结果已被单独断言）。
- **建议**：保留 `launchPromise resolves false`（第一个用例再补 `expect(clickSpy).not.toHaveBeenCalled()`），删除日志形状断言；若诊断确实要测，把事件名/字段抽成导出常量并对常量断言，或移到 devLogger 自己的单测。
- **置信度**：高（日志字符串为内部实现的判断）；中（是否算“诊断契约”取决于团队约定）

#### F5. Gem 路由完整流程用例与 /app 用例 + DOM 单测重复（D）
- **严重度/类别**：中 / D（重复）
- **位置/用例**：`src/utils/currentChatDelete.test.ts:83-91` `openCurrentChatDeleteConfirmation > opens Gemini confirmation from a concrete Gem conversation route`
- **证据**：
  ```ts
  it('opens Gemini confirmation from a concrete Gem conversation route', async () => {
    window.history.replaceState({}, '', '/gem/8064a1da0457/1675c897fedd575c')
    const flow = makeDeleteFlow()
    await expect(openCurrentChatDeleteConfirmation()).resolves.toBe(true)
    expect(document.activeElement).toBe(flow.confirmButton)
  ```
  与 L73-81（`/app/test-conversation`）除路径外逐字相同；`currentChatDelete.dom.test.ts:109-115 > only accepts concrete conversation routes` 已断言 `isCurrentChatPath('/gem/8064a1da0457/1675c897fedd575c') === true`。
- **判定理由**：`openCurrentChatDeleteConfirmation` 对 `/app/...` 与 `/gem/.../...` 走完全相同的代码路径，唯一差异（路径正则）已被 DOM 单测覆盖；该完整流程用例不能捕获任何 /app 用例 + 路由单测组合捕获不到的回归。
- **能捕获的真实回归**：无额外。
- **建议**：合并为 `it.each(['/app/test-conversation', '/gem/8064a1da0457/1675c897fedd575c'])` 一个用例；或直接删除 /gem 用例。
- **置信度**：高

#### F6. 用例名声称覆盖“page route/query order”，实际未覆盖账号路由分支（E）
- **严重度/类别**：中 / E（假覆盖/名不符实）
- **位置/用例**：`src/utils/library/mediaParser.test.ts:35-39` `Library GraphQL media parser > matches the exact Gemini endpoint independently of signature, query order and page route`
- **证据**：
  ```ts
  it('matches the exact Gemini endpoint independently of signature, query order and page route', () => {
    expect(isLibraryMediaRequest(`${LIBRARY_QUERY_PATH}?variables={}&query_signature=changed`)).toBe(true)
    expect(isLibraryMediaRequest(`https://example.com${LIBRARY_QUERY_PATH}`)).toBe(false)
    expect(isLibraryMediaRequest(`${LIBRARY_QUERY_PATH}Other`)).toBe(false)
  })
  ```
- **判定理由**：断言只覆盖 query signature、外部 origin、路径后缀；没有 query 顺序用例，也没有 `/u/N` 账号路由用例。`isLibraryMediaRequest` 的账号前缀分支依赖 `src/utils/geminiAccountRoute.ts` 的 `extractGeminiAccountRoutePrefix`，全仓库**没有任何测试覆盖**该 helper 或 `/u/N` 形态（已 grep 确认 library-monitor/library-preload/libraryIsland 测试均无 `/u/` 路径）。
- **能捕获的真实回归**：能说明一个具体回归——Gemini 对多账号用户使用 `https://gemini.google.com/u/2/_/BardChatUi/graphql/...` 时，前缀剥离失效会让媒体请求永远识别失败，gallery 缓存/预加载静默不工作；现有用例不会发现。
- **建议**：改名去掉未覆盖的声明，并补 `expect(isLibraryMediaRequest(`/u/2${LIBRARY_QUERY_PATH}`)).toBe(true)`（顺带给 `extractGeminiAccountRoutePrefix` 补 `/u/1`、`/u/1extra`、`/library` 等单测）。
- **置信度**：高

---

### 低严重度

#### F7. `{ once: true }` 让 popstate 计数断言退化为布尔断言（E）
- **严重度/类别**：低 / E（断言能力弱于测试名）
- **位置/用例**（`src/utils/chatActions.test.ts`）：
  - L24 + L29 `chatActions existing chat > opens an existing chat through an in-page history transition`
  - L228 + L233 `chatActions new chat > falls back to a SPA route transition when no native control is available`
  - L251 + L258 `chatActions new chat > falls back to a SPA route transition when the native control does not change routes`
  - L347 + L363 `chatActions temporary chat > uses the SPA route fallback before waiting for the Temporary chat control`
- **证据**：
  ```ts
  window.addEventListener('popstate', popStateSpy, { once: true })
  ...
  expect(popStateSpy).toHaveBeenCalledTimes(1)
  ```
- **判定理由**：`once: true` 使监听器在被调用一次后自动移除，spy 最多记录 1 次，`toHaveBeenCalledTimes(1)` 与 `toHaveBeenCalled()` 等价。它能发现“完全没派发 popstate”，但检测不到“重复派发 popstate”（URL monitor 会重复处理，真实回归）。
- **能捕获的真实回归**：部分（漏掉重复派发；若要检测需去掉 once 或用捕获监听）。
- **建议**：去掉 `{ once: true }`，并在用例末尾 `removeEventListener`；或改为 `const handler = vi.fn(); ... expect(handler).toHaveBeenCalledTimes(1)` 后手动移除。
- **置信度**：高（once 语义确定）；重复派发的现实可能性中

#### F8. pathname 断言由测试自己的 click spy 写入，属空断言（A）
- **严重度/类别**：低 / A（恒真/空断言）
- **位置/用例**：`src/utils/chatActions.test.ts:188-210` `chatActions new chat > uses the native control when it moves an existing chat to /app`（证据 L201-204、L209）
- **证据**：
  ```ts
  const clickSpy = vi.fn(() => { window.history.pushState({}, '', '/app') })
  ...
  expect(clickSpy).toHaveBeenCalledTimes(1)
  expect(window.location.pathname).toBe('/app')
  ```
- **判定理由**：路径变化由测试 fixture 的 click handler 自己写入，生产代码在该路径不写 pathname（正常路径下只是 click + 等路由）。若生产改成 click 后不等待直接返回、或 click 后错误地放弃等待，该断言仍通过。
- **能捕获的真实回归**：无额外（`clickSpy` 已覆盖“必须点击原生控件”）。
- **建议**：删除 pathname 断言；补 `expect(popStateSpy).not.toHaveBeenCalled()`（断言未走 SPA fallback）更有价值。
- **置信度**：高

#### F9. 断言未被任何代码消费的 `risk` 常量字面量（A+F）
- **严重度/类别**：低 / A（只断言常量字面量），兼 F（死字段）
- **位置/用例**：`src/integrations/gemini-rpc/operations.test.ts:24` `conversation.rename > builds the captured MUAZcd request using the current account and route`
- **证据**：
  ```ts
  expect(operation.parseInput(input)).toEqual({ success: true, data: input })
  expect(operation.risk).toBe('write')
  ```
- **判定理由**：全仓库 grep 显示 `risk` 仅在 `operations.ts` 定义、`types.ts` 声明，没有任何读取方；它不参与请求构建/确认/重试逻辑。把它从 `'write'` 改成 `'read'` 不影响任何行为，但测试会红；反之删除该字段测试也不会损失回归检测。
- **能捕获的真实回归**：无。
- **建议**：删除该断言；若 `risk` 确无用途，考虑连同类型一起删掉。
- **置信度**：高

#### F10. 精确内部错误文案断言（C）
- **严重度/类别**：低 / C（精确错误消息）
- **位置/用例**：
  - `src/integrations/gemini-rpc/operations.test.ts:72-74` `conversation.rename > rejects unrelated RPC frames and invalid JSON`
  - `src/integrations/gemini-rpc/main-world-runtime.test.ts:152-161` `delete conversation response parsing > rejects a response without the GzXR5e acknowledgement`（断言 L158-160）
- **证据**：
  ```ts
  )).toThrow('Rename conversation RPC acknowledgement missing')
  ...
  expect(() => parseDeleteConversationResponse(response)).toThrow(
    'Delete conversation RPC acknowledgement missing',
  )
  ```
- **判定理由**：文案只在 Main World 内部使用，最终被 `executeOperation` 统一映射成 `response_parse_error`，用户/调用方看不到。只要错误分支仍抛出且被映射，改文案（等价重构）会误报；该断言真正想区分的是“ack 缺失 vs 无 frame”，可改用更稳定的方式表达（或在用例里同时构造无 frame 输入并对两条 `.toThrow()` 分支断言）。
- **能捕获的真实回归**：部分（能区分错误分支，但依赖文案）。
- **建议**：若只关心“解析失败”，使用 `.toThrow()`；若确实要区分分支，给错误加可判别的 `code` 字段并断言 `code`，或在既有 `No batchexecute response frames found` 用例旁成对断言。
- **置信度**：中

#### F11. 只断言 `source` 的弱断言，且与上一个用例同分支（E）
- **严重度/类别**：低 / E（断言弱 + 轻度重复）
- **位置/用例**：`src/integrations/gemini-rpc/main-world-runtime.test.ts:46-53` `Gemini RPC runtime parameters > accepts a request scoped to a numbered Gemini account`
- **证据**：
  ```ts
  const parameters = extractRuntimeParametersFromXHR(
    'https://gemini.google.com/u/2/_/BardChatUi/data/batchexecute?bl=build-label&f.sid=123456',
    'at=at-token',
  )
  expect(parameters?.source).toBe('xhr')
  ```
- **判定理由**：L23-37 已用 `toEqual` 全量断言同一提取逻辑；本用例唯一新增信息是“`/u/2` 前缀路径被接受”，但只断言 `source`（等价于非 null），没有验证 fSid/bl/at 在该前缀下被正确提取。若账号前缀剥离错误导致字段取错，测试仍绿。
- **能捕获的真实回归**：部分（能发现“账号路由被拒绝”，漏掉“账号路由字段解析错误”）。
- **建议**：与 L23-37 合并为 `it.each`，对 `/u/2/...` 也断言完整 `{at,fSid,bl,capturedAt,source}`；或至少断言 `parameters?.fSid`/`bl`。
- **置信度**：高

#### F12. stuffMediaParser 内 3 处弱断言/名不符实（E+A）
- **严重度/类别**：低 / E（名不符实、断言过弱），其中 `toBeDefined` 属 A
- **位置/用例**：
  1. `stuffMediaParser > Response Parsing > should return null for response without page token`（L221-224）
  2. `stuffMediaParser > Request Parameter Parsing > should build next page request`（L154-167）
  3. `stuffMediaParser > Response Parsing > should parse real media response data`（L172-195，断言 L181-189）
- **证据**：
  ```ts
  const emptyResponse = ')]}\'\n\n[[["wResponse",null,"[[[]]]"]]]';
  expect(extractPageToken(emptyResponse)).toBeNull();
  ...
  expect(inner[2]).toBe(token);
  ...
  expect(firstItem.conversationId).toBeDefined(); // 类型上必然有值，抽错/空串也通过
  ```
- **判定理由**：
  1) 该构造只有 **1 个非空行**，`parseMediaResponse` 在 L268-271 就因 `lines.length < 2` 返回 null，根本没有走到“payload 无 pageToken”的分支；用例名声称的语义未被执行到（换成无 token 的合法两行响应才能覆盖）。
  2) `buildNextPageRequest` 只断言 `inner[2]` 是 token，`typeArray`/`pageSize`/`rpcId` 被丢弃也发现不了。
  3) `conversationId/responseId/timestamp` 用 `toBeDefined` 断言，对 string/number 字段几乎恒真（空串/错误值也通过）；同一文件 L204-207 的 library 用例反而用了精确值。
- **能捕获的真实回归**：部分（3 个字段抽取回归、分页参数回归、无 token 语义回归会漏）。
- **建议**：用例 1 改为两行合法响应（如 `)]}'\n\n[[["wResponse",null,"[[],\\"\\"]"]]]` 且 payload 无第二项）；用例 2 断言完整 `inner` 数组与 `outer[0][0][0] === 'jGArJ'`；用例 3 改成对第一项 `conversationId/responseId/timestamp` 的精确值断言（从样本中取值）。
- **置信度**：高（用例 1、2）；中（用例 3 属“可加强”）

#### F13. cycleModel 测试 fixture 混合矛盾的选中标记，锁定“只认 class”的实现（C/E）
- **严重度/类别**：低 / C（实现细节耦合）
- **位置/用例**：`src/utils/cycleModel.test.ts:20-22` 的 fixture 与 L33-46 `cycleGeminiModel > clicks the next selected model and excludes Extended thinking`
- **证据**：
  ```html
  <gem-menu-item role="menuitem" data-mode-id="flash-lite" data-active="true">3.1 Flash-Lite</gem-menu-item>
  <gem-menu-item role="menuitem" data-mode-id="flash" class="selected">3.5 Flash</gem-menu-item>
  ```
  实现 `isSelectedModeItem` 只看 `class="selected"` / `aria-selected` / `aria-checked`，忽略 `data-active`。
- **判定理由**：fixture 同时给了两个互相矛盾的“选中”信号，测试只能证明 class 优先。若 Gemini 真实页面改用 `data-active`（或实现补上对 `data-active` 的支持），该测试会误报为失败；反过来若 Gemini 停止输出 `class="selected"`，测试也发现不了（fixture 永远保留该 class）。测试无法表达“哪个标记才是真契约”。
- **能捕获的真实回归**：部分（class 探测逻辑被删会红；真实 Gemini 标记切换会漏）。
- **建议**：删除矛盾 fixture 中的 `data-active="true"`（或改为与 class 一致）；如确实要支持 `data-active`，新增独立用例断言优先级并注释依据抓包；否则把“只支持 class/aria-*”写进注释与用例名。
- **置信度**：中（`data-active` 是否为真实契约需对照抓包）

#### F14. 断言无调用方的 debug 导出 `getDetailedButtonStatus`（F）
- **严重度/类别**：低 / F（死代码覆盖）
- **位置/用例**：`src/utils/editorUtils.test.ts:37-42` `editorUtils send button detection > detects Gemini send state when aria-label is on the nested native button`
- **证据**：
  ```ts
  expect(getDetailedButtonStatus()).toMatchObject({
    hasSubmitClass: true,
    hasSendLabel: true,
    isValidSendState: true,
    currentState: 'ready'
  })
  ```
- **判定理由**：`getDetailedButtonStatus` 在全仓库（除 test/自身定义）没有任何调用方，是 debug-only 导出；同一用例里 `getSendButton`/`isReadyToSend` 是活代码、断言保留即可。该断言只覆盖死代码，且 `hasSendLabel/isValidSendState` 与上一行 `isReadyToSend` 重复。
- **能捕获的真实回归**：无。
- **建议**：删除这三行断言（保留 `sendButton` 与 `isReadyToSend` 断言）；若该函数确实只用于调试，可连同函数一起删除。
- **置信度**：高

---

## 3. 文件覆盖表

`用例数`：`it` 声明数；`N/M` 表示 N 个声明经 `it.each` 展开为 M 个运行用例。所有文件均已通读（含其生产实现）。

| 文件 | 用例数 | 结论 | 备注 |
| --- | --- | --- | --- |
| scripts/folder-performance-tools.test.ts | 1 | 干净 | 单个 it 覆盖两个脚本的确定性输出，断言有效；仅注意子进程使用相对路径，依赖 CWD=仓库根 |
| src/integrations/gemini-rpc/client.test.ts | 2 | 干净 | ready 解锁、abort not-sent 均为行为断言；总体覆盖偏薄但无无效断言 |
| src/integrations/gemini-rpc/debug.test.ts | 2 | 干净 | install/uninstall/restore 均为可观察行为 |
| src/integrations/gemini-rpc/main-world-runtime.test.ts | 9 | 发现 2 处（低） | F11（L46-53）、F10（L152-161）；其余 URL/f.req/解析断言有效 |
| src/integrations/gemini-rpc/operations.test.ts | 5/18 | 发现 3 处（低） | F9（L24）、F10（L72-74）；L34-36 与 main-world 测试重复（§4） |
| src/services/shortcuts/definitions.test.ts | 10 | 发现 1 处（中，含 4 用例+3 断言） | F3；L46-71 的排序断言见 §5（有效） |
| src/services/shortcuts/format.test.ts | 7 | 干净 | 纯函数格式化，逐分支断言合理 |
| src/services/shortcuts/settings.test.ts | 6 | 干净 | normalize 的缺失补全/保留用户值/显式清空均为行为断言 |
| src/services/shortcuts/validation.test.ts | 8 | 干净 | 无无效断言；硬编码 bindings fixture 与 definitions 表重复见 §4 |
| src/utils/chatActions.test.ts | 21 | 发现 2 处（低） | F7（4 个用例的 once 计数）、F8（L209） |
| src/utils/currentChatDelete.test.ts | 4 | 发现 1 处（中） | F5（L83-91）；其余路由/已存在 dialog 守卫有效 |
| src/utils/currentChatDelete.dom.test.ts | 5/7 | 干净 | Gemini DOM 技术属性/歧义/路由谓词断言有效；fixture 与集成测试重复见 §4 |
| src/utils/cycleModel.test.ts | 4 | 发现 1 处（低） | F13（L20-22 fixture） |
| src/utils/dictationActions.test.ts | 4 | 干净 | 开/停/可见性优先/无控件四种行为断言有效 |
| src/utils/editorUtils.test.ts | 5 | 发现 1 处（低） | F14（L37-42） |
| src/utils/fetchInterceptor.test.ts | 7 | 干净 | 生命周期/透明性/隔离性断言强；L110-124 的 mock-only 形式见 §5（有效） |
| src/utils/geminiDom.test.ts | 2 | 干净 | 受控 menu 与“新增 dialog”两断言有效（覆盖较薄但不无效） |
| src/utils/library/mediaCache.test.ts | 5 | 干净 | 前缀边界/歧义/合并/上限/TTL 均为行为断言 |
| src/utils/library/mediaParser.test.ts | 4 | 发现 1 处（中） | F6（L35-39） |
| src/utils/streamGenerate.test.ts | 7 | 干净 | 分片解码/端点/请求/帧/超限恢复均有效，期望来自抓包 |
| src/utils/stuffMediaParser.test.ts | 24 | 发现 3 处（高 1 / 中 1 / 低 1） | F1（L37-41）、F2、F12；另 request 类用例与 source-path 单测重复（§4） |
| src/utils/toolboxActions.test.ts | 9 | 发现 2 处（中 1 / 低 1） | F4（L146-156、L216-221）；其余图标/可见性/portal 等待断言有效 |
| src/utils/xhrInterceptor.test.ts | 2 | 干净 | 转发与分段进度是协议本身，断言有效（见 §5） |

---

## 4. 潜在跨文件重复清单（供 Lead 统一合并）

1. **`currentChatDelete.test.ts` ↔ `currentChatDelete.dom.test.ts`**
   - `/gem` 完整流程用例与 `/app` 用例逐字重复，且路由差异已被 dom 单测覆盖（见 F5）。
   - `makeVisible` 辅助函数三份复制：`currentChatDelete.test.ts:4-7`、`currentChatDelete.dom.test.ts:10-13`、`geminiDom.test.ts:4-7`；`makeDeleteFlow`（L10-65）与 dom.test L21-49 的 DOM fixture 结构重复。建议抽到 `src/utils/__test-utils__/domVisibility.ts`。
2. **shortcuts 各文件之间**
   - `definitions.test.ts:92-131` 的完整默认表（17 action × default/mac）与 `validation.test.ts:5-23` 的 `bindings` fixture 是同一张表的两次硬编码；`definitions.test.ts:46-71` 的 action 列表与 validation fixture 的 key 集合相同。新增/重命名 action 要改三处。
   - 建议：validation 的冲突测试改用 `getDefaultShortcutBindings(false)`（或抽共享 fixture 文件）；definitions 内部删除 F3 的重复用例后只保留一张表 + 循环不变量。
   - `settings.test.ts` 的期望值（mac 默认值）与 definitions 的完整表部分重叠，但它是 normalization 行为测试，保留合理。
3. **`operations.test.ts` ↔ `main-world-runtime.test.ts`（buildBatchExecuteRequest）**
   - `operations.test.ts:34-36` 的 pathname / rpcids / source-path 断言与 `main-world-runtime.test.ts:100-108`、`:117-122` 重复；operations 中唯一独有的是 rename 的 `f.req` 结构（L37-39）。建议 URL 契约只由 main-world 测试负责，operations 只断言 operation 特有的 args/sourcePath。
   - 响应帧构造：`operations.test.ts:9-16` 的 `response()` 与 `main-world-runtime.test.ts:127-161` 的手工 `wrb.fr` 帧重复，值得抽公共 fixture builder。
4. **`stuffMediaParser.test.ts` 内部**
   - `isStuffMediaRequest` 的 “legacy /mystuff”、“unsupported source path” 用例（L73-97）与 `isStuffMediaSourcePath` 用例（L229-234）重复覆盖同一谓词；随 F2 一并删除即可。
5. **跨切片（不在本切片，但内容是同一被测面）**
   - `src/utils/library/mediaParser.test.ts`（本切片）与 slice-4 的 `src/entrypoints/main-world/library-monitor.test.ts:34-72`、`library-preload.test.ts:62`、slice-3 的 `src/entrypoints/content/stuff-page/libraryIsland.test.ts:18` 共享同一 `library-query.json` fixture 与 `parseLibraryMediaResponse` / URL 匹配行为。建议 Lead 指定唯一 owner：单测负责解析与 `/u/N` 路由边界，集成测试只断言事件/缓存管线，避免同一 fixture 断言四处重复。
   - `src/utils/fetchInterceptor.test.ts` 的“返回原生 promise + 原生 body 仍可读”（L35-56）与 slice-4 `library-monitor.test.ts` 的 “returns the native promise and leaves the response body readable” 行为重叠；前者更完整，可让后者只测监听器/事件层。

---

## 5. 看起来可疑但判定有效（防误报，最多 3 条）

1. **`definitions.test.ts:46-71` `groups shortcuts by product area in display order`**：把分类顺序与 action 顺序全部硬编码，看起来像锁定内部数组顺序（C）。但它同时保证“每个 action 都恰好落在一个分类里”——若 action 拼错分类/漏加分类，该 action 会从设置面板消失（用户无法配置仍生效的快捷键），这是真实回归。建议保留；若担心顺序变更误报，可在注释中标注“设置面板展示顺序为产品契约”。
2. **`fetchInterceptor.test.ts:110-124` `does not deliver an in-flight response to an unsubscribed or newly subscribed consumer`**：只有两条 `not.toHaveBeenCalled()` 的 mock 断言（静态分析会标 mockOnly/negativeOnly）。但它验证的是订阅快照语义：请求发出后取消订阅/新订阅都不应收到该 in-flight 响应，否则会出现重复处理或幽灵回调。属于传输/生命周期协议，按任务说明的反例应视为有效。若要加强，可补“另一个持续订阅者仍收到”的正向断言。
3. **`xhrInterceptor.test.ts:22-41` `notifies matching request listeners when XHR sends its request body`**：只断言回调收到的 `(url, method, body)`，形式上是 B（只断言协作者调用参数）。但 XHR 拦截器的唯一职责就是把 send 生命周期转发给监听者，转发参数即被测协议；URL 匹配、body 透传正是生产代码（`captureRuntimeParameters`）依赖的契约，不能判为无效。

---

## 6. 结论

- 本切片整体质量偏好：13/23 个文件完全干净（如 format/settings/validation/dictation/fetchInterceptor/geminiDom/mediaCache/streamGenerate/xhrInterceptor），没有“无断言/未 await/吞断言”类严重缺陷。
- 真正需要动作的是 3 类：
  1. **可移植性**：`stuffMediaParser.test.ts` 依赖本机 `.original`（F1，必须修）。
  2. **死代码/同源自证**：`stuffMediaParser.test.ts` 的 request/format/filter 用例（F2，可删可重写）+ `getDetailedButtonStatus`（F14）+ `risk`（F9）。
  3. **重复与内部耦合**：shortcuts definitions 的 4 个重复用例（F3）、currentChatDelete 的 /gem 重复流程（F5）、toolbox 内部日志断言（F4）。
- 剩余低严重度问题（F7/F8/F10/F11/F12/F13）建议在顺带改动相关代码时修复，不必单独排期。
