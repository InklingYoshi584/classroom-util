# Changelog


## v1.5.1 (2026-06-24)

### 🔧 修复

- **Electron 作业窗口无法打开**：添加 `createHomeworkWindow` 及 IPC handler，preload 暴露 `openHomeworkWindow`/`closeHomeworkWindow`/`onHomeworkWindowClosed`，修复所有导向另一个 HTML 文件的弹窗在 Electron 中无法显示的问题。（[#16](https://github.com/InklingYoshi584/classroom-util/issues/16)）
- **作业统计日期错误**：`getWeekDates` 从 `toISOString()`（UTC）改为本地日期格式化，修复时区导致的「周日到周四」显示问题。（[#14](https://github.com/InklingYoshi584/classroom-util/issues/14)）

### ✨ 改进

- **星期筛选器**：作业追踪页面新增星期筛选 chips（默认周一至周五），可自由勾选显示的工作日。数据始终全量保存，筛选仅影响客户端显示与导航。（[#14](https://github.com/InklingYoshi584/classroom-util/issues/14)）

## v1.5.0 (2026-06-23)

### 🎉 新功能

- **自定义消息重构**：统一发送流程，移除「学生呼叫」tab，所有发送统一到自定义消息。支持在消息中插入学生姓名，发送时姓名已真实填入无需再次选择。
- **拼音搜索**：学生姓名搜索支持中文、拼音全拼、拼音首字母匹配（使用 `pinyin-pro`）。
- **消息模板系统**：支持保存/复用自定义消息模板。模板中的学生姓名自动替换为 `{name}` 占位符，点击含占位符的模板时自动弹出学生选择器。
- **学生管理移入设置**：学生增删改查、CSV 导入功能移至设置面板（需 Admin/Sudo 认证后可见）。

### ✨ 改进

- **发送端 UI 简化**：设置改为 overlay 面板（点击⚙️弹出），冷启动时弹出连接对话框。
- **接收端 UI 简化**：移除 tab 栏，设置改为 overlay 面板，冷启动时弹出连接对话框。
- **无障碍**：发送端按钮添加 `aria-label`，tab 按钮添加 `cursor:pointer`。
- **CSS 变量统一**：所有硬编码颜色替换为 CSS 变量，圆角尺寸统一使用 `--radius`，z-index 使用分层变量。
- **页面高度策略统一**：接收端使用 `min-height` 代替 `height + overflow:hidden`。
- **倒计时优化**：环和文字使用 `vmin` 随视口缩放，模式按钮字体大小和 padding 恢复。

### 🔧 修复

- **作业页面缺少 CSS**：修复 borders 和 CSS 变量缺失问题。
- **发送端 overlay 点击连接后立即关闭**：不再等待 MQTT 连接完成。
- **接收端作业可新窗口打开**。
- **倒计时双 interval 问题**：修复 `startCountdown()` 未保护导致的双 interval bug。
- **CSS Grid height 在 Electron 窗口不可靠**：改用 flexbox。
- **倒计时时钟和模式选择器在运行中可见**。

### 🗑️ 移除

- 接收端「呼叫老师」功能已隐藏。

---

## 构建信息

- **Electron**: v33.4.11
- **Vite**: v5.4.21
- **React**: v18.3.1
