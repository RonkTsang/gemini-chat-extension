# Folder Browser Sync 数据协议 V3

当前实现使用一个 Manifest 和一组按编号存储的 Chunk。只支持 V3，不迁移未发布的旧 Folder 协议或旧试验数据；Dexie v11 清理旧 Folder 试验表，当前 Dexie schema 为 v12（增加本地恢复状态表），其他功能表保留。后台清理旧 Folder Sync key。

`observed` 与 `manual-confirmed` 身份若由相同规范化邮箱派生出同一 `accountScopeId`，使用同一同步数据和调度。手动选择不会验证当前 Gemini 登录身份；最近使用的邮箱和 scope 仅保存在本机 `browser.storage.local` 账号历史中，不进入 Manifest、Chunk 或导出文件。账号历史可在页面重载后恢复，页面自动识别的身份优先。

## 1. 远端结构

```ts
interface BrowserSyncManifest {
  schemaVersion: 3
  accountScopeId: string
  generationId: string
  dataRevision: string
  authorityEpoch: string
  chunkCount: number
  payloadBytes: number
  payloadHash: string
  settings: {
    enabled: boolean
    hideOrganizedChats: boolean
  }
  settingsVersion: string
}

interface FolderSyncData {
  folders: Omit<FolderRow, 'accountScopeId'>[]
  memberships: Omit<FolderMembershipRow, 'accountScopeId'>[]
  chatReferences: Omit<ChatReferenceRow, 'accountScopeId'>[]
}
```

| 字段 | 含义与价值 |
| --- | --- |
| `schemaVersion` | 同时约定 Manifest、业务结构、压缩算法和还原流程，避免多组协议版本 |
| `accountScopeId` | 当前 Gemini 账号的数据边界，读取时必须匹配 job scope |
| `generationId` | 定位不可变 Chunk 集合，持久化后重试复用同一 ID |
| `dataRevision` | 业务组织数据修订；设置和收起状态修改不改变它 |
| `authorityEpoch` | 当前同步权威周期；保留给 provider 切换，Browser Sync 未实现 Drive 切换 |
| `chunkCount` | 按索引生成完整 Chunk key 列表，检测缺块 |
| `payloadBytes` | 拼接后压缩字符串的 UTF-8 字节数 |
| `payloadHash` | 压缩字符串的 SHA-256；一次校验覆盖所有 Chunk |
| `settings` | 两个普通布尔开关，独立于 Folder 业务数据 |
| `settingsVersion` | 设置整体的 HLC 版本；整个对象一起选择，不逐字段混合 |

存储 key：

```text
folders:v3:{accountScopeId}:manifest
folders:v3:{accountScopeId}:generation:{generationId}:chunk:{index}
```

Chunk value 是 `LZString.compressToBase64(stableStringify(FolderSyncData))` 的连续片段，内部无 Envelope、Manifest、设置或导出元数据。Scope 在远端记录中省略，还原后由已验证的 Manifest 注入本地行。Membership ID 保留既有格式，可能包含 scope；它是关系身份，不另造第二套 ID。

## 2. 业务行字段

- Folder：`id` 唯一身份；`parentFolderId` 扁平树邻接关系；`name`、`iconKey`、`colorValue` 外观；`orderKey` 顺序；`createdAt`、`updatedAt` 展示时间；`versionStamp` 行版本；`fieldVersions` 为名称、图标、颜色、位置分别合并；`deletedAt`、`deleteVersionStamp` 保留删除 tombstone，阻止旧数据复活。
- Membership：`id`、`folderId`、`chatId` 表达 Folder 与 Chat 归属；`orderKey` 保存普通排序；可选 `pinnedOrderKey` 表示已置顶并保存置顶组内排序；创建/更新时间；`versionStamp` 为行版本，`positionVersionStamp` 与可选 `pinVersionStamp` 分别合并普通位置和置顶状态/顺序；删除时间和版本保留 tombstone。缺少置顶字段的旧数据默认未置顶。

置顶是当前 Membership 的独立版本寄存器：取消置顶清除 `pinnedOrderKey`，但保留新的 `pinVersionStamp`，防止其他设备的旧置顶状态覆盖取消操作。普通拖拽不更新置顶版本，置顶和置顶组内拖拽不更新普通位置版本。正常展示先置顶组、再普通组，每组按其对应 order key 与 membership ID 的 ASCII 顺序排序；后台 Chat 分页 cursor 包含组别与当前组排序键。置顶数据随完整业务数据同步、导出及恢复，不存入界面偏好。
- Chat reference：`chatId` 引用 Gemini Chat；`cachedTitle` 本地标题缓存；创建/更新时间；`titleVersionStamp` 用于标题合并。不存 Chat 正文。

