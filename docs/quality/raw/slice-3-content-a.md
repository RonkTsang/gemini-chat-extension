# Slice-3 测试质量审计报告（entrypoints/content：bulk-delete / gem-avatar / stuff-page / chat-settings / power-kit-entry / top-bar-*）

- 审计方式：只读。清单 18 个文件全部通读（约 3501 行），并对照 `deleteQueue.ts`、`deleteQueue.dom.ts`、`deleteProgressOverlay.ts`、`dom.ts`（部分）、`index.tsx`、`settings.ts`（bulk-delete / gem-avatar）、`stickyActionBar.ts`、`gem-avatar/index.ts`、`gem-avatar/dom.ts`、`route.ts`、`styleController.ts`、`top-bar-action/index.ts`、`top-bar-customization/style.css` 等生产实现确认断言语义。未运行 vitest。
- 切片用例总数：约 130 个（含 `it.each` 展开 4 个）。
- 说明：凡“删掉后仍能说出一个具体回归”的断言，最多标为“低价值但有效”，不计入无效结论（rubric 要求）。所有行号以当前工作区文件为准。

## 1. 概要

| 严重度 | 数量 | 含义 |
| --- | --- | --- |
| 高 | 3 | 建议删除或重写（断言文本/自造 oracle，无法捕获声称的回归） |
| 中 | 4 | 建议合并/加强（实现细节耦合、伴随断言恒真、覆盖声称与断言不符） |
| 低 | 12 | 可选清理（低价值断言、轻微重复、内部常量/类名耦合） |
| 合计 | 19 | 涉及 12 个文件；6 个文件干净 |

Top 风险模式：
1. **CSS/样式的“源码文本快照”**（styleController 全量字符串、top-bar-customization 直接读 `style.css`、top-bar-action light-theme、power-kit-entry 注入 CSS 文本）——断言的是常量文本而不是行为，换行/格式/等价写法即误报，CSS 语义错误又查不出。
2. **自造 oracle**：deleteQueue.test.ts 把生产 `OVERLAY_SELECTORS` 复制进测试再调测试专用 helper，生产顺序回归完全无覆盖。
3. **恒真/伴随断言**：dom.load 的 `MutationObserver.disconnect` 负向 spy、index.test.tsx 的 `checkbox.checked` 自设自检。

## 2. 发现列表

### 高

#### H1. CSS 模板字符串快照：断言的是生产源码文本，不是任何行为
- 文件/行：`src/entrypoints/content/chat-settings/styleController.test.ts:34-51`、`:113-132`（用例：`Chat layout style controller > applies independent chat and input widths`、`> scopes alignment, full-width, and table compatibility rules`）
- 类别：A（断言常量文本）/ C（实现细节耦合）
- 证据：
  ```ts
  expect(css).toContain(
    `:root[data-gpk-chat-width] ${CHAT_SETTINGS_SCOPE} infinite-scroller > div.conversation-container user-query {\n  max-width: 100% !important;\n}`,
  )
  expect(css).toContain(
    `${CHAT_SETTINGS_SCOPE} infinite-scroller > div.conversation-container model-response message-content > .markdown > *`,
  )
  ```
- 判定：`css` 就是 `styleController.ts` 里 `STYLE` 模板字符串的 `textContent`。这里用含 `\n`/两空格缩进的完整片段做 `.toContain`，本质是把生产常量复制了一份当期望。行为不变但格式化/选择器等价重排（如加一层 `:where()`、改文件风格）必然失败；反过来，CSS 语义错误（规则写进错误的层叠位置、被后规则覆盖）测试完全无法发现。同文件 94-99 的第二段断言也没有执行任何生产函数（见 L11）。
- 能捕获的真实回归：**无**。它只捕获“文本被编辑”，不捕获“样式失效”。Gemini DOM 选择器漂移只能靠浏览器验证。
- 建议：删除 34-51、113-132 的全部 `.toContain` 文本断言；保留 30-33、70-73、111-112 的 root `data-*` 属性与 `--gpk-*` 自定义属性断言（这些是真实状态）。若仍需防选择器漂移，改成：把捕获的真实 DOM fixture 挂到 happy-dom，注入生产 `<style>` 后用 `getComputedStyle` 断言关键结果（已验证 happy-dom 会应用静态 CSS 规则，例如 light-theme 下 `color` 可从 `inherit` 变 `rgb(0, 0, 0)`）；否则把 CSS 契约交给浏览器端验证。
- 置信度：高

