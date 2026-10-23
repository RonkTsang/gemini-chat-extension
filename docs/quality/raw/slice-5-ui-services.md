# Slice-5 测试质量审计（components 全部 / 通知与设置服务 / 设置视图）

- 审计对象：`.tmp/audit/slice-5.txt` 所列 21 个测试文件（约 3926 行，127 个声明用例 / 展开 138 个运行用例）。
- 方式：只读。逐文件通读测试，必要时对照生产实现（`folderAppearance.ts`、`folders/index.tsx`、`FolderStorageDebug.tsx`、`BrowserSyncSummary.tsx`、`ThemeBloomControl.tsx`、`useThemeSettingsController` 相关组件、`useResponseCompleteNotificationSettings.ts`、`useNotificationAudioAsset.ts`、`toaster.tsx`、`responseCompleteNotificationContent.ts` 等）。未运行 vitest。
- 判定原则：删掉该断言后能明确说出的“真实回归”若存在，则不判无效（见第 5 节）。

## 1. 概要

| 级别 | 数量 | 含义 |
| --- | --- | --- |
| 高 | 3 | 建议删除或重写：恒真断言 / 结构性假覆盖 / 无法失败的用例 |
| 中 | 6 | 建议合并或加强：负向弱断言、重复覆盖、mock 自测、脆弱耦合 |
| 低 | 10 | 可选清理：文案/像素/CSS token 耦合、命名与断言不符、死 mock、低价值补丁 |
| 合计 | 19 | 涉及 14 / 21 个文件（另 7 个文件干净） |

主要模式：
1. **“测试名声称的行为 ≠ 断言内容”**（高 2 处、低 3 处）：`registers one content request listener` 不计监听器数量；`closes when …` 无“先打开”前置断言；`keeps pending state local` 只单实例断言。
2. **只有负向断言 / 无法失败的断言**（中 2、低 3）：只断言“不含某文案”“不包含 accepted”，任何“错误但同样不含该词”的实现都能通过。
3. **测试内复制生产算法/常量**（高 1、低 3）：`storage.test.ts` 断言常量字面量与 mock 调用参数；enhancements 测试手写 `normalizeTopBarSettings`；folderAppearance 测试快照常量表。
4. **mock 掉全部依赖后只断言 mock 自己的通道**（中 2）：FolderAppearancePicker 断言 mock 注入的 `data-gpk-*` 与 `conic-gradient` 字符串；toaster 断言 Chakra 内部 `data-scope/data-part` 与魔数偏移。
5. 重复覆盖集中在大文件：`folders/index.test.tsx` 的容量阈值、重试结果、设置节流在多个用例/文件重复。

## 2. 发现列表

### 高

#### H1. 断言常量字面量 + mock 配置参数，模块其余导出零覆盖
- 严重度/类别：高 / A（恒真）+ F（假覆盖）
- 位置：`src/common/storage.test.ts:17-23`
- 用例全名：`shared storage defaults > enables Theme Bloom when no preference has been saved`
- 证据：
  ```ts
  expect(DEFAULT_THEME_BLOOM_ENABLED).toBe(true)
  expect(defineItem).toHaveBeenCalledWith('sync:enableThemeBloom', {
    fallback: true,
  })
  ```
- 判定理由：`DEFAULT_THEME_BLOOM_ENABLED` 就是 `storage.ts` 里的字面量 `true`，断言它等于 `true` 属于同义反复；第二条断言的是被 mock 的 `#imports.storage.defineItem` 的调用参数，即“生产代码把常量传给了 mock”。`src/common/storage.ts` 还有 7 个 `defineItem`、10 个 getter/setter 导出（`getThemeBloomEnabled`、`setChatOutlineEnabled` 等）以及 `getAllSettings` 的组合逻辑，全部零覆盖。文件名暗示“storage 模块已测”，实际只测了一行常量。
- 能捕获的真实回归：仅能捕获 `sync:enableThemeBloom` 键名或 fallback 被无意改动（持久化迁移类回归，有价值）；**捕获不到** getter/setter 忘记委托、`getAllSettings` 只取了两项等真实回归。
- 建议：重写。保留“键名/fallback 契约”一条（可参数化覆盖 8 个 item 的键名与 fallback），并断言 `getThemeBloomEnabled()` 返回 `enableThemeBloom.getValue()`、`setX` 转发 `setValue`、`getAllSettings` 汇总。或者删除常量字面量断言，仅保留键名契约。
- 置信度：高

#### H2. “只注册一个监听器”用例从不统计监听器数量
- 严重度/类别：高 / E（假覆盖）
- 位置：`src/services/responseCompleteNotificationContent.test.ts:162-167`
- 用例全名：`responseCompleteNotificationContent > registers one content request listener`
- 证据：
  ```ts
  startResponseCompleteNotificationContentProvider()
  startResponseCompleteNotificationContentProvider()
  expect(runtimeMessageListener).not.toBeNull()
  ```
- 判定理由：mock 的 `addListener` 只是把回调覆盖到变量里，测试没有断言调用次数。生产实现 `startResponseCompleteNotificationContentProvider` 的 `hasStarted` 幂等守卫（`responseCompleteNotificationContent.ts:51-55`）正是该用例想保护的行为；删掉守卫后 `addListener` 会被调用两次，用例仍然通过。用例名“one listener”与断言不符。
- 能捕获的真实回归：无（当前形态下）。真实风险是后台消息处理被重复注册，导致 Deep Research 状态消息返回两次/重复响应。
- 建议：重写为行为断言：`expect(addListenerMock).toHaveBeenCalledTimes(1)`（把 `onMessage.addListener` 提为 hoisted mock），并补一条“非目标消息返回 undefined、目标消息返回 Promise”的分派断言。
- 置信度：高

