# Folders

背景：
1. Gemini 的对话管理中缺失了 Folders/Projects 功能，对于有对话管理的用户来说难以按类别整理
2. 用户反馈希望增加 Folders 功能
3. 作为刚需功能，故GPK需要具备

## 核心产品逻辑

Folders 功能包含三个主要场景： SideNav（主场景）、编辑页、设置页

用户可以在 SideNav 中的 Folder 面板中增删改文件夹，并管理各自文件夹中的 Chat

如何增加 Chat 至对应的 Folder？ 支持两个交互：
1. 拖拽 Gemini Chat 列表项节点至对应对应的 Folder 节点
2. Gemini Chat 二级菜单栏增加新的入口 “Add to folder  >”，hover 后在二级菜单组件右侧继续展开二级菜单，菜单内容为已有 Folder 列表

一个 Chat 可以加入多个 Folder；加入 Folder 不会移动、删除或修改 Gemini 原生 Chat。用户可从任意 Folder 将 Chat 移出，只有移出最后一个 Folder 后，该 Chat 才成为未归类 Chat。

### Gemini 原生菜单入口（P0）

除拖拽外，Gemini Chat 的“更多”菜单是 P0 的主要入口，适用于长列表中不适合长距离拖拽的归类操作。

1. 在当前打开的 Gemini Chat 更多菜单**末尾**追加 GPK 的 `[Folder Icon] Add to Folder` 菜单项；该菜单项前展示分隔线，与 Gemini 原生操作区隔开。
2. 点击 `Add to Folder` 后，在按钮右侧打开 GPK Folder 选择层。选择层包含 `New Folder`、分隔线和全部 Folder 列表；已加入当前 Chat 的 Folder 显示已选中标记且不可再次选择，尚未加入的 Folder 可点击加入。
3. 选择层宽度为 `200px`，最大高度为 `600px`；超过可用高度时，Folder 列表区域支持垂直滚动。右侧空间不足时，选择层展示在按钮左侧。
4. 用户点击一个 Folder 后立即完成加入并关闭选择层。点击 `New Folder` 后，创建成功的 Folder 自动加入当前 Chat。
5. 原生菜单关闭、当前 Chat 不再可确认、Folders 不可用或用户点击选择层外部时，选择层立即关闭；不得残留在页面中。
6. 当所有 Folder 均已加入当前 Chat 时，选择层仍展示这些已选中项，帮助用户确认归属；不得展示空白列表。

### P0 层级边界

当前 UI 只创建和展示根 Folder，不提供创建或管理子 Folder 的入口。底层数据协议和 Repository 使用 `ROOT_FOLDER_ID` 标识根节点，并支持校验、保存和移动层级 Folder，以保证数据兼容和恢复能力；这不代表 P0 向用户开放了子 Folder。

### Chat 组织与 Recents 展示

Folders 默认采用 **索引模式**：已加入 Folder 的 Chat 仍保留在 Gemini 原生 Recents 列表中。Folder 是额外的组织入口，而非 Gemini Chat 的归档或删除操作。

设置页面提供显式选项：**“隐藏已加入 Folder 的聊天”**，默认关闭。开启后：

1. 只要 Chat 仍属于至少一个 Folder，即在 Gemini 原生 Recents 列表中隐藏；从最后一个 Folder 移出后，立即恢复展示。
2. 当前正在浏览的 Chat 和用户在 Gemini 中置顶的 Chat 始终保留在原生列表，避免失去当前导航锚点或违背用户已有的置顶意图。
3. 隐藏仅改变当前页面的视觉展示：对已解析的 Gemini Chat Item 添加 GPK 自有标记并应用 `display: none` 样式，不删除、移除或修改 Gemini 原生 DOM 数据及对话内容。
4. 关闭该选项、关闭 Folders、删除 Folder、改变 Chat 归属关系后，应立即重新计算并恢复所有不再符合隐藏条件的 Chat Item。
5. **失效保护：** 若 Folder 功能发生运行时异常、当前用户身份不可识别或不唯一、必要 DOM 选择器/插入点失配，或 Folders 被卸载，必须立即撤销已添加的隐藏样式并恢复 Gemini 原生 Recents 列表。不得等待页面刷新，也不得因 Folders 失效使用户无法在原生列表找到 Chat。

