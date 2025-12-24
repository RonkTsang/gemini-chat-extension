**产品需求文档：Gemini Prompt管理器 - 基础框架搭建**

#### **1. 目标 (Objective)**

构建一个可扩展、体验一致的基础应用框架。该框架将作为所有后续功能（如Chain Prompt, Quick Follow-up等）的容器，提供清晰的主导航和流畅的多级页面浏览体验。

#### **2. 核心用户故事 (Core User Story)**

“作为一名用户，我希望有一个清晰、有条理的设置界面，可以轻松地在不同的功能区（如‘Chain Prompt’和‘工具’）之间切换。当我需要编辑或创建一个新项目时，我希望能进入一个专门的页面，并且能方便地返回到之前的列表，而不会迷失方向。”

#### **3. 整体布局设计原则 (Layout Design Principle)**

*   **主次分明:** 采用经典的**“侧边栏导航 + 内容区”**两栏式布局。左侧导航栏固定，用于一级功能区的切换；右侧内容区则根据用户的操作动态变化，展示相应的内容。
*   **空间利用:** 侧边栏宽度固定，内容区占据剩余所有可用空间，确保核心操作区域最大化。
*   **一致性:** 整个应用的色彩、间距、字体和交互动效应遵循Chakra UI的默认设计系统，以确保视觉和体验的一致性。

#### **4. 组件详细需求 (Component Breakdown)**

##### **4.1. 侧边栏 (SideBar / Primary Navigation)**

*   **功能:** 应用的一级导航，是用户探索所有功能的主入口。
*   **需求:**
    1.  **固定位置:** 侧边栏应固定在页面左侧，不随内容区滚动而滚动。
    2.  **导航项目:** 包含以下可点击的导航项，每个导航项由一个**图标**和一个**文本标签**组成：
        *   **分组标题: Prompt**
            *   `Chain Prompt`
            *   `Quick Follow-up`
        *   **分组标题: Tools**
            *   `Chat outline`
            *   `Theme`
        *   **(分隔线)**
        *   `Support`
        *   `Feedback`
    3.  **状态反馈:**
        *   **悬停状态 (Hover):** 鼠标悬停在导航项上时，背景色应有变化，以提供可交互的视觉反馈。
        *   **激活状态 (Active):** 当前被选中的导航项应有明显的高亮样式，让用户清楚地知道自己所在的模块。
    4.  **行为:** 点击任一导航项，右侧内容区应立即更新，显示对应的一级页面（L1 Page）。

##### **4.2. 内容区 (Content Area)**

*   **功能:** 应用的核心工作区，用于展示列表、表单、编辑器等所有功能性内容。
*   **设计原则:**
    *   **分层清晰:** 内容区必须支持至少**两级页面结构**，以实现“列表 -> 详情/编辑”的通用交互模式。
    *   **导航能力:** 类似于MacOS的系统设置页面，页面顶部固定有标题（指明当前页面），二级页面的页面标题左边则具有后退按钮，点击即可返回上一级页面（无需前进），页面切换**无需动画**

*   **需求:**
    1.  **一级页面 (L1 - List/Dashboard View):**
        *   **定义:** 当用户点击侧边栏导航项时，内容区显示的默认页面。
        *   **占位符内容:** 在此阶段，每个模块的一级页面可以是一个简单的占位符。例如，点击`Chain Prompt`后，内容区应显示：
            *   一个大标题：“Chain Prompt”
            *   一个按钮或链接，文本为：“**Navigate to Second Level Page**”。
        *   **行为:** 点击此按钮或链接，内容区应平滑过渡到二级页面。

    2.  **二级页面 (L2 - Detail/Editor View):**
        *   **定义:** 用于执行具体任务（如创建、编辑、查看详情）的页面。
        *   **核心元素：返回导航 (Back Navigation)**
            *   在页面的左上角，必须有一个清晰的**“返回”**按钮或图标（例如，一个左箭头 `←`）。
            *   此按钮的文本可以是“Back”，或者紧跟在标题旁边。
        *   **占位符内容:** 二级页面同样可以使用简单占位符，例如：
            *   一个大标题：“Second Level Page”
            *   一些描述性文本：“This is the detail or editor view. Click the back button to return.”
        *   **行为:** 点击“返回”按钮，内容区应平滑过渡回对应的一级页面。

#### **5. 状态管理设计原则 (State Management - Zustand)**

*   **核心原则：分离与抽象 (Decoupling & Abstraction)**
    1.  **独立模块:** Store的定义必须存在于一个独立的JS/TS文件中（例如 `store.js`），不与任何React组件耦合。
    2.  **原生可用性:** Store必须导出其创建的hook (`useStore`) 以及**核心的action方法**和**`getState`方法**。这确保了非React环境（如未来的Background Script）可以通过直接调用`usePromptStore.getState()`或`usePromptStore.getState().someAction()`来与状态交互。

*   **需求:**
    1.  **Store结构:** 初始化一个用于管理导航状态的Store，其State应至少包含：
        *   `activeSection`: 一个字符串，用于存储当前侧边栏选中的是哪个导航项（例如：`'chainPrompt'`）。
        *   `currentView`: 一个对象或字符串，用于表示当前内容区是处于一级页面还是二级页面（例如：`{ level: 1 }` 或 `{ level: 2, context: 'someId' }`）。
    2.  **Actions:** Store需要提供明确的Action来修改状态，而不是让组件随意`set`：
        *   `setActiveSection(sectionName)`: 当用户点击侧边栏时调用，用于更新`activeSection`并重置`currentView`到一级页面。
        *   `navigateToLevel2()`: 用于将`currentView`切换到二级页面。
        *   `navigateBackToLevel1()`: 用于将`currentView`切换回一级页面。
