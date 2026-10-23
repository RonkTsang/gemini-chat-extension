# Slice-4 测试有效性审计（gemini-theme / theme-bloom / main-world / notification-audio-offscreen）

- 审计方式：只读；逐文件通读清单内 17 个测试文件（共 3424 行），并按需阅读生产实现（`styleController.ts`、`style.css`、`types.ts`、`messageGlassVisibility.ts`、`transition.ts`、`controller.ts`、`dropArbiter.ts`、`settings.ts`、`estimator.ts`、`rect.ts`、`appearance/service.ts`、`welcome-greeting/service.ts`、`notification-audio-offscreen/main.ts`、`library-preload.ts` 相关行为）。
- 未运行 vitest；未修改 `src/`、`test/`、`scripts/` 下任何文件。行号为当前工作树实际行号。

## 1. 概要

| 指标 | 数量 |
| --- | --- |
| 发现总数 | 12 |
| 高（建议删除/重写） | 1 |
| 中（建议合并/加强/改写断言） | 7 |
| 低（可选清理） | 4 |
| 涉及文件数 | 9 / 17 |
| 本切片用例数（含 it.each 展开） | 123 |

分布特点：真正“恒真/空断言”集中在 `styleController.test.ts` 的遗留变量断言与 `!important` 断言；`types.test.ts`、`rect.test.ts` 存在“测试内复制生产算法/常量表”的 oracle duplication；`messageGlassVisibility.test.ts` 整体是“私有 token 表回读”；`notification-audio-offscreen/main.test.ts` 的消息监听用例只断言返回值为 Promise。main-world 三个测试文件整体干净，theme-bloom 的 drop 仲裁/失败回滚类测试质量较高。

## 2. 发现列表

### F1【高】【A 恒真/空断言】styleController.test.ts:294

- 文件/行：`src/entrypoints/content/gemini-theme/background/styleController.test.ts:294`
- 用例：`describe('styleController') > it('scopes input transparency to renderable message glass')`（264 行起）
- 证据：

```ts
expect(css).toContain(
  'transparent var(--gpk-input-area-transparency, 40%)',
)
expect(css).toContain('!important')
```

- 判定理由：`style.css` 共 388 行、含大量 `!important`（侧栏、响应容器、编辑框等规则）。最后一条断言只要求文件任意位置出现字符串 `!important`，与“input-area 规则必须是 important”这一意图无关；删掉前两条 selector/声明断言后它仍会通过。即使该规则被改成非 important（只是文件中别的规则保留 important），用例也不会失败，属于典型“为了覆盖而写的恒真检查”。
- 能捕获的真实回归：几乎无。只有“整个 CSS 文件所有 !important 全部被删”这种与用例意图无关的极端变化才会触发。
- 建议：删除；若要保留强度，改成对“该规则块”做正则断言，例如 `/:root\[data-gpk-bg-enabled="true"\]\[data-gpk-msg-glass="true"\] input-container input-area-v2 \{[^}]*!important/`，或改用 `getComputedStyle` 行为断言（参考同文件 317-343 行的做法）。
- 置信度：高

### F2【中】【A 恒真/空断言（oracle duplication）】types.test.ts:118-127

- 文件/行：`src/entrypoints/content/gemini-theme/background/types.test.ts:118-127`
- 用例：`describe('theme background settings normalize') > it('maps background image positions to css values')`
- 证据：

```ts
for (const position of BACKGROUND_IMAGE_POSITIONS) {
  expect(getBackgroundImagePositionCssValue(position)).toBe(
    BACKGROUND_IMAGE_POSITION_CSS_VALUES[position],
  )
}
```

- 判定理由：生产实现 `types.ts:279-283` 就是 `return BACKGROUND_IMAGE_POSITION_CSS_VALUES[position]`。测试用同一张常量表作为期望值，等价于断言 `table[k] === table[k]`；若表里某个映射从第一天起就写错（例如 `top` 写成 `'top center'`），循环仍全绿。真正独立的只有 124-126 行三个字面量断言。
- 能捕获的真实回归：仅“函数实现偏离常量表”这一种（改实现为 switch 且不一致）会失败；映射值本身写错（表与实现同步错）无法捕获。
- 建议：删除 119-123 行循环，保留/补全 124-126 行的独立字面量断言（至少覆盖四角 + center），或改断言渲染语义（`getBackgroundImagePositionCssValue('top-left') === 'left top'` 这类可独立核对的值）。
- 置信度：高

