// agency-agents WebUI - 前端逻辑

// 全局状态
let tools = {};
let agents = {};
let departments = {};
let activeAgents = {};
let currentTool = null;
let currentTaskId = null;
let updateCheckInterval = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    init();
    // 定时刷新状态
    setInterval(refreshTools, 3000);
    // 检查更新
    checkUpdateSilent();
    setInterval(checkUpdateSilent, 3600000); // 每小时检查一次
});

// 初始化
async function init() {
    await refreshTools();
    await loadAgents();
    updateAccessUrl();
}

// 更新访问地址
function updateAccessUrl() {
    const url = window.location.origin;
    document.getElementById('accessUrl').textContent = url;
}

// 复制URL
function copyUrl() {
    const url = document.getElementById('accessUrl').textContent;
    navigator.clipboard.writeText(url);
    showToast('已复制访问地址', 'success');
}

// 刷新所有
async function refreshAll() {
    await refreshTools();
    await loadAgents();
    showToast('已刷新', 'success');
}

// 刷新工具列表
async function refreshTools() {
    try {
        const response = await fetch('/api/tools');
        const data = await response.json();
        tools = data.tools;
        renderToolList();
        renderToolTabs();
        if (currentTool) {
            renderAgentGrid();
        }
    } catch (error) {
        console.error('刷新工具失败:', error);
    }
}

// 加载智能体列表
async function loadAgents() {
    try {
        const response = await fetch('/api/agents');
        const data = await response.json();
        agents = data.agents;
        departments = data.departments;
        
        // 加载激活状态
        const activeResponse = await fetch('/api/active-agents');
        activeAgents = await activeResponse.json();
        
        updateActiveAgentStatus();
    } catch (error) {
        console.error('加载智能体失败:', error);
    }
}