#### H3. “账号切换后丢弃测量结果”用例在结构上无法失败
- 严重度/类别：高 / E（无法捕获回归）+ A
- 位置：`src/components/setting-panel/views/folders/index.test.tsx:314-323`
- 用例全名：`Folders Settings storage measurements > discards debug measurements completed after the account switches`
- 证据：
  ```ts
  await act(async () => root.render(<FolderStorageDebug key="old" accountScopeId="account-scope-0001" />))
  runtime.snapshot.identity.identity.accountScopeId = 'account-scope-0002'
  await act(async () => root.render(<FolderStorageDebug key="new" accountScopeId="account-scope-0002" />))
  await act(async () => resolve({ snapshotCount: 99, snapshotBytes: 9999, ... }))
  expect(host.textContent).not.toContain('9,999 B')
  ```
- 判定理由：`key` 从 `old` 变成 `new` 会让旧实例真正卸载，React 会直接忽略对已卸载组件的 `setState`。因此即使删掉 `FolderStorageDebug` 里的 `active.current` / `pending.current` 守卫（`FolderStorageDebug.tsx:49-56`），旧的 `resolve` 也不会影响 DOM，断言恒过。用例名描述的“账号切换”实际从未在同一实例上发生。
- 能捕获的真实回归：无。真实的竞态是“同一实例、accountScopeId prop 变化后旧请求返回”；当前用例绕开了它。
- 建议：重写为同一实例上的 prop 变化：渲染 `<FolderStorageDebug accountScopeId="account-scope-0001" />`，改为 `accountScopeId="account-scope-0002"`（不换 key），让第一个请求保持 pending，再 resolve 旧请求，断言新账号视图不出现旧数据、且旧请求的 resolve 不会把 loading 卡住。也可直接给 `refresh` 的守卫补单元测试。
- 置信度：高

### 中

#### M1. 4 个重试结果只做负向断言，结果映射未验证
- 严重度/类别：中 / E + A
- 位置：`src/components/setting-panel/views/folders/index.test.tsx:696-705`
- 用例全名：`Folders Settings storage measurements > reports the completed %s retry outcome`（`failed` / `conflict` / `busy` / `deferred`）
- 证据：
  ```ts
  const title = runtime.toastCreate.mock.calls.at(-1)![0].title as string
  expect(title).not.toContain('accepted')
  expect(title).not.toContain('Retry requested')
  expect(runtime.toastCreate.mock.calls.at(-1)![0].type).toBe(outcome === 'failed' ? 'error' : 'info')
  ```
- 判定理由：生产 `BrowserSyncSummary.tsx:82-88` 为 4 种 outcome 各有一个独立文案；测试只断言“不含 accepted / Retry requested”。如果 `busy` 与 `deferred` 文案互换、`conflict` 文案为空、或任何新错误文案写错，用例全部通过。类别上既非行为断言，也非协议断言（type 那一条有效）。
- 能捕获的真实回归：只能捕获“把 accepted 文案复用到失败分支”这一种；用户看到错误指引文案的回归全部漏掉。
- 建议：改为 `expect(title).toBe(messages[outcome])` 的精确映射（4 个文案与生产一一对应），保留 type 断言；若担心文案漂移，至少断言每个 outcome 的 title 两两不同且包含各自关键词（busy/deferred/conflict）。
- 置信度：高

#### M2. 容量颜色阈值行为在两处重复覆盖（且循环内重复断言）
- 严重度/类别：中 / D（重复）
- 位置：`src/components/setting-panel/views/folders/index.test.tsx:334-340` 与 `556-569`
- 用例全名：`Folders Settings storage measurements > previews sync capacity colors, failures and actions without sending sync requests`；`… > uses $color for $percent remaining capacity`
- 证据：
  ```ts
  for (const [scenario, percent, color] of [
    ['sync-green', '75%', 'fg.success'], ['sync-yellow', '25%', 'fg.warning'], ['sync-red', '5%', 'fg.error'],
  ]) {
    await choose(scenario)
    expect(host.querySelector(`[data-color="${color}"]`)?.textContent).toContain(`${percent} available`)
    expect(host.textContent).toContain('2 folders · 12 organized chats')   // 每个 scenario 重复
  ```
  另一处：
  ```ts
  it.each([{ used: 599, percent: '40.1%', color: 'fg.success' }, { used: 600, percent: '40%', color: 'fg.warning' }, …])
  ```
- 判定理由：`FolderDebugPanel` 的 scenario 预览就是复用 `BrowserSyncSummary` 的同一套阈值逻辑（debug 面板构造伪 projection 传给 `BrowserSyncSummary`），因此 `556-569` 已经完整覆盖 `≤10 / ≤40 / 其他` 三档；`334-340` 只是换入口重复测同一函数，且把 `'2 folders · 12 organized chats'` 这个与 scenario 无关的断言放进循环重复 4 次。
- 能捕获的真实回归：删除 `334-340` 中的颜色/百分比三行不会丢覆盖（`556-569` 已覆盖）；scenario 到 warning/状态文案的映射仍由该用例其他断言覆盖，应保留。
- 建议：`previews sync capacity…` 只保留“scenario 切换 → 对应 warning/提示文案/动作按钮”的断言；颜色阈值断言合并到 `uses $color…` 一处，并把 `'2 folders · 12 organized chats'` 提到循环外断言一次。
- 置信度：高

