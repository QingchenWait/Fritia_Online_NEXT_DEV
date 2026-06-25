# 芙提雅 ONLINE NEXT — 移动端横屏 UI 设计文档

更新时间：2026-06-25

本文是「移动端横屏专用交互逻辑」的设计事实源。**接手相关功能、或要为新浮层补横屏适配时，先读本文，再动样式。**

本系统与桌面端 / 移动端竖屏完全解耦：它是一套**独立、可一键移除**的样式层，只在「触屏设备 + 横屏」时叠加生效，其余情况零影响。设计语言 / 令牌 / 组件仍沿用 `UI_STYLE.md`，本文只讲**横屏下如何重排尺寸与位置**。

---

## 1. 总体思路

### 1.1 为什么需要它
- 所有悬浮窗口（otome 浮层 + 战术考核 HUD）的标题栏/底栏在桌面尺度下很高；移动端原本**没有针对横屏的缩放/重排机制**。
- 在 17:9 以上比例的横屏手机上，浮层内容被挤成很窄一条，几乎无法操作。
- 战术考核（卡牌模式）底部按钮用 `left: calc(50% ± 478px)` 这类**中心偏移**绝对定位，窄屏手机上会被推到屏幕外 → 「奇奇怪怪的布局」。

### 1.2 两个文件 = 一套闭环
| 文件 | 职责 |
| --- | --- |
| `js/mobile_landscape.js` | 唯一检测入口。判定「触屏 + 横屏」后给 `<html>` 挂 class，并把真实视口尺寸写入 CSS 变量。**只切 class / 写变量，不直接改任何布局。** |
| `css/mobile_landscape.css` | 全部横屏布局。**每条规则**都以 `html.ml-active` 开头，最后 link 加载。 |

> 一键还原：删掉 `index.html` 里这两行引用即可。任何现有 CSS/JS 的布局逻辑都未被改写（唯一例外见 §4 战术考核人物贴图）。

### 1.3 根 class 契约（JS ↔ CSS 的唯一接口）
`js/mobile_landscape.js` 在 `<html>` 上维护：

| class | 含义 | 触发条件 |
| --- | --- | --- |
| `ml-active` | 移动端横屏模式开启 | 触屏设备（`(pointer: coarse)` 或 touch+移动 UA）**且**横屏 |
| `ml-short` | 矮屏，进一步压缩 | `ml-active` 且视口高度 ≤ 400px |
| `ml-ultrawide` | 超宽（≈19:9 以上） | `ml-active` 且宽高比 ≥ 2.1 |

并写入 CSS 变量（解决移动浏览器 100vh 抖动）：`--ml-h` / `--ml-w`（真实视口 px）、`--ml-vh` / `--ml-vw`（1% px）。
切换时派发 `window` 事件 `ml-mode-changed { active }`。对外只读接口 `window.FritiaMobileLandscape.isActive()`。

### 1.4 调试开关（桌面对照测试用）
- URL 参数 `?ml=1` 强制开启 / `?ml=0` 强制关闭；
- `localStorage.fritia_force_ml` = `'1'`/`'0'` 同义（优先级低于 URL）。

### 1.5 令牌（仅 ml-active 作用域）
| 令牌 | 公式 | 用途 |
| --- | --- | --- |
| `--ml-panel-h` | `calc(var(--ml-h) - 10px)` | 浮层最大高度（真实视口高度减小边距） |
| `--ml-safe-*` | `env(safe-area-inset-*)` | 刘海/挖孔屏安全区 |

> 浮层内的尺寸基本用固定值 + `calc(var(--ml-h) - Npx)` 直接随高约束（如各列表 `max-height`），不再引入额外缩放变量，便于阅读与维护。战术考核**不引入本系统的缩放变量**——其缩放完全由既有 `--side-combat-ui-scale`（responsive.css）负责。

### 1.6 特异性策略
- 每条规则 `html.ml-active …` 比对应原规则多 1 个 class（`.ml-active`）的特异性；文件最后加载，平手时凭加载顺序取胜；
- 战术考核只做"尺寸微调"，定位不碰；既有 `--side-combat-ui-scale` 是 JS 内联变量，本系统不依赖它、也不覆盖它。

---

## 2. 浮层骨架通用压缩（§1，所有 `.otome-panel` 共用）

目标：把标题栏从 ~96px 压到 ~52px，底栏/内边距同步收紧，让正文在矮横屏里仍有可用高度。

