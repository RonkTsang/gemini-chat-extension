# Chain Prompt Feature

Chain Prompt 功能允许用户创建和管理由多个步骤组成的链式提示词，实现复杂任务的自动化执行。

## 功能概览

### 核心功能
- ✅ 创建、编辑、复制、删除 Chain Prompts
- ✅ 定义输入变量（支持默认值）
- ✅ 多步骤编排（支持拖拽排序）
- ✅ 模板变量系统（`{{VAR}}` 和 `{{StepN.output}}`）
- ✅ 运行前预览（实时渲染）
- ✅ 自动执行（插入 → 发送 → 等待 → 继续）
- ✅ 搜索和筛选

## 架构说明

### 数据层
- **数据库**: IndexedDB (`gemini_extension`) via Dexie
- **表**: `chain_prompts` (模板持久化)
- **仓储**: `chainPromptRepository` (统一数据访问接口)
- **数据源**: `LocalDexieDataSource` (本地存储实现)

### 业务层
- **模板引擎**: `templateEngine` - 处理变量解析和校验
- **执行服务**: `chainPromptExecutor` - 驱动步骤执行流程
- **状态管理**: `chainPromptStore` (Zustand) - UI 状态

### UI 层
- **列表页**: `index.tsx` - 展示所有 Chain Prompts
- **编辑页**: `editor.tsx` - 创建/编辑界面
- **运行弹窗**: `RunModal.tsx` - 变量输入与预览

## 文件结构

```
src/
├── domain/chain-prompt/
│   └── types.ts                    # 领域类型定义
├── data/
│   ├── db.ts                       # Dexie 数据库配置
│   ├── sources/
│   │   └── LocalDexieDataSource.ts # 本地数据源
│   └── repositories/
│       └── chainPromptRepository.ts # 仓储实现
├── services/
│   ├── templateEngine.ts           # 模板解析引擎
│   └── chainPromptExecutor.ts      # 执行服务
├── stores/
│   └── chainPromptStore.ts         # UI 状态管理
└── components/setting-panel/views/chain-prompt/
    ├── index.tsx                   # 列表视图
    ├── editor.tsx                  # 编辑视图
    ├── RunModal.tsx                # 运行弹窗
    └── README.md                   # 本文档
```

## 使用示例

### 创建 Chain Prompt

1. 打开 Setting Panel → Chain Prompt
2. 点击 "New Chain Prompt"
3. 填写名称和描述
4. （可选）定义输入变量
5. 添加步骤并编写 Prompt
6. 使用 `{{VAR}}` 引用变量，`{{StepN.output}}` 引用前序步骤输出
7. 保存

### 运行 Chain Prompt

1. 在列表中找到目标 Chain Prompt
2. 点击 "Run" 按钮
3. 在弹窗中填写变量值
4. 查看右侧预览
5. 点击 "Execute" 开始执行

### 变量系统

**输入变量**:
- 格式: `{{VARIABLE_KEY}}`
- 示例: `{{TOPIC}}`, `{{TONE}}`

**步骤输出引用**:
- 格式: `{{StepN.output}}` (N 为 1-based)
- 示例: `{{Step1.output}}`, `{{Step2.output}}`
- 限制: 仅可引用之前步骤的输出

## 技术细节

### 执行流程

1. 用户点击 Run → 打开 RunModal
2. 填写变量 → 实时预览渲染后的 Prompts
3. 点击 Execute → 开始执行
4. 对于每个步骤:
   - 渲染模板（替换变量）
   - 插入到 Gemini 输入框
   - 发送消息
   - 监听模型状态变化
   - 等待响应完成
   - 提取输出并保存到上下文
5. 全部完成 → 显示结果

### 数据存储

- **本地优先**: V1 仅使用 IndexedDB 本地存储
- **云端预留**: 架构已为云端迁移做准备（DataSource 抽象）
- **运行记录**: V1 不持久化运行记录（仅页面级内存状态）

### 校验规则

- Chain Prompt 必须有名称
- 至少包含一个步骤
- 所有步骤必须有 Prompt 内容
- 变量 key 不能重复
- 步骤中只能引用已定义的变量和之前步骤的输出

## 未来扩展

- [ ] 运行历史记录持久化
- [ ] 导入/导出 JSON
- [ ] 标签和分类
- [ ] 云端同步
- [ ] 模板市场/分享
- [ ] 条件分支和循环
- [ ] 重试和错误处理增强