#### M3. 两个“关闭”用例缺少“先确认已打开”的前置断言，可空转通过
- 严重度/类别：中 / E（断言可能不覆盖被测行为）
- 位置：`src/components/chat-settings-panel/index.test.tsx:104-125` 与 `200-223`
- 用例全名：`ChatSettingsPanel > closes when the user clicks outside`；`ChatSettingsPanel > closes when Theme opens`
- 证据：
  ```ts
  act(() => { eventBus.emitSync('chat-settings-panel:toggle', { source: 'top-bar-action' }) })
  act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
  expect(container.querySelector('[data-chat-settings-panel]')).toBeNull()
  ```
- 判定理由：这两个用例都没有先断言面板已渲染。如果 `chat-settings-panel:toggle` 打开链路坏掉（事件名改错、`open` 状态未置位、渲染条件失效），面板本来就是 null，用例仍然通过，看似覆盖了“外部点击关闭”，实际什么都没验证。相比之下第三个用例先取 `panel` 并在 `composedPath` 中放入它，能感知打开失败。
- 能捕获的真实回归：当前只能覆盖“关闭逻辑不生效”的一半；打开链路回归漏掉。
- 建议：在触发关闭事件前插入 `expect(container.querySelector('[data-chat-settings-panel]')).not.toBeNull()`（或复用第三个用例的取 panel 方式），再断言关闭后为 null。
- 置信度：高

#### M4. `getValue` mock 返回与初始默认值相同的 true，加载链路实际未被验证
- 严重度/类别：中 / A + E
- 位置：`src/components/setting-panel/views/theme/ThemeBloomControl.test.tsx:120`、`157`、`187-202`
- 用例全名：`ThemeBloomControl > renders an Interactions section with an accessible info tooltip`；`ThemeBloomControl > keeps the current state and reports a failed write`
- 证据：
  ```ts
  mocks.getValue.mockResolvedValue(true)          // beforeAll
  expect(findSwitch(container).getAttribute('aria-checked')).toBe('true')   // 初始值也是 true
  ```
- 判定理由：`DEFAULT_THEME_BLOOM_ENABLED === true`，组件初始 `useState(DEFAULT_THEME_BLOOM_ENABLED)` 也是 true。因此“存储读取后应用值”的 `.then(setEnabled(storedEnabled))` 即使被删掉，断言依然通过。另：`handleCheckedChange` 没有乐观更新（`ThemeBloomControl.tsx:72-81` 只 `setValue`，`checked` 来自 watch/state），所以失败用例里的 `expect(aria-checked).toBe('true')` 在“写入成功”时同样为 true，“保持原状态”是恒真断言，真正有效的只有 toast 断言。
- 能捕获的真实回归：catch 缺失（toast 不报错）可捕获；初始读取被忽略、失败回滚语义不可捕获。
- 建议：`getValue` 改为 `mockResolvedValue(false)`，断言加载后 `aria-checked=false`（覆盖 `setEnabled(storedEnabled)`）；失败用例保留 toast 断言，把“保持原状态”改成先由 watch 回调设为 true 再模拟失败，或直接删除该恒真断言。
- 置信度：高

#### M5. FolderAppearancePicker 用例断言的是全量 mock 自造的属性与 CSS 字面量
- 严重度/类别：中 / C（实现细节耦合）+ F（测 mock）
- 位置：`src/components/folders/FolderAppearancePicker.test.tsx:5-70`、`110-122`
- 用例全名：`FolderAppearancePicker custom color > places the multicolor custom swatch after the preset colors and preserves the picker action`
- 证据：
  ```ts
  // mock 里自造属性：
  Box: ({ children, css }) => <div data-gpk-color-swatch={css?.background ? 'true' : undefined} data-background={css?.background} …>
  // 断言：
  expect(customSwatch.querySelector('[data-gpk-color-swatch]')?.getAttribute('data-background'))
    .toContain('conic-gradient')
  ```
- 判定理由：整个 `@chakra-ui/react` 被替换（含 ColorPicker/Popover/SimpleGrid），断言依赖三处 mock 专属通道：`data-gpk-color-swatch`、`data-background={css.background}`、`data-inline`。生产若把渐变从 `css.background` 移到 `bg`/class，视觉完全一致但用例失败；反之真实的 ColorPicker 交互、Popover 定位、可访问性都测不到。`swatches[8]` 的索引断言也与 mock 的渲染顺序强绑定。有效部分：点击自定义色块 → `onChange`、`aria-label="Custom color"`、`Hex color` 输入框出现。
- 能捕获的真实回归：真正可捕获的只有 onChange 契约与“自定义色块排在预设之后”；`conic-gradient` 字符串、`data-inline` 都不是用户可见行为的可靠代理。
- 建议：改用真实 Chakra（参考 `FolderSideNav.pin.test.tsx` 的 `ChakraProvider value={system}`）；保留 9 个色块/最后一个为自定义色块/`aria-label`/点击后 `onChange({iconKey,colorValue:'#3A83F7'})`；删掉 `conic-gradient` 与 `data-inline` 断言，若一定要测渐变，放到真实 DOM 的 computed style 或单独的设计 token 测试。
- 置信度：高

#### M6. toaster 用例耦合 Chakra 内部 DOM part 与像素魔数
- 严重度/类别：中 / C（实现细节耦合）+ A（冗余断言）
- 位置：`src/components/setting-panel/toaster.test.tsx:33-47`
- 用例全名：（顶层）`portals toast above the panel within its Shadow DOM, tracks its bounds, and clears on close`
- 证据：
  ```ts
  const region = shadow.querySelector<HTMLElement>('[data-scope="toast"][data-part="group"]')!
  expect(region).not.toBeNull()
  expect(region.style.top).toBe('66px')
  expect(region.style.left).toBe('600px')
  …
  expect(region.style.width).toBe('288px')
  ```