| 元素 | 桌面 | 横屏（`ml-active`） | 矮屏附加（`ml-short`） |
| --- | --- | --- | --- |
| `.ui-overlay` 内边距 | 24px | 6px | — |
| `.otome-panel` 限高 | `min(86vh,880px)` | `--ml-panel-h` | — |
| 角标 `::before/::after` | 58px | 32px | — |
| `.otome-panel__head` 内边距 | `22px 28px` | `8px 16px` | `6px 14px` |
| `.otome-panel__icon` | 52px | 38px | 32px |
| `.otome-panel__title` | `--fs-xl`(1.6rem) | 1.12rem | 1rem |
| `.otome-panel__sub` | 0.8rem，多行 | 0.72rem，限 2 行 | 隐藏 |
| `.otome-panel__kicker` | 0.72rem | 0.6rem | 隐藏 |
| `.otome-panel__close` | 38px | 34px | — |
| `.otome-panel__body`（非 flush） | 28px | `12px 16px` | — |
| `.otome-panel__foot` | `16px 28px` | `8px 16px` | — |
| `.btn` 最小高 | — | 40px | 36px |

约束：
- **flush 主体**（`.otome-panel__body--flush`，自管滚动：settings/roundtable/bartending/history/date）**不套通用内边距**，改由 §3.2 各自处理。
- **输入框字号保持 ≥16px**（防 iOS 自动放大），只压高度/内边距，不压字号。

---

## 3. 逐窗口专属布局（§2 + §3，具体问题具体分析）

### 3.1 普通 otome 浮层

| 浮层 | 关键调整 |
| --- | --- |
| `#model-selector` 换装 | 宽 `min(560px,92vw)`；列表 gap 收紧。 |
| `#settings-panel` 系统设置 | 侧栏 150→112px、nav-item 64→46px；view-head 内边距压缩；保证底栏「保存」可见。知识库见「知识库专项」、更多资源见「更多资源专项」。 |
| `#roundtable-whispers-panel` 圆桌密语 | 见下「圆桌密语专项」。 |
| `#bartending-challenge-panel` 调酒挑战 | 见下「调酒挑战专项（完全重制）」。 |
| `#bar-guest-panel` 邀请角色（发起邀请） | 见下「发起邀请专项」。 |
| `#dream-terminal-panel` 造梦终端 | 愿望/锻造双栏；描述 textarea `min-height` 随高 clamp。 |
| `#dream-furniture-editor-panel` / `#dream-placement-editor-panel` | 样式/位置 textarea `min-height` 随高 clamp。 |
| `#history-panel` 历史 | tab 工具条内边距压缩。 |
| `#date-panel` 约会 | 地点网格内边距/gap 压缩；聊天区/输入行压缩。 |
| `#gift-terminal-panel` / `#gift-collection-panel` | 描述 textarea 随高 clamp；收藏列表 gap 收紧。 |
| `#achievements-panel` 成就 | 网格 minmax 280→220px、卡片 min-height 140→112px。 |
| `#dance-panel` 舞曲 | 宽 `min(880px,96vw)`；**左栏底部说明文字 `#dance-status` 用 `order:-1` + `grid-column:1/-1` 提到顶部整行显示**；舞台卡去掉固定 min-height/跨行。 |

#### 圆桌密语专项
- **设置步**（`#roundtable-step-setup`）：保留副标题与底栏；邀请/规则双栏保留；中间 `#roundtable-participant-list` 加 `max-height`（随高）+ **自绘滚动条**（`scrollbar-width:thin` + `::-webkit-scrollbar` 玫瑰金渐变 thumb）。
- **群聊步**（`#roundtable-step-chat`，JS 给面板加 `.ml-rt-chat`）：
  1. 输入栏 `#roundtable-input` 压成**一行**（`height:40px; resize:none`），与 `#roundtable-send` 同行；
  2. **取消底栏** `.roundtable-foot`（`display:none`，回收高度）；
  3. 「圆桌密语进行中」状态 `#roundtable-chat-status` 由 JS **搬到标题区**当副标题（同时隐藏原副标题）；
  4. 底栏右下的时间/电量/警告 `.roundtable-foot-timebar`（含错误浮窗）由 JS **搬到左栏**（`.roundtable-roster`）的 `+/-/返回` 按钮组下方。
  - 搬移与还原逻辑在 `js/mobile_landscape.js`（见 §4），退出群聊或关闭横屏模式时原样还原。

