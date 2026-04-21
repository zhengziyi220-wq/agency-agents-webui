# agency-agents WebUI

AI智能体管理面板 - 支持多工具分区管理、一键安装、人设切换、工具控制

## 功能特性

- 🎯 **多工具分区管理** - 支持Hermes、OpenClaw、Claude Code、Cursor等12种AI工具
- ⚡ **一键安装** - 自动处理各工具差异化安装逻辑
- 🔄 **人设切换** - 实时切换AI智能体，支持即时生效/重启生效
- 📊 **状态监控** - 实时监控工具运行状态（CPU、内存、进程）
- 🌐 **外网访问** - 支持局域网/公网访问，无需认证
- 📝 **日志管理** - 查看启动日志、安装日志，错误高亮
- ⬆️ **检测更新** - 自动检测仓库更新，一键更新智能体

## 支持的AI工具

| 工具 | 类型 | 安装方式 | Web界面 |
|------|------|----------|---------|
| Hermes Agent | 全局 | 分类批量 | ❌ |
| OpenClaw | 全局 | 两步安装 | ✅ |
| Claude Code | 全局 | 直接复制 | ❌ |
| Cursor | 项目级 | 转换安装 | ❌ |
| GitHub Copilot | 全局 | 直接复制 | ❌ |
| Aider | 项目级 | 单文件 | ❌ |
| Windsurf | 项目级 | 单文件 | ❌ |
| Gemini CLI | 全局 | 扩展安装 | ❌ |
| Codex CLI | 项目级 | 转换安装 | ❌ |
| Kiro (Amazon) | 全局 | 转换安装 | ❌ |
| WorkBuddy (腾讯) | 全局 | 转换安装 | ❌ |

## 快速安装

### 1. 克隆仓库

```bash
# 克隆 agency-agents-zh（如果还没有）
git clone https://github.com/jnMetaCode/agency-agents-zh.git

# 克隆本项目
git clone https://github.com/zhengziyi220-wq/agency-agents-webui.git
cd agency-agents-webui
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

### 3. 启动服务

```bash
python server.py
```

### 4. 访问界面

- 本机访问: http://localhost:8888
- 局域网访问: http://你的IP:8888
- 公网访问: http://公网IP:8888（需开端口）

## 使用说明

### 工具分区管理

1. 左侧边栏显示所有支持的AI工具
2. 点击工具卡片选择当前分区
3. 每个工具显示：名称、状态、已安装智能体数量

### 一键安装

1. 选择要安装的工具
2. 点击"安装"按钮
3. 自动执行该工具的安装流程
4. 查看安装进度和日志

### 人设切换

1. 在智能体列表中找到要激活的人设
2. 点击"激活"按钮
3. 根据工具类型：
   - 文件类工具：立即生效
   - 重启类工具：提示重启
   - 指令类工具：显示激活指令

### 工具控制

1. 点击工具卡片上的控制按钮：
   - 启动：启动工具进程
   - 停止：停止工具进程
   - 重启：重启工具进程
   - 打开：打开工具Web界面（支持的工具）
   - 日志：查看启动日志

### 检测更新

1. 点击顶部"检查更新"按钮
2. 查看是否有新版本
3. 点击"一键更新"拉取最新智能体

## 配置说明

### tool_configs.json

定义各AI工具的安装配置，包括：
- 安装命令
- 技能路径
- 激活方式
- 进程管理命令
- Web界面地址

### 数据目录

- `data/active_agents.json` - 当前激活的人设记录
- `data/install_history.json` - 安装历史记录
- `data/update_history.json` - 更新历史记录

### 日志目录

- `logs/{tool_name}/` - 各工具启动日志
- `logs/install/` - 安装日志
- `logs/update/` - 更新日志

## API接口

### 工具管理
- `GET /api/tools` - 获取所有工具状态
- `POST /api/install/{tool_name}` - 一键安装工具
- `GET /api/install/status/{task_id}` - 获取安装状态

### 工具控制
- `POST /api/tool/{tool_name}/start` - 启动工具
- `POST /api/tool/{tool_name}/stop` - 停止工具
- `POST /api/tool/{tool_name}/restart` - 重启工具

### 智能体管理
- `GET /api/agents` - 获取所有智能体
- `GET /api/active-agents` - 获取激活状态
- `POST /api/active-agents/{tool_name}/{agent_name}` - 设置激活人设

### 更新管理
- `GET /api/update/check` - 检查更新
- `POST /api/update/execute` - 执行更新
- `GET /api/update/status` - 获取更新状态

### 日志管理
- `GET /api/logs/{tool_name}` - 获取工具日志

## 目录结构

```
agency-agents-webui/
├── server.py                  # FastAPI后端服务
├── tool_configs.json          # 工具配置文件
├── requirements.txt           # Python依赖
├── static/
│   ├── index.html             # 主界面
│   ├── style.css              # 样式文件
│   └── app.js                 # 前端逻辑
├── logs/                      # 日志目录
│   ├── hermes/
│   ├── openclaw/
│   ├── install/
│   └── update/
├── data/                      # 数据目录
│   ├── active_agents.json
│   ├── install_history.json
│   └── update_history.json
└── README.md                  # 本文件
```

## 外网访问

### 局域网访问

服务默认绑定 `0.0.0.0:8888`，局域网内其他设备可通过 `http://你的IP:8888` 访问。