### F3【中】【A 恒真/空断言】styleController.test.ts:89-93、149-153、162-166、440-444、453-456、508-512

- 文件/行：`src/entrypoints/content/gemini-theme/background/styleController.test.ts:91/151/164`（`applies renderable background + message glass state`）与 `:442/454/510`（`clears style tag, root attributes and background layer`）
- 用例：
  - `describe('styleController') > it('applies renderable background + message glass state')`
  - `describe('styleController') > it('clears style tag, root attributes and background layer')`
- 证据：

```ts
expect(document.documentElement.style.getPropertyValue(
  '--gpk-msg-glass-transparency',
)).toBe('')
...
expect(document.documentElement.getAttribute(
  'data-gpk-msg-glass-transparency-customized',
)).toBeNull()
```

- 判定理由：这三个遗留 key（`data-gpk-msg-glass-transparency-customized`、`--gpk-msg-glass-transparency`、`--gpk-msg-glass-transparency-customized`）在生产中**只被 remove/从未被 set**。全仓库 grep 只命中 `styleController.ts` 的 `removeAttribute/removeProperty` 与测试本身，`style.css` 也没有 `:root` 默认值。因此 apply 之后它们必然是空，clear 之前它们也从未被写入；无论删掉生产里的 remove 行还是删掉断言，测试结果都不变，属于不可失败的检查。
- 能捕获的真实回归：无（现状下三条 key 不可能出现）。
- 建议：删除这 6 条断言。若确实想守“清理遗留值”这个意图，改为**先手动写入**再调用受测函数：`root.setAttribute(..., 'true'); root.style.setProperty('--gpk-msg-glass-transparency','40%'); applyThemeBackgroundStyle(createState()); expect(...).toBeNull()` —— 这样才真的能捕获 remove 行被误删的回归。
- 置信度：高

### F4【中】【C 实现细节耦合 / E 弱断言】styleController.test.ts:264-315、396-422

- 文件/行：`src/entrypoints/content/gemini-theme/background/styleController.test.ts:264-277`、`279-295`、`297-315`、`396-408`、`410-422`（共 5 个用例读取 `style.css` 源码文本）
- 用例：
  - `it('scopes chat text color CSS to chat-window')`
  - `it('scopes input transparency to renderable message glass')`
  - `it('keeps the model response surface aligned with Gemini content width')`
  - `it('removes the autosuggest scrim when a wallpaper is enabled')`
  - `it('keeps the luminous mode sidenav transparent when a background is enabled')`
- 证据：

```ts
const css = readFileSync(join(process.cwd(), 'src/entrypoints/content/gemini-theme/background/style.css'), 'utf8')
expect(css).toContain('[data-gpk-chat-text-light-color] body.light-theme chat-window')
expect(css).toMatch(/:root\[data-gpk-bg-enabled="true"\]\[data-gpk-msg-glass\] chat-window:not\(\.preview-chat-window\):not\(\.in-gems-mode\) model-response response-container>div\.response-container \{\s*box-sizing: border-box;\s*width: 100%; .../)
```

- 判定理由：
  1. 断言对象是 CSS 源文本而非渲染结果，属于锁实现细节：格式化（换行/空格/属性顺序）、选择器拆分/合并、`process.cwd()` 变化都会造成误报，行为并未改变；297-315 行的巨型正则尤其脆弱。
  2. 部分子串断言无法捕获“作用域收窄”这类真实回归：例如 273 行只断言 `[data-gpk-chat-text-light-color] body.light-theme chat-window`，若把选择器前缀 `:root[data-gpk-bg-enabled="true"]` 删掉（无壁纸时也强制文字颜色），子串仍然包含，用例依旧绿（false negative）。