此选项的文案必须说明“仅隐藏，不删除 Gemini 聊天”，并允许用户随时关闭以恢复原生列表。

### Folder 与 Chat 的删除、移出逻辑

Folder 和 Chat 的操作必须区分“删除 GPK 索引数据”与“删除 Gemini 真实对话”，并使用独立的二次确认弹窗。

#### 删除 Folder

1. Folder 菜单中的 `Delete folder` 仅删除当前 Folder 及其成员关系，不调用 Gemini 删除 Chat。
2. 点击后显示二次确认弹窗；弹窗需明确说明“将删除此 Folder，但不会删除 Gemini 聊天”，并展示受影响的去重后 Chat 数量。
3. 确认后，Chat 失去该 Folder 的索引关系。若 Chat 仍在其他 Folder，保留其他归属；若不再属于任何 Folder，则成为未归类 Chat，并按“隐藏已加入 Folder 的聊天”选项重新决定是否在 Recents 展示。

#### Folder 内 Chat 菜单

Folder 内 Chat 菜单顺序为 `Rename` → `Pin / Unpin` → 分隔线 → `Remove from folder` → `Delete chat`。以下两个移出、删除操作保持独立：

1. `Remove from folder`
   - 仅移除该 Chat 与**当前 Folder**的索引关系，不删除 Gemini 真实 Chat，也不影响它在其他 Folder 中的归属。
   - 点击后显示二次确认弹窗，明确当前 Folder 名称和“仅移出，不删除 Gemini 聊天”。
   - 确认后立即重新计算该 Chat 在 Recents 的展示状态。
2. `Delete chat`
   - 删除 Gemini 的真实 Chat。点击后显示二次确认弹窗，明确该操作不可恢复，并说明该 Chat 会同时从所有 GPK Folder 中移除。
   - 用户确认后先保存当前 Folder 组织的保护恢复点，再调用 Gemini 的删除接口执行删除；只有收到 Gemini 删除成功的结果后，才删除该 Chat 在 GPK 中的全部 Folder 索引和缓存标题。保护点失败时不得调用 Gemini 删除。
   - Gemini 删除失败、当前页面无法确认目标 Chat，或删除接口不可用时，必须保留全部 GPK 索引并提示失败；不得以本地删除替代 Gemini 删除。

#### Folder 内 Chat 置顶

1. 未置顶 Chat 的菜单显示 `Pin` 与 `<LuPin />`；已置顶时显示 `Unpin` 与 `<LuPinOff />`，位于 Rename 下方。
2. 置顶仅作用于当前 Folder 内的 Chat 归属，不影响其他 Folder 或 Gemini 原生置顶。点击后关闭菜单，置顶 Chat 排在普通 Chat 前，后置顶的排在最前。
3. 已置顶 Chat 在原三点菜单位置常驻 `<LuPin />`；整行 hover、键盘焦点位于行内或菜单打开时，原位切换为三点菜单。图标共用 24px 按钮，Pin 图形为 13×13px，三点图形为 16×16px，切换不挤动标题。
4. 取消置顶后恢复普通列表中的原有相对顺序；新加入 Chat 默认未置顶，排在普通列表最前、所有置顶 Chat 之后。移出再加入时不保留旧置顶状态。
5. 置顶、普通 Chat 各自在组内拖拽排序，不允许通过跨组拖拽隐式改变置顶状态。置顶组排序不改写普通排序。
6. 置顶数据参与账号隔离、Browser Sync、导入导出及恢复点；旧数据缺少置顶字段时按未置顶处理。后台排序后再分页，首屏和后续页使用同一顺序。

### 独立模块：用户身份获取

Folders 的数据归属当前登录 **Gemini 页面** 的用户身份，而不是 Chrome Profile 或浏览器内其他 Google 身份。该模块向 Folders 及后续需要用户上下文的功能提供当前用户的邮箱、头像及身份状态。

