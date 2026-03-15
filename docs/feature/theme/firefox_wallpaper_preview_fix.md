# Firefox 壁纸预览跨主体问题：技术改造记录

## 背景
- 扩展提供自定义壁纸功能，上传后在页面背景和设置面板中预览。
- Chrome 上可用，但 Firefox 出现 `Security Error: Content at moz-extension://... may not load data from blob:https://gemini.google.com/...`。
- 刷新后页面背景生效，但设置面板预览仍报错。

## 核心问题
`blob:` URL 绑定创建它的安全主体（origin/principal）。  
当前流程里，面板预览和页面背景共享同一个 `blob:https://gemini.google.com/...`。  
在 Firefox 中：
- 页面背景由页面主体加载（`https://gemini.google.com`）是允许的。
- 设置面板运行在扩展主体（`moz-extension://...`），加载 `blob:https://...` 会被拦截。

这不是权限问题，不能靠 `manifest` 权限修复，是浏览器安全模型限制。

## 关键代码位置
- 壁纸 Blob/URL 生成逻辑：  
  `src/entrypoints/content/gemini-theme/background/service.ts`
- 壁纸样式应用到页面：  
  `src/entrypoints/content/gemini-theme/background/styleController.ts`
- 设置面板预览与上传入口：  
  `src/components/setting-panel/views/theme/index.tsx`  
  `src/components/setting-panel/views/theme/CustomBackground.tsx`

## 现有数据流（问题流）
1. 上传 `File`（页面主体 File）  
2. `URL.createObjectURL(file)` → `blob:https://...`  
3. 保存到 IndexedDB  
4. `resolveBackgroundUrlFromSettings` 再次 `createObjectURL(asset.blob)`  
5. 页面背景与面板预览共用同一 `blob:https://...`  
6. 面板在 `moz-extension://` 主体加载该 URL → 报错

## 改造方案（仅 Firefox，构建时分支）

### 思路
- 页面背景继续使用 `blob:https://...`（页面主体加载，合法）。
- 面板预览使用 `blob:moz-extension://...`（扩展主体加载，合法）。
- 通过 WXT 构建时分支，Firefox 使用新逻辑，Chrome 保持现状。

### 数据流（Firefox）
1. 上传 `File` → 仍保存到 IndexedDB（保持现有逻辑）
2. 页面背景：  
   `resolveBackgroundUrlFromSettings` → `URL.createObjectURL(asset.blob)`  
   生成 `blob:https://...`  
3. 面板预览：  
   `resolveThemeBackgroundPreviewUrlForPanel`  
   - `asset.blob.arrayBuffer()`  
   - `new Blob([buffer], { type })`  
   - `URL.createObjectURL(newBlob)` → `blob:moz-extension://...`  
4. 预览只在面板使用，页面背景不受影响

### 做法
- 新增 `resolveThemeBackgroundPreviewUrlForPanel`（Firefox 专用）  
  只在设置面板中使用。
- 保留 `resolveThemeBackgroundPreviewUrl` 给 Chrome 使用。
- 引入独立缓存与 `revokeObjectURL`，避免重复拷贝与泄漏。

### 分平台构建（WXT）
- 使用 WXT 内置环境变量：
  - `import.meta.env.FIREFOX`  
  - `import.meta.env.BROWSER`
- 运行时代码在 Firefox 仅走预览专用逻辑，Chrome 保持原逻辑。

## 核心代码改造点（计划）
1. `src/entrypoints/content/gemini-theme/background/service.ts`  
   - 增加 Firefox 专用预览 URL 生成方法（克隆 Blob → `blob:moz-extension://...`）  
   - 增加缓存与 `revokeObjectURL`
2. `src/components/setting-panel/views/theme/index.tsx`  
   - Firefox 构建产物调用 `resolveThemeBackgroundPreviewUrlForPanel`
3. 运行时代码使用 `import.meta.env.FIREFOX` 分支  
   - Chrome 产物不会走 Firefox 逻辑

## 验证方案
### 功能验证
- Firefox：  
  1) 上传图片后，页面背景立即生效  
  2) 设置面板预览正常显示  
  3) 无 `moz-extension:// ... blob:https://...` 报错
- Chrome：  
  1) 上传、预览、背景无回归  

### 产物互斥
- Chrome 产物不包含 Firefox 逻辑  
- Firefox 产物包含面板专用预览方法

### 日志验证（可选）
- 在 Firefox 产物中输出：
  - 页面背景 URL origin = `https://gemini.google.com`
  - 面板预览 URL origin = `moz-extension://...`