- 能捕获的真实回归：整条 CSS 规则被删除/选择器名拼错时会失败（这类确有价值）；但无法可靠捕获作用域/优先级回归，且对等价重构误报。
- 建议：优先改成行为断言（注入 CSS + 走 `getComputedStyle`，同文件 317-343、345-394 行已是可用的模式）；若保留源码断言，至少使用锚定完整选择器（含 `:root[...]` 前缀）的正则，而不是裸子串，并去掉对空白格式敏感的 `\s*` 逐字匹配。
- 置信度：高

### F5【中】【A/C】messageGlassVisibility.test.ts:9-18、73-82、84-163

- 文件/行：`src/entrypoints/content/gemini-theme/background/messageGlassVisibility.test.ts:9-18`（把 5 条私有 surface 字符串整段复制进测试）、`73-82`（`resolveMessageGlassTransparencies(5)` 的期望对象就是 `MESSAGE_GLASS_TRANSPARENCY_ANCHORS` 原表）、`84-163`（逐条复述 color-mix 字符串与 64/32/72/48 等派生值）
- 用例：`describe('message glass background visibility strategy')` 下 5 个用例全部相关，尤以 `it('resolves the full CSS variable set')`、`it('keeps light surfaces stable while dark low visibility moves toward dark solid surfaces')`
- 证据：

```ts
const darkModelLegacySurface
  = 'var(--theme-200, var(--gem-sys-color--surface-container-high, var(--gem-sys-color--surface-container, #2d2f31)))'
...
expect(resolveMessageGlassTransparencies(5)).toEqual({
  userLight: 40, userDark: 40, modelLight: 40, modelDark: 90, dualLight: 40, dualDark: 60,
})
```

- 判定理由：被测函数本质是“常量表 + 线性/平方插值”的纯映射；测试的期望值来自生产私有常量（surface 字符串逐字复制、锚点表原样重写），不构成独立 oracle。生产 token 若一开始就写错，测试同步错并全绿；设计值若被有意调整，测试必须逐字改（change-detector），行为并未变化。文件 5 个用例中约 4 个只是在重复“表输出 = 表”。中间插值点（4→32/72、6→52/92）确有一定公式行为价值，不应全删。
- 能捕获的真实回归：clamp/插值公式被误改（部分）；表中 token 字符串被误改（可捕获后续手误，但无法捕获“初始即错”）。
- 建议：保留“边界/分支”断言（visibility 0 取 solid、5 取 legacy anchor、10 取 100；light 恒 legacy、dark 随可见度单调增），删除 73-82 的整表回读与 9-18 的字符串复制；color-mix 断言改成结构化（先断言 `legacySurfaceMixPercentage` 与 `transparency`，再对 `surfaceColor` 只断言包含关键变量名），或把 token 表作为测试 fixture 由生产 `export` 后再断言“同一份表”之外的少数代表值。
- 置信度：中高（“表回读”部分高）

### F6【中】【C 实现细节耦合】transition.test.ts:141-155、182-193

- 文件/行：`src/entrypoints/content/theme-bloom/transition.test.ts:141-155`（`it('uses same-document View Transitions when available')`）、`182-193`（`it('primes a real View Transition pseudo-element without changing page state')`）
- 证据：

```ts
const [keyframes, animationOptions] = animate.mock.calls[0]
expect(keyframes).toHaveLength(8)
expect(keyframes[0]).toMatchObject({ clipPath: 'circle(0px at 20px 30px)', offset: 0 })
...
expect(animationOptions).toMatchObject({ duration: 34, easing: 'linear', fill: 'both', pseudoElement: '::view-transition-new(root)' })
```