- 判定理由：`data-scope`/`data-part` 是 Chakra 内部实现属性，Chakra 改内部结构即失败；`66/600/288` 是 `toaster.tsx:20` 的 `top+16`、`left+width/2`、`min(384, width-32)` 的魔数展开，改视觉常量（16→12、384→400）测试就红，而用户可见行为（跟随锚点、不超出面板）不变。`expect(region).not.toBeNull()` 出现在 `querySelector(...)!` 之后且后续已直接解引用 `region.style`，是冗余断言。
- 能捕获的真实回归：位置跟随/宽度夹取/关闭清理这些行为本身仍有价值（toast 不在 shadow root、未 fixed、resize 不更新都是真回归）；但精确像素与内部 part 名不是。
- 建议：保留 `mount.contains(region) === false`、`position: fixed`、resize 后仍跟随（可用 “top 变大/相对 rect 偏移为常量” 的关系断言）、关闭后清空与 `getCount()`；删除 `data-part="close-trigger"` 或改为可访问名称查询；删除冗余 `not.toBeNull`，像素断言改为相对关系（`Number.parseFloat(top) === rect.top + OFFSET` 中的 OFFSET 从生产常量导入，若导出）。
- 置信度：中

### 低

#### L1. enhancements 用例在 mock 里重抄生产 normalize 算法，并夹带无关的负向断言
- 严重度/类别：低 / A（测试内复制生产算法）+ F（死 mock 代码）
- 位置：`src/components/setting-panel/views/enhancements/index.test.tsx:91-114`、`217`
- 用例全名：`EnhancementsSettingsView top bar customization > opens the Gem Avatar guide from its title help icon`；`… > writes one patch, locks the group, and follows storage updates`
- 证据：
  ```ts
  normalizeTopBarSettings: (settings: unknown) => {
    const source = settings && typeof settings === 'object' ? settings as Record<string, unknown> : {}
    return { showThemeShortcut: typeof source.showThemeShortcut === 'boolean' ? … : true, … }
  },
  ```
  ```ts
  expect(container.textContent).not.toContain('Theme Bloom')
  ```
- 判定理由：(a) 测试手写了一份 `normalizeTopBarSettings`（生产 `topBarCustomizationSettings.ts` 已有实现与测试），后续生产规则变化（如新增 `showChatSettingsShortcut` 归一化）时这里静默漂移；现有断言只喂纯布尔对象，该 mock 从未被检验。mock 里的 `DEFAULT_TOP_BAR_SETTINGS` 还漏了 `showChatSettingsShortcut`，与真实类型不一致。(b) 行 217 的 `not.toContain('Theme Bloom')` 属于“Gem Avatar 指南”用例的无关守卫：mock 的 `t` 对未映射 key 原样返回 key，若 Theme Bloom 用 `t()`（无 fallback）重新加回 Enhancement，该断言不会失败。
- 能捕获的真实回归：normalize mock 没有任何断言依赖 → 无；行 217 仅能捕获“用英文 fallback 重新渲染 Theme Bloom”的一种情况。
- 建议：mock 改为 `...await importOriginal()` 只覆盖 `getTopBarSettings`/`updateTopBarSettings`/`topBarSettingsStorage.watch`，让 normalize 走真实实现；删除行 217 的 Theme Bloom 断言（跨 Tab 位置约束应由 Theme 视图测试或快照保证）。
- 置信度：中

#### L2. ThemeSettingsControls 用例只验证“JSX 子节点顺序 + variant 透传”，五个子组件全被 mock
- 严重度/类别：低 / C + E（只验证组合，无行为）
- 位置：`src/components/setting-panel/views/theme/ThemeSettingsControls.test.tsx:58-100`
- 用例全名：`ThemeSettingsControls > renders Theme Bloom first and Chat layout after Wallpaper`；`ThemeSettingsControls > uses the compact Chat layout variant in the floating panel layout`
- 证据：
  ```ts
  expect(controls.map((control) => control.dataset.control)).toEqual([
    'theme-bloom', 'appearance', 'colors', 'wallpaper', 'chat-layout',
  ])
  expect(controls.every((control) => control.dataset.variant === 'default')).toBe(true)
  ```
- 判定理由：五个子组件（ThemeBloomControl/AppearanceSelector/ColorPresets/CustomBackground/ChatLayoutSettings）全部替换为 `<div data-control=…>`，被测的只有 `ThemeSettingsControls` 的 JSX 排列与 `variant` 传参。这等价于一份“组件数组快照”，唯一失败场景是有人故意调整顺序；顺序若是产品约束尚可算规格，但第二条用例只抽查 5 个子组件中的 2 个 `variant`，与用例名（compact Chat layout）也不完全一致。
- 能捕获的真实回归：顺序回归、compact variant 未透传（但只对 2/5 个子组件）。
- 建议：合并为一条“顺序 + 全部子组件收到 variant”的用例（`every(control => control.dataset.variant === 'compact')`）；或删除，把 variant 透传交给真实的 Theme 面板集成测试。
- 置信度：中

#### L3. folderAppearance 用例是常量表快照，且与 domain/folder/appearance.test.ts 重复；CSS 变量名断言取代了回退等价断言
- 严重度/类别：低 / A + D + C
- 位置：`src/components/folders/folderAppearance.test.ts:11-28`
- 用例全名：`Folder appearance catalog > matches the reference grid and palette order`；`… > renders validated custom colors and safe fallbacks`
- 证据：
  ```ts
  expect(FOLDER_ICON_CATALOG.map((definition) => definition.key)).toHaveLength(30)
  expect(FOLDER_PRESET_COLORS.map(({ key, hex }) => [key, hex])).toEqual([['neutral', '#000'], …])
  ```
  ```ts
  expect(getFolderColor('url(https://example.com)')).toContain('--lumi-sys-color--on-surface')
  ```
