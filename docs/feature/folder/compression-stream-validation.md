# Folder 原生 gzip 验证记录

日期：2026-10-20。Folder 尚未发布，验证使用合成数据及独立测试数据库。

## 格式与行为

- 共享 codec 使用 stableStringify、UTF-8 和原生 CompressionStream/DecompressionStream gzip，编码、解码均为异步。
- 恢复点 schemaVersion 1 正文保存 ArrayBuffer，payloadBytes 为 byteLength，contentHash 对二进制计算 SHA-256；逻辑预算为正文长度加持久元数据 JSON UTF-8 长度，排除响应用 protectionToken。
- Browser Sync v4 使用 gzip → Base64 → 现有分块。manifest 的字节数/hash 对应传输字符串，配额预检仍包含封装和 key。writing 重试复用精确原文。
- 保留事务外压缩/hash、保存前捕获视图核对和 newer pending/dirty 保护。接口缺失不标记有效快照为损坏，保护快照失败阻止破坏性操作。
- package.json 和 pnpm-lock.yaml 已移除 lz-string，没有旧格式读取、迁移、自动清理或备用压缩库。JSON 导入导出格式未改。

## 自动化与构建

| 检查 | 结果 |
| --- | --- |
| `pnpm compile` | 通过 |
| `pnpm test:run` | 123 个文件、1037 个用例通过 |
| `pnpm build` | Chromium MV3 通过 |
| `pnpm build:firefox` | Firefox MV2 通过 |
| 运行时代码、manifest/lockfile 及双浏览器构建产物扫描 | 无 lz-string 编解码引用 |

用例包含 Unicode、多 MiB 正文、无效 Base64、截断/损坏 gzip、非法 UTF-8/JSON/schema、接口缺失、数据库重开、二进制类型/长度/hash 校验、预算边界、租约与回滚、物理删除、压缩期间并发编辑及中断重试。

## 浏览器原生验证

通过 localhost 独立页面注册 Service Worker，运行从本次共享 codec 转译的代码。测试数据库与扩展数据库隔离，测试后删除测试库并注销 Worker。

| 场景 | Chrome 155 | Firefox 157 |
| --- | --- | --- |
| gzip 二进制与大正文 Base64 往返 | 通过 | 通过 |
| IndexedDB 二进制写入、关闭重开、hash 和解压恢复 | 通过 | 通过 |
| Node gzip → 浏览器解码 | 通过 | 通过 |
| 浏览器 gzip → Node 解码 | 通过 | 通过 |
| Chrome ↔ Firefox 双向 gzip 解码 | 通过 | 通过 |

此项证明原生 codec 在真实浏览器 Service Worker 中可运行及互解；未加载新构建进行扩展端到端验证，也未进行云端或第二设备 storage.sync 读回。未访问真实 Folder 数据。

## 压缩基准

环境：Node 22.14.0；每组 3 次，取中位数。数据为 folders/memberships 空数组及 chatReferences；标题分为含中文/emoji 的重复文本与固定种子生成的多样 ASCII 文本。两种压缩使用同一份 stableStringify 结果。

纯压缩分别计量 LZ-String 的 compressToBase64 与预先 UTF-8 编码后的原生 gzip（含流结果收集）；gzip 不含 Base64。JSON 序列化独立计量；完整 gzip 编码另含序列化、UTF-8、gzip 与 Base64。不同计量边界不作为完整应用延迟对比。

各档以表中实际 JSON bytes 为准。结果不包含数据库 I/O、SHA-256、Zod 校验、IPC 或浏览器调度，也未测量峰值内存。浏览器仅做功能验证，没有将 Node 耗时表述为 Chrome/Firefox 的性能数据。不设置毫秒级 CI 门槛；小 payload 的 gzip 封装可能增加体积。

| Dataset | JSON bytes | Serialize ms | LZ to Base64 ms | gzip ms | LZ Base64 bytes | gzip bytes | gzip Base64 bytes | Full gzip encode ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| repetitive 1 | 762874 | 6.92 | 116.84 | 5.07 | 51008 | 15637 | 20852 | 9.9 |
| repetitive 5 | 3831438 | 21.81 | 480.96 | 7.4 | 185860 | 75166 | 100224 | 32.17 |
| repetitive 10 | 7673936 | 39.5 | 1153.91 | 13.08 | 328256 | 148678 | 198240 | 61.66 |
| varied 1 | 878637 | 5.61 | 132.13 | 10.18 | 738552 | 457519 | 610028 | 19.37 |
| varied 5 | 4401931 | 12.86 | 967.16 | 48.64 | 3525152 | 2286843 | 3049124 | 94 |
| varied 10 | 8815019 | 25.67 | 2120.81 | 94.33 | 6834304 | 4573460 | 6097948 | 190.78 |

| Dataset | LZ Base64 decode + JSON ms | gzip Base64 decode + JSON ms |
| --- | ---: | ---: |
| repetitive 1 | 10.62 | 9.88 |
| repetitive 5 | 21.34 | 15.94 |
| repetitive 10 | 41.02 | 25.48 |
| varied 1 | 41.19 | 5.39 |
| varied 5 | 259.85 | 30.79 |
| varied 10 | 572.86 | 46.46 |