// 渲染工具列表
function renderToolList() {
    const container = document.getElementById('toolList');
    container.innerHTML = '';
    
    for (const [toolName, tool] of Object.entries(tools)) {
        const card = document.createElement('div');
        card.className = `tool-card ${currentTool === toolName ? 'active' : ''}`;
        card.onclick = () => selectTool(toolName);
        
        card.innerHTML = `
            <div class="tool-card-header">
                <span class="tool-name">${tool.name}</span>
                <div class="tool-status">
                    ${tool.running ? '<span class="status-dot running"></span>运行中' : 
                      tool.installed ? '<span class="status-dot installed"></span>已安装' : 
                      '<span class="status-dot"></span>未安装'}
                </div>
            </div>
            <div class="tool-card-body">
                <span>${tool.agent_count} 个智能体</span>
                <span>${tool.description}</span>
            </div>
            <div class="tool-card-actions">
                ${!tool.installed ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); installTool('${toolName}')">安装</button>` : ''}
                ${tool.can_start && !tool.running ? `<button class="btn btn-sm btn-success" onclick="event.stopPropagation(); startTool('${toolName}')">启动</button>` : ''}
                ${tool.can_stop && tool.running ? `<button class="btn btn-sm btn-warning" onclick="event.stopPropagation(); stopTool('${toolName}')">停止</button>` : ''}
                ${tool.can_restart ? `<button class="btn btn-sm" onclick="event.stopPropagation(); restartTool('${toolName}')">重启</button>` : ''}
                ${tool.has_web && tool.running ? `<button class="btn btn-sm" onclick="event.stopPropagation(); openWebUI('${tool.web_url}')">打开</button>` : ''}
                <button class="btn btn-sm" onclick="event.stopPropagation(); showLogs('${toolName}')">日志</button>
            </div>
        `;
        
        container.appendChild(card);
    }
}

// 渲染工具标签
function renderToolTabs() {
    const container = document.getElementById('toolTabs');
    container.innerHTML = '';
    
    for (const [toolName, tool] of Object.entries(tools)) {
        const tab = document.createElement('div');
        tab.className = `tab ${currentTool === toolName ? 'active' : ''}`;
        tab.textContent = tool.name;
        tab.onclick = () => selectTool(toolName);
        container.appendChild(tab);
    }
}

// 选择工具
function selectTool(toolName) {
    currentTool = toolName;
    renderToolList();
    renderToolTabs();
    renderAgentGrid();
}

// 渲染智能体网格
function renderAgentGrid() {
    const container = document.getElementById('agentGrid');
    container.innerHTML = '';
    
    if (!currentTool) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px;">请先选择一个工具分区</p>';
        return;
    }
    
    const tool = tools[currentTool];
    const search = document.getElementById('searchInput').value.toLowerCase();
    
    // 当前激活人设显示
    const activeSection = document.createElement('div');
    activeSection.className = 'active-agent-section';
    activeSection.style.cssText = 'background: var(--bg-secondary); border-radius: 8px; padding: 16px; margin-bottom: 16px; border: 1px solid var(--primary);';
    
    if (activeAgents[currentTool]) {
        activeSection.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">当前激活人设</div>
                    <div style="font-size: 18px; font-weight: 600; color: var(--primary);">${activeAgents[currentTool].agent}</div>
                </div>
                <button class="btn btn-sm" onclick="toggleAgent('${activeAgents[currentTool].agent}')">停用</button>
            </div>
        `;
    } else {
        activeSection.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary);">
                <div style="font-size: 12px; margin-bottom: 4px;">当前激活人设</div>
                <div>未激活任何人设</div>
            </div>
        `;
    }
    container.appendChild(activeSection);
    
    // 筛选选项
    const filterSection = document.createElement('div');
    filterSection.className = 'filter-section';
    filterSection.style.cssText = 'display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;';
    filterSection.innerHTML = `
        <button class="btn btn-sm btn-primary" onclick="setFilter('installed')" id="filterInstalled">已安装 (${tool.agent_count})</button>
        <button class="btn btn-sm" onclick="setFilter('all')" id="filterAll">全部智能体</button>
        <button class="btn btn-sm" onclick="setFilter('category')" id="filterCategory">按部门</button>
    `;
    container.appendChild(filterSection);
    
    // 当前筛选状态
    if (!window.currentFilter) window.currentFilter = 'installed';
    
    // 部门筛选（仅在按部门模式显示）
    if (window.currentFilter === 'category') {
        const deptFilter = document.createElement('div');
        deptFilter.className = 'department-filter';
        deptFilter.innerHTML = `
            <span class="dept-tag active" onclick="filterByDept('all')">全部</span>
            ${Object.keys(departments).map(dept => 
                `<span class="dept-tag" onclick="filterByDept('${dept}')">${dept}</span>`
            ).join('')}
        `;
        container.appendChild(deptFilter);
    }
    
    // 智能体卡片
    const grid = document.createElement('div');
    grid.className = 'agent-grid';
    
    // 根据筛选模式过滤智能体
    let filteredAgents = Object.entries(agents);
    
    if (window.currentFilter === 'installed') {
        filteredAgents = filteredAgents.filter(([name]) => tool.agents.includes(name));
    }
    
    for (const [agentName, agent] of filteredAgents) {
        // 搜索过滤
        if (search && !agentName.toLowerCase().includes(search) && 
            !agent.category.toLowerCase().includes(search)) {
            continue;
        }
        
        const isInstalled = tool.agents.includes(agentName);
        const isActive = activeAgents[currentTool]?.agent === agentName;
        
        const card = document.createElement('div');
        card.className = 'agent-card';
        card.dataset.category = agent.category;
        card.style.cssText = isActive ? 'border-color: var(--primary);' : '';
        
        card.innerHTML = `
            <div class="agent-card-header">
                <span class="agent-name">${agent.name}</span>
                ${isActive ? '<span class="agent-badge active">激活</span>' : 
                  isInstalled ? '<span class="agent-badge installed">已安装</span>' : ''}
            </div>
            <div class="agent-card-body">
                <div class="agent-category">${agent.category}</div>
                <div class="agent-desc" style="font-size: 11px; color: var(--text-secondary);">${agentName}</div>
            </div>
            <div class="agent-card-actions">
                ${isInstalled ? 
                    `<button class="btn btn-sm ${isActive ? 'btn-primary' : ''}" 
                             onclick="toggleAgent('${agentName}')">
                        ${isActive ? '已激活' : '激活'}
                    </button>
                     <button class="btn btn-sm btn-danger" onclick="uninstallAgent('${agentName}')">卸载</button>` :
                    `<button class="btn btn-sm btn-primary" onclick="installAgent('${agentName}')">安装</button>`
                }
            </div>
        `;
        
        grid.appendChild(card);
    }
    
    container.appendChild(grid);
}

// 设置筛选模式
function setFilter(mode) {
    window.currentFilter = mode;
    
    // 更新按钮样式
    document.querySelectorAll('.filter-section .btn').forEach(btn => {
        btn.classList.remove('btn-primary');
    });
    
    if (mode === 'installed') {
        document.getElementById('filterInstalled').classList.add('btn-primary');
    } else if (mode === 'all') {
        document.getElementById('filterAll').classList.add('btn-primary');
    } else if (mode === 'category') {
        document.getElementById('filterCategory').classList.add('btn-primary');
    }
    
    renderAgentGrid();
}

// 搜索过滤
function filterAgents() {
    renderAgentGrid();
}

// 部门过滤
function filterByDept(dept) {
    const tags = document.querySelectorAll('.dept-tag');
    tags.forEach(tag => tag.classList.remove('active'));
    event.target.classList.add('active');
    
    const cards = document.querySelectorAll('.agent-card');
    cards.forEach(card => {
        if (dept === 'all' || card.dataset.category === dept) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

// 安装工具
async function installTool(toolName) {
    if (!confirm(`确定要安装 ${tools[toolName].name} 吗？`)) return;
    
    try {
        // 显示安装进度
        showInstallModal(`安装 ${tools[toolName].name}`);
        
        const response = await fetch(`/api/install/${toolName}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            currentTaskId = data.task_id;
            pollInstallStatus();
        } else {
            hideInstallModal();
            showToast('安装失败: ' + data.message, 'error');
        }
    } catch (error) {
        hideInstallModal();
        showToast('安装请求失败', 'error');
    }
}