产品逻辑：

1. 每个 Gemini 用户拥有独立的 Folder、Chat 归属关系和设置；同一浏览器 Profile 切换 Gemini 用户后，不能看到、搜索到或操作另一用户的数据。
2. 页面首次自动识别当前用户成功后，加载该用户的数据，并为首次出现的账号默认启用 Folders；用户手动关闭开关后保持其个人设置。用户在页面内切换账号、页面重载或重新获得焦点后，需要重新确认身份并切换到对应数据。
3. 身份暂时不可识别、未登录或识别结果不唯一时，Folders 先进入不可用状态：不展示任何已缓存的 Folder 数据，也不允许新建、移动、导入或导出；已保存的数据不得被删除或覆盖。SideNav 显示原因与“手动输入邮箱”入口。
4. 手动邮箱是用户确认的账号选择入口，不是 Gemini 登录身份验证。用户输入有效邮箱并确认后，可按同一邮箱对应的数据范围使用 Folders；设置页可选择或忘记已保存的账号。最近使用的规范化邮箱及账号范围保存在本机账号历史，页面重载时可恢复最近选择；自动识别结果一旦出现，优先切换至页面识别的账号。
5. 手动选择与自动识别相同邮箱时使用同一份 Folders 数据和 Browser Sync。已开启的“隐藏已加入 Folder 的聊天”也按当前选择范围生效；手动选择不证明 Gemini 当前登录身份，用户需确认选择正确账号。Google Drive 尚未实现，未来加入时须另行验证 Drive 身份。
6. 邮箱用于建立账号范围、保存本机账号历史和在设置中显示身份；头像仅用于页面身份展示。Folder 业务行、Browser Sync payload 和导出文件不包含原始邮箱。
7. 关闭 Folders 仅隐藏功能，不删除该用户数据。不同用户在同一浏览器 Profile 下各自保留独立数据。
8. Google Drive 同步属于后续规划，当前实现不请求 OAuth 权限、不读写 Drive。若未来加入，必须确认云端授权身份与当前**自动识别**的 Gemini 用户身份一致；不一致时不得读取、写入或合并对方数据。

### 数据、备份与同步（P0）

Folders 是用户的组织资产。数据仅保存 Folder、Chat 归属关系、必要的标题缓存和本功能设置；不保存 Gemini 聊天正文，也不改变 Gemini 原生聊天。