- 判定理由：断言了内部动画实现细节：关键帧数量（`REVEAL_RADIUS_STOPS` 长度 8）、首个关键帧、primer 的 `duration: 34`、`easing: 'linear'`、`fill`、`pseudoElement`。这些都是“行为不变但会失败”的等价重构点（例如把 8 个采样点改成 10 个让动画更平滑、把 `linear` 改成等价 cubic-bezier、把 primer 时长调整）。真正用户可见的契约只是“从 origin 圆形扩散到覆盖视口”和“apply 被调用一次”。
- 能捕获的真实回归：未调用 `animate`/未设置 clip-path 的回归（部分可捕获）；`toHaveLength(8)` 这类断言捕获不到用户可见回归。
- 建议：保留 `animate` 被调用一次、`pseudoElement` 正确、首帧 radius≈0、末帧 radius ≥ `getThemeBloomRevealRadius(origin)`、offset 单调递增/递减；删除 `toHaveLength(8)`、`duration: 34`、`easing/fill` 等内部常量断言（或改为从生产 export 的常量引用，至少不再复制魔法数）。
- 置信度：高

### F7【中】【A 恒真/空断言（oracle duplication）】rect.test.ts:79-80

- 文件/行：`src/entrypoints/content/gemini-theme/background/welcome-greeting/rect.test.ts:79-80`
- 用例：`describe('welcome-greeting rect') > it('falls back to formula when greeting DOM is absent')`
- 证据：

```ts
expect(rect.left).toBe((1400 - 120 - 760) / 2 + 120)
expect(rect.top).toBe((900 - 48) / 2 - 80 * 2 - 24 + 48)
```

- 判定理由：期望值是把生产 `rect.ts:47-53` 的公式连同常量一起搬进测试（760/48/24/80 均来自 `welcome-greeting/types.ts`），属于“测试内复制生产算法”：若生产公式本身写错（例如 vertical offset 被重复扣减），测试用同样错误的公式计算期望，双方同错仍全绿。77-78 行的 `350`/`80` 是独立的字面量，恰好是正确的写法。
- 能捕获的真实回归：只捕获“实现偏离当前公式”的变化（包括合法重构），无法捕获公式本身的语义错误。
- 建议：改成独立期望值 `expect(rect.left).toBe(380)`、`expect(rect.top).toBe(290)`（当前输入下手工核算值），或断言关系（rect 在 content 区水平居中、顶部相对 header 的偏移固定）；保留 350/80 的常量断言。
- 置信度：高

### F8【中】【A 只断言类型 / E 假覆盖】notification-audio-offscreen/main.test.ts:131-140

- 文件/行：`src/entrypoints/notification-audio-offscreen/main.test.ts:131-140`
- 用例：`describe('notification audio offscreen') > it('registers the runtime playback listener')`
- 证据：

```ts
const listener = runtimeAddListenerMock.mock.calls[0]?.[0]
expect(listener({
  type: 'response-complete-notification-audio:play',
  target: 'offscreen',
})).toBeInstanceOf(Promise)
```

- 判定理由：用例名字声称“registers the runtime playback listener”，注册断言本身有效；但真正调用 listener 后只断言“返回 Promise”，既没有 `await`，也没有断言音频播放（`MockAudio.instances[0].src/play`）。这意味着：消息路由仍然返回一个 Promise、但不再触发 `playResponseCompleteNotificationAudioFromOffscreen` 的回归（例如把 `return play...()` 改成 `return Promise.resolve()`，或消息类型判断被放宽到任何消息）不会被发现；返回 Promise 的异步失败也会变成未处理的 rejection 而测试不感知。
- 能捕获的真实回归：`browser.runtime.onMessage.addListener` 未被调用。
- 建议：改成 `await listener({ type: '...play', target: 'offscreen' })` 后断言 `MockAudio.instances[0].play` 被调用、`src` 正确；再加一条“非本模块消息”负例断言 `listener(...)` 返回 `undefined` 且不播放。
- 置信度：高

### F9【低】【D 重复 / A 断言由测试自身回调推导】controller.test.ts:375-377、402-403

- 文件/行：`src/entrypoints/content/theme-bloom/controller.test.ts:377`（`it('asks Gemini to clear its native drag state after an outside drop')`）、`403`（`it('falls back to an empty native drop when dragleave does not clear Gemini state')`）
- 证据：

```ts
const nativeDragLeave = vi.fn(() => {
  nativeDropzone.classList.remove('xap-drag-in-progress')
})
...
expect(nativeDragLeave).toHaveBeenCalledOnce()
expect(nativeDropzone.classList.contains('xap-drag-in-progress')).toBe(false)
```