## 3. 设置与设备状态

`enabled`、`hideOrganizedChats` 在 Manifest 中同步。修改开关时更新 `settingsVersion` 与本地 `settingsPending`，不生成业务 Outbox operation、Chunk 或 data revision。已有 Manifest 时只更新 Manifest，并保留最新读取到的数据指针。首次无 Manifest 时发布空业务数据或当前本地业务数据以建立完整入口。

Manifest 通过 schema 和 scope 校验后，其设置可以独立应用，即使 Chunk 缺失或 payload 损坏；业务数据仍须完整校验。发布数据 generation 前重新选择本地与当前 Manifest 中较新的设置，防止旧 prepared 数据带回旧开关。相同版本但不同值使用规范化 JSON 的 ASCII 比较确定结果。本地下一次编辑会观察已有版本，避免时钟落后导致编辑被旧版本覆盖。

本地 `FolderSettingsRow` 仍用于统一 UI 查询，但以下字段不传输：

- `collapsedFolderIds`：仅本设备 UI 状态，不进入同步、备份、导出、Outbox 或 revision；同步与导入保留本地有效 ID，删除 Folder 时清理失效 ID。
- `settingsPending`：本机未被 Browser Storage 接受的设置修改；较旧写入结果不得确认较新本地修改。
- `updatedAt`：本机展示时间，不作为冲突依据。

## 4. Chunk 字节限制与还原

分块通过二分搜索求每个 Chunk 的最大长度，计算：

```text
UTF8(key).byteLength + UTF8(JSON.stringify(value)).byteLength
```

目标每项不超过 7000 bytes，并同时遵守浏览器实际 `QUOTA_BYTES_PER_ITEM`。计算包含完整 key、索引位数与 JSON 引号；正常默认限制下每项严格小于 8192 bytes。Manifest 也独立执行单项限额检查。发布前预估所有账号 Folder key、孤立块和扩展其他 Sync key 的总容量与 item 数量；Folder 总预算 70 KiB，整体遵守浏览器实际额度。

Settings 中的容量提示按 Folder 已用字节占 70 KiB 预算的比例计算，达到 80% 时可提示并暂时关闭；这不是浏览器整体同步空间使用率。普通状态查询不扫描所有 Sync key，容量测量由显式请求或同步写入结果更新。

还原顺序：校验 Manifest → 按索引读取全部 Chunk → 缺块则等待重试 → 按索引拼接 → 校验字节数及 SHA-256 → Base64 解压 → JSON/schema 校验 → 注入 scope → 校验引用、唯一性及树结构 → 合并本地数据。任何失败都不覆盖本地组织数据。

## 5. 本地恢复与写入

`FolderSyncGenerationRow` 保存 `id`、scope、provider、epoch、revision、压缩 `payload`、`payloadHash`、创建时间、状态、`includedOperationIds` 与 `replacedGenerationId`。准备时在同一个 Dexie 事务中捕获业务数据、revision 和待确认 operation。重试不重新生成 payload、ID 或 hash。

写入前检查当前 generation 与预期替换目标一致，持久化替换目标，预检容量后删除旧 active Chunk，再一次 `set()` 写入新 Chunk 与 Manifest。若删除后写入失败，凭本地 writing generation 与替换目标恢复重试同一 generation。只有此次捕获的 operation 被接受；期间新建 operation 保持 pending。

每个账号的本地 lease 避免同设备并行 job。Browser Sync 没有跨设备 CAS；最后一次读取后仍可能发生远端竞争，后续 storage change、重读与实体合并继续收敛，不能把一次 `set()` 描述为跨设备事务或云端确认。

只清理本地仓储明确记录可回收、且当前 Manifest 未引用的 generation，不枚举删除其他设备 generation。无 previous 指针，无成功后确认回读。

## 6. 备份与验证

导出/快照有独立 `FolderExportPayload`：`schemaVersion: 1`、scope、完整 scoped 业务行、简单 settings、settingsVersion、exportedAt。独立文件需要自描述元数据；不含设备收起状态。导出在同一只读事务中捕获业务行与设置版本。恢复组织数据保留当前开关；导入开关作为新的本地设置编辑。

本地恢复点每账号最多 10 份，全扩展共用 20 MiB 逻辑预算。`unlimitedStorage` 已在 Chrome 和 Firefox manifest 中声明为必需权限，不能增加恢复点预算或 Browser Sync 配额；`navigator.storage.estimate()` 只作诊断，实际写入错误单独处理。

测试覆盖多块还原、字节限制、损坏与缺块、设置独立应用/写入、较新开关保留、旧确认不清除新 pending、本地收起状态、generation 重试与配额预检。真实跨设备传播时间由浏览器决定，单元测试不证明云端传播。