#### 调酒挑战专项（双栏 + 收紧）
目标是**调酒区(左) + 结果区(右) 左右双栏**（如桌面/图1），但更紧凑：
- `.bartending-grid` 强制 `display:grid` + `grid-template-columns: minmax(0,1.32fr) minmax(0,1fr)`——**覆盖 `@media(max-width:980px)` 把它改成 `display:flex` 单列的规则**（否则窄横屏会变上下堆叠）；
- **HP 与 ROUND 同一行**：`.bartending-status-deck` 强制 `grid-template-columns: minmax(0,1fr) auto`（覆盖 ≤980 单列堆叠）；
- `.bartending-mixer-panel` `repeat(3,1fr)` 三栏材料；`.bartending-ingredient-list` 强制 `display:flex;flex-direction:column`（覆盖 ≤980 的 2 列网格）+ `max-height` 随高 + **自绘滚动条**；
- **隐藏材料类型标签** `.bartending-ingredient small`（「标准材料/异常材料」）；
- **材料按钮高度 ≈ 文字行高的 1.3 倍**（原 `min-height:56px` 含两行；去标签后只剩单行名称）：关键是 `.bartending-ingredient { flex: 0 0 auto; min-height:0; padding:2px 11px; line-height:1.3 }`——**`flex:0 0 auto` 必不可少**，否则列表过长时按钮被 column-flex 压扁（padding 失效、塌成 ~17px）；想再高/再矮就调这里的 `padding`；
- 状态台/HP 台/结果区 padding、`otome-section-label` 行距全部收紧。

#### 发起邀请专项
- 右栏**删除顶部 PMX 预览方框** `.bar-guest-preview`（`display:none`），`.bar-guest-preview-wrap` 改单列，只保留「新角色配置」标题；说明 `.bar-guest-copy` 压成**一行**；
- **候选角色** `.bar-guest-card` 缩矮（`padding:8px 11px; min-height:0`），左栏 `.bar-guest-card-list` 加 `max-height` + **自绘滚动条**（候选很多时可滚）；
- **取消** `#bar-guest-status` 说明条（`display:none`，即「XX 已选中，可直接邀请入场」）；
- 整体更紧凑：`otome-section-label`/`otome-field-label` 行距收紧、`#bar-guest-name` 与文件卡更矮、底栏按钮 `min-height:38px`。

#### 系统设置 · 知识库专项
- **症结**：桌面用 `.knowledge-workbench → .kb-main → .kb-detail → .kb-management-grid → .kb-*-panel` 一条 `flex:1 + overflow:hidden` 的层层裁剪链；短横屏下 head/上传台占满高度，把 management-grid 裁成 0，只剩 FILES/CHUNKS 标题、看不到文件名/删除键/分块内容。
- **修法**：固定 `.knowledge-workbench` 高度 `calc(var(--ml-h)-150px)`；右栏详情链改成"自然高度 + 整体滚动"——`.kb-main { display:block; overflow-y:auto }`、`.kb-detail / .kb-management-grid { display:block 或 flex:none; overflow:visible }`、`.kb-*-panel { overflow:visible }`；FILES/CHUNKS 列表 `#kb-file-list`/`#kb-chunk-list` 各自 `max-height + overflow-y:auto`。
- **三处独立自绘滚动条**：左栏 `.kb-list`（flex:1）、右栏 `.kb-main`、以及详情内 `#kb-file-list` / `#kb-chunk-list`，都挂玫瑰金渐变 `::-webkit-scrollbar`。
- **底栏压到 ~70%**：`.settings-foot` padding `5px 16px`、右下角按钮 `min-height:30px` 且收紧上下 padding（实测 foot ~42px / 按钮 ~31px）。

#### 系统设置 · 更多资源（INFO）专项
- **目标**：桌面是「LOGO + 标题 + 副标题 + 制作信息 + 4 个资源按钮」**居中单列**；横屏改成**左右两栏**——左栏 = LOGO + 标题（截图蓝框那块，适当缩小），右栏 = 副标题 + 制作信息 + 4 个资源按钮（**2×2**）。
- **症结**：5 个元素是 `.settings-resources-page` 的同级子节点（DOM 顺序：logo→标题→副标题→about→links），**不能加包裹层**（会改桌面 DOM）。CSS 网格的行高是跨列共享的，若简单按列摆放，LOGO 的高度会把右栏第一项往下顶出大片空隙。
- **修法**：把 `.settings-resources-page` 由「居中单列 grid」改成 **2 列网格** `minmax(0,0.82fr) minmax(0,1.18fr)`，对 5 个子节点**显式定位**：
  - 左栏：`.settings-resources-logo-wrap` 占 **`grid-row: 1 / 3`** 且 `align-self: end`（底部贴住标题），宽度 `clamp(96px, var(--ml-h)*0.30, 140px)`（随高缩放，比桌面 188/150 小）；`.settings-resources-title` 占 `grid-row: 3`、`align-self: start`——于是 LOGO 底缘与标题顶缘相邻，**无论制作信息多长都不脱节**。
  - 右栏：`.settings-resources-subtitle`(row1) / `#settings-about-text`(row2) / `.settings-resource-links`(row3) 各占一行，**行高由各自内容决定**，紧凑堆叠、不受 LOGO 高度影响。
  - 4 个按钮：`.settings-resource-links` 强制 `display:grid; grid-template-columns:1fr 1fr`（覆盖桌面/≤980 的 flex-wrap），即 **2×2**；按钮 `flex:none; min-height:34px`。