// 轮询安装状态
async function pollInstallStatus() {
    if (!currentTaskId) return;
    
    try {
        const response = await fetch(`/api/install/status/${currentTaskId}`);
        const data = await response.json();
        
        updateInstallLog(data.log);
        
        if (data.status === 'completed') {
            updateInstallProgress(100);
            showToast('安装完成', 'success');
            setTimeout(() => {
                hideInstallModal();
                refreshTools();
            }, 1000);
        } else if (data.status === 'failed') {
            showToast('安装失败', 'error');
        } else {
            setTimeout(pollInstallStatus, 500);
        }
    } catch (error) {
        console.error('轮询安装状态失败:', error);
    }
}

// 显示安装模态框
function showInstallModal(title) {
    document.getElementById('installModalTitle').textContent = title;
    document.getElementById('installProgress').style.width = '0%';
    document.getElementById('installLog').querySelector('pre').textContent = '';
    document.getElementById('installModal').classList.add('show');
}

// 隐藏安装模态框
function hideInstallModal() {
    document.getElementById('installModal').classList.remove('show');
    currentTaskId = null;
}

// 关闭安装模态框
function closeInstallModal() {
    hideInstallModal();
}

// 更新安装进度
function updateInstallProgress(percent) {
    document.getElementById('installProgress').style.width = `${percent}%`;
}

// 更新安装日志
function updateInstallLog(log) {
    document.getElementById('installLog').querySelector('pre').textContent = log;
}

