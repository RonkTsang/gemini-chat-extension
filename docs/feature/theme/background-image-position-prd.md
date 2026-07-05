# Background Image Position

| **Document Version** | **V1.0** |
| :--- | :--- |
| **Feature Name** | Background Image Position |
| **Issue** | [#34](https://github.com/RonkTsang/gemini-chat-extension/issues/34) |
| **Status** | Draft |

## 1. 背景
当前 Wallpaper 使用居中 `cover` 渲染。多数图片可正常显示，但当主体位于边缘时，重要内容容易被裁切。

## 2. 目标
在 Theme > Wallpaper 中新增一个轻量设置：**Position**。

用户可选择 9 个常见背景定位：

- Top left
- Top
- Top right
- Left
- Center
- Right
- Bottom left
- Bottom
- Bottom right

默认值保持 **Center**，兼容现有表现。

## 3. 范围
本期包含：

1. 新增持久化的背景图定位值。
2. 将定位应用到 Gemini 页面真实 wallpaper 层。
3. 现有 Theme preview 同步展示定位效果。
4. 补充设置项与选项的 i18n 文案。

本期不包含：

1. 自由拖拽或百分比坐标。
2. 桌面端 / 移动端分别配置。
3. 按主题或按图片记忆多个预设。
4. 新的裁剪、编辑、上传流程。
5. 额外预览面板或高级设置区。

## 4. 产品交互
### 4.1 设置位置
在现有 Theme > Wallpaper 区域内展示 **Position**，靠近图片上传 / 删除控件。

建议顺序：

1. Wallpaper upload / remove
2. Blur
3. Position
4. Message Glass Effect

只有存在 wallpaper 图片时该设置才有实际效果。无图片时，可按现有面板风格选择隐藏或禁用。

### 4.2 控件形态
使用紧凑的 3x3 定位选择器，放在 `Position` label 右侧。

- 每个格子代表对应背景锚点。
- 选中项沿用现有选中态样式。
- hover / focus 可展示选项名称。
- 不增加说明段落，避免设置面板变重。
- 控件整体建议控制在约 `54px x 54px`，每个格子为小型图标按钮，不使用文字按钮。
- 选中态使用当前主题色做描边或中心点提示，避免大面积填色。
- hover / focus 只做轻量高亮，并通过 tooltip 展示完整位置名称。

该形态比下拉菜单更直观，但必须保持紧凑。若实际实现中横向空间不足，可降级为单行 `Position` label + 右侧 compact menu，菜单展开后再展示 3x3 网格。

### 4.3 行为
1. 选择定位后立即保存。
2. 当前 Gemini 页面立即更新 wallpaper 位置。
3. 刷新 Gemini 后恢复已保存定位。
4. 删除 wallpaper 后保留定位值，但不产生可见效果。
5. 再次上传 wallpaper 时复用上次定位。

## 5. 数据
在现有 background settings 中新增一个字段：

```ts
backgroundImagePosition:
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'center'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right'
```

Default: `'center'`.

CSS 映射：

| Value | CSS `background-position` |
| :--- | :--- |
| `top-left` | `left top` |
| `top` | `center top` |
| `top-right` | `right top` |
| `left` | `left center` |
| `center` | `center center` |
| `right` | `right center` |
| `bottom-left` | `left bottom` |
| `bottom` | `center bottom` |
| `bottom-right` | `right bottom` |

## 6. 验收标准
1. 老用户升级后 wallpaper 仍保持居中显示。
2. 9 个定位选项均能更新真实 wallpaper 层。
3. 定位变更自动保存，并在刷新后恢复。
4. Theme preview 与真实页面使用同一定位。
5. 缺失或非法存储值回退到 `center`。
6. Theme 设置面板仍保持单一简洁的 Wallpaper 区域，不新增高级子面板。