- 判定理由：`FOLDER_ICON_CATALOG` 由 `FOLDER_ICON_KEYS.map` 生成，长度恒等于 keys 长度，这条断言只能由“改设计稿”触发；调色板 hex 列表是数据快照。`domain/folder/appearance.test.ts` 已锁定 30 个 icon key 与 8 个颜色 key 顺序，此处是部分重复（hex 值是新信息）。`toContain('--lumi-sys-color--on-surface')` 耦合 `folderAppearance.ts:105` 的 CSS 变量名，安全的真实契约应为“非 hex/非预设值回退到默认色”。
- 能捕获的真实回归：hex 值写错（设计数据回归）；但用 `getFolderColor('url(...)') === getFolderColor('neutral')` 能更稳地覆盖回退语义。
- 建议：合并进 `domain/folder/appearance.test.ts`；图标断言改成“catalog 每个 key 都有定义、key 唯一、每个 Icon 是函数”（当前构造方式下真正会坏的只有 import 缺失）；`getFolderColor` 断言改为与 `getFolderColor(FOLDER_PRESET_COLORS[0].key)` 相等，并保留 `getFolderIcon('unknown') === getFolderIcon('folder')`。
- 置信度：中

#### L4. useNotificationAudioAsset 测试中的自 mock / 重复 mock / 无用 mock
- 严重度/类别：低 / F（死 mock 代码）+ D
- 位置：`src/components/setting-panel/views/notification/useNotificationAudioAsset.test.tsx:13-18`、`38-42`、`119-131`
- 用例全名：（文件级，影响全部 5 个用例）
- 证据：
  ```ts
  vi.mock('@/services/responseCompleteNotificationAudioAsset', async (importOriginal) => {
    const original = await importOriginal<…>()
    return { ...original }        // 与不 mock 完全相同
  })
  vi.mock('#i18n', () => ({ i18n: { t: (id: string) => id } }))   // hook 未 import '#i18n'
  ```
  ```ts
  // beforeEach 里又 doMock 了一遍 @/utils/i18n、#i18n、@/components/ui/toaster
  ```
- 判定理由：第一条 mock 是空操作（原样返回真实模块），不产生隔离价值；`#i18n` 的 mock 没有任何模块引用（hook 只 import `@/utils/i18n` 的 `t`）；`beforeEach` 的 `vi.doMock` 与文件顶层 `vi.mock` 重复定义同样的 factory，`resetModules` 后两套机制叠加，增加理解成本且容易在后续调整时出现“只改了一处”的漂移。
- 能捕获的真实回归：无（只影响可维护性）。
- 建议：删除空操作 mock 与 `#i18n` mock，只保留 `wxt/browser`、`toaster`、`@/utils/i18n` 三处；统一用顶层 `vi.mock`（若必须 resetModules，则只保留 doMock 一套）。另外该文件的 `MockAudio` 类（59-84 行）与 `responseCompleteNotificationAudioAsset.test.ts:35-60` 完全重复，可抽到共享 test util。
- 置信度：高

#### L5. 177 行脚手架只为一条“pending 不变”的断言；没有验证测试通知的实际结果
- 严重度/类别：低 / E（覆盖单薄）
- 位置：`src/hooks/useResponseCompleteNotificationSettings.test.tsx:147-176`
- 用例全名：`useResponseCompleteNotificationSettings > does not enter setting pending state while sending test notifications`
- 证据：
  ```ts
  sendPromise = getLatestResult().sendTestNotification()
  …
  expect(getLatestResult().isPending).toBe(false)     // 发送前/发送中
  …
  expect(getLatestResult().isPending).toBe(false)     // 完成后
  ```
- 判定理由：`isPending` 初始就是 false，且 `sendTestNotification`（hook 319-340 行）只在 `toggleEnabled`/`toggleAudioEnabled` 中改 pending；断言能捕获的唯一回归是“有人把 pending 塞进 sendTestNotification”，这确实是一个会造成开关误禁用的合理回归，因此不算无效，但整个 177 行只覆盖该分支：未断言发出的消息类型/payload、未断言 resolve 后 readiness 被更新、未断言 catch 后重新拉取 readiness（`refreshReadiness` 分支）。
- 能捕获的真实回归：只有 pending 误用；测试通知结果更新 readiness 的行为无覆盖。
- 建议：保留 pending 断言；补充 `expect(sendMessageMock).toHaveBeenCalledWith(expect.objectContaining({type: RESPONSE_COMPLETE_NOTIFICATION_TEST_MESSAGE}))` 与“resolve 带 readiness → hook.readiness 更新”“reject → 调用 getReadiness 两处（`browser.runtime.sendMessage` 次数/readiness 变化）”。
- 置信度：中

#### L6. FolderSideNav 用例中的像素尺寸、CSS token 子串与纯负向用例
- 严重度/类别：低 / C（实现细节）+ E（无正向前置的负向断言）
- 位置：`src/components/folders/FolderSideNav.test.tsx:106`、`114-117`、`143`
- 用例全名：`FolderSideNav folder preview > keeps the folder list visible and opens account selection from the compact account icon`；`… > does not show the extra account icon when identification succeeds`；`… > renders a muted load-more entry only for a folder with another page and disables it while loading`
- 证据：
  ```ts
  expect(switchAccount.querySelector('svg')?.getAttribute('width')).toBe('14')   // LuUserRound size={14}
  expect(button.dataset.color).toContain('--on-surface-variant')                 // HEADER_COLOR 子串
  it('does not show the extra account icon when identification succeeds', () => {
    act(() => root.render(<FolderSideNav />))
    expect(container.querySelector('[data-gpk-folder-account]')).toBeNull()
  })
  ```
