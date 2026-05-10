# Classroom Caller

课堂呼叫与作业统计工具。支持通过 MQTT 向接收端发送语音呼叫消息、作业提交情况跟踪、课堂模式自动弹窗。

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

**多消息模板**（Admin 模式）
- 可在设置中管理多条消息模板
- 发送时通过下拉菜单选择模板
- 支持添加、编辑（点击文本）、删除模板

**发送者昵称**
- 在设置中配置昵称
- 接收端呼叫记录中会显示此昵称

**作业追踪**
- 在"作业"标签页中管理作业任务
- 与接收端实时同步（基于 MQTT）
- 支持锁定/解锁编辑避免误操作
- 数据保存在服务器

**权限体系**
- **Admin 模式**：PIN 验证后解锁（管理学生名单、修改消息模板）
- **Sudo 模式**：Sudo 密码验证后解锁（管理 PIN 码、拥有 Admin 全部权限）

### 接收端（Receiver）

**语音接收**
- 订阅班级频道，接收呼叫消息
- 全屏显示呼叫内容，支持 TTS 语音朗读
- 可配置语音、语速、音量、重复次数
- 浏览器首次使用需点击"启用语音"解锁 TTS

**呼叫老师（双向呼叫）**
- 接收端呼叫记录中可通过下拉菜单选择已连接的发送端
- 发送端收到呼叫时会播报语音（重复 3 次），如"王老师 呼叫了你"
- 双方均可配置昵称

**课堂模式（自动弹窗）**
当服务器配置了上课时间表时，接收端自动进入课堂模式：
- **上课时段**：呼叫以弹窗显示（5 秒自动消失），不播放语音
- **下课/休息时段**：正常播放语音和全屏显示
- Electron 桌面版弹窗窗口会置顶（always-on-top）
- 未配置时间表时：始终为正常语音模式

**作业追踪**
- 按周管理每日作业任务
- 学生作业状态：未交（红）→ 已交（绿）→ 请假（黄），点击切换
- "一键全交"快速标记全班已交
- 导出 Excel（.xlsx）、图片（.png）
- **高级导出**：支持选择学生、多日合并导出
- **未交列表**：按学生分组，列出未交作业的日期和任务名称
- **JSON 导入**：可导入备份数据（需 PIN 验证）
- 数据自动同步到服务器（同时本地 `D:\HWManagement\` 备份）

### 服务器（Server）

- 内置 MQTT Broker（Aedes），WebSocket 端口 8787
- REST API：学生名单、PIN 管理、Sudo 验证、作业数据、上课时间表
- **消息缓存**：自动缓存最近 5 条呼叫消息，接收端重连后自动拉取
- 数据持久化到 `server/data.json`（重启不丢失）

## 配置说明

### 设置 Sudo 密码（环境变量）

在启动服务器前设置环境变量 `SUDO_PASSWORD`：

```bash
# Windows CMD
set SUDO_PASSWORD=your_password_here
cd server && npm start

# PowerShell
$env:SUDO_PASSWORD="your_password_here"
cd server && npm start
```

不设置时默认密码为 `Yoshi1024`。

### PIN 管理

PIN 码通过发送端设置面板管理：

1. 点击发送端右上角齿轮图标打开设置
2. 输入 Sudo 密码验证
3. 验证后可以添加 / 删除 PIN 码

### 消息模板

模板变量：
- `{name}` — 被呼叫的学生姓名

示例：`请 {name} 同学到前台`

Admin 模式下可在设置面板管理多条模板（添加、编辑、删除）。

### 上课时间表（课堂模式）

在发送端 Sudo 模式下可直接导入文本格式的课表。

**文本文件格式**：每行一个时间段，`HH:MM-HH:MM`，忽略空格。

```
10:10-10:50
13:30-15:00
```

配置步骤：
1. 发送端右上角齿轮 → 输入 Sudo 密码验证
2. 在"课堂时间表"区域直接编辑或导入 `.txt` 文件
3. 点击"保存课表"即可下发到服务器

也可通过 API 直接配置：

```bash
curl -X POST http://localhost:8787/api/schedule/set \
  -H "Content-Type: application/json" \
  -d '{
    "class": "g8c",
    "sudo": "Yoshi1024",
    "schedule": [
      { "start": "08:00", "end": "09:30" }
    ]
  }'
```

配置后接收端自动显示当前状态（课堂中 / 休息中），无需手动切换。

### CSV 导入格式

学生名单支持 CSV 导入，格式示例：

```csv
姓名
张三
李四
王五
```

首行如包含"姓名"/"name"等关键字会自动跳过。

### JSON 数据导入

从旧版作业追踪器导出的备份文件（含 `homeworkData` 包装格式）可直接导入：

1. 进入作业追踪页面
2. 点击"导入数据"按钮
3. 选择备份 JSON 文件
4. 输入 PIN 验证（如已配置）
5. 数据会自动合并到当前作业数据中

导入文件格式示例：

```json
{
  "homeworkData": {
    "2026-05-08": {
      "tasks": [{ "id": 1, "name": "数学练习" }],
      "taskStatuses": { "1": { "0": "submitted" } },
      "todayTaskContent": "完成课本第45页"
    }
  }
}
```

### 跨设备使用

1. 在某台电脑启动服务器
2. 发送端 / 接收端输入服务器的 LAN IP 地址
3. 发送端会被服务器托管，直接通过 `http://服务器IP:8787` 访问

## 接收端打包为 .exe

```bash
cd receiver
npm run electron:package
```

生成 `receiver/dist/ClassroomReceiver.exe`（便携版，约 150 MB）。

国内加速下载 Electron 二进制：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm run electron:package
```

若生成安装包：

```bash
npm run electron:dist
```

## 技术栈

- **后端**：Node.js + Express + Aedes MQTT
- **前端**：React 18 + TypeScript + Vite
- **MQTT**：mqtt.js v5（WebSocket 连接）
- **桌面端**：Electron（接收端打包）
- **语音**：Web Speech API（浏览器内置）

## License

AGPL-3.0

(c) InklingYoshi584, 2026