1. **默认同步：** P0 默认使用 `browser.storage.sync` 在同一浏览器账号的已同步设备间同步 Folder 数据和设置。每个 Gemini 用户的数据仍按其身份范围隔离。Browser Sync 由浏览器自动管理，GPK 可确认本机 Browser Storage 接受写入，但不能确认云端同步完成、同步进度或其他设备到达时间；Settings 不得呈现这些云端状态。Browser Storage 写入失败时，界面只能说明本机保存状态和待处理情况。
2. **容量保护：** 同步数据压缩后按编号分 Chunk 保存。Folder 同步数据有 **70 KiB** 预算；占该预算 **80%** 时，提示空间接近上限并允许稍后关闭提示，同时写入仍须遵守浏览器实际配额和单项限制。备份导出入口独立提供，当前没有 Drive 连接入口。Browser Storage 配额或频率限制导致写入失败时，本地业务事务保持有效，界面说明更改已保存在本机，并提供重试入口；不得声称已同步到其他设备。
3. **Google Drive 同步：** 尚未实现，不属于当前 P0 可用能力。未来如增加 Drive，须另立实施与发布验收；身份校验、权威切换和状态展示以届时批准的协议为准。
4. **同步状态：** 当前状态只反映本地保存、待 Browser Storage 接受、Browser Storage 本地写入结果及可测量的本机容量。Browser Sync 云端传播和其他设备到达时间由浏览器控制，GPK 不展示无法验证的云端成功时间或同步进度。
5. **本地自动备份与历史版本：** 每次完成结构性变更后，在本机保留可恢复的历史快照；导入、恢复和批量删除前必须额外创建当前状态的保护快照。Settings 提供“历史版本”入口，按创建时间和创建原因（如自动保存、删除 Folder 前、导入前）展示恢复点。P0 只支持按当前 Gemini 用户恢复完整的 Folder 组织状态，不支持单个 Folder、单条 Chat 归属或手动命名版本的恢复。恢复前展示 Folder、Chat 归属和排序的影响摘要并要求确认；确认前再创建一个保护快照，恢复完成后作为新的同步变更发布。恢复不删除或改变 Gemini 聊天，也不回滚当前的 Folders 开关、隐藏聊天选项和展开/收起等界面偏好。每个账号最多保留 10 个恢复点，不设时间过期；整个扩展的所有账号共用 20 MiB 的恢复点容量预算。普通结构变更首次立即保存，相邻操作间隔不超过 60 秒时更新当前自动恢复点，每组最长 5 分钟。手动创建以及删除、导入、恢复前的保护点结束自动合并组；组织内容相同则复用快照并保留创建原因。数量限制优先保留最近 3 个手动或保护点，其余名额按最新保存时间填充；容量不足时先清理最旧普通点，再清理最旧重要点。正在执行操作的保护点及恢复目标不得被淘汰。保护点无法写入时阻止对应操作；普通自动快照失败不撤销已保存的组织修改，并显示恢复点未更新提示。恢复点不占用浏览器同步配额。
   本地容量检测在扩展后台通过 `navigator.storage.estimate()` 执行，估算结果仅供诊断，不等于磁盘真实剩余空间，也不单独判定写入失败。先回收可淘汰历史，实际写入仍须处理容量错误。`unlimitedStorage` 已在 Chrome 和 Firefox manifest 中声明为必需权限；它不扩大恢复点自身预算或 Browser Sync 容量。失败的破坏性操作由用户手动重试，不自动重放。

6. **手动备份：** 用户可导出当前 Gemini 用户的 Folder 数据为带版本信息的 JSON 文件，并可导入同一身份范围的有效备份。导入或恢复覆盖当前数据前必须明确确认，且不得影响 Gemini 原生聊天。
7. **一致性与离线：** 本地 IndexedDB 是离线工作缓存；离线产生的变更在恢复连接后同步。两个设备同时变更时，系统静默合并可独立合并的 Folder 与归属关系；无法自动合并的排序等状态采用确定性版本规则，不能要求用户在“本地或云端版本”之间盲选。仅当数据不可验证、无法安全恢复或同步数据损坏时，展示需要用户处理的错误。


### SideNav 主场景 —— Folders
在 SideNav 中增加 **Folders 主面板**（由我们插入）
用户可以像文件系统一样增删改 Folder 和 Chat

SideNav中的 Folder 主面板包括有以下结构：
1. Header：Folders 功能标题栏
2. Folders List：用户Folder列表以及展示更多按钮，默认展示前五个 folder

结构示意：
```
[Folders Header]
[
  [Folder-1]
    [chat-1]
    [chat-2]
  [Folder-2]
  [Folder-3]
  [Folder-4]
  [Folder-5]
  [See more]
]
```

默认仅展示前五个 Folder。点击 `See more` 后在当前 SideNav 内展开全部 Folder，不跳转到独立页面；展开后该入口变为 `Show less`，再次点击恢复前五个 Folder。此操作不改变 Folder 的保存顺序、展开状态或任何数据。

