# Open Stuff Item In New Tab

| **Document Version** | **V1.0** |
| :--- | :--- |
| **Feature Name** | - |
| **Created Date** | January 24, 2026 |
| **Status** | unimplemented |

## 1. Background

`https://gemini.google.com/mystuff` 页面是展示用户历史生成的资源（文档、图片）的页面。
用户可以在此页面中看到 Grid 布局的资源列表，当用户点击其中的 item 时，可以跳转到对应的聊天历史页面（/app/cid#rid）。

用户痛点：心流被打断
1. 点击item后只能在当前页面进行跳转（页面前端实现如此），在完成跳转后使用浏览器“后退”功能回到 stuff 页面后，无法自动回到原点击item的位置。
2. 不支持通过新标签打开

## 2. Goal
实现高质量的“新标签打开”插件功能，让用户工作心流自然流畅。

## 3. Solution

为 Stuff Item 支持“新标签打开”功能，为用户提供多一种跳转方式。

### 3.1 新增 XHR 拦截工具单例

src/utils 中新增 XHR 拦截工具单例，支持传入请求 URL 进行匹配监听

### 3.2 拦截 stuff 页面的 XHR 页面请求，获取 Media item

- src/entrypoints 新增 main-world 目录，新增 stuff 模块，此模块中实现拦截逻辑，导出至 `url-monitor-main-world.ts` 进行启动

- 使用 XHR 拦截工具单例监听 "/stuff" 路径下的页面请求
需要监听的 url：`/_/BardChatUi/data/batchexecute?rpcids=jGArJ&source-path=%2Fmystuff`（允许有其他的参数）

- 匹配到数据后，解析回包并发出通知
  - 使用 src/utils/stuffMediaParser.ts 解析资源回包
  - 事件通知参考 url-monitor-main-world.ts 中的事件处理
  - 事件数据对象为：处理后的数据 dataList

### 3.3 数据缓存与页面改造

src/content 新增 stuff-page 模块，此模块中实现本次需求的数据缓存与页面改造逻辑，导出至 src/entrypoints/content/index.tsx 进行初始化

1. Media 数据缓存
- 监听数据回包事件
- 在内存中存储回包的 itemList，**无需持久化**
注意：每次对回包存储时需要去重检查，可以使用 conversationId + responseId 作为唯一标识定位

2. stuff 页面 item 增加跳转入口
页面结构参考：`.original/stuff.html`
在 stuff 页面的 Media section 中，对每个 `library-item-card` 的组件的右上角增加一个 NewTab 按钮

NewTab 按钮:
1. 结构：div > svg
2. 宽高：div-35x35, svg-16x16
3. div 基础样式:
``` css
position: absolute;
right: 4px;
top: 4px;
width: 35px;
aspect-ratio: 1;
background:rgba(0, 0, 0, 0.4);  // hover: rgba(0, 0, 0, 0.6)
border-radius: 100%;
display: flex;
justify-content: center;
align-items: center;
cursor: pointer;
color: white
```
4. SVG
``` html
<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24">
  <g class="open-in-new-tab-outline">
    <g fill="currentColor" fill-rule="evenodd" class="Vector" clip-rule="evenodd">
      <path d="M5 4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5.263a1 1 0 1 1 2 0V19a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3h5.017a1 1 0 1 1 0 2z"></path>
      <path d="M21.411 2.572a.963.963 0 0 1 0 1.36l-8.772 8.786a.96.96 0 0 1-1.358 0a.963.963 0 0 1 0-1.36l8.773-8.786a.96.96 0 0 1 1.357 0"></path>
      <path d="M21.04 2c.53 0 .96.43.96.962V8c0 .531-.47 1-1 1s-1-.469-1-1V4h-4c-.53 0-1-.469-1-1s.43-1 .96-1z"></path>
    </g>
  </g>
</svg>
```
5. 按钮交互
- 当 `library-item-card` hover 时，展示 NewTab 按钮
- 当 NewTab 按钮 hover 时，使用 tippy 展示 “Open In New Tab” (需要多语言)


### 3.4 新标签页跳转
**核心逻辑**
1. 点击 “NewTab 按钮” 时获取其所在 `library-item-card` 中的 `jslog` 属性，提取关键 ID (似乎是 timestamp)，如下的示例：
``` html
<library-item-card
  jslog="279444;track:generic_click,impression;BardVeMetadataKey:[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,[1,[1753892482,343000000]]]"
>
</library-item-card>
```
需要提取其中的 `[1753892482,343000000]`

2. 原始数据查找
使用上述的 `[1753892482,343000000]` 在缓存数据中查找具体的信息
匹配逻辑： 找到 `timestamp` 为 1753892482 的 MediaItem

3. 新建标签跳转
- 拼接跳转路径：`/app/${MediaItem.conversationId}#${MediaItem.responseId}`
- 使用浏览器接口新建标签跳转（注意不要被页面拦截、也不要新增权限）


## 4. Others

1. 关于回包格式与解析的调研文档：`.original/api_response`
2. 注释需使用英文
3. 代码质量必须为生产环境级别质量



