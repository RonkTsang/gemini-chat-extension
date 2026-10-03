# Rename Chat 请求分析与接口

## 抓包协议

依据仓库根目录的 `rename-request`，重命名使用 `MUAZcd` RPC，通过现有 `batchexecute` 传输层发送 POST 请求。

解码 `f.req` 后，外层结构为：

```ts
[[['MUAZcd', JSON.stringify(args), null, 'generic']]]
```

本次抓包中的 `args` 为：

```ts
[null, [['title']], ['c_e314bf90da4c7254', 'TP-Link password']]
```

`[['title']]` 表示此次修改的字段；最后一个数组包含会话资源 ID 和新标题。封装保留这一结构，将 ID 和标题作为动态参数。其他字段的更改方式未由此次抓包验证。

响应包含防 XSSI 前缀、长度行和 JSON 帧。目标帧的结构为：

```ts
['wrb.fr', 'MUAZcd', JSON.stringify([
  null,
  ['c_e314bf90da4c7254', 'TP-Link password', null, null, null,
   [1790769743, 423304000], null, null, null, 2],
]), null, null, null, 'generic']
```

响应中的会话资源 ID 和标题用于构造返回值；其余元数据不向业务层暴露，也不推断其含义。与 delete chat 的 `[]` 确认不同，rename chat 必须收到有效的 `MUAZcd` 帧及其中的会话 ID、标题，才能返回成功。HTTP 200、其他 RPC 帧和空 payload 均不能作为成功依据。

## 公共接口

```ts
import { geminiApi } from '@/services/gemini-api'

const result = await geminiApi.conversations.renameChat(
  { chat_id: 'e314bf90da4c7254', title: 'New title' },
  { signal }, // 可选 AbortSignal
)

if (result.ok) {
  // result.data: { accepted: true, conversationId: 'c_...', title: 'New title' }
}
```

与 `deleteChat` 一致，`chat_id` 接受路由 ID 或已经带 `c_` 前缀的资源 ID。Operation 在 Main World 发送前校验 ID 格式和标题类型，拒绝空标题及纯空白标题，保留有效标题的原始空格与字符。标题长度限制未由抓包确认，因此未添加推测性的上限。

接口注册为 `conversation.rename`，风险类型为 `write`。复用现有 Runtime 获取当前登录态参数、账号路径、语言和请求序号；抓包中的认证参数与浏览器特有请求头不硬编码。

失败沿用 `GeminiApiResult`：非法输入返回 `invalid_input / not-sent`；响应不符合协议返回 `response_parse_error / unknown`；其他通信失败由现有传输层分类。`unknown` 时调用方应先核实实际标题再决定是否重试。

Folders 侧栏 chat 更多菜单已接入该接口：点击 Rename 打开编辑弹窗，默认填充当前标题；保存时先通过 `updateChatTitle` 写入该账号的共享 chat reference 和同步日志，再调用 Gemini rename。所有已加载 Folder 中同一 chat 的标题会一起更新，不重新加载列表或分页游标。

Gemini 请求失败时保留本地标题，弹窗说明失败或结果未知，允许用户核实后重试。RPC 返回成功也不保证 Gemini 原生侧栏立即刷新。

## 验证边界

单元测试覆盖抓包参数结构、账号路由、特殊字符编码、输入校验、响应解析和公共 API 的参数与结果透传。协议依据单份原生抓包，尚未独立重放请求或验证真实页面副作用。