#### H2. 直接读仓库 `style.css` 源文件做字符串断言（连打包产物都不是）
- 文件/行：`src/entrypoints/content/top-bar-customization/index.test.ts:238-250`（用例：`top bar customization controller > keeps the upgrade reminder selector in the customization stylesheet`）
- 类别：A（断言源码文件内容）/ C
- 证据：
  ```ts
  const css = readFileSync(
    join(process.cwd(), 'src/entrypoints/content/top-bar-customization/style.css'),
    'utf8',
  )
  expect(css).toContain(
    ':root[data-gpk-hide-upgrade-reminder] top-bar-actions div.right-section div.adv-upsell',
  )
  ```
- 判定：测试读取磁盘上的 CSS 源文本并与硬编码选择器比较。它既没经过构建链（不验证最终注入/打包的 CSS），也依赖 `process.cwd()`（从别的 cwd 运行即失败）；选择器换行/用 `:is()` 等价重写就误报，而真正的行为（`data-gpk-hide-upgrade-reminder` 属性是否切换）已由本文件 21-75 覆盖。
- 能捕获的真实回归：**无**。只捕获“这一行文本被改”。
- 建议：删除。若要防“升级提醒隐藏规则丢失”，改成行为方式：把 fixture 升级提醒 DOM 挂到 happy-dom、注入生产 CSS 文本（通过 controller 注入的 `<style>` 元素），再断言 `getComputedStyle(advUpsell).display === 'none'` 在属性存在时成立、移除后恢复。
- 置信度：高

#### H3. 自造 oracle：测试把生产 selector 数组复制进断言，生产 overlay 优先级零覆盖
- 文件/行：`src/entrypoints/content/bulk-delete/deleteQueue.test.ts:30-47`（用例：`delete queue confirmation dialog > selects the fixed CDK overlay before an unrelated visible overlay container`）
- 类别：A（用测试内复制的生产算法算期望）/ E（用例名声称的行为未被断言）
- 证据：
  ```ts
  const overlay = __deleteQueueTestApi.findFirst([
    'div.cdk-overlay-container',
    '[role="dialog"]',
    '.modal-container',
    '.overlay-container',
  ])
  expect(overlay?.classList.contains('cdk-overlay-container')).toBe(true)
  expect(overlay?.querySelector('[data-test-id="delete-button"]')).not.toBeNull()
  ```
- 判定：这 4 个 selector 是测试手抄的 `deleteQueue.ts:22` 的 `OVERLAY_SELECTORS`。测试只验证了通用 `findFirst` 的“按 selector 数组顺序取第一个匹配”，**没有**验证生产的 `OVERLAY_SELECTORS` 顺序/内容；即使生产把 `.overlay-container` 提前、导致在图片预览 overlay 里找删除菜单（真实故障），本用例仍然全绿。同时标题里的 “fixed”/“visible” 没有被任何断言触及（`findFirst` 不看 `position`/可见性）。第二句 `querySelector` 在给定 HTML 下必然为真。
- 能捕获的真实回归：仅 `findFirst` 泛型实现被改坏（如返回最后匹配）。**无法捕获** overlay 优先级回归——而这是该测试声称保护的目标。
- 建议：删除，或重写为生产可观测入口：把 overlay 解析抽成 `export function findDeleteOverlayRoot()`（内部持有 `OVERLAY_SELECTORS`），测试调用它并断言 `cdk-overlay-container` 优先；若 `deleteConversationRows` 的失败路径可注入 DOM，则优先用整链路断言（点击删除菜单 → 确认按钮 → 行被移除）。不要删除生产代码里的 `findFirst`；它仍由其他路径覆盖。
- 置信度：高

### 中

#### M1. 动画时长/状态类名与生产常量逐一对应（时序 oracle + CSS class 耦合）
- 文件/行：`src/entrypoints/content/bulk-delete/deleteProgressOverlay.test.ts:22-41`、`:62-85`（另 87-103、115 有同类时长断言）（用例：`delete progress overlay > holds the strike for 200ms, then scrolls the fixed queue for 200ms`、`> morphs into a success mark after every queued deletion succeeds`）
- 类别：A（测试内复制生产时序）/ C（`is-striking`/`is-scrolling`/`is-transitioning`/`is-complete`/`is-leaving` 类名）
- 证据：
  ```ts
  await vi.advanceTimersByTimeAsync(200)
  expect(track.classList.contains('is-scrolling')).toBe(true)
  await vi.advanceTimersByTimeAsync(200)
  ...
  await vi.advanceTimersByTimeAsync(160)
  expect(root.querySelector('[data-gpk-bulk-delete-progress-stage]')?.classList.contains('is-complete')).toBe(true)
  await vi.advanceTimersByTimeAsync(1040)
  expect(root.classList.contains('is-leaving')).toBe(true)
  ```