- 判定理由：`width="14"` 是图标视觉尺寸，改成 16 无任何行为差异却会红；`--on-surface-variant` 是生产 CSS token 的子串；`does not show the extra account icon` 只有一条负向断言，若整个组件渲染失败（返回 null）该用例依然通过（同文件其他用例能兜底，但这条例句本身没有正向锚点）。
- 能捕获的真实回归：图标存在性/点击行为由同文件其他断言覆盖；尺寸与 token 不是回归代理。
- 建议：删除 `width` 与 color token 断言（保留 aria-label/可点击）；负向用例加一条正向前置（如 `expect(container.textContent).toContain('Folders')`）或合并到同文件第一条用例的 “available” 分支。
- 置信度：中

#### L7. theme-floating-panel 第三条用例只断言按钮数量，与前一条用例重复
- 严重度/类别：低 / D + E（弱断言）
- 位置：`src/components/theme-floating-panel/index.test.tsx:99-111`
- 用例全名：`ThemeFloatingPanel entry behavior > keeps the primary action for existing non-top-bar entry points`
- 证据：
  ```ts
  act(() => { eventBus.emitSync('theme-floating-panel:open', { source: 'whats-new' }) })
  expect(container.querySelectorAll('button')).toHaveLength(2)
  ```
- 判定理由：上一条 `keeps the back action when opened from Theme settings` 已经断言相同数量（2）并额外断言了两个按钮的 aria-label。本条新增的信息只有“source=whats-new 不被误判为 top-bar”这一分支，但只用数量表达：任何“多渲染一个无关按钮/错按钮但仍为 2 个”的实现都会通过。
- 能捕获的真实回归：`source === 'top-bar-action'` 判断写反导致 whats-new 隐藏返回按钮（数量 1）——这一种能捕获，因此有效但很弱。
- 建议：断言两个按钮的 aria-label（`Back to settings` / `Close theme panel`）与顺序，或与上一条用例合并为 `it.each(['setting-panel','whats-new'])`，保留 top-bar 分支单独断言 1 个按钮。
- 置信度：中

#### L8. folders 大文件里有 2 处用例名声称的行为未被断言
- 严重度/类别：低 / E（名实不符 / 未验证声明）
- 位置：`src/components/setting-panel/views/folders/index.test.tsx:163-172`、`174-192`
- 用例全名：`… > prioritizes saved accounts and reveals new email input on request`；`… > shows the restored account and exposes switching and forgetting without deleting Folder data`
- 证据：
  ```ts
  it('prioritizes saved accounts and reveals new email input on request', …) {
    … expect(host.textContent).toContain('Saved accounts')
    const saved = …'saved@example.com'…; await saved.click()
    expect(runtime.selectAccount).toHaveBeenCalledExactlyOnceWith('saved@example.com')
    // 没有任何“reveal new email input”的断言；reveal 行为在下一个用例（line 184-186）才被断言
  ```
  ```ts
  expect(runtime.forgetAccount).toHaveBeenCalledExactlyOnceWith('account-scope-0002')
  expect(host.textContent).not.toContain('saved@example.com')
  expect(runtime.snapshot.identity.identity.email).toBe('user@example.com')   // 声称“不删除 Folder 数据”，却只验证了 identity email
  ```
- 判定理由：命名承诺 > 断言覆盖。“reveals new email input on request”只验证了 saved account 被点击；“without deleting Folder data”用 identity email 未变来代表“Folder 数据未删”，并未断言 `importJson`/`restore`/`exportJson` 等破坏性调用未发生，也没有断言账户历史之外的数据未变。
- 能捕获的真实回归：前半段捕获 selectAccount 接线；后半段捕获不到“忘记账号时误删/误重建 Folder 数据”。
- 建议：第一条补“点击 Use another email 后 email input 出现”或改名为 `selects a saved account`；第二条补 `expect(runtime.restore).not.toHaveBeenCalled()`、`expect(runtime.importJson).not.toHaveBeenCalled()`、`expect(runtime.createSnapshot).not.toHaveBeenCalled()` 等，或直接改名为 `forgets an account from history without switching the current identity`。
- 置信度：中

#### L9. 系统性：i18n mock 复制英文文案进测试，key 拼错会被 fallback 吞掉
- 严重度/类别：低 / C（文案键耦合）+ F
- 位置：`src/components/setting-panel/views/theme/ThemeBloomControl.test.tsx:91-101`（断言 142-156）；`src/components/setting-panel/views/enhancements/index.test.tsx:122-145`（断言 244-250）；`src/components/setting-panel/views/folders/index.test.tsx:52-56`（断言如 371、405-409）
- 用例全名：`ThemeBloomControl > renders an Interactions section with an accessible info tooltip`；`EnhancementsSettingsView top bar customization > renders the group and disables both switches while loading`；folders 视图的文案断言若干
- 证据：
  ```ts
  // ThemeBloomControl.test.tsx mock
  tt: (key, fallback) => ({ 'settingPanel.theme.interactions': 'Interactions', … }[key] ?? fallback)
  // 断言
  expect(container.textContent).toContain('Interactions')
  expect(container.querySelector('[data-tooltip-content]')?.getAttribute('data-tooltip-content')).toBe(description)
  ```
