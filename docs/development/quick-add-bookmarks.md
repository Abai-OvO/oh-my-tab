# 快速添加与文件夹交互

[返回文档中心](../README.md)

本文记录 2026-10-21 在 `feat/calendar-popup` 分支上完成的快速添加、书签分组和文件夹交互调整。具体类型、默认值和注册表以代码为准。

## 目标

- 新建标签时，可以从常用网站或当前浏览器书签快速回填表单，不再在网址下增加一整行控件。
- 常用网站按分类浏览；浏览器书签按根栏筛选、按文件夹分组；两边都不使用分页。
- 修复文件夹预览滚轮到底部时行重叠、收尾跳动，以及标签拖入文件夹时的明显卡顿。

## 交互

### 入口

- 仅在新建标签时，编辑器左上角显示「快速添加」胶囊按钮；点击后打开覆盖表单的 sheet。
- 表单本身仍只包含名称、网址、背景色和图标。选择网站或书签只回填名称/网址，仍需点击原「确认添加」落库；回填后焦点回到名称输入框。
- 搜索框自动聚焦，Enter 选择第一条，Escape 关闭面板，Tab 在面板内循环。
- 面板用来源页签区分「常用网站」和「浏览器书签」，两者各自维护搜索和筛选状态。

### 常用网站

- 26 个预置站点，分类为：全部、热门、搜索、社交、影音、开发、AI、阅读、购物、工具。
- 分类 chips + 即时搜索 + 响应式卡片网格；内容区滚动，不做分页。
- 卡片显示站点名和域名，点击后回填表单；页脚显示总数/筛选结果和「点击卡片回填」或「滚动查看更多」。

### 浏览器书签

- 首次切到「浏览器书签」页签时申请可选 `bookmarks` 权限，之后可手动重新读取。
- chips 使用浏览器根栏（如书签栏、其他书签、移动设备书签），空根栏隐藏。
- 列表按完整文件夹路径分组（如 `书签栏 / 工作 / 设计`），组头吸顶；直接放在根栏的书签归到该根栏组。
- 组头数量是该组直接书签数；根栏 chip 是该根栏去重后的递归总数；「全部」是全局去重总数。
- 搜索匹配名称、URL、根栏和完整路径。输入搜索时根栏回到全部；点击根栏时清空搜索。
- 同一规范化 URL 只展示第一次出现，避免重复添加同一个标签。设置页的批量导入仍走原有 `mergeBookmarks` 去重逻辑。
- 提供加载、空书签、无匹配、权限拒绝、不支持扩展环境和重试状态。

## 书签数据

`chrome.bookmarks.getTree()` 返回 `BookmarkTreeNode[]`，根节点的 `children` 才是浏览器根栏。解析约定：

- 根节点通常是 `id: "0"`、`title: ""`；不要把根节点当成文件夹展示。
- 文件夹有 `children`、没有 `url`；书签有 `url`、没有 `children`。
- `title` 可能为空；文件夹空标题回退为本地化的「未命名」，书签空标题回退为 hostname。
- 根栏和文件夹名称随浏览器语言变化，不能写死。
- 同一 URL 可以出现在多个文件夹；快捷添加按规范化 URL 去重，保留第一次出现。

`parseBookmarkTree` 返回：

```ts
type BrowserBookmarkData = {
  bookmarks: ImportedBookmark[]
  bars: { id: string; title: string }[]
  invalid: number
}
```

每个书签额外保留：

- `barId` / `barTitle`：所属浏览器根栏。
- `folderPath`：相对根栏的文件夹路径（如 `["工作", "设计"]`，直接放在根栏时为空数组）。
- `folder`：供现有批量导入使用的完整路径字符串（如 `"书签栏 / 工作"`）。
- `folderId`：直接父文件夹或根栏的 ID。

非 `http/https` 书签计入 `invalid`，不进入快捷添加列表。

## 设计取舍

### 为什么用根栏做 chips（方案 B）

- 浏览器根栏是浏览器实际提供的一级结构，名称稳定且已本地化。
- 先用根栏缩小范围，再用完整文件夹路径分组，可以保留层级，也不会把不同根栏下的同名文件夹合并。
- 与 Lemon New Tab 的「根栏作为树顶层」和 Humble New Tab Page 的「根栏/文件夹作为列」一致。
- 对比方案 A（第一层文件夹做 chips）：更接近 Bonjourr 的按文件夹标题拍平，但会丢路径且同名文件夹合并，因此没有采用。