- 判定：200/160/1040/180 与 `deleteProgressOverlay.ts:4-6,108,143,150,126` 的常量一一对应，只是把内部实现抄进测试；用 Web Animations/改时长等行为等价的实现改造会误报。状态类名是 CSS 动画的中间态，不是用户可观察结果（可观察结果是进度文本、行移除、overlay 消失）。这些用例真正有价值的信息（行最终被移除、`Completed 1 / 3`、结束后 overlay 消失）混在时序断言里。
- 能捕获的真实回归：可以捕获“状态机顺序/最终 DOM 清理”回归，但用结果断言同样能覆盖；当前形式额外捕获的是“常量没被改”，不是回归。
- 建议：保留结果断言（`track.children`、`Completed n / m`、overlay 最终为 null），把多个精确 `advanceTimersByTimeAsync(200/160/1040)` 改为一次大跨度推进（如 `advanceTimersByTimeAsync(5000)`）后断言最终状态；若要保留“先划掉再滚动”的时序，断言“第一次 advance 后行仍在且 count 已 +1，滚动完成后移除”这一可观察差异，而不是 `is-striking` 类；把 87-103 的并发语义保留（见 §5）。
- 置信度：中

#### M2. `MutationObserver.disconnect` 负向 spy 命不中声称的回归（两个用例 4 处断言恒真）
- 文件/行：`src/entrypoints/content/bulk-delete/dom.load.test.ts:108,117`、`:128,137`（用例：`Bulk Delete history loading > ignores a non-adjacent spinner in the same SideNav region`、`> does not treat a generic conversation row as a loading list`）
- 类别：A（断言必然成立）/ E（假覆盖）
- 证据：
  ```ts
  const disconnectSpy = vi.spyOn(MutationObserver.prototype, 'disconnect')
  ...
  await expect(loading).resolves.toEqual({ completed: true })
  expect(disconnectSpy).not.toHaveBeenCalled()
  ```
- 判定：`waitForLoadingRemoved` 只有在“紧邻 spinner”时才创建 observer（`dom.ts:675-678` 提前 return `'not-found'`）。这两个场景里 spinner 故意不紧邻，因此 observer 根本不会创建；`disconnectSpy` 是否被调用和“是否错误等待了非相邻 spinner”没有必然关系。即使生产错误地创建了 observer 但只是观察而不 disconnect，断言仍通过。真正起作用的断言是 `resolves.toEqual({completed:true})`（错误等待 7s 会超时/不 resolve）。
- 能捕获的真实回归：仅“清理路径多调了一次 disconnect”，不是用例名声称的“忽略非相邻 spinner”。
- 建议：删除两处 `disconnectSpy` 断言与 spy。保留 `resolves` 断言；如需更强的时序证明，用 `vi.getTimerCount()` 或断言 `advanceTimersByTimeAsync(600)` 内完成（当前已隐含），并在 fail 时给出明确 reason。顺带：本文件 140-151、153-164 的 disconnect 计数断言确有清理价值，可保留。
- 置信度：高

#### M3. selector 常量字面量快照，与同文件行为测试重复
- 文件/行：`src/entrypoints/content/bulk-delete/deleteQueue.dom.test.ts:44-52`（用例：`bulk delete queue DOM resolvers > uses direct, complete selectors for the current DOM contract`）
- 类别：A（只断言常量字面量）/ D（与同文件 54-176 的行为测试重复）
- 证据：
  ```ts
  expect(CONVERSATION_ROW_SELECTOR).toBe(
    'gem-nav-list-item[data-test-id="conversation"][data-gpk-conversation-key]',
  )
  expect(ACTION_MENU_TRIGGER_SELECTOR).toBe(
    'gem-icon-button[data-test-id="actions-menu-button"][aria-haspopup="menu"]',
  )
  ```
- 判定：把生产的导出常量与测试里手抄的字符串比较，等价于常量快照。选择器真正的契约（对 DOM 是否有效、是否误匹配）已由后续 10 个用例用真实 fixture 验证（比如“不带 wrapper class 也能找到”“重复 trigger 返回 null”）。本用例唯一作用是“改常量必须同步改测试”，属 change-detector；若把 selector 改成等价的属性顺序/组合，会误报。
- 能捕获的真实回归：无（行为测试已覆盖；常量被删会直接编译失败）。
- 建议：删除；若想保留“选择器文案可读性”约束，改成 `expect(CONVERSATION_ROW_SELECTOR).toMatchObject(...)` 无意义——直接删。保留生产常量的可读注释即可。
- 置信度：高

#### M4. light-theme 颜色只靠注入 CSS 文本断言，未验证任何生效结果
- 文件/行：`src/entrypoints/content/top-bar-action/index.test.ts:133-146`（用例：`Theme top bar action > uses black for both shortcuts in Light mode`）
- 类别：C（内部 CSS 文本/选择器字符串）
- 证据：
  ```ts
  expect(injectedStyle?.textContent).toContain(
    'body.light-theme :is([data-test-id="gemini-power-kit-theme-top-bar-button"], [data-test-id="gemini-power-kit-chat-settings-top-bar-button"])',
  )
  expect(injectedStyle?.textContent).toContain('color: rgb(0, 0, 0);')
  ```
