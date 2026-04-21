#!/usr/bin/env python3
"""
agency-agents WebUI - AI智能体管理面板
支持多工具分区管理、一键安装、人设切换、工具控制
"""

import os
import json
import subprocess
import asyncio
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict, List, Any
from contextlib import asynccontextmanager

import psutil
import git
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# 配置
BASE_DIR = Path(__file__).parent
REPO_PATH = BASE_DIR.parent / "agency-agents-zh"
CONFIG_PATH = BASE_DIR / "tool_configs.json"
DATA_DIR = BASE_DIR / "data"
LOGS_DIR = BASE_DIR / "logs"
ACTIVE_AGENTS_FILE = DATA_DIR / "active_agents.json"
INSTALL_HISTORY_FILE = DATA_DIR / "install_history.json"
UPDATE_HISTORY_FILE = DATA_DIR / "update_history.json"

# 确保目录存在
DATA_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# 全局状态
install_tasks: Dict[str, Dict] = {}
update_task: Optional[Dict] = None


class ToolConfig(BaseModel):
    name: str
    description: str
    install_type: str
    install_cmd: str
    skills_path: str
    active_config: Optional[str] = None
    active_type: Optional[str] = None
    instruction: Optional[str] = None
    restart_required: bool = False
    has_web: bool = False
    discord_limit: bool = False
    process_name: str
    categories: Optional[List[str]] = None
    web_url: Optional[str] = None
    start_cmd: Optional[str] = None
    stop_cmd: Optional[str] = None
    restart_cmd: Optional[str] = None
    log_path: Optional[str] = None


def load_tool_configs() -> Dict[str, ToolConfig]:
    """加载工具配置"""
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return {k: ToolConfig(**v) for k, v in data.items()}


def load_json_file(filepath: Path, default: Any = None) -> Any:
    """加载JSON文件"""
    if filepath.exists():
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    return default or {}


def save_json_file(filepath: Path, data: Any):
    """保存JSON文件"""
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def expand_path(path: str) -> Path:
    """展开路径中的~"""
    return Path(os.path.expanduser(path))


def check_tool_installed(tool_name: str, config: ToolConfig) -> Dict:
    """检查工具是否已安装"""
    result = {
        "installed": False,
        "path": None,
        "agent_count": 0,
        "agents": []
    }
    
    skills_path = expand_path(config.skills_path)
    if skills_path.exists():
        result["installed"] = True
        result["path"] = str(skills_path)
        
        # 统计已安装的智能体
        if skills_path.is_dir():
            for item in skills_path.iterdir():
                if item.is_file() and item.suffix in ['.md', '.mdc']:
                    result["agents"].append(item.stem)
                elif item.is_dir() and not item.name.startswith('.'):
                    # 检查目录下的SKILL.md或SOUL.md
                    for sub in item.iterdir():
                        if sub.name in ['SKILL.md', 'SOUL.md', 'AGENTS.md']:
                            result["agents"].append(item.name)
                            break
        
        result["agent_count"] = len(result["agents"])
    
    return result


def check_process_running(process_name: str) -> Dict:
    """检查进程是否运行"""
    result = {
        "running": False,
        "pid": None,
        "cpu_percent": 0,
        "memory_mb": 0
    }
    
    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            cmdline = ' '.join(proc.info['cmdline'] or [])
            if process_name.lower() in cmdline.lower() or process_name.lower() in (proc.info['name'] or '').lower():
                result["running"] = True
                result["pid"] = proc.info['pid']
                result["cpu_percent"] = proc.cpu_percent()
                result["memory_mb"] = round(proc.memory_info().rss / 1024 / 1024, 1)
                break
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    
    return result