- 判定理由：`xap-drag-in-progress` 是**测试自己注册的回调**移除的；一旦 `toHaveBeenCalledOnce()` 通过，class 断言必然为真；403 行同理（`receivedFileCounts` 已证明 drop 事件到达）。断言不提供额外信息，删除不会遗漏任何生产回归。
- 能捕获的真实回归：无（`nativeDragLeave`/`receivedFileCounts` 已经覆盖同一行为）。
- 建议：删除 377、403 两行 class 断言，保留事件调用/文件数量断言；若想验证真实 Gemini 清理路径，应由受测代码驱动 class 变化（当前实现做不到，可删）。
- 置信度：高

### F10【低】【F 覆盖填充/死配置】background/service.test.ts:38-45

- 文件/行：`src/entrypoints/content/gemini-theme/background/service.test.ts:38-45`
- 用例：文件级 `vi.mock` 配置，影响 `describe('theme background service')` 全部 8 个用例
- 证据：

```ts
vi.mock('#imports', () => ({
  storage: {
    defineItem: () => ({ getValue: mockGetStored, setValue: mockSetStored }),
  },
}))
```

- 判定理由：受测 `service.ts` 依赖的 `./storage` 已在 47-50 行整模块 mock，`service.ts` 的依赖图（db/styleController/welcome-greeting/storage）中没有任何模块会真正加载 `#imports`；该 mock 从未被命中，且会误导读者以为在测 WXT storage 内部。属于死 mock 配置，不是有效覆盖。
- 能捕获的真实回归：无。
- 建议：删除 38-45 行；若未来直接测试 `./storage` 再单独建测试文件覆盖 `defineItem` 迁移/默认值。
- 置信度：高

### F11【低】【E 测试名与断言不符】transition.test.ts:88-100

- 文件/行：`src/entrypoints/content/theme-bloom/transition.test.ts:88-100`
- 用例：`describe('Theme Bloom transition') > it('uses a short cross-fade for reduced motion')`
- 证据：

```ts
expect(transition.reducedMotion).toBe(true)
await vi.advanceTimersByTimeAsync(120)
await transition.finished
```

- 判定理由：`transition.reducedMotion` 只是把入参 `prefersReducedMotion:true` 原样回传，属恒真；用例没有断言任何“cross-fade”（生产 reduced-motion 路径其实只是立即 apply + 120ms 后 cleanup，没有动画）。唯一有效覆盖是隐式的：把 cleanup 时长从 120 改成 600 时，推进 120ms 不会 resolve，测试会挂起/超时。
- 能捕获的真实回归：reduced-motion 路径清理延迟被拉长（隐式、弱）。
- 建议：改名为 `applies immediately and cleans up shortly in reduced-motion mode`；删掉 flag 断言，显式断言 `document.documentElement` 没有 `data-gpk-theme-bloom-fallback`、`--gpk-theme-bloom-x` 已移除，并断言 `vi.advanceTimersByTimeAsync(119)` 后 `finished` 未 resolve、120 后 resolve。
- 置信度：中（隐式计时覆盖确实存在）

### F12【低】【C 实现细节耦合】library-preload.test.ts:36-39、47-52

- 文件/行：`src/entrypoints/main-world/library-preload.test.ts:36-39`、`47-52`
- 用例：`describe('Library HTML preload') > it('reports missing preload scripts only after the initial document scan finishes')`、`it('reports rejected envelopes without repeating the same diagnostic on each mutation')`
- 证据：

```ts
expect(event).toBe('main:preload-scan-complete')
expect(details()).toEqual({ scripts: 0, chunks: 0, reason: 'no-preload-scripts', scriptReasons: [] })
...
expect(calls.find(([event]) => event === 'main:preload-skipped')![1]().reason).toBe('unexpected-envelope')
```