- 判定：断言的是 `top-bar-action/index.ts:122-125` 注入的字符串片段。规则写错层级/被 `inherit` 覆盖时文本断言仍通过（false positive 覆盖）；而格式化、选择器合并等行为等价改动会误报。
- 能捕获的真实回归：仅“文本片段被删/改写”，不保证 light 模式真的变黑。
- 建议：改为行为断言：`document.body.classList.add('light-theme')` 后对两个按钮断言 `getComputedStyle(btn).color === 'rgb(0, 0, 0)'`，dark 模式下断言不等于该值（happy-dom 会应用注入的 `<style>`，本审计已用 node + happy-dom 验证该能力）。其余 11 个用例无需改动。
- 置信度：高

### 低

#### L1. 自设自检的 `checkbox.checked` 恒真断言
- 文件/行：`src/entrypoints/content/bulk-delete/index.test.tsx:269-272`（用例：`bulk delete DOM helpers > toggles Bulk Delete mode only while the feature controller is running`）
- 类别：A（断言测试自己写入的值）
- 证据：
  ```ts
  checkbox.checked = true
  checkbox.dispatchEvent(new Event('change', { bubbles: true }))
  expect(checkbox.checked).toBe(true)
  ```
- 判定：`checked` 是测试刚写的，生产 `handleCheckboxChange` 只更新 `selectedKeys`，不会回写 DOM，所以除非生产“主动取消勾选”否则永远通过；而选择状态是否被记录完全没验证。
- 能捕获的真实回归：无。漏掉的合理回归：change 事件没接上/选择数没进菜单（删除按钮仍显示 `Delete (0)`）。
- 建议：改为 `expect(menu.querySelector('[data-gpk-bulk-delete-submit]')?.textContent).toBe('Delete (1)')`（或 `deselectAll.hidden === false`），再断言退出模式后 checkboxes 被清理。
- 置信度：高

#### L2. 面板显隐断言在两条用例重复
- 文件/行：`src/entrypoints/content/bulk-delete/index.test.tsx:323,327` 与 `:351,353`（用例：`> configures the next recent selection from the Change menu` 与 `> reveals the recent count control only after choosing Change`）
- 类别：D（同一行为跨用例重复）
- 证据：
  ```ts
  // 用例 1（301-336）
  change.click()
  expect(panel.hidden).toBe(false)
  // 用例 2（338-355）
  expect(panel.hidden).toBe(true)
  change.click()
  expect(panel.hidden).toBe(false)
  ```
- 判定：`change` 点击后面板展开的断言重复；用例 2 的专属价值只有初始 `hidden === true` 和 `aria-expanded === 'true'`。
- 能捕获的真实回归：有（面板展开），但已被另一条覆盖，非独立回归。
- 建议：用例 1 删除 `expect(panel.hidden).toBe(false)` 两行，仅保留选项选择/回调断言；用例 2 负责显隐 + aria。
- 置信度：中

#### L3. DEV 调试开关路径 + 对不存在行为的 Escape 负向断言
- 文件/行：`src/entrypoints/content/bulk-delete/deleteQueue.test.ts:49-63`（用例：`delete queue confirmation dialog > returns a failure without dispatching a synthetic Escape event`）
- 类别：F（测试 DEV-only 调试注入）/ A（负向断言不可失败）
- 证据：
  ```ts
  setDevForceBulkDeleteFailure(true)
  ...
  expect(result).toMatchObject({ status: 'failed', succeeded: 0 })
  expect(onFailed).toHaveBeenCalledOnce()
  expect(onKeyDown).not.toHaveBeenCalled()
  ```
- 判定：`setDevForceBulkDeleteFailure` 只在 `import.meta.env.DEV` 生效（`deleteQueue.ts:26-30`），是排障开关不是产品行为；`deleteQueue.ts` 全文没有 dispatch keydown 的代码（Escape 由 `index.tsx:356-362` 处理并有自己的测试），所以“没有 synthetic Escape”是对一个从未存在的行为设防。`succeeded: 0` 被 `status: 'failed'` 覆盖。
- 能捕获的真实回归：失败路径的 `onFailed` 回调与状态（有效，可由 mock/注入失败触发）；Escape 断言不捕获任何当前真实回归。
- 建议：保留“失败返回 + onFailed 调用”的断言，但改成真正的失败注入（如让 `deleteOneConversation` 的 DOM 解析失败：只放一个没有 key 的行）；删除 keydown 监听与断言，或保留开发排障用法并把用例归入 debug helper 的单独描述块。
- 置信度：中