def check_repo_update() -> Dict:
    """检查仓库更新"""
    result = {
        "has_update": False,
        "current_commit": None,
        "latest_commit": None,
        "behind_count": 0,
        "changes": []
    }
    
    if not REPO_PATH.exists():
        result["error"] = "仓库不存在"
        return result
    
    try:
        repo = git.Repo(REPO_PATH)
        
        # 获取当前commit
        result["current_commit"] = {
            "hash": repo.head.commit.hexsha[:8],
            "date": datetime.fromtimestamp(repo.head.commit.committed_date).isoformat(),
            "message": repo.head.commit.message.strip()[:100]
        }
        
        # 获取远程更新
        origin = repo.remotes.origin
        origin.fetch()
        
        # 比较
        behind = list(repo.iter_commits('HEAD..origin/main'))
        result["behind_count"] = len(behind)
        
        if behind:
            result["has_update"] = True
            result["latest_commit"] = {
                "hash": behind[0].hexsha[:8],
                "date": datetime.fromtimestamp(behind[0].committed_date).isoformat(),
                "message": behind[0].message.strip()[:100]
            }
            
            # 获取变化文件
            for commit in behind[:5]:  # 最近5个commit
                for parent in commit.parents:
                    diff = parent.diff(commit)
                    for change in diff:
                        result["changes"].append({
                            "type": change.change_type,
                            "file": change.b_path or change.a_path
                        })
    
    except Exception as e:
        result["error"] = str(e)
    
    return result