### 为什么不做分页

- 常用网站是策展列表，分类加搜索已经能把范围缩到一屏；分页只会增加点击。
- 书签使用根栏/文件夹筛选、搜索和完整行窗口滚动；数量大时也不需要编号分页。
- 如果以后常用网站变成用户可自由添加的数百项，再考虑「加载更多」或虚拟滚动，而不是页码分页。

### 社区参考

- [Bonjourr bookmarks.ts](https://github.com/victrme/Bonjourr/blob/master/src/scripts/features/links/bookmarks.ts)：按文件夹标题分组、导入/同步。
- [Lemon New Tab bookmarks.ts](https://github.com/Redlnn/lemon-new-tab/blob/master/entrypoints/newtab/components/Bookmark/bookmarks.ts)、[virtualTree.ts](https://github.com/Redlnn/lemon-new-tab/blob/master/entrypoints/newtab/components/Bookmark/virtualTree.ts)：根栏为顶层、逐级展开、虚拟滚动。
- [Lemon New Tab README](https://github.com/Redlnn/lemon-new-tab/blob/master/README.md)：Quick Links 提供分组、分页、滚动等布局选项。
- [Humble New Tab Page](https://github.com/ibillingsley/HumbleNewTabPage)：根栏/文件夹作为列，`getSubTree` 懒加载。
- [Chrome bookmarks API](https://developer.chrome.com/docs/extensions/reference/api/bookmarks)：`BookmarkTreeNode` 与根节点结构。

## 文件夹预览滚动

原实现用 GSAP 折叠/压缩行，并在到底时切换到另一套 `settled` 坐标。接近底部时多行被压到同一个 `bottomLimit`，到 `atEnd` 又切换位置，因此出现最后两行重叠和收尾跳动。

现在文件夹预览使用 `useStackScroll` 的 `snap` 模式：

- 行保持自然布局，不做 y/scale 折叠。
- `stackWindow(lines, visibleLineCount, scrollTop, rowStep)` 计算当前完整行窗口，并把 `topLine` 夹在 `0..lines-visibleLines`。
- 窗口外的行设置 `inert` 和 `autoAlpha 0`；窗口内行保持可见。
- 滚轮一次切换一行，滚动目标按行高取整；进出窗口的行做短暂淡入淡出。
- 键盘 Home/End/上下键使用同一套窗口和滚动上限。
- `--stack-bottom` 仍用于保留可滚动空间；窗口本身不再依赖底部特殊坐标。

文件夹行按标签尺寸在同一行内流式排列：1×1 占 1 格、2×1 占 2 格、4×1 与 4×2 占 4 格；累计超过 4 格换行。宽文件夹的每行可容纳两个 4 格组；1×1 标签只渲染居中图标，2×1 使用紧凑行，4×2 仍占一行。行内多个标签共用一个 `data-stack-row`，标签自身保留 `data-tab-id` 供插入位置和展开动画读取。

文件夹展开/收起时，`collectionFrames` 只读取当前窗口内、非 `inert`、与文件夹区域相交的源标签。被滚出视口的书签不再从屏幕外飞入，展开和关闭不会从错误的行位置起跳。

## 拖拽性能

拖标签进文件夹时，原路径的主要开销：

1. 充能动画每帧 `publish` 进度，导致整个网格按 60fps 重渲染。
2. 每帧重新计算全量 placements。
3. 每帧遍历所有文件夹并查询 DOM rect。
4. 拖拽预览的 folder tabs 数组每次都是新引用，`FolderTabStack` 的 GSAP、ResizeObserver 和事件监听随进度变化每帧重建。

调整：

- 充能进度量化成 20 档；rAF 仍全速跟踪指针，但 React 只更新约 20 次，`ready` 仍按 550ms 判断。
- placements 只在真正进入文件夹、需要冻结布局时计算一次。
- 使用 `elementsFromPoint` 一次命中指针下的网格项，跳过拖拽浮层，不再遍历所有文件夹。
- 按 folder/intent/index 缓存拖拽预览的 tabs 数组；进度变化不改变数组引用。
- `FolderTabStack` 和 `DraggableGridItem` 使用 memo；网格项比较 item、placement 数值、dropProgress、folderTabs/todoTasks，回调不参与比较（都是每个 item 的稳定闭包）。
- `FolderTabStack` 的 FLIP 和滚动 effect 依赖 tab ID 字符串，而不是数组引用。

结果：充能过程中只有被悬停的文件夹和拖拽浮层重渲染，其它卡片跳过；文件夹内部的滚动/GSAP setup 不再每帧重建。

## 模块

| 路径                                                     | 变更                                                 |
| -------------------------------------------------------- | ---------------------------------------------------- |
| `src/components/tab-grid/tab-quick-add.tsx`              | 快速添加入口、sheet、来源页签、权限加载与焦点管理    |
| `src/components/tab-grid/common-site-picker.tsx`         | 常用网站分类、搜索、卡片网格和页脚                   |
| `src/components/tab-grid/bookmark-quick-picker.tsx`      | 书签根栏 chips、文件夹分组、搜索、去重和状态         |
| `src/lib/common-sites.ts`                                | 26 个预置站点、分类和热门标记                        |
| `src/lib/browser-bookmarks.ts`                           | 根栏/文件夹层级解析、`folderPath`/`folderId`/`barId` |
| `src/lib/bookmark-import.ts`                             | URL 去重、根栏计数、文件夹分组和搜索                 |
| `src/components/tab-grid/component-editor-frame.tsx`     | 编辑器 overlay 插槽                                  |
| `src/components/tab-grid/tab-editor.tsx`                 | 接入快速添加 overlay 和回填后的焦点                  |
| `src/components/tab-grid/collection/use-stack-scroll.ts` | 文件夹完整行 snap 窗口；待办仍使用 stack 模式        |
| `src/components/tab-grid/folder-tab-stack.tsx`           | 使用 snap 模式、tab ID 依赖和 memo                   |
| `src/components/tab-grid/collection/expansion.tsx`       | 展开源行只取非 inert 可见行                          |
| `src/components/tab-grid/use-grid-drag.ts`               | 充能量化、懒计算 placements、hit-test 文件夹         |
| `src/components/tab-grid/tab-grid.tsx`                   | 稳定 folderTabPreviews、memo 网格项                  |
| `src/components/tab-grid/draggable-grid-item.tsx`        | 拖拽期间跳过无关卡片重渲染                           |
| `src/components/tab-grid/folder-drop.ts`                 | 充能进度与量化辅助函数                               |
| `src/i18n/locales/{zh-CN,en}/grid.ts`                    | 快速添加、分类、站点和书签状态文案                   |
| `tests/unit/browser-bookmarks.test.ts`                   | 根栏/文件夹解析断言                                  |
| `tests/unit/bookmark-import-groups.test.ts`              | 去重、根栏计数、分组和搜索                           |
| `tests/unit/common-sites.test.ts`                        | 26 个站点、分类、热门数量和双语标签                  |
| `tests/unit/folder-drop.test.ts`                         | 充能进度和量化                                       |
| `tests/unit/folder-stack-window.test.ts`                 | 完整行窗口和两端夹紧                                 |
| `README.md` / `README.en.md`                             | 用户功能介绍                                         |
| `docs/store-assets/description.txt`                      | 商店商品说明                                         |
| `docs/publishing/chrome-web-store.md`                    | 送审验证步骤                                         |
| `website/src/i18n/locales/{zh-CN,en}.ts`                 | 隐私政策的书签读取说明                               |

## 验证

- `npm run typecheck`
- `npm run lint`
- `npm run verify:architecture`
- `npm run test:unit`：321 项通过
- `npm run build`
- `python scripts/release/verify-packages.py`：本地 dirty ZIP 通过结构校验

本轮没有运行端到端测试，也没有打开浏览器验证视觉效果（仓库规则要求单独确认）。与本次交互直接相关的既有规范：

- `tests/e2e/folder-preview.spec.ts`：完整行数、只暴露 fitted 个链接、End 能看到最后一项、宽文件夹两列。
- `tests/e2e/folder-drop.spec.ts`：文件夹充能、拖拽悬停、源文件夹固定和释放。

## 已知限制

- 同一根栏下同名的不同文件夹仍会按标题路径合并；数据层保留了 `folderId`，未来需要严格区分时可改为 ID 分组。
- 同一 URL 出现在多个文件夹时只显示第一次出现；因此快捷添加的计数是去重后的数量，可能小于浏览器原始计数。
- 浏览器内部页（书签管理、历史记录、下载、扩展管理）不是 `bookmarks` 数据；若需要，应作为独立的系统快捷方式实现。
- 常用网站暂不做分页；书签也不做分页，靠筛选、搜索和窗口滚动。
- 本轮只在本地生成 dirty ZIP（`packages/` 被 Git 忽略）；上架前仍需要统一升版本号。