UI 插入位置：sidenav 中找到最后一个 <expandable-section> (通常是 “Recents” Chat 列表节点），将面板根节点的 DOM 插在此之前。


#### 主标题栏 Folders Header
```
[[Foloder][>/^] [fill space] [Plus icon(new folder...)][setting icon]]
```

标题栏分为左右两个区域，左侧为“Folders”标题与展示/收起icon，右侧为Action区域，本期为新增Folder按钮与设置入口，Action区域按钮均需要 Tooltips。
交互上：
- hover：除了标题，其他按钮均为 Hover Header 区域才展示
- click：
  - 点击标题区域，展示或收起 Folder list
  - 点击 new folder，弹出“编辑页Modal弹窗”
  - 点击 setting，进入到 Setting Panel 并定位到 Folder tab

标题样式：
``` css
color: var(--lumi-sys-color--on-surface-variant, rgba(255,255,255,0.55));
font-family: Google Sans Flex, Google Sans, Helvetica Neue, sans-serif;
font-size: var(--gem-sys-typography-type-scale--body-s-font-size, 0.8125rem);
font-weight: var(--gem-sys-typography-type-scale--body-s-font-weight, 400);
letter-spacing: var(--gem-sys-typography-type-scale--body-s-font-tracking);
```

2. Folder 与 Chat
```
[[Folder Icon] [Folder Title]  [Menu Icon(二级菜单入口)]]
  [[chat title] [Menu Icon(二级菜单入口)]]
  [[chat title] [Menu Icon(二级菜单入口)]]
  ...
  [[view more]]
```

业务与交互逻辑：
- 对于 Folder
  - Folder 栏同样支持点击收起/展开 Chat 列表
  - Folder hover 时展示 Menu Icon，二级菜单包含选项：edit、delete folder
  - 新建 Folder 默认置顶；Folder 支持拖拽调节顺序
- 对于 Chat，类似的：
  - 点击 Chat 跳转到对应页面（切换本地路由）
  - 未置顶 Chat hover 时展示 Menu Icon；已置顶 Chat 默认显示 Pin Icon，hover、行内焦点或菜单打开时原位显示 Menu Icon。菜单依次包含 rename、pin/unpin、remove from folder、delete chat。
  - 新加入当前 Folder 的 Chat 默认排在普通列表最前、所有置顶 Chat 之后；置顶与普通 Chat 各自在当前 Folder 的组内拖拽调节顺序。一个 Chat 在不同 Folder 中的排序与置顶彼此独立。

样式：
``` css
color: var(--mat-list-list-item-label-text-color, var(--mat-sys-on-surface));
font-family: Google Sans Flex, Google Sans, Helvetica Neue, sans-serif;
font-size: var(--gem-sys-typography-type-scale--body-s-font-size);
font-weight: var(--gem-sys-typography-type-scale--body-s-font-weight);
letter-spacing: var(--gem-sys-typography-type-scale--body-s-font-tracking);
```

### 2. 新建/编辑 Folder 弹窗

界面简述：编辑弹窗包含名称输入框、左侧图标与颜色预览按钮、说明文案和取消/保存操作；点击预览按钮打开图标与颜色选择器。

Folder 是 Gemini Chat 的本地组织索引，不是项目空间。弹窗不得出现“项目记忆”、文件、共享上下文或持续工作等能力与文案，也不得暗示会移动、删除或改变 Gemini Chat。

#### 弹窗结构

```text
[New folder / Edit folder]                              [Close]

Folder name
[Icon and color button] [Folder name input                         ]

Folders only organize existing Gemini chats. They do not move or delete chats.

                                              [Cancel] [Create folder / Save]
```

说明文案可依据页面语言本地化，但必须表达“仅组织已有 Gemini Chat，不移动或删除 Chat”的边界。

#### 创建与编辑状态

| 场景 | 标题 | 主按钮 | 成功后的行为 |
| --- | --- | --- | --- |
| 从 Folders Header 创建 | `New folder` | `Create folder` | 创建空 Folder，并在 SideNav 列表中展示。 |
| 从 `Add to Folder → New Folder` 创建 | `New folder` | `Create folder` | 创建 Folder 后，自动将触发该流程的 Chat 加入新 Folder；随后关闭编辑弹窗和 Folder 选择层。 |
| 编辑已有 Folder | `Edit folder` | `Save` | 仅更新名称、图标和颜色；成员关系、Folder 排序和展开/收起状态保持不变。 |

删除 Folder 不放在本弹窗内，继续从 Folder 的更多菜单进入独立的 `Delete folder` 二次确认流程。

#### 名称输入

1. Name 是必填项。保存时先去除首尾空白；结果为空时不允许提交。
2. 名称上限为 60 个字符。允许中文、英文、emoji 和常规标点；SideNav 中超长名称省略展示，完整名称通过 tooltip 和编辑框可见。
3. 在同一 Gemini 用户范围内，规范化后完全相同的 Folder 名称不允许重复。输入时即时提示 `Folder name already exists`，且保留用户已输入内容。
4. 创建时自动聚焦名称输入框；编辑时自动选中现有名称，方便直接替换。
5. 名称有效前主按钮保持禁用。保存请求进行中，关闭按钮、取消按钮和主按钮均避免重复提交；失败后保留输入值和图标选择，并在输入框附近显示可恢复的错误说明。

#### 图标与颜色选择

图标与颜色通过名称输入框左侧的预览按钮打开选择器。默认值为中性的 Folder 图标和默认颜色。

1. P0 提供 `6 × 5` 图标网格，共 30 个图标：Folder、Finance、Book、Education、Writing、Design、Code、Terminal、Music、Entertainment、Exploration、Art、Health、Wellbeing、Nature、Work、Analytics、Achievement、Fitness、Notes、Legal、World、Travel、Global、Tools、Pets、Science、Ideas、Favorites、Gardening。内部使用稳定语义 key，不把数据与具体图标库组件名绑定。
2. P0 提供 8 个颜色预设：`neutral #000000`、`red #E75248`、`orange #DF8248`、`yellow #EEC75C`、`green #6DB364`、`blue #4E82EF`、`purple #8255E6`、`pink #E17EAD`。`neutral` 是语义默认色：浅色主题显示参考图黑色，深色主题切换为当前页面的浅色前景色。
3. P0 同时支持自定义颜色。点击 `Custom color` 后在当前选择器内展开色域、色相、Hex 输入和浏览器支持时的吸色器；只接受不透明六位 Hex，不提供透明度。自定义颜色跨主题保持用户选择的字面值；与当前主题对比不足时提示但不阻止保存。
4. 打开选择器时，记录当前的图标和颜色作为选择器初始值；点击颜色或图标仅更新选择器内部草稿。
5. 点击 `Done` 后，将选择结果写入弹窗草稿并关闭选择器。点击选择器外部或按 `Escape` 时，放弃本次打开选择器后的变更，恢复到初始值。
6. 图标按钮、每个颜色预设和每个图标必须有本地化的无障碍名称；颜色与图标使用独立选中态，键盘可进入网格并选中，关闭后焦点返回触发按钮。`Escape` 的优先级为先关闭选择器、再关闭编辑弹窗。

Folder 持久化时分别记录 `iconKey` 和 `colorValue`。`colorValue` 为预设颜色 key 或规范化后的小写 `#rrggbb`；图标和颜色分别维护字段版本，使不同设备上互不冲突的外观修改可以合并。

#### 关闭、取消与保存

1. 通过 Close、Cancel、点击弹窗外部或 `Escape` 关闭时：没有改动则直接关闭；有未保存改动则显示 `Discard changes?` 二次确认。
2. 主按钮仅在名称和弹窗草稿有效时可用。点击后创建或保存；成功时关闭弹窗并即时刷新 SideNav 与设置页数据。
3. 从 `Add to Folder` 流程创建时，如果创建或自动加入 Chat 失败，保留完整弹窗草稿和原 Folder 选择层上下文，提示用户重试；不得创建一个成功但未告知用户的空 Folder。
4. 用户身份不可识别、Folders 被关闭或功能处于失效保护状态时，不允许打开或提交弹窗，并解释当前不可用原因。

所有用户可见文字均通过 i18n 提供；同一状态在 SideNav 和设置页打开时使用一致的标题、按钮与错误文案。


### 3. Folders 功能设置页面

入口：Setting Panel 下新建 tab “Folders”
设置项：
- 开关
- 隐藏已加入 Folder 的聊天（默认关闭；仅隐藏 Gemini 原生 Recents 列表，不删除 Chat）
- 已有配置导入与导出
- 历史版本（查看并恢复本机自动备份的恢复点）
- 同步与存储：展示 Browser Sync 本机写入/待处理状态、容量说明与重试入口；Google Drive 暂未实现，不展示 Drive 授权、同步状态或最后成功时间