### 公网访问

1. 确保服务器有公网IP
2. 开放8888端口（或配置的端口）
3. 配置防火墙规则

```bash
# Ubuntu/Debian
sudo ufw allow 8888

# CentOS
sudo firewall-cmd --permanent --add-port=8888/tcp
sudo firewall-cmd --reload
```

### 修改端口

编辑 `server.py` 最后一行：

```python
uvicorn.run(app, host="0.0.0.0", port=9999)  # 修改为9999端口
```

## 常见问题

### Q: 安装失败怎么办？

A: 查看安装日志，检查：
- agency-agents-zh仓库是否存在
- 依赖是否安装完整
- 权限是否足够

### Q: 工具启动失败怎么办？

A: 点击"日志"按钮查看启动日志，常见原因：
- 端口被占用
- 配置文件错误
- 依赖缺失

### Q: Hermes安装为什么要分批？

A: Hermes的Discord集成会把每个skill注册为斜杠命令，Discord API有8000字符限制。分批安装可避免超限。

### Q: 如何更新智能体？

A: 点击顶部"检查更新"按钮，有新版本时点击"一键更新"即可。

## 开发说明

### 添加新工具

1. 编辑 `tool_configs.json`，添加工具配置
2. 在 `server.py` 中添加对应的检测逻辑
3. 刷新界面即可看到新工具

### 自定义样式

编辑 `static/style.css`，支持的变量：
- `--primary`: 主题色
- `--success`: 成功色
- `--warning`: 警告色
- `--danger`: 危险色
- `--bg`: 背景色

## 许可证

MIT License

## 开机自启动

### 安装systemd服务

```bash
# 复制服务文件
sudo cp agency-agents-webui.service /etc/systemd/system/

# 重新加载配置
sudo systemctl daemon-reload

# 启用开机自启
sudo systemctl enable agency-agents-webui

# 启动服务
sudo systemctl start agency-agents-webui
```

### 管理服务

```bash
# 查看状态
sudo systemctl status agency-agents-webui

# 停止服务
sudo systemctl stop agency-agents-webui

# 重启服务
sudo systemctl restart agency-agents-webui

# 查看日志
sudo journalctl -u agency-agents-webui -f
```

## 致谢

- [agency-agents-zh](https://github.com/jnMetaCode/agency-agents-zh) - AI智能体专家团队
- [FastAPI](https://fastapi.tiangolo.com/) - Python Web框架