- **想调比例/大小**：改 `grid-template-columns` 的两个 fr（左右栏宽比）、LOGO 的 `clamp(...)`（左栏图大小）、标题 `font-size`、按钮 `gap`。只动本段，不影响桌面/竖屏。

#### 造梦终端专项
- 左右双栏整体压缩、保证全部内容在窗口内可见（`.otome-panel__body` 仍可滚作兜底）：
  - 左栏家具愿望 `#dream-furniture-description` 用 **`flex:none` + 固定 `height: clamp(70px, var(--ml-h)-360px, 150px)`**——覆盖既有 `flex:1` 撑满整列的行为（否则文本框会占掉半屏）；
  - 右栏"打造参数"：`.dream-compose` 间距、`otome-field-label` 行距、`#dream-placement-input` 高度、`.dream-forge-card` padding、进度条间距全部收紧。

| `#dialogue-box` 场景对话（高频） | 内边距压缩；正文区 `max-height` 30vh（矮屏 26vh）；输入行压矮。 |

### 3.2 战术考核 `#side-scroller-adventure`（§3）

> **背景**：战术考核整体骨架（顶栏/路线/生命 HUD/敌方/侧边钮/弹窗）沿用既有 `css/responsive.css` 三层方案
> （`@media(max-height:540px)` 固定块 + `.is-side-combat-compact-wide` 线性缩放 + `.is-side-combat-extreme-wide` 生命 HUD 居中）。
> 本系统**只接管两处**，其余一律不碰（更不碰 Canvas 人物——早期改人物缩放导致占满屏，已彻底回退，`side_scroller_*.js` 与本系统无关）。
>
> ⚠️ 历史教训：不要在本系统里**整体重排**战术考核定位（会与三层方案叠加打架）。只允许像下面这样**精准接管个别控件**。

**(a) 手牌两侧 4 个控件贴到卡牌旁**（核心修复）：既有方案用 `left:calc(50% ± 340/396px)` 等中心偏移定位牌库/刷新/弃牌/出牌数，在宽横屏上离卡牌太远、离角落按钮太近。改为**锚定到手牌左右边缘**：
- 本系统接管手牌宽度 `--ml-hand-w: min(660px, calc(100vw - 300px))`（两侧各留 ~150px）、`min-width:0`；
- 左簇（刷新下/牌库上）`right: calc(50% + var(--ml-hand-w)/2 + 8px)`；右簇（弃牌下/出牌数上）`left: calc(50% + var(--ml-hand-w)/2 + 8px)`——即**贴着卡牌外缘 8px**；
- 两簇竖向抬到 `bottom: 74px / 128px`，**位于底部角按钮（信息/结束回合，bottom≈16px）之上**，故即使水平接近也不相撞；
- 窄屏/超宽（`ml-short`/`ml-ultrawide`）把 `--ml-hand-w` 收到 `min(600px,100vw-280px)`、夹层钮 46→**42px**、下沿 74→66px，**杜绝超出卡片或撞到角按钮**。

**(b) 卡牌大小与字号（多轮迭代后定稿，约为"放大版"的 70%）**：
- 手牌宽度 `--ml-hand-w: min(470px, 100vw-300px)`（窄屏 `min(430px,100vw-280px)`）；卡牌宽 `clamp(80px, (var(--ml-hand-w)-30px)/4, 124px)`、高 `×1.26`——宽屏下约 **119×146**；缩小手牌宽度的同时夹层控件仍贴着卡牌外缘 8px。
- **卡牌字号用 §0 的 CSS 变量，手牌与"拖动幽灵"各一套、互相独立**：
  - 手牌：`--ml-card-title-fs`(0.69rem) / `--ml-card-desc-fs`(0.62rem) / `--ml-card-top-fs`(0.56rem) / `--ml-card-value-fs`(0.82rem)
  - 拖动幽灵：`--ml-ghost-title-fs` / `--ml-ghost-desc-fs` / `--ml-ghost-top-fs` / `--ml-ghost-value-fs`（默认与手牌相同值）
  - 两套默认相同，所以现在看不出差别；要单独调"手牌数值"改 `--ml-card-value-fs`，要单独调"拖动中卡片数值"改 `--ml-ghost-value-fs`，互不影响。