def run_command(cmd: str, cwd: Optional[str] = None, log_file: Optional[Path] = None) -> Dict:
    """执行命令并返回结果"""
    try:
        process = subprocess.Popen(
            cmd,
            shell=True,
            cwd=cwd or str(BASE_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
        
        output = []
        for line in process.stdout:
            output.append(line)
            if log_file:
                with open(log_file, 'a', encoding='utf-8') as f:
                    f.write(line)
        
        process.wait()
        
        return {
            "success": process.returncode == 0,
            "returncode": process.returncode,
            "output": ''.join(output)
        }
    except Exception as e:
        return {
            "success": False,
            "returncode": -1,
            "output": str(e)
        }


# FastAPI应用
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期"""
    print("🚀 agency-agents WebUI 启动")
    print(f"📁 仓库路径: {REPO_PATH}")
    print(f"📊 配置文件: {CONFIG_PATH}")
    yield
    print("👋 agency-agents WebUI 关闭")


app = FastAPI(
    title="agency-agents WebUI",
    description="AI智能体管理面板 - 支持多工具分区管理",
    version="1.0.0",
    lifespan=lifespan
)

# 挂载静态文件
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


@app.get("/")
async def index():
    """主页"""
    return FileResponse(BASE_DIR / "static" / "index.html")


@app.get("/api/tools")
async def get_tools():
    """获取所有工具状态"""
    configs = load_tool_configs()
    tools = {}
    
    for tool_name, config in configs.items():
        install_status = check_tool_installed(tool_name, config)
        process_status = check_process_running(config.process_name)
        
        tools[tool_name] = {
            "name": config.name,
            "description": config.description,
            "installed": install_status["installed"],
            "agent_count": install_status["agent_count"],
            "agents": install_status["agents"],
            "skills_path": install_status["path"],
            "running": process_status["running"],
            "pid": process_status["pid"],
            "cpu_percent": process_status["cpu_percent"],
            "memory_mb": process_status["memory_mb"],
            "has_web": config.has_web,
            "web_url": config.web_url,
            "restart_required": config.restart_required,
            "discord_limit": config.discord_limit,
            "categories": config.categories,
            "can_start": config.start_cmd is not None,
            "can_stop": config.stop_cmd is not None,
            "can_restart": config.restart_cmd is not None,
            "activate_instruction": getattr(config, 'activate_instruction', None) or "请在对话中指定技能"
        }
    
    return {"tools": tools}


@app.get("/api/agents")
async def get_agents():
    """获取所有可用智能体"""
    if not REPO_PATH.exists():
        raise HTTPException(status_code=404, detail="仓库不存在，请先克隆agency-agents-zh")
    
    # 部门名称映射(英文 -> 中文)
    dept_name_map = {
        "academic": "学术",
        "blender": "Blender",
        "creative": "创意",
        "data-science": "数据科学",
        "design": "设计",
        "devops": "DevOps",
        "dogfood": "内测",
        "domain": "领域",
        "email": "邮件",
        "engineering": "工程",
        "examples": "示例",
        "feeds": "订阅",
        "finance": "金融",
        "game-development": "游戏开发",
        "gaming": "游戏",
        "github": "GitHub",
        "homeassistant": "智能家居",
        "hr": "人力资源",
        "integrations": "集成",
        "leisure": "休闲",
        "legal": "法务",
        "marketing": "营销",
        "mlops": "MLOps",
        "note-taking": "笔记",
        "paid-media": "付费媒体",
        "product": "产品",
        "productivity": "效率",
        "project-management": "项目管理",
        "red-teaming": "红队",
        "research": "研究",
        "roblox-studio": "Roblox",
        "sales": "销售",
        "scripts": "脚本",
        "smart-home": "智能家居",
        "social-media": "社交媒体",
        "software-development": "软件开发",
        "spatial-computing": "空间计算",
        "specialized": "专项",
        "strategy": "战略",
        "supply-chain": "供应链",
        "support": "支持",
        "testing": "测试",
        "unity": "Unity",
        "unreal-engine": "Unreal"
    }
    
    agents = {}
    departments = {}
    
    # 扫描仓库中的智能体
    for category_dir in REPO_PATH.iterdir():
        if category_dir.is_dir() and not category_dir.name.startswith('.'):
            category_name = category_dir.name
            dept_cn = dept_name_map.get(category_name, category_name)
            departments[dept_cn] = []
            
            for agent_file in category_dir.glob('*.md'):
                if agent_file.name not in ['README.md', 'CONTRIBUTING.md']:
                    agent_name = agent_file.stem
                    
                    # 从文件中提取中文名称
                    display_name = agent_name
                    try:
                        with open(agent_file, 'r', encoding='utf-8') as f:
                            content = f.read(500)  # 只读取前500字符
                            # 查找 name: 字段
                            if 'name:' in content:
                                for line in content.split('\n'):
                                    if line.strip().startswith('name:'):
                                        display_name = line.split(':', 1)[1].strip()
                                        break
                    except:
                        pass
                    
                    agents[agent_name] = {
                        "name": display_name,
                        "category": dept_cn,
                        "category_en": category_name,
                        "file": str(agent_file.relative_to(REPO_PATH))
                    }
                    departments[dept_cn].append(agent_name)
    
    return {"agents": agents, "departments": departments}


@app.get("/api/active-agents")
async def get_active_agents():
    """获取当前激活的人设"""
    return load_json_file(ACTIVE_AGENTS_FILE, {})


@app.post("/api/active-agents/{tool_name}/{agent_name}")
async def set_active_agent(tool_name: str, agent_name: str):
    """设置激活的人设"""
    configs = load_tool_configs()
    if tool_name not in configs:
        raise HTTPException(status_code=404, detail=f"工具 {tool_name} 不存在")
    
    config = configs[tool_name]
    active_agents = load_json_file(ACTIVE_AGENTS_FILE, {})
    
    # 更新激活状态
    active_agents[tool_name] = {
        "agent": agent_name,
        "timestamp": datetime.now().isoformat()
    }
    save_json_file(ACTIVE_AGENTS_FILE, active_agents)
    
    # 如果有配置文件需要修改
    if config.active_config:
        skills_path = expand_path(config.skills_path)
        agent_dir = skills_path / agent_name
        
        if agent_dir.exists():
            # 这里可以实现具体的激活逻辑
            # 例如：复制SOUL.md到激活位置
            pass
    
    # 如果需要重启
    if config.restart_required:
        return {
            "success": True,
            "message": f"已设置 {agent_name} 为当前人设，需要重启 {config.name} 生效",
            "need_restart": True,
            "restart_cmd": config.restart_cmd
        }
    
    # 如果是指令类工具
    if config.active_type == "instruction":
        instruction = config.instruction.replace("{agent}", agent_name)
        return {
            "success": True,
            "message": f"已设置 {agent_name} 为当前人设",
            "instruction": instruction
        }
    
    return {"success": True, "message": f"已激活 {agent_name}"}


@app.delete("/api/active-agents/{tool_name}")
async def deactivate_agent(tool_name: str):
    """取消激活人设"""
    configs = load_tool_configs()
    if tool_name not in configs:
        raise HTTPException(status_code=404, detail=f"工具 {tool_name} 不存在")
    
    config = configs[tool_name]
    active_agents = load_json_file(ACTIVE_AGENTS_FILE, {})
    
    if tool_name not in active_agents:
        return {"success": True, "message": f"{config.name} 未激活任何人设"}
    
    # 移除激活状态
    removed_agent = active_agents.pop(tool_name, None)
    save_json_file(ACTIVE_AGENTS_FILE, active_agents)
    
    # 如果需要重启
    if config.restart_required:
        return {
            "success": True,
            "message": f"已取消激活 {removed_agent['agent'] if removed_agent else ''}，需要重启 {config.name} 生效",
            "need_restart": True,
            "restart_cmd": config.restart_cmd
        }
    
    return {"success": True, "message": f"已取消激活，恢复默认状态"}


@app.post("/api/install/{tool_name}")
async def install_tool(tool_name: str, background_tasks: BackgroundTasks, categories: Optional[str] = None):
    """一键安装工具"""
    configs = load_tool_configs()
    if tool_name not in configs:
        raise HTTPException(status_code=404, detail=f"工具 {tool_name} 不存在")
    
    config = configs[tool_name]
    
    if not REPO_PATH.exists():
        raise HTTPException(status_code=404, detail="仓库不存在")
    
    # 生成日志文件
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = LOGS_DIR / "install" / f"{tool_name}_{timestamp}.log"
    log_file.parent.mkdir(exist_ok=True)
    
    # 构建安装命令
    install_cmd = config.install_cmd.replace("{repo_path}", str(REPO_PATH))
    
    # 如果指定了分类
    if categories and config.categories:
        category_list = [c.strip() for c in categories.split(',')]
        if config.discord_limit:
            # Hermes特殊处理：逐个分类安装
            install_cmd = f"cd {REPO_PATH}"
            for cat in category_list:
                install_cmd += f" && ./scripts/install.sh --tool {tool_name} --category {cat}"
    
    # 记录安装任务
    task_id = f"{tool_name}_{timestamp}"
    install_tasks[task_id] = {
        "tool": tool_name,
        "status": "running",
        "start_time": datetime.now().isoformat(),
        "log_file": str(log_file)
    }
    
    # 后台执行安装
    def run_install():
        result = run_command(install_cmd, log_file=log_file)
        install_tasks[task_id]["status"] = "completed" if result["success"] else "failed"
        install_tasks[task_id]["end_time"] = datetime.now().isoformat()
        install_tasks[task_id]["output"] = result["output"][-1000:]  # 保留最后1000字符
        
        # 记录安装历史
        history = load_json_file(INSTALL_HISTORY_FILE, {"installs": []})
        history["installs"].append({
            "tool": tool_name,
            "timestamp": datetime.now().isoformat(),
            "success": result["success"],
            "categories": categories
        })
        save_json_file(INSTALL_HISTORY_FILE, history)
    
    background_tasks.add_task(run_install)
    
    return {
        "success": True,
        "task_id": task_id,
        "message": f"开始安装 {config.name}",
        "log_file": str(log_file)
    }


@app.get("/api/install/status/{task_id}")
async def get_install_status(task_id: str):
    """获取安装任务状态"""
    if task_id not in install_tasks:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    task = install_tasks[task_id]
    
    # 读取日志
    log_content = ""
    if Path(task["log_file"]).exists():
        with open(task["log_file"], 'r', encoding='utf-8') as f:
            log_content = f.read()[-2000:]  # 最后2000字符
    
    return {
        **task,
        "log": log_content
    }


@app.post("/api/tool/{tool_name}/start")
async def start_tool(tool_name: str):
    """启动工具"""
    configs = load_tool_configs()
    if tool_name not in configs:
        raise HTTPException(status_code=404, detail=f"工具 {tool_name} 不存在")
    
    config = configs[tool_name]
    if not config.start_cmd:
        raise HTTPException(status_code=400, detail=f"{config.name} 不支持启动操作")
    
    # 生成日志文件
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = LOGS_DIR / tool_name / f"startup_{timestamp}.log"
    log_file.parent.mkdir(exist_ok=True)
    
    result = run_command(config.start_cmd, log_file=log_file)
    
    return {
        "success": result["success"],
        "message": f"{'启动成功' if result['success'] else '启动失败'}",
        "log_file": str(log_file),
        "output": result["output"][-500:]
    }


@app.post("/api/tool/{tool_name}/stop")
async def stop_tool(tool_name: str):
    """停止工具"""
    configs = load_tool_configs()
    if tool_name not in configs:
        raise HTTPException(status_code=404, detail=f"工具 {tool_name} 不存在")
    
    config = configs[tool_name]
    if not config.stop_cmd:
        raise HTTPException(status_code=400, detail=f"{config.name} 不支持停止操作")
    
    result = run_command(config.stop_cmd)
    
    return {
        "success": result["success"],
        "message": f"{'停止成功' if result['success'] else '停止失败'}",
        "output": result["output"][-500:]
    }


@app.post("/api/tool/{tool_name}/restart")
async def restart_tool(tool_name: str):
    """重启工具"""
    configs = load_tool_configs()
    if tool_name not in configs:
        raise HTTPException(status_code=404, detail=f"工具 {tool_name} 不存在")
    
    config = configs[tool_name]
    if not config.restart_cmd:
        raise HTTPException(status_code=400, detail=f"{config.name} 不支持重启操作")
    
    # 生成日志文件
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = LOGS_DIR / tool_name / f"restart_{timestamp}.log"
    log_file.parent.mkdir(exist_ok=True)
    
    result = run_command(config.restart_cmd, log_file=log_file)
    
    return {
        "success": result["success"],
        "message": f"{'重启成功' if result['success'] else '重启失败'}",
        "log_file": str(log_file),
        "output": result["output"][-500:]
    }


@app.post("/api/tool/{tool_name}/uninstall")
async def uninstall_tool(tool_name: str):
    """卸载工具的所有智能体"""
    configs = load_tool_configs()
    if tool_name not in configs:
        raise HTTPException(status_code=404, detail=f"工具 {tool_name} 不存在")
    
    config = configs[tool_name]
    
    # 获取卸载命令
    uninstall_cmd = getattr(config, 'uninstall_cmd', None)
    if not uninstall_cmd:
        # 默认卸载方式：清空skills目录
        skills_path = expand_path(config.skills_path)
        uninstall_cmd = f"rm -rf {skills_path}*"
    
    result = run_command(uninstall_cmd)
    
    # 清除激活状态
    active_agents = load_json_file(ACTIVE_AGENTS_FILE, {})
    if tool_name in active_agents:
        del active_agents[tool_name]
        save_json_file(ACTIVE_AGENTS_FILE, active_agents)
    
    return {
        "success": result["success"],
        "message": f"{'卸载成功' if result['success'] else '卸载失败'}",
        "output": result["output"][-500:]
    }


@app.get("/api/logs/{tool_name}")
async def get_tool_logs(tool_name: str, log_type: str = "latest"):
    """获取工具日志"""
    log_dir = LOGS_DIR / tool_name
    if not log_dir.exists():
        return {"logs": []}
    
    logs = []
    for log_file in sorted(log_dir.glob("*.log"), reverse=True)[:10]:
        with open(log_file, 'r', encoding='utf-8') as f:
            content = f.read()
        logs.append({
            "file": log_file.name,
            "timestamp": log_file.stem.split('_', 1)[-1],
            "content": content[-5000:]  # 最后5000字符
        })
    
    return {"logs": logs}


@app.get("/api/update/check")
async def check_update():
    """检查更新"""
    return check_repo_update()


@app.post("/api/update/execute")
async def execute_update(background_tasks: BackgroundTasks):
    """执行更新"""
    global update_task
    
    if not REPO_PATH.exists():
        raise HTTPException(status_code=404, detail="仓库不存在")
    
    # 生成日志文件
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = LOGS_DIR / "update" / f"update_{timestamp}.log"
    log_file.parent.mkdir(exist_ok=True)
    
    update_task = {
        "status": "running",
        "start_time": datetime.now().isoformat(),
        "log_file": str(log_file)
    }
    
    def run_update():
        global update_task
        
        # 拉取更新
        result1 = run_command(f"cd {REPO_PATH} && git pull origin main", log_file=log_file)
        
        if not result1["success"]:
            update_task["status"] = "failed"
            update_task["output"] = result1["output"]
            return
        
        # 重新转换已安装的工具
        configs = load_tool_configs()
        tools_updated = []
        
        for tool_name, config in configs.items():
            install_status = check_tool_installed(tool_name, config)
            if install_status["installed"]:
                convert_cmd = f"cd {REPO_PATH} && ./scripts/convert.sh --tool {tool_name}"
                result2 = run_command(convert_cmd, log_file=log_file)
                if result2["success"]:
                    tools_updated.append(tool_name)
        
        update_task["status"] = "completed"
        update_task["end_time"] = datetime.now().isoformat()
        update_task["tools_updated"] = tools_updated
        
        # 记录更新历史
        history = load_json_file(UPDATE_HISTORY_FILE, {"updates": []})
        history["updates"].append({
            "timestamp": datetime.now().isoformat(),
            "tools_updated": tools_updated
        })
        save_json_file(UPDATE_HISTORY_FILE, history)
    
    background_tasks.add_task(run_update)
    
    return {
        "success": True,
        "message": "开始更新",
        "log_file": str(log_file)
    }


@app.get("/api/update/status")
async def get_update_status():
    """获取更新状态"""
    global update_task
    
    if not update_task:
        return {"status": "idle"}
    
    # 读取日志
    log_content = ""
    if Path(update_task.get("log_file", "")).exists():
        with open(update_task["log_file"], 'r', encoding='utf-8') as f:
            log_content = f.read()[-2000:]
    
    return {
        **update_task,
        "log": log_content
    }


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {
        "status": "ok",
        "repo_exists": REPO_PATH.exists(),
        "timestamp": datetime.now().isoformat()
    }


@app.get("/api/agent/{agent_id}")
async def get_agent_content(agent_id: str):
    """获取智能体文件内容"""
    if not REPO_PATH.exists():
        raise HTTPException(status_code=404, detail="仓库不存在")
    
    # 查找智能体文件
    for category_dir in REPO_PATH.iterdir():
        if category_dir.is_dir() and not category_dir.name.startswith('.'):
            agent_file = category_dir / f"{agent_id}.md"
            if agent_file.exists():
                try:
                    with open(agent_file, 'r', encoding='utf-8') as f:
                        content = f.read()
                    return {
                        "id": agent_id,
                        "file": str(agent_file.relative_to(REPO_PATH)),
                        "content": content
                    }
                except Exception as e:
                    raise HTTPException(status_code=500, detail=f"读取文件失败: {str(e)}")
    
    raise HTTPException(status_code=404, detail=f"智能体 {agent_id} 不存在")


@app.post("/api/agent/{agent_id}/install/{tool_name}")
async def install_single_agent(agent_id: str, tool_name: str):
    """安装单个智能体到指定工具"""
    configs = load_tool_configs()
    if tool_name not in configs:
        raise HTTPException(status_code=404, detail=f"工具 {tool_name} 不存在")
    
    config = configs[tool_name]
    skills_path = expand_path(config.skills_path)
    
    if not skills_path.exists():
        return {"success": False, "message": f"{config.name} 未安装，请先安装工具"}
    
    # 查找智能体文件
    agent_file = None
    for category_dir in REPO_PATH.iterdir():
        if category_dir.is_dir() and not category_dir.name.startswith('.'):
            potential_file = category_dir / f"{agent_id}.md"
            if potential_file.exists():
                agent_file = potential_file
                break
    
    if not agent_file:
        raise HTTPException(status_code=404, detail=f"智能体 {agent_id} 不存在")
    
    try:
        # 根据工具类型决定安装方式
        if tool_name == 'openclaw':
            # OpenClaw需要转换格式
            convert_dir = REPO_PATH / "integrations" / "openclaw" / agent_id
            if convert_dir.exists():
                # 复制转换后的文件
                import shutil
                dest = skills_path / agent_id
                if dest.exists():
                    shutil.rmtree(dest)
                shutil.copytree(convert_dir, dest)
                return {"success": True, "message": f"已安装 {agent_id} 到 {config.name}"}
            else:
                # 直接复制原文件
                dest = skills_path / f"{agent_id}.md"
                shutil.copy2(agent_file, dest)
                return {"success": True, "message": f"已安装 {agent_id} 到 {config.name}"}
        elif tool_name == 'hermes':
            # Hermes需要转换格式
            convert_dir = REPO_PATH / "integrations" / "hermes"
            # 查找在哪个分类下
            for cat_dir in convert_dir.iterdir():
                if cat_dir.is_dir():
                    skill_file = cat_dir / agent_id / "SKILL.md"
                    if skill_file.exists():
                        import shutil
                        dest = skills_path / cat_dir.name / agent_id
                        dest.mkdir(parents=True, exist_ok=True)
                        shutil.copytree(cat_dir / agent_id, dest, dirs_exist_ok=True)
                        return {"success": True, "message": f"已安装 {agent_id} 到 {config.name}"}
            # 没有转换文件，直接复制
            import shutil
            dest = skills_path / f"{agent_id}.md"
            shutil.copy2(agent_file, dest)
            return {"success": True, "message": f"已安装 {agent_id} 到 {config.name}"}
        else:
            # 其他工具直接复制
            import shutil
            dest = skills_path / f"{agent_id}.md"
            shutil.copy2(agent_file, dest)
            return {"success": True, "message": f"已安装 {agent_id} 到 {config.name}"}
    except Exception as e:
        return {"success": False, "message": f"安装失败: {str(e)}"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8888)