#### L4. “hidden target row action” 用例名过度声称，实际只是行内查找的重复覆盖
- 文件/行：`src/entrypoints/content/bulk-delete/deleteQueue.dom.test.ts:82-95`（用例：`bulk delete queue DOM resolvers > resolves a hidden target row action without choosing a visible adjacent row action`）
- 类别：D（与 119-131、97-117 重复）/ E（名称声称的可见性语义未实现）
- 证据：
  ```ts
  ${conversationRow('/app/target', actionTrigger('style="display: none"'))}
  ${conversationRow('/app/adjacent', actionTrigger())}
  ...
  expect(actionButton).toBe(targetRow.querySelector('button'))
  ```
- 判定：`findActionMenuButton` 完全不看可见性（`deleteQueue.dom.ts:34-52` 只做结构查找），`display:none` 对断言无影响；“不选相邻行”已被 119-131 的“不扫描 parent/sibling”覆盖。该用例名会让人误以为覆盖了“隐藏 action 的可见性策略”。
- 能捕获的真实回归：仅“按行查找而不是全局查找”（重复覆盖）。
- 建议：并入 119-131 或改名为“resolves the target row action while an adjacent row also has one”，删除 `style="display: none"` 以免误导。
- 置信度：中

#### L5. 对“生产从不点击的按钮”设防的负向断言
- 文件/行：`src/entrypoints/content/bulk-delete/dom.load.test.ts:66-79`（用例：`Bulk Delete history loading > does not click chat-window Show more options while using the no-spinner fallback`）
- 类别：A（断言当前实现必然成立）
- 证据：
  ```ts
  const chatWindowMoreButton = document.querySelector<HTMLButtonElement>('chat-window button')!
  const clickSpy = vi.spyOn(chatWindowMoreButton, 'click')
  ...
  expect(clickSpy).not.toHaveBeenCalled()
  ```
- 判定：`loadLatestChatRows` 完全没引用 chat-window 的按钮（grep 确认 bulk-delete 仅用 `chat-window` 做 scroller 排除判断）；该断言只有“未来有人加一次 click”才可能失败，没有现存回归对应。
- 能捕获的真实回归：无（同 `resolves completed` 的有效性由同用例保证）。
- 建议：删除 spy 与断言；若确有历史 bug（曾用点击 Show more 触发加载），保留为注释/issue 说明，或以行为断言“加载完成且未新增额外请求/滚动次数”。置信度：中
- 置信度：中

#### L6. gem-avatar 注入结果的类名/文本/svg 细节断言
- 文件/行：`src/entrypoints/content/gem-avatar/index.test.ts:190-191`、`:221`、`:467-468`（用例：`gemAvatarModule > opens the Gem editor from the chat-page Gem logo avatar`、`> ... model message avatar`、`> deletes the stored edit-page avatar from the hover control`）
- 类别：C（CSS 类名/DOM 文本细节）
- 证据：
  ```ts
  expect(avatar.classList.contains('gpk-gem-avatar-logo-clickable')).toBe(true)
  ...
  expect(deleteButton.textContent).toBe('')
  expect(deleteButton.querySelector('svg')).not.toBeNull()
  ```
- 判定：clickable 类在创建时即添加（`dom.ts:142`），与“点击打开编辑器”无因果关系，且同一用例已用 `role="link"`/`aria-label`/`window.open` 断言真实行为；`textContent === ''`、`svg` 存在只是图标实现细节。删除后仅丢失“视觉/样式类回归”，不丢功能回归。
- 能捕获的真实回归：clickable 类被删导致的 cursor/focus 样式回归（弱，视觉类）；其余无。
- 建议：删除 190-191、221 的类断言（role/aria/open 已覆盖），467-468 改为断言 `aria-label`（可访问性）或保留 svg 断言并删除 `textContent` 空串断言。类名契约交给 CSS 快照/browser 验证。
- 置信度：中

#### L7. power-kit-entry 实现标记断言集合
- 文件/行：`src/entrypoints/content/power-kit-entry/index.test.ts:140-141,144,145-146,198,273`
- 用例：`power kit entry > renders an owned light-DOM entry before Settings in expanded mode`、`> renders a self-contained aligned entry above Settings in collapsed mode`、`> renders a fallback entry as the penultimate child of the footer right container`
- 类别：C（内部标记/类名/内联样式）
- 证据：
  ```ts
  expect(container?.className).toBe('')
  expect(container?.querySelector('gem-icon-button, mat-icon')).toBeNull()
  expect(powerKitButton?.hasAttribute('aria-haspopup')).toBe(false)
  expect(document.getElementById('gpk-side-nav-entry-style')?.textContent)
    .toContain('[data-gpk-mavatar-entry-button]')
  expect(powerKitButton?.style.cssText).toBe('')
  expect(powerKitButton?.querySelector('svg')?.getAttribute('data-gpk-icon-size')).toBe('18')
  ```