- **拖动幽灵 `.side-combat-card.is-drag-ghost`**：JS 把卡牌 `cloneNode` 到 `<body>`（不在 `#side-scroller-adventure` 内），故必须用**不带 `#side-scroller-adventure` 前缀**的 `html.ml-active .side-combat-card.is-drag-ghost …` 规则、引用 `--ml-ghost-*-fs` + 相同 padding——否则拖动瞬间字号会回落到桌面大字号"突然变大"。
- 调整大小只需改 `--ml-hand-w`（卡牌与两侧控件一起缩放）；字号改对应变量。

其余仅尺寸略增（不动定位）：信息/侧边/技能钮 48–50px、结束回合 min-height 50px、路线/生命数字、开局弹窗字体/按钮。

> 经验：要动战术考核定位时，**像 (a) 那样精准锚定到某个参照（手牌边缘）并把竖向错开角按钮**，配窄屏兜底缩小；不要整体平移所有控件。

---

## 4. 系统内的 JS（除检测外）：圆桌密语群聊 DOM 搬移

CSS 无法把节点重新挂载到另一个父级，故圆桌密语群聊步的两处搬移由 `js/mobile_landscape.js` 完成（仅 `ml-active` + 群聊步生效，退出即原样还原）：

1. `#roundtable-chat-status`（"圆桌密语进行中"）→ 搬入 `.otome-panel__titles` 当副标题；
2. `.roundtable-foot-timebar`（时间/电量/警告）+ `#roundtable-bug-popover` → 搬入 `.roundtable-roster`（`+/-/返回` 下方）；
3. 给 `#roundtable-whispers-panel` 加 `.ml-rt-chat`，CSS 据此隐藏底栏、让位副标题。

实现要点：搬移前记录每个节点的 `{parent, nextSibling}`，还原时逆序 `insertBefore` 放回；用 `MutationObserver` 监听 `#roundtable-step-chat` 与面板的 class 变化（设置↔群聊切换不一定伴随 resize）。

> **战术考核不再改任何 JS**——早期为人物贴图加的 `drawFritia()`/`isCompactCombatViewport()` 分支**已回退**，`js/side_scroller_adventure.js` 与本系统无关。

---

## 5. 保持不变
- 三处保留区域 `#top-bar` / `#game-status` / `#dream-object-controls` 不接管。
- 既有竖屏拦截 `#side-scroller-orientation-blocker`（`isMobilePortraitViewport()`）保留：竖屏仍提示「请切换横屏」。
- 现有 `responsive.css` / `panels.css` / 各浮层 id 与 JS 生成 class 均未改写。

---

## 6. 测试与扩展

### 测试
1. 桌面 Chrome → DevTools 设备模拟选横屏手机（如 915×412、19.5:9），或加 `?ml=1` 强制开启；
2. 逐一打开各浮层：标题栏/底栏变矮、内容完整、按钮可点、底栏主操作可见；
3. 战术考核：整体仍是既有横屏布局（手牌居中、人物居中、敌方在右），但**手牌两侧 4 控件（牌库/刷新/弃牌/出牌数）紧贴卡牌左右、夹在卡牌与角落按钮之间且互不重叠**，卡牌更大、标题/描述更小而底部数值不缩小；在 1000/1280 等宽度下用静态 harness 量过四角无重叠；开局弹窗「提交」可见；旋转回竖屏触发原拦截卡且 `ml-active` 移除。**若 4 控件离卡牌太远或撞角按钮，调 `--ml-hand-w` / `--ml-fbtn` / `--ml-fbtn-b1`，不要整体平移**；
4. `?ml=0` 与桌面宽高比对照：浮层与战术考核外观应与现状**完全一致**（无回归）；
5. 真机（Android WebView APP / 手机浏览器）横屏抽测。

### 给新浮层补横屏适配
1. 新浮层若复用 `.otome-panel` 骨架，§1 通用压缩**自动生效**，通常无需额外工作；
2. 仅当其正文有特殊网格/列表/`--flush` 自管滚动时，在 `css/mobile_landscape.css` §2 追加 `html.ml-active #新浮层id …` 一段；
3. 切忌在其它 CSS 文件写横屏规则——所有横屏逻辑必须留在本系统内，保持「一键移除」。