- 判定理由：mock 把英文文案复制进测试文件；`?? fallback` 的写法意味着**生产把 key 拼错时 mock 会返回相同的英文 fallback，断言照样通过**——也就是说这些断言实际验证的是“英文 fallback 没变”，而不是“i18n key 正确”。同时任何 locale 文案调整都会导致测试红，而用户可见行为不变。三个文件都用 `t: (key) => translations[key] ?? key` / `tt: (_id, fallback) => fallback` 的同类手法。
- 能捕获的真实回归：仅英文 fallback 文案被改动；真实缺失的翻译 key（其他 locale 显示 fallback/raw key）无覆盖。
- 建议：统一策略——要么 mock 中记录调用并断言 `expect(tt).toHaveBeenCalledWith('settingPanel.theme.interactions', expect.any(String))` 之类（key 契约，文案无关），要么这几处用真实 `src/locales/en.json`（`getCurrentLocale` 有 mock 能力）做一次 key 存在性断言；至少不要在断言里复制英文文案全文。建议 Lead 跨切片统一决定，避免各文件各自为政。
- 置信度：中

#### L10. debug 面板断言“unlimitedStorage grantedtrue”，锁定相邻文本节点拼接
- 严重度/类别：低 / C（DOM 结构耦合）+ A（mock 产物）
- 位置：`src/components/setting-panel/views/folders/index.test.tsx:283`
- 用例全名：`Folders Settings storage measurements > reads actual debug storage on demand and keeps scenario changes separate from measurements`
- 证据：
  ```ts
  expect(data.textContent).toContain('unlimitedStorage grantedtrue')
  ```
  生产对应（`FolderStorageDebug.tsx:110-116`）是两个相邻 `<Text>`（label 与 value），`textContent` 直接拼接、无分隔符。
- 判定理由：`grantedtrue` 是“两段文本相邻且无空格”的实现产物；给 label/值之间加空格或改为 `label: value` 就失败，属于纯 DOM 结构耦合。同用例的 `123 B (123 B)`、`877 B (877 B) · 87.7% available` 等断言是格式化/夹取逻辑（有效），只有这一条是拼接伪影。
- 能捕获的真实回归：`local.unlimited` 的布尔值展示；但 `toContain('unlimitedStorage granted')` + `toContain('true')` 或按行定位同样能覆盖且不锁结构。
- 建议：改为按行查询（例如遍历 `HStack` 取 label 相邻 value）或断言 `data.textContent` 分别包含 `unlimitedStorage granted` 与值；生产侧给 label/value 之间加分隔符后同步调整。
- 置信度：高

## 3. 文件覆盖表

| 文件 | 用例数 | 结果 | 备注 |
| --- | --- | --- | --- |
| src/components/chat-layout-settings/index.test.tsx | 5 | 干净 | 通读；真实 Chakra + 部分 mock，watch/setValue/回滚均为行为断言 |
| src/components/chat-settings-panel/index.test.tsx | 5 | 发现 1 处（M3，涉 2 用例） | 通读；开/关生命周期覆盖，缺“先打开”前置 |
| src/components/folders/FolderAppearancePicker.test.tsx | 1 | 发现 1 处（M5） | 通读；全量 Chakra mock，断言 mock 自造属性 |
| src/components/folders/FolderSideNav.pin.test.tsx | 3 | 干净 | 通读；真实 Chakra，pin 排序/菜单按钮复用/拖拽分组均为行为断言（见第 5 节） |
| src/components/folders/FolderSideNav.test.tsx | 9 | 发现 1 处（L6，涉 3 处断言） | 通读；折叠/双击/延迟保存为主，少量像素/token 耦合 |
| src/components/folders/folderAppearance.test.ts | 2 | 发现 1 处（L3） | 通读；常量快照，与 domain 测试部分重复 |
| src/components/folders/folderTitleClick.test.ts | 2 | 干净 | 通读；fake timer 边界与双击取消均为有效行为（第 5 节） |
| src/components/notification/NotificationTestButton.test.tsx | 1 | 干净 | 通读；pending→disabled→恢复是有效行为；名称“local”略夸张但不构成无效断言 |
| src/components/setting-panel/toaster.test.tsx | 1 | 发现 1 处（M6） | 通读；portal/定位/清理有效，但 Chakra 内部 part + 精确像素/魔数 |
| src/components/setting-panel/views/enhancements/index.test.tsx | 4 | 发现 2 处（L1、L9） | 通读；加载/写入/失败行为扎实，mock 内重抄 normalize |
| src/components/setting-panel/views/folders/index.test.tsx | 45 声明 / 56 运行 | 发现 5 处（H3、M1、M2、L8、L10） | 通读（分两段）；整体质量高，问题集中在调试面板与负向断言 |
| src/components/setting-panel/views/notification/useNotificationAudioAsset.test.tsx | 5 | 发现 1 处（L4，文件级） | 通读；行为断言有效，mock 脚手架冗余 |
| src/components/setting-panel/views/theme/ThemeBloomControl.test.tsx | 4 | 发现 2 处（M4、L9） | 通读；watch/setValue/toast 有效，初始读取未被验证 |
| src/components/setting-panel/views/theme/ThemeSettingsControls.test.tsx | 2 | 发现 1 处（L2） | 通读；仅组合快照 |
| src/components/theme-floating-panel/index.test.tsx | 3 | 发现 1 处（L7） | 通读；source 分支行为有效，第三条仅数量断言 |
| src/hooks/useResponseCompleteNotificationSettings.test.tsx | 1 | 发现 1 处（L5） | 通读；仅 pending 断言，其余 hook 行为未覆盖 |
| src/common/storage.test.ts | 1 | 发现 1 处（H1） | 通读；恒真断言 + mock 调用，模块其余导出零覆盖 |
| src/services/chatSettings.test.ts | 7 | 干净 | 通读；normalize/夹取/同步 patch 均为纯函数行为 |
| src/services/responseCompleteNotificationAudioAsset.test.ts | 6 | 干净 | 通读；2MB 边界、类型/解码拒绝、元数据剥离、删除协议均有效 |
| src/services/responseCompleteNotificationContent.test.ts | 17 | 发现 1 处（H2） | 通读；DOM 提取/重试/前台判定均有效，仅监听器计数用例假覆盖 |
| src/services/topBarCustomizationSettings.test.ts | 3 | 干净 | 通读；归一化/读取/patch 合并 + setValue 协议均有效 |

