# **产品需求文档：Chain Prompt 运行状态**

#### **1. 整体目标 (Objective)**
在 Gemini 的输入框右上方为用户提供一个 ChainPrompt 运行状态界面, 用户能够直观地看到当前运行中 prompt 的所有状态

#### **2. 核心交互逻辑 (Core logic)**
1. 当用户点击 “开始执行” Chain Prompt 后，关闭当前的所有 dialog 弹窗（如 setting-panel、RunModal等），以让用户看到 Gemini 聊天界面

2. 在 Gemini 的消息输入框上方展示当前的 Chain Prompt 简要状态（称为 SimpleRunStatus 组件），包含以下内容：
  - 展示结构：
    - 执行中： [Progress Circle] {ChainPromptName} is running ({step}/{StepsLength})。其中 Progress Circle 是执行进度展示，使用 Chakra UI 中的 ProgressCircle 组件，strokeLinecap="round"，主色为 gemOnPrimaryContainer
    - 执行成功：[Success Icon] {ChainPromptName} is success. [Close Button]。Success Icon 为 IconButton，rounded="full"，colorPalette="green", icon 为LuCheck，尺寸与ProgressCircle一致；Close Button 则是一个小的关闭按钮，点击则清除运行状态UI
    - 执行失败：[Error Icon] {ChainPromptName} failed [Close Button], Error Icon 样式同 ，colorPalette="red", icon 为 LuX.

3. SimpleRunStatus 组件是一个可点击组件，当 hover 时，组件 cursor 为 pointer，并且会有对应的 UI 表明这是一个可点击组件

4. 点击 SimpleRunStatus，在组件上方出现 RunStatusPanel 组件（暂称如此，若命名不好，可更换），此组件中将可看到更为具体的运行过程与状态信息

5. RunStatusPanel 组件组成为：名称 + 执行Steps。执行Steps：使用 TimeLine 组件，每个 step 包含以下信息：
  - 状态：成功、失败、执行中、待执行
  - Step Name
  - Step Prompt：最多展示三行，超出则使用 “...” 截断