- 判定理由：断言精确到内部 trace stage 名与 reason 文案。`logLibraryTrace` 的 stage 字符串是纯诊断输出，重命名（行为不变）会让用例失败；且因为命中不到时用 `!` 解引用，用例失败信息会退化为 TypeError。不过本文件几乎所有可观察行为就是日志（扫描时机、去重、最大字节数、清理），因此不能整条删除：扫描/去重语义确实需要这个通道验证。
- 能捕获的真实回归：扫描计数、去重次数、清理后停止监听的回归（有效）；但 stage 文案改动会误报。
- 建议：保留“次数/时机”断言（如 `calls.filter(([e]) => e === 'main:preload-skipped')` 长度），把 stage 名/reason 收进 `src/utils/library/logger.ts` 导出的常量（测试引用常量而非字面量），或只对 `details().scripts/chunks` 这类结构化字段断言语义，避免锁死文案；同时把非空断言改为 `find(...)?.` + `expect(...).toBeDefined()` 以避免误导性 TypeError。
- 置信度：中

## 3. 文件覆盖表

| 文件 | 用例数 | 结论 | 备注 |
| --- | --- | --- | --- |
| src/entrypoints/content/gemini-theme/appearance/service.test.ts | 9 | 干净 | 通读；matchMedia modern/legacy 两条分支均有行为断言，详见 §5 |
| src/entrypoints/content/gemini-theme/background/messageGlassVisibility.test.ts | 5 | 发现 1 处（中） | 通读；对照 messageGlassVisibility.ts 常量表核对 |
| src/entrypoints/content/gemini-theme/background/service.test.ts | 8 | 发现 1 处（低，死 mock） | 通读；对照 service.ts 依赖图确认 `#imports` mock 未命中 |
| src/entrypoints/content/gemini-theme/background/styleController.test.ts | 11 | 发现 3 处（高 1 / 中 2） | 通读；对照 styleController.ts + style.css（含 388 行 CSS）核对 |
| src/entrypoints/content/gemini-theme/background/types.test.ts | 13 | 发现 1 处（中） | 通读；对照 types.ts 的 getter/常量定义 |
| src/entrypoints/content/gemini-theme/background/welcome-greeting/estimator.test.ts | 3 | 干净 | 通读；期望值为独立手算几何值，覆盖 cover 缩放与阈值分支 |
| src/entrypoints/content/gemini-theme/background/welcome-greeting/rect.test.ts | 2 | 发现 1 处（中） | 通读；对照 rect.ts 公式 |
| src/entrypoints/content/gemini-theme/background/welcome-greeting/service.test.ts | 5 | 干净 | 通读；对照 service.ts 的缓存/URL/暗色/URL 变化路径 |
| src/entrypoints/content/theme-bloom/controller.test.ts | 26（含 it.each 展开） | 发现 1 处（低） | 通读；对照 controller.ts/dropArbiter.ts 的事件与坐标分支 |
| src/entrypoints/content/theme-bloom/palette.test.ts | 6 | 干净 | 通读；合成像素→preset/hex 的期望可独立核算 |
| src/entrypoints/content/theme-bloom/service.test.ts | 4 | 干净 | 通读；依赖 mock 属编排协议（预加载先于 transition、失败回滚） |
| src/entrypoints/content/theme-bloom/settings.test.ts | 4 | 干净 | 通读；对照 settings.ts 的 revision/abort 逻辑 |
| src/entrypoints/content/theme-bloom/transition.test.ts | 7 | 发现 2 处（中 1 / 低 1） | 通读；对照 transition.ts 关键帧/时长/reduced-motion 分支 |
| src/entrypoints/main-world/library-monitor.test.ts | 4 | 干净 | 通读；fetch 透传/bodyUsed/清理后停止派发均有行为断言 |
| src/entrypoints/main-world/library-preload.test.ts | 7 | 发现 1 处（低） | 通读；对照 library-preload.ts 的扫描/去重/字节上限 |
| src/entrypoints/main-world/stream-generate-monitor.test.ts | 4 | 干净 | 通读；observation 相位序列本身即跨世界协议 |
| src/entrypoints/notification-audio-offscreen/main.test.ts | 5 | 发现 1 处（中） | 通读；对照 main.ts 的 listener/播放实现 |

## 4. 潜在跨文件重复（供 Lead 统一合并）