- 判定：这些是“自建 light-DOM、无 Gemini 组件、尺寸 18”的设计契约落在内部标记上的检查；位置/点击事件等真实行为已由相邻断言覆盖。CSS 文本 `.toContain` 与 H1/M4 同类（低剂量）。`data-gpk-icon-size` 是内部缓存标记，改实现（如 CSS 控制尺寸）即误报。
- 能捕获的真实回归：设计约束被破坏（弱），无功能回归。
- 建议：保留位置断言（`nextElementSibling`/`parentElement`）与点击后 `emitSync`；删除 `className`、`hasAttribute('aria-haspopup')`、`style.cssText`、`data-gpk-icon-size` 断言；`style.textContent` 断言保留 169（样式刷新）即可，删除 145-146。
- 置信度：中

#### L8. libraryIsland 内部诊断 reason 字符串 + 插入节点 tag 断言
- 文件/行：`src/entrypoints/content/stuff-page/libraryIsland.test.ts:68,81,83,91,95,111`
- 用例：`Library island adapter ... > uses the island adapter for the declared route Library and excludes Documents`、`> ignores unrelated declared route islands`、`> rejects multiple declared Library pages or multiple Library roots`、`> handles DOM before data, injects each media button once, and excludes Documents`
- 类别：C（内部 reason 字符串/DOM 结构）
- 证据：
  ```ts
  expect(inspectLibraryPage().reason).toBe('no-library-page')
  ...
  expect(inspectLibraryPage().reason).toBe('ambiguous-island-page')
  expect(inspectLibraryPage().reason).toBe('invalid-island-root-count')
  ...
  expect(buttons[0].parentElement?.tagName).toBe('DIV')
  ```
- 判定：`reason` 是内部诊断码，用户可见行为是“不注入按钮”（同用例已有 `toHaveLength(0)`）；`parentElement.tagName === 'DIV'` 锁定插入位置实现，重排即误报。
- 能捕获的真实回归：`kind` 判断错误影响 adapter 选择（有用，但 `page?.kind` 断言已覆盖）；reason 字符串无；parent tag 仅布局。
- 建议：删除 reason 字符串断言与 111 的 tag 断言，保留 `page?.kind`、按钮数量、`dataset.openUrl` 断言。
- 置信度：中

#### L9. Hint 挂载位置的 DOM 结构断言
- 文件/行：`src/entrypoints/content/bulk-delete/BulkDeleteEntryHint.test.tsx:58`（用例：`BulkDeleteEntryHint > introduces Bulk Delete with its value proposition on first use`）
- 类别：C（DOM 结构/类名）
- 证据：
  ```ts
  expect(hint?.parentElement).toBe(container.querySelector('.gpk-bulk-delete-entry-anchor'))
  ```
- 判定：断言 hint 挂在 anchor `span` 内，属于布局结构；若改用 portal/兄弟节点但样式等价，测试误报。同文件 59/72/85/101 对 `markFeatureHintSeen('bulk-delete-entry','1')` 的调用参数属于存储协议（有效），不在本条范围。
- 能捕获的真实回归：仅“hint 不再处于定位锚点内”导致的视觉回归（弱）。
- 建议：删除该断言，保留文案/存储/关闭断言。
- 置信度：中

#### L10. styleController 的“选择器事实”用例不执行任何生产逻辑
- 文件/行：`src/entrypoints/content/chat-settings/styleController.test.ts:76-100`（用例：`Chat layout style controller > targets the current Gemini prompt surface outside Gem previews`）
- 类别：F（不测行为）/ C（测试内复制 scope selector）
- 证据：
  ```ts
  const CHAT_SETTINGS_SCOPE = 'chat-window:not(.preview-chat-window):not(.in-gems-mode)'
  ...
  expect(document.querySelectorAll(`${CHAT_SETTINGS_SCOPE} ${INPUT_AREA_V2_SELECTOR}`)).toHaveLength(1)
  expect(document.querySelectorAll(`${CHAT_SETTINGS_SCOPE} input-container > fieldset`)).toHaveLength(0)
  ```
- 判定：用例只 import 常量 + 拼 DOM，没有调用 `applyChatSettingsStyles`；scope selector 还是测试内手抄的副本（不是生产导出的常量），所以生产 scope 改了它不会失败（`STYLE` 文本断言会失败，但那属于 H1）。第二句断言“legacy 直接子元素选择器匹配不到当前 fixture”，只是 DOM 事实说明。
- 能捕获的真实回归：无（生产 selector 漂移由 H1 文本断言或浏览器验证覆盖）。
- 建议：删除 94-99；若想保留 fixture 契约，改为从生产 import `CHAT_SETTINGS_SCOPE_SELECTOR` 并对真实注入的 `<style>` 做 `getComputedStyle` 结果断言。
- 置信度：高

