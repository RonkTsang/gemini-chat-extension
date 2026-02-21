# Background Image 技术思路（简版）

## 1. 设计目标
- 与现有主题链路对齐：复用 `src/entrypoints/content/gemini-theme` 的初始化与样式注入模式。
- 配置与素材分离：小配置走轻量存储，大图片走 IndexedDB。
- 样式幂等、可增量更新：避免重复注入、避免每次重建整段 CSS。
- 结构可扩展：后续可平滑增加遮罩、亮度、对比度、多图等能力。

## 2. 数据结构设计

### 2.1 配置对象（轻量）
```ts
type BackgroundImageRef =
  | { kind: 'none' }
  | { kind: 'asset'; assetId: string }
  | { kind: 'external-url'; url: string } // 预留，默认不作为主路径

interface ThemeBackgroundSettings {
  version: 1
  backgroundImageEnabled: boolean
  backgroundBlurPx: number // clamp: 0-20
  messageGlassEnabled: boolean
  imageRef: BackgroundImageRef
  updatedAt: string
}
```

说明：
- PRD 的 `backgroundImageUrl` 在实现层不直接作为唯一真值，改为 `imageRef`（避免把大数据或不稳定外链直接放配置）。
- 运行态可有 `resolvedBackgroundUrl`（objectURL），但不持久化。

### 2.2 图片素材对象（重数据）
```ts
interface ThemeAssetRow {
  id: string
  feature: 'background-image'
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  size: number
  blob: Blob
  hash?: string
  width?: number
  height?: number
  createdAt: string
  updatedAt: string
}
```

## 3. 数据持久化设计（重点）

### 3.1 `backgroundUrl` 方案取舍
- 直接存外链 URL：高风险。会遇到 CSP/CORS、热链防盗、链接过期、跨域策略限制，稳定性差。
- base64/Data URL：可行但不优。体积膨胀明显，`storage.sync/local` 的读写和配额压力大。
- **推荐：IndexedDB Blob（主方案）**：图片二进制本地存储，不依赖外网；配置只保存 `assetId`。

结论：**配置与二进制分层存储**。

### 3.2 落地存储分层
- `storage.local`：`ThemeBackgroundSettings`（小对象）。
- Dexie (`IndexedDB`)：`theme_assets` 表存 `ThemeAssetRow.blob`。
- 不建议放 `storage.sync`：背景图无服务端同步能力，跨设备同步配置会导致“有开关没图片”。

### 3.3 上传/删除流程
1. 上传时校验类型和 5MB 限制。
2. 写入 `theme_assets`（必要时可先压缩为 webp）。
3. 更新设置：
   - `imageRef = { kind: 'asset', assetId }`
   - `backgroundImageEnabled = true`
4. 删除时：
   - `imageRef = { kind: 'none' }`
   - `backgroundImageEnabled = false`
   - 异步清理旧 asset（或延迟 GC）。

## 4. 样式更新逻辑（结合现有链路）

### 4.1 与现有链路对齐
- 当前已有：
  - `initTheme()`：页面加载应用主题
  - `applyTheme()`：设置面板即时应用
  - `inject.ts`：style 标签幂等注入
- 新能力建议同构：
  - `initThemeBackground()`
  - `applyThemeBackground(settings)`
  - `clearThemeBackground()`

### 4.2 样式更新策略
- 背景图、消息毛玻璃使用**独立 style block**（与预设主题解耦）。
- 采用“静态 CSS + CSS 变量”：
  - 只注入一次结构样式；
  - 更新时仅改变量和 `data-*` 状态，避免频繁重写整段 CSS。

建议变量/状态：
- `--gpk-bg-image: url(...) | none`
- `--gpk-bg-blur: 0px~20px`
- `data-gpk-bg-enabled="true|false"`
- `data-gpk-msg-glass="true|false"`

### 4.3 关键执行点
1. `content/index.tsx` 启动时：读取设置 + 解析 `assetId -> objectURL` + 应用样式。
2. 设置面板变更时：即时调用 `applyThemeBackground`，同时持久化。
3. 背景图生效时才隐藏默认渐变层；关闭时恢复。
4. 每次替换图片时 `URL.revokeObjectURL`，避免内存泄漏。

## 5. 结构设计（利于迭代）

建议拆分：
- `theme/background/types.ts`：类型与边界。
- `theme/background/storage.ts`：配置读写（local）。
- `theme/background/assetRepository.ts`：Dexie 图片素材 CRUD。
- `theme/background/styleController.ts`：style 注入、变量更新、清理。
- `theme/background/service.ts`：对外 `init/apply/clear/upload/remove`。

这样后续新增能力（遮罩强度、亮度、对比度、背景多图轮播）只需扩展 settings + styleController，不影响主题色主链路。

## 6. 最小可行迭代（MVP）
- 第一阶段：本地上传 + Blob 存储 + 页面背景 + blur + 消息毛玻璃开关。
- 第二阶段：图片压缩、旧素材回收策略、异常上报与性能埋点。