合计：21 文件全部通读；127 条声明用例（folders 大文件 7 个 `it.each` 展开后共 138 个运行用例）。

## 4. 潜在跨文件重复清单（供 Lead 统一合并）

| # | 重复内容 | 涉及位置 | 建议 |
| --- | --- | --- | --- |
| 1 | 文件夹图标/颜色目录契约（30 icon / 8 色 / 顺序 / hex） | `domain/folder/appearance.test.ts`（30 keys、palette key 顺序）↔ `components/folders/folderAppearance.test.ts`（catalog 30、palette hex 顺序）↔ `FolderAppearancePicker.test.tsx`（8 预设 + 自定义 = 9 色块） | 目录契约留在 domain 测试；组件测试只断言“渲染了目录中的 key / 点击回调”，删除 hex/长度重复 |
| 2 | `FolderSideNav` 的两套 harness | `FolderSideNav.test.tsx`（手写 Chakra mock）↔ `FolderSideNav.pin.test.tsx`（真实 `ChakraProvider value={system}`） | 可合并为同一 harness（真实 Chakra）并抽 `renderSideNav(snapshot)` helper；两文件还有 `tt: (_k, fallback) => fallback`、runtime snapshot 构造的重复 |
| 3 | Chat Width 同步协议（mode/value patch → setValue） | `services/chatSettings.test.ts`（createWidthModePatch / createWidthValuePatch / createSyncInputWidthPatch）↔ `chat-layout-settings/index.test.tsx:117-136` ↔ `chat-settings-panel/index.test.tsx:160-198` | 三处断言的是同一协议的不同层；UI 层两处几乎等价，建议只保留一处 UI 集成断言（面板间差异用另一条断言区分），其余靠 service 测试 |
| 4 | `variant="compact"` 透传 | `ThemeSettingsControls.test.tsx:82-100`（对 5 个 mock 子组件断言）↔ `theme-floating-panel/index.test.tsx:61-79`（对 mock 的 ThemeSettingsControls 断言 compact） | 两级都用 mock 验证同一透传；保留一级真实组件断言即可 |
| 5 | `MockAudio` 类（decode 成功/失败桩）逐字重复 | `services/responseCompleteNotificationAudioAsset.test.ts:35-60` ↔ `notification/useNotificationAudioAsset.test.tsx:59-84` | 抽 `src/test` 之外的共享 test util（注意：禁止改 `src/test`，可放在两个测试旁的 `*.fixtures.ts` 或由 Lead 统一放置） |
| 6 | `createDeferred` helper 重复 | `NotificationTestButton.test.tsx:16-26` ↔ `useResponseCompleteNotificationSettings.test.tsx:98-108` | 抽共享 helper；folders 大文件里也有内联 `new Promise` 版本 |
| 7 | “设置写入失败 → toaster.create({type:'error', title: err.message})”断言模式 | `ThemeBloomControl.test.tsx:198-201`、`enhancements/index.test.tsx:319-322`、`chat-layout-settings/index.test.tsx:175-178`、`folders/index.test.tsx:849` | 模式本身是有效行为，可抽 `expectErrorToast(message)` 断言 helper 降低重复 |
| 8 | i18n mock 翻译表 / fallback 手法 | `ThemeBloomControl.test.tsx:91-101`、`enhancements/index.test.tsx:122-145`、`folders/index.test.tsx:52-56`、`chat-layout-settings`、`FolderSideNav.test.tsx`、`theme-floating-panel` | 统一 i18n 测试策略（key 契约 vs fallback 文案），见 L9；不要每个文件各复制一份文案表 |

## 5. 看起来可疑但判定有效（防误报）

1. **`folders/index.test.tsx:520-530`“measures on each visible entry”** —— 断言 `measure` 调用次数（隐藏挂载 0、可见进入 1、普通 rerender 不重复）看起来像 mock 编排，但“测量只在可见入口触发、避免每次状态更新都测”就是 `folders/index.tsx` 的真实协议；若退化成每次 render 都测量，会带来后台 sync 存储测量的真实性能/配额回归。**有效**。
2. **`FolderSideNav.pin.test.tsx:60-68` 用 `getComputedStyle(...).visibility` 断言 pin/menu 图标切换** —— 看似锁 CSS。但生产通过 `FolderSideNav.tsx:88-96` 的 `data-gpk-folder-pinned` CSS 选择器实现“钉住行显示 pin 图标、隐藏菜单图标”，这是用户可见的视觉行为；断言的是 computed style 而非选择器字符串本身，删除会漏掉“钉住行仍显示菜单图标/两个图标同时显示”的回归。**有效**（保留）。
3. **`chat-layout-settings/index.test.tsx:161-181` 失败时 `applyChatSettingsStyles(DEFAULT_CHAT_SETTINGS)`** —— 看起来是对内部协作者的调用断言，但它是“保存失败后把页面样式回滚到已存设置”的用户可见行为（否则 UI 与实际存储不一致）；同时 toast 断言覆盖错误上报。**有效**。