#### L11. deleteProgressOverlay 的 mock 文案、DOM 顺序、transform 断言
- 文件/行：`src/entrypoints/content/bulk-delete/deleteProgressOverlay.test.ts:49-50,52,58`（用例：`delete progress overlay > separates the overall progress from the chat queue and explains Esc`）
- 类别：C（文案键/DOM 顺序/内联样式）
- 证据：
  ```ts
  expect(root.querySelector('[data-gpk-bulk-delete-progress-heading]')?.textContent).toBe('Deleting chats')
  expect(root.querySelector('[data-gpk-bulk-delete-progress-track]')?.tagName).toBe('UL')
  expect(root.querySelector('[data-gpk-bulk-delete-progress-viewport]')?.nextElementSibling).toBe(root.querySelector('[data-gpk-bulk-delete-progress-escape-hint]'))
  expect(...style.transform).toBe('scaleX(0.5)')
  ```
- 判定：`'Deleting chats'` 等来自本文件 `vi.mock('@/utils/i18n')` 的配置，断言值等于“mock 配置 + 生产用的 key”共同决定的结果（换成真实 i18n 更有意义）；兄弟顺序和 `scaleX` 是纯实现细节（进度值已有 `aria-valuenow` 断言）。
- 能捕获的真实回归：文案键用错（弱，mock 会回显 key 从而失败）；DOM 顺序/transform 无。
- 建议：保留 `role`、`aria-valuenow`、行内容断言；删除 49-52、58，或改为断言 `aria-label`/可访问性结构与进度值。
- 置信度：中

#### L12. top-bar-action 的 class 名/svg viewBox 细节
- 文件/行：`src/entrypoints/content/top-bar-action/index.test.ts:87,91`（用例：`Theme top bar action > inserts its buttons container before the last native child`）
- 类别：C（CSS 类名/图标实现细节）
- 证据：
  ```ts
  expect(entry?.className).toBe('buttons-container')
  expect(button?.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24')
  ```
- 判定：`buttons-container` 是复用 Gemini 原生样式的类名，viewBox 是图标实现。位置（`nextElementSibling`）、aria-label、tooltip、点击 `emitSync` 已覆盖真实行为。
- 能捕获的真实回归：类名丢失导致样式错位（弱视觉）；viewBox 无。
- 建议：删除 91；保留 87 或改成断言 ENTRY selector 匹配（已有）。
- 置信度：中

## 3. 文件覆盖表

| 文件 | 用例数 | 状态 | 备注（已通读） |
| --- | --- | --- | --- |
| bulk-delete/BulkDeleteEntryHint.test.tsx | 4 | 发现 1 处（低 L9） | 通读；存储协议断言（id/version）有效，n 未计入 |
| bulk-delete/deleteProgressOverlay.test.ts | 5 | 发现 2 处（中 M1、低 L11） | 通读；结果类断言（行移除/overlay 消失/进度文本）有效 |
| bulk-delete/deleteQueue.dom.test.ts | 12 | 发现 2 处（中 M3、低 L4） | 通读；10 个 DOM fixture 用例质量高 |
| bulk-delete/deleteQueue.test.ts | 3 | 发现 2 处（高 H3、低 L3） | 通读；含 1 个私有 helper 用例（有效，见 §5） |
| bulk-delete/dom.load.test.ts | 6 | 发现 2 处（中 M2、低 L5） | 通读；abort/timeout 清理用例有效 |
| bulk-delete/index.test.tsx | 21 | 发现 2 处（低 L1、L2） | 通读；大文件整体质量好，mutation/tooltip/失败 toast 用例有效 |
| bulk-delete/settings.test.ts | 4 | 干净 | 通读；fail-open 语义与幂等/退订断言有效 |
| bulk-delete/stickyActionBar.test.ts | 1 | 干净 | 通读；单用例覆盖显隐/定位/文案/点击/销毁，紧凑有效 |
| gem-avatar/index.test.ts | 13 | 发现 1 处（低 L6） | 通读；集成度高的注入/路由/仓库 mock 用例质量好 |
| gem-avatar/route.test.ts | 4 | 干净 | 通读 |
| gem-avatar/settings.test.ts | 4 | 干净 | 通读；与 bulk-delete/settings.test.ts 结构重复（见 §4） |
| stuff-page/buttonInjector.test.ts | 4 | 干净 | 通读 |
| stuff-page/libraryIsland.test.ts | 11 | 发现 1 处（低 L8） | 通读；真实 fixture 驱动，主力断言有效 |
| stuff-page/navigation.test.ts | 5 | 干净 | 通读 |
| chat-settings/styleController.test.ts | 4 | 发现 2 处（高 H1、低 L10） | 通读 |
| power-kit-entry/index.test.ts | 8 | 发现 1 处（低 L7） | 通读 |
| top-bar-action/index.test.ts | 12 | 发现 2 处（中 M4、低 L12） | 通读；observer/重建/清理用例有效 |
| top-bar-customization/index.test.ts | 9（5 it + 4 it.each） | 发现 1 处（高 H2） | 通读；竞态/默认值用例有效 |

