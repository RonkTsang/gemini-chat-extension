# Library 新标签页打开

Gemini 的新旧 Library 页面使用不同的接口和 DOM 结构。扩展根据实际页面结构选择适配器，保留两条数据处理链路。

| 版本 | 页面结构 | 文档 |
| --- | --- | --- |
| 新版 Library | `library-island-page`，媒体数据来自 GraphQL Fetch | [新版实现逻辑](library-v2.md) |
| 旧版 Library / My Stuff | `library-sections-overview-page`、`library-item-card`，媒体数据来自 `batchexecute` | [旧版原始设计](prd.md) |

`prd.md` 保留原始内容，其中的页面路径、初始化方式、样式和状态描述属于历史设计，不能直接作为当前实现说明。旧版当前运行逻辑见 `src/entrypoints/main-world/stuff-monitor.ts`、`src/entrypoints/background/firefox.ts` 及 `src/entrypoints/content/stuff-page/` 中的 `dataCache.ts`、`buttonInjector.ts`、`navigation.ts`。

辅助文档：

- [浏览器平台差异](../../platforms.md)
