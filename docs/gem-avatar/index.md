# Character Avatar In Gem

## 1. 目标

为 Gemini Gem 增加本地头像定制能力：

- 用户头像：读取 Gemini 当前页面中的用户头像，仅用于页面展示，不持久化。
- Gem 头像：用户为每个 Gem 上传一个专属头像，并按 `gemId` 本地持久化。
- 展示位置：Gem 编辑页的 `bot-logo` 预览、Gem 列表页的 `bot-list-row` logo、Gem 聊天页的 Gem header、用户消息头像、模型消息头像。

## 2. 路由识别

Gem 页面通过 path 判断：

- 新建编辑页：`/gems/create`
- Gem 列表页：`/gems/view`
- 已有 Gem 编辑页：`/gems/edit/{gemId}`
- Gem 新对话：`/gem/{gemId}`
- Gem 对话：`/gem/{gemId}/{chatId}`

`gemId` 只从路由解析。`/gems/create` 初始没有 `gemId`，需要在用户保存后监听路由变更到 `/gems/edit/{gemId}`，再把 pending 头像写入存储。

## 3. 数据与存储

Gem 头像素材使用 IndexedDB/Dexie 持久化，不放入 `storage.sync` 或 base64 配置中。

建议表结构：

```ts
interface GemAvatarAssetRow {
  gemId: string
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  size: number
  blob: Blob
  width?: number
  height?: number
  createdAt: string
  updatedAt: string
}
```

约束：

- 每个 `gemId` 最多一个头像，主键可直接使用 `gemId`。
- 上传原始文件大小不超过 `3MB`。
- 文件大小上限必须配置化，例如 `GEM_AVATAR_FILE_SIZE_LIMIT = 3 * 1024 * 1024`，不要把 `3MB` 散落在 UI、校验和测试中。
- 仅接受 `image/png`、`image/jpeg`、`image/webp`。

## 4. 上传归一化

上传时建议先用 canvas 归一化，再把处理后的 Blob 写入 IndexedDB：

- 中心裁剪为正方形。
- 输出尺寸使用 `256x256`。
- 输出格式建议 `image/webp`，质量可配置，例如 `0.9`。
- 使用 `canvas.toBlob()`，不要使用 `toDataURL()`。
- 使用 `URL.createObjectURL(file)` 读取原图，加载完成后立即 `URL.revokeObjectURL()`。
- 只持久化归一化后的头像 Blob，不保存原图。

性能判断：

- 主要成本来自原图解码，而不是 `256x256` 或 `512x512` 的 canvas 绘制。
- canvas 归一化只发生在用户上传头像时，是一次性成本。
- 聊天页只读取已归一化的小 Blob 并创建 object URL，不再做裁剪、缩放或重新编码。
- 归一化可以降低长期 IndexedDB 存储、读取、object URL 创建和 DOM 渲染成本，适合该功能。

## 5. 编辑页注入

目标入口：

```css
bots-creation-window div.title-container > bot-logo
```

注入层级：

```html
<bot-logo>
  ...
  <gem-avatar-preview>
    <gem-avatar></gem-avatar>
    <gem-avatar-uploader></gem-avatar-uploader>
  </gem-avatar-preview>
</bot-logo>
```

行为：

- `gem-avatar-preview` 层级最高，覆盖原 `bot-logo`。
- 点击 uploader 打开本地文件选择。
- 上传成功后立即在 `bot-logo` 内预览。
- `/gems/edit/{gemId}`：上传后直接写入 `gemId` 对应头像。
- `/gems/create`：上传后先保存在 content module 的 pending 状态；保存成功并解析到 `gemId` 后写入 IndexedDB。
- pending 状态必须在写入成功、离开 Gem 编辑页、content script invalidated 时清理。
- 新建/编辑页内如果存在聊天预览 `infinite-scroller`，同样注入用户/模型头像，但使用小尺寸样式：`32x32`，左右额外偏移量为 `0px`。
- 新建/编辑页内如果预览聊天区 `infinite-scroller` 下存在任意 `bot-logo`，同样覆盖 Gem 头像。

## 6. Gem 列表页注入

当 path 为 `/gems/view` 时，监听 `div.bots-section-container` 下的 `bot-list-row`。

Gem ID 来源：

```css
bot-list-row a.bot-row[href^="/gem/"]
```

从 `href="/gem/{gemId}"` 解析 `gemId`。如果本地存储中存在该 `gemId` 的头像，则覆盖同一行内的：

```css
bot-list-row bot-logo
```

列表页会为当前页面中命中的 Gem 头像创建页面级 object URL 缓存；离开列表页或模块停止时必须统一 revoke。

## 7. 聊天页注入

当 path 为 `/gem/{gemId}` 或 `/gem/{gemId}/{chatId}`，并且存储中存在该 `gemId` 的头像时，启用头像展示。

Gem 头像：

- 从 IndexedDB 按 `gemId` 读取 Blob。
- 转换为 object URL 后注入到 `bot-logo` 和模型消息头像位置。
- 页面切换 Gem 或模块停止时 revoke object URL。

用户头像：

```css
sidenav-mavatar-footer > div.mavatar-footer-row > a > div.mavatar-container > img.mavatar-image
```

读取当前页面 `img.mavatar-image` 的 `currentSrc || src`，只用于当前页面渲染，不持久化。

消息注入位置参考 `.original/characters/demo.html`：

- 用户消息：`user-query-content > div.user-query-container`
- 模型消息：`response-container > div.response-container`

样式应使用 class + CSS 文件，避免大量 inline style。

## 8. 生命周期与性能边界

- 使用 `urlMonitor` 的 `urlchange` 事件重新解析页面状态。
- 使用 `MutationObserver` 处理 Gemini DOM 重建和新增消息。
- 聊天消息区优先监听 `#chat-history infinite-scroller`，列表页优先监听 `div.bots-section-container`，新建/编辑页预览聊天区监听 `bots-creation-window infinite-scroller`。
- 使用已注入标记避免重复插入头像节点。
- 任意页面中，只要 Gem 头像注入到 `recent-chat-list-item bot-logo` 下，头像圆角都使用 `calc(var(--bot-logo-size, 32px) / 3)`，不限定于编辑页。
- 不在 background 中保存头像路由状态。
- 不保留无界 `Map`/`Set`。如需缓存 object URL，必须按当前 `gemId` 绑定，并在切换或 stop 时清理。
- DOM 选择器集中管理，便于 Gemini 页面改版时修复。

## 9. MVP 范围

第一阶段实现：

- Gem 编辑页上传、校验、归一化、预览。
- `/gems/create` 保存后绑定新生成的 `gemId`。
- `/gems/edit/{gemId}` 直接替换该 Gem 头像。
- `/gems/view` 列表页展示已配置的 Gem 头像。
- Gem 聊天页展示 Gem header 头像、用户消息头像、模型消息头像。
- IndexedDB 持久化和 object URL 清理。

暂不纳入第一阶段：

- 删除头像入口。
- 裁剪 UI。
- 多设备同步。
- 批量导入导出。