## 4. 潜在跨文件重复清单（供 Lead 统一合并）

1. **`deleteQueue.test.ts` vs `deleteQueue.dom.test.ts`：无行为重复**。前者测 `deleteQueue.ts` 的 private helper/失败路径，后者测行/action 解析；仅重复了 fixture 风格（HTML 模板），不建议合并。
2. **`new-chat.test.ts` / `new-chat.dom.test.ts`：不在本切片清单内**，本切片未发现对应成对文件，请 Lead 交给对应 slice 交叉核对。
3. **`bulk-delete/index.test.tsx` vs `deleteQueue.dom.test.ts`**：无行为重复（index 完整 mock 了 `./deleteQueue`，只测 UI/选择状态；dom.test 测解析器）。可复用但不必合并：`renderSidenav()`（index.test.tsx:76-108）与 `conversationRow()/actionTrigger()`（deleteQueue.dom.test.ts:10-37）都在手写 Gemini sidenav 行 DOM，若要减少 fixture 漂移，可抽一个 `__fixtures__` builder（低优先）。
4. **`bulk-delete/settings.test.ts` vs `gem-avatar/settings.test.ts`**：4 个用例、`createSetting` helper 几乎逐行相同（生产 `settings.ts` 本身也近乎复制，仅 fail-open/fail-closed 不同）。若后续统一 controller，两个测试文件应合并为参数化套件；在当前产品结构下保持两份可接受。
5. **CSS 文本快照反模式跨 4 个文件**：`chat-settings/styleController.test.ts`（H1）、`top-bar-customization/index.test.ts`（H2）、`top-bar-action/index.test.ts:142-145`（M4）、`power-kit-entry/index.test.ts:145-146,169`（L7）。建议 Lead 制定一条统一规则（禁止断言 CSS 源文本，改用注入 fixture + computed style），一次性清理。
6. **`bulk-delete/index.test.tsx` 内部**：301-336 与 338-355 对 `panel.hidden` 的展开断言重复一次（L2），无跨文件影响。
7. **`stickyActionBar.test.ts:72` / `bulk-delete/index.test.tsx:413` 的“复制 header 字体”断言**：两处都把期望值算成 `getComputedStyle(source).fontFamily`，形式上是 oracle-复制，但目标是“菜单字体跟 header 一致”这一真实规格，且能捕获同步逻辑被删，故判为有效，仅记录不合并。

## 5. 看起来可疑但判定有效（防误报说明）

1. **`deleteQueue.test.ts:14-28` 通过 `__deleteQueueTestApi` 测私有 helper**：看似“测内部实现”，但它是本仓库里唯一覆盖“确认对话框优先选 cdkfocusinitial 的 Delete 而不是 Cancel”的用例；visible fallback 分支在 happy-dom 下天然不可测（`offsetParent` 恒 null），删掉等于完全放弃确认按钮选择覆盖。建议保留，最多把测试专用导出的命名/范围收窄。
2. **`top-bar-customization/index.test.ts:77-108` 的 `it.each` 4 组合**：期望值用 `settings.showThemeShortcut ? 1 : 0` 重新推导条件，看似 oracle 复制；但它是对两个独立布尔分支的最小完整矩阵，每个组合还断言了独立的 DOM 属性，属于有效分支覆盖，不建议删（若要精简可只留 2 个非显然组合，收益很小）。
3. **`deleteProgressOverlay.test.ts:87-103` “later deletions strike while earlier waits to scroll”**：断言的是 `is-striking` 类，看似 CSS 耦合；但它是唯一证明“多个 advance 可在滚动动画尚未完成时并行进入划掉阶段”的用例（队列并发协议），删掉会丢失真实时序回归覆盖。建议保留，可把两类断言拆开以便将来改状态标记实现时用行为断言替代。

---

### 附：建议 Lead 的处置顺序
1. 先删/改 3 个高（H1/H2/H3）——收益最大且不丢覆盖。
2. 再统一处理 4 个中（M1/M2/M3/M4），其中 M2、M3 是纯删除，M1、M4 需小改写。
3. 低项可按文件顺手清理，或纳入“新测试规范”避免复发；L3 的 DEV 开关建议与维护者确认是否仍需要在 CI 中保护。