// 安装单个智能体
async function installAgent(agentName) {
    try {
        const response = await fetch(`/api/install/${currentTool}`, {
            method: 'POST'
        });
        const data = await response.json();
        showToast(`开始安装 ${agentName}`, 'success');
        await refreshTools();
    } catch (error) {
        showToast('安装失败', 'error');
    }
}

// 卸载智能体
async function uninstallAgent(agentName) {
    if (!confirm(`确定要卸载 ${agentName} 吗？`)) return;
    showToast('卸载功能开发中', 'warning');
}

// 激活/停用智能体
async function toggleAgent(agentName) {
    try {
        const response = await fetch(`/api/active-agents/${currentTool}/${agentName}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            activeAgents[currentTool] = { agent: agentName };
            showToast(data.message, 'success');
            
            if (data.need_restart) {
                showToast(`需要重启 ${tools[currentTool].name} 生效`, 'warning');
            }
            
            if (data.instruction) {
                showToast(`激活指令: ${data.instruction}`, 'success');
            }
            
            await loadAgents();
            renderAgentGrid();
        }
    } catch (error) {
        showToast('激活失败', 'error');
    }
}

// 启动工具
async function startTool(toolName) {
    try {
        const response = await fetch(`/api/tool/${toolName}/start`, {
            method: 'POST'
        });
        const data = await response.json();
        
        showToast(data.message, data.success ? 'success' : 'error');
        
        if (!data.success) {
            showToolLog(data.output);
        }
        
        await refreshTools();
    } catch (error) {
        showToast('启动失败', 'error');
    }
}

// 停止工具
async function stopTool(toolName) {
    try {
        const response = await fetch(`/api/tool/${toolName}/stop`, {
            method: 'POST'
        });
        const data = await response.json();
        
        showToast(data.message, data.success ? 'success' : 'error');
        await refreshTools();
    } catch (error) {
        showToast('停止失败', 'error');
    }
}

// 重启工具
async function restartTool(toolName) {
    try {
        const response = await fetch(`/api/tool/${toolName}/restart`, {
            method: 'POST'
        });
        const data = await response.json();
        
        showToast(data.message, data.success ? 'success' : 'error');
        
        if (!data.success) {
            showToolLog(data.output);
        }
        
        await refreshTools();
    } catch (error) {
        showToast('重启失败', 'error');
    }
}

// 打开Web界面
function openWebUI(url) {
    window.open(url, '_blank');
}

// 显示日志
async function showLogs(toolName) {
    try {
        const response = await fetch(`/api/logs/${toolName}`);
        const data = await response.json();
        
        if (data.logs.length === 0) {
            showToast('暂无日志', 'warning');
            return;
        }
        
        document.getElementById('logModalTitle').textContent = `${tools[toolName].name} 日志`;
        
        const logList = document.getElementById('logList');
        logList.innerHTML = data.logs.map(log => `
            <div class="log-item" onclick="showLogContent(\`${log.content.replace(/`/g, '\\`')}\`)">
                <div class="filename">${log.file}</div>
                <div class="timestamp">${log.timestamp}</div>
            </div>
        `).join('');
        
        document.getElementById('logModal').classList.add('show');
    } catch (error) {
        showToast('获取日志失败', 'error');
    }
}

// 显示日志内容
function showLogContent(content) {
    const logViewer = document.createElement('div');
    logViewer.className = 'log-viewer';
    logViewer.innerHTML = `<pre>${content}</pre>`;
    
    const logList = document.getElementById('logList');
    logList.innerHTML = '';
    logList.appendChild(logViewer);
}

// 显示工具日志
function showToolLog(content) {
    document.getElementById('toolLog').querySelector('pre').textContent = content;
    document.getElementById('toolControlModal').classList.add('show');
}

// 关闭日志模态框
function closeLogModal() {
    document.getElementById('logModal').classList.remove('show');
}

// 关闭工具控制模态框
function closeToolControlModal() {
    document.getElementById('toolControlModal').classList.remove('show');
}

// 复制日志
function copyLog() {
    const content = document.querySelector('#logList .log-viewer pre')?.textContent || 
                    document.querySelector('#logList .log-item .filename')?.textContent;
    if (content) {
        navigator.clipboard.writeText(content);
        showToast('已复制日志', 'success');
    }
}

// 检查更新（静默）
async function checkUpdateSilent() {
    try {
        const response = await fetch('/api/update/check');
        const data = await response.json();
        
        if (data.has_update) {
            document.getElementById('updateBanner').style.display = 'flex';
            document.querySelector('.update-text').textContent = 
                `发现新版本 (${data.behind_count} 个提交)`;
        }
    } catch (error) {
        console.error('检查更新失败:', error);
    }
}

// 检查更新
async function checkUpdate() {
    try {
        const response = await fetch('/api/update/check');
        const data = await response.json();
        
        if (data.error) {
            showToast('检查更新失败: ' + data.error, 'error');
            return;
        }
        
        const updateInfo = document.getElementById('updateInfo');
        updateInfo.innerHTML = `
            <div class="item">
                <span class="label">当前版本</span>
                <span class="value">${data.current_commit?.hash || '未知'}</span>
            </div>
            <div class="item">
                <span class="label">最新版本</span>
                <span class="value">${data.latest_commit?.hash || '已是最新'}</span>
            </div>
            ${data.has_update ? `
                <div class="item">
                    <span class="label">落后提交</span>
                    <span class="value">${data.behind_count} 个</span>
                </div>
                <div class="item">
                    <span class="label">变更文件</span>
                    <span class="value">${data.changes.length} 个</span>
                </div>
            ` : ''}
        `;
        
        document.getElementById('updateBtn').style.display = data.has_update ? 'block' : 'none';
        document.getElementById('updateModal').classList.add('show');
    } catch (error) {
        showToast('检查更新失败', 'error');
    }
}

// 显示更新模态框
function showUpdateModal() {
    checkUpdate();
}

// 关闭更新模态框
function closeUpdateModal() {
    document.getElementById('updateModal').classList.remove('show');
}

// 忽略更新
function dismissUpdate() {
    document.getElementById('updateBanner').style.display = 'none';
}

// 执行更新
async function executeUpdate() {
    try {
        const response = await fetch('/api/update/execute', {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('开始更新', 'success');
            document.getElementById('updateBtn').disabled = true;
            document.getElementById('updateLog').style.display = 'block';
            pollUpdateStatus();
        }
    } catch (error) {
        showToast('更新失败', 'error');
    }
}

// 轮询更新状态
async function pollUpdateStatus() {
    try {
        const response = await fetch('/api/update/status');
        const data = await response.json();
        
        if (data.log) {
            document.getElementById('updateLog').querySelector('pre').textContent = data.log;
        }
        
        if (data.status === 'completed') {
            showToast('更新完成', 'success');
            document.getElementById('updateBtn').disabled = false;
            document.getElementById('updateBtn').textContent = '更新完成';
            await refreshTools();
        } else if (data.status === 'failed') {
            showToast('更新失败', 'error');
            document.getElementById('updateBtn').disabled = false;
        } else if (data.status === 'running') {
            setTimeout(pollUpdateStatus, 500);
        }
    } catch (error) {
        console.error('轮询更新状态失败:', error);
    }
}

// 更新激活状态显示
function updateActiveAgentStatus() {
    const status = document.getElementById('activeAgentStatus');
    if (currentTool && activeAgents[currentTool]) {
        status.innerHTML = `当前激活: <strong>${activeAgents[currentTool].agent} (${tools[currentTool]?.name})</strong>`;
    } else {
        status.innerHTML = '当前激活: <strong>无</strong>';
    }
}

// 显示Toast
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 3000);
    
    // 更新最近操作
    document.getElementById('lastOperation').textContent = `最近操作: ${message}`;
}