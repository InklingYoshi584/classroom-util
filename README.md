# Classroom Caller

课堂呼叫与作业统计工具。支持通过 MQTT 向接收端发送语音呼叫消息，以及作业提交情况跟踪。

## 项目结构

| 目录 | 说明 | 端口 |
|------|------|------|
| `server/` | MQTT 服务器 + API（生产环境托管发送端页面） | 8787 |
| `sender/` | 发送端（浏览器 SPA） | 5173 |
| `receiver/` | 接收端（浏览器 SPA / 可打包为 Windows .exe） | 5174 |

## 快速开始

### 环境要求

- Node.js 18+
- npm
- Windows 10/11（接收端打包为 .exe 需要 Windows）

### 安装

```bash
git clone https://github.com/InklingYoshi584/classroom-util.git
cd classroom-util
npm run install:all
```

### 开发模式

同时启动服务器、发送端、接收端（需要三个终端窗口或使用 concurrently）：

```bash
npm run dev
```

或分别启动：

```bash
# 终端 1 — 服务器
cd server && npm start

# 终端 2 — 发送端（浏览器访问 http://localhost:5173）
cd sender && npm run dev

# 终端 3 — 接收端（浏览器访问 http://localhost:5174）
cd receiver && npm run dev
```

### 生产部署

```bash
npm run build    # 构建发送端和接收端
npm run server   # 启动服务器（托管发送端页面）
```

服务器启动后会打印 LAN 地址，其他设备可通过该地址访问发送端。

## 功能介绍

### 发送端（Sender）

**学生呼叫**
- 输入班级 ID 连接 MQTT 频道
- 管理学生名单（手动添加、CSV 导入）
- 点击学生姓名发起呼叫，需要 PIN 验证
- 可自定义消息模板（变量：`{name}`）

**自定义消息**
- 手动输入任意消息发送到频道
- 同样需要 PIN 验证

**权限体系**
- **Admin 模式**：PIN 验证后解锁（管理学生名单、修改消息模板）
- **Sudo 模式**：Sudo 密码验证后解锁（管理 PIN 码、拥有 Admin 全部权限）
- 两种模式在刷新页面后自动退出

### 接收端（Receiver）

**语音接收**
- 订阅班级频道，接收呼叫消息
- 全屏显示呼叫内容，支持 TTS 语音朗读
- 可配置语音、语速、音量、重复次数
- 浏览器首次使用需点击"启用语音"解锁 TTS

**作业追踪**
- 按周管理每日作业任务
- 学生作业状态：未交（红）→ 已交（绿）→ 请假（黄），点击切换
- "一键全交"快速标记全班已交
- 导出 Excel（.xlsx）和图片（.png）
- 数据自动保存到 `D:\HWManagement\`

### 服务器（Server）

- 内置 MQTT Broker（Aedes），WebSocket 端口 8787
- REST API：学生名单增删查、PIN 管理、Sudo 验证
- 数据持久化到 `server/data.json`（重启不丢失）

## 接收端打包为 .exe

```bash
cd receiver
npm run electron:package
```

生成 `receiver/dist/ClassroomReceiver.exe`（约 144 MB 便携版）。

国内加速下载 Electron 二进制：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm run electron:package
```

若生成安装包而非便携版：

```bash
npm run electron:dist
```

## 配置说明

### 默认 PIN 管理

PIN 码通过发送端设置面板管理：

1. 点击发送端右上角齿轮图标打开设置
2. 输入 Sudo 密码（默认：`Yoshi1024`）验证
3. 验证后可以添加 / 删除 PIN 码

### 消息模板

模板变量：
- `{name}` — 被呼叫的学生姓名

示例：`请 {name} 同学到前台`

修改方式：
1. 进入 Admin 模式或 Sudo 模式
2. 在设置面板修改消息模板

### CSV 导入格式

学生名单支持 CSV 导入，格式示例：

```csv
姓名
张三
李四
王五
```

首行如包含"姓名"/"name"等关键字会自动跳过。

### 跨设备使用

1. 在某台电脑启动服务器
2. 发送端 / 接收端输入服务器的 LAN IP 地址
3. 发送端会被服务器托管，直接通过 `http://服务器IP:8787` 访问

## 技术栈

- **后端**：Node.js + Express + Aedes MQTT
- **前端**：React 18 + TypeScript + Vite
- **MQTT**：mqtt.js v5（WebSocket 连接）
- **桌面端**：Electron（接收端打包）
- **语音**：Web Speech API（浏览器内置）

## License

MIT
