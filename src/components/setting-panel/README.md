# Setting Panel Component

基于设计稿和需求文档实现的设置面板功能，提供完整的两级导航结构。

## 功能特点

- **侧边栏导航**: 固定在左侧的主导航，包含所有功能模块
- **两级页面结构**: 支持列表视图(L1)和详情视图(L2)的导航
- **状态管理**: 使用 Zustand 进行全局状态管理
- **响应式设计**: 基于 Chakra UI 的设计系统

## 组件结构

```
setting-panel/
├── index.tsx          # 主设置面板组件
├── Sidebar.tsx        # 侧边栏导航组件
├── ContentArea.tsx    # 内容区域组件
└── README.md
```

## 使用方法

### 基本使用

```tsx
import { SettingPanel } from './components/setting-panel'

// 组件会自动监听 'settings:open' 事件
function App() {
  return <SettingPanel />
}
```

### 打开设置面板

```tsx
import { useEventEmitter } from './hooks/useEventBus'

function SomeComponent() {
  const { emit } = useEventEmitter()
  
  const openSettings = () => {
    emit('settings:open', { open: true })
  }
  
  return <button onClick={openSettings}>打开设置</button>
}
```

## 状态管理

使用 Zustand store 管理导航状态：

```tsx
import useSettingStore from './stores/settingStore'

// 在 React 组件中使用
const { activeSection, currentView, setActiveSection } = useSettingStore()

// 在非 React 环境中使用
import { getSettingState, setActiveSection } from './stores/settingStore'
```

## 导航结构

### 一级导航 (侧边栏)

- **Prompt 分组**
  - Chain Prompt
  - Quick Follow-up
- **Tools 分组**
  - Chat outline
  - Theme
- **其他**
  - Support
  - Feedback

### 二级页面

每个一级导航项都支持进入二级详情页面，二级页面包含：
- 返回按钮 (左上角)
- 页面标题
- 占位符内容区域

## 扩展指南

### 添加新的导航项

1. 在 `src/stores/settingStore.ts` 中添加新的 `NavigationSection` 类型
2. 在 `Sidebar.tsx` 的 `navigationItems` 数组中添加新项
3. 在 `ContentArea.tsx` 的 `sectionConfigs` 中添加配置

### 自定义内容页面

修改 `ContentArea.tsx` 中的 `LevelOnePage` 和 `LevelTwoPage` 组件，替换占位符内容为实际功能组件。

## 技术栈

- **React**: UI 框架
- **Chakra UI v3**: UI 组件库
- **Zustand**: 状态管理
- **React Icons**: 图标库
- **TypeScript**: 类型支持