1. **`ThemeBackgroundSettings` 字面量 fixture 复制 4 份**：`background/service.test.ts:77-106`、`background/styleController.test.ts:13-56`、`background/welcome-greeting/service.test.ts:24-55`、`theme-bloom/service.test.ts:24-50`。每次 `DEFAULT_THEME_BACKGROUND_SETTINGS` 字段变化都要改四处，已出现“默认值 0/true 与 fixture 5/false 不一致”的潜在漂移（各测试恰好不依赖这些字段时不会暴露）。建议抽公共 `createThemeBackgroundSettings()` 工厂（`{ ...DEFAULT_THEME_BACKGROUND_SETTINGS, ...overrides }`）。
2. **message-glass 数值期望重复**：`messageGlassVisibility.test.ts` 的表输出（32/72/48/64%…）与 `styleController.test.ts:100-148` 通过 DOM 断言同一批派生值。两者一个是纯函数、一个是 settings→CSS var 接线，都有价值，但数值断言应共享一份 fixture/常量，避免调参时只改一处导致“同名不同数”。
3. **Library 相关 fixture 跨切片共享**：`library-preload.json` / `library-query.json` / `library-island.html` 同时被 `utils/library/mediaParser.test.ts`、`stuff-page/libraryIsland.test.ts`、`main-world/library-preload.test.ts`、`main-world/library-monitor.test.ts`、`gemini-theme/background/styleController.test.ts` 使用；其中 styleController 只为“Library surface 透明”这一个断言引入整份 `library-island.html`，可考虑抽一个最小 DOM 片段 fixture，避免真实抓包快照变化时牵连 5 个测试文件。
4. **StreamGenerate 信封构造重复**：`main-world/stream-generate-monitor.test.ts` 的 `frame()`/`request()` 与 `utils/streamGenerate.test.ts`、`utils/stuffMediaParser.test.ts`、`integrations/gemini-rpc/*.test.ts` 各自手写 `f.req`/`wrb.fr` 信封；可抽 `test/fixtures/streamGenerate` 工具，避免协议字段调整时逐文件修。
5. **`Audio` / `URL.createObjectURL` / `matchMedia` 手写桩**：`notification-audio-offscreen/main.test.ts` 的 `MockAudio` 与 `background/service.test.ts` 的 `MockImage`、`appearance/service.test.ts` 的 matchMedia 桩均为文件内私有实现，未与其他切片重复；如果后续新增 media 测试，建议集中到 `src/test/` 下复用（当前无需改动）。

## 5. 看起来可疑但判定有效（防误报）

1. **`appearance/service.test.ts:171-195`（matchMedia 监听器 add/remove 调用次数）**：乍看是 B 类“只断言协作者调用次数”，但监听器注册/注销本身就是 `subscribeSystemThemeChange` 的对外协议，且同用例还断言 `onChange('dark')` 与 legacy `addListener` 分支；若删除会漏掉“只支持 modern 或只支持 legacy”的平台回归。仍可加强：`unsubscribe()` 后再 `emit(true)` 断言 `onChange` 不再被调用（当前未覆盖“移除错 handler”的真实泄漏）。
2. **`styleController.test.ts:317-343`（对 `[data-gpk-msg-glass]` false/true 两值都断言 padding=12px）**：看似循环重复同一分支，但两轮的区别是属性**值**；生产选择器是属性存在匹配 `[data-gpk-msg-glass]`，该用例真正守护的是“玻璃关闭时也不丢 padding”。若 CSS 被收窄成 `[data-gpk-msg-glass="true"]`，false 轮会算得 0px 而失败，是有效的 computed-style 行为测试，不建议删除。
3. **`styleController.test.ts:424-527`（clear 后约 30 条内联 CSS 变量/属性为空）**：看似枚举冗余且与 apply 用例重复，但每条对应一个真实用户可见的“主题关闭后残留壁纸/玻璃样式”泄漏；clear 代码正是逐项 removeProperty，任一行漏删都会留下 stale CSS var。属于“低价值但有效”，若嫌冗长可改为断言 `documentElement.style.cssText === ''` + 关键 attribute 为空，但不要当成无效断言删除。
