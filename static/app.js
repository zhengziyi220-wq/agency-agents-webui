// agency-agents WebUI - 响应式前端逻辑

// 全局状态
let tools = {};
let agents = {};
let departments = {};
let activeAgents = {};
let currentTool = null;
let currentFilter = 'installed';
let currentDept = 'all';

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    init();
    setInterval(refreshTools, 5000);
    checkUpdateSilent();
    setInterval(checkUpdateSilent, 3600000);
});

async function init() {
    await refreshTools();
    await loadAgents();
    updateUrl();
}

function updateUrl() {
    const url = window.location.origin;
    document.getElementById('urlText').textContent = url.replace('http://', '');
}

function copyUrl() {
    const url = window.location.origin;
    navigator.clipboard.writeText(url);
    showToast('已复制地址', 'success');
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
}

async function refreshAll() {
    await refreshTools();
    await loadAgents();
    showToast('已刷新', 'success');
}

async function refreshTools() {
    try {
        const res = await fetch('/api/tools');
        const data = await res.json();
        tools = data.tools;
        renderToolList();
        renderToolTabs();
        updateActiveAgent();
    } catch (e) {
        console.error('刷新工具失败:', e);
    }
}

async function loadAgents() {
    try {
        const res = await fetch('/api/agents');
        const data = await res.json();
        agents = data.agents;
        departments = data.departments;
        
        const activeRes = await fetch('/api/active-agents');
        activeAgents = await activeRes.json();
    } catch (e) {
        console.error('加载智能体失败:', e);
    }
}

function renderToolList() {
    const container = document.getElementById('toolList');
    container.innerHTML = '';
    
    // 按状态排序：已安装 > 运行中 > 未安装
    const sortedTools = Object.entries(tools).sort(([,a], [,b]) => {
        if (a.installed && !b.installed) return -1;
        if (!a.installed && b.installed) return 1;
        if (a.running && !b.running) return -1;
        if (!a.running && b.running) return 1;
        return 0;
    });
    
    for (const [name, tool] of sortedTools) {
        const card = document.createElement('div');
        card.className = `tool-card ${currentTool === name ? 'active' : ''}`;
        card.onclick = () => selectTool(name);
        
        card.innerHTML = `
            <div class="tool-card-header">
                <span class="tool-name">${tool.name}</span>
                <div class="tool-status">
                    ${tool.running ? '<span class="status-dot running"></span>' : 
                      tool.installed ? '<span class="status-dot installed"></span>' : 
                      '<span class="status-dot"></span>'}
                    ${tool.running ? '运行中' : tool.installed ? '已安装' : '未安装'}
                </div>
            </div>
            <div class="tool-card-info">${tool.agent_count} 个智能体</div>
            <div class="tool-card-actions">
                ${!tool.installed ? `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); installTool('${name}')">安装</button>` : ''}
                ${tool.can_start && !tool.running ? `<button class="btn btn-sm btn-success" onclick="event.stopPropagation(); startTool('${name}')">启动</button>` : ''}
                ${tool.can_stop && tool.running ? `<button class="btn btn-sm btn-warning" onclick="event.stopPropagation(); stopTool('${name}')">停止</button>` : ''}
                ${tool.can_restart ? `<button class="btn btn-sm" onclick="event.stopPropagation(); restartTool('${name}')">重启</button>` : ''}
                ${tool.has_web && tool.running ? `<button class="btn btn-sm" onclick="event.stopPropagation(); window.open('${tool.web_url}', '_blank')">打开</button>` : ''}
                <button class="btn btn-sm" onclick="event.stopPropagation(); showLogs('${name}')">日志</button>
            </div>
        `;
        
        container.appendChild(card);
    }
}

function renderToolTabs() {
    const container = document.getElementById('toolTabs');
    container.innerHTML = '';
    
    // 按状态排序：已安装 > 运行中 > 未安装
    const sortedTools = Object.entries(tools).sort(([,a], [,b]) => {
        if (a.installed && !b.installed) return -1;
        if (!a.installed && b.installed) return 1;
        if (a.running && !b.running) return -1;
        if (!a.running && b.running) return 1;
        return 0;
    });
    
    for (const [name, tool] of sortedTools) {
        const tab = document.createElement('button');
        tab.className = `tool-tab ${currentTool === name ? 'active' : ''}`;
        tab.textContent = tool.name;
        tab.onclick = () => selectTool(name);
        container.appendChild(tab);
    }
}

function selectTool(name) {
    currentTool = name;
    currentFilter = 'installed';
    currentDept = 'all';
    
    renderToolList();
    renderToolTabs();
    updateActiveAgent();
    renderAgents();
    
    // 移动端关闭侧边栏
    document.getElementById('sidebar').classList.remove('open');
}

function updateActiveAgent() {
    const nameEl = document.getElementById('activeAgentName');
    const btnEl = document.getElementById('activeAgentBtn');
    
    if (currentTool && activeAgents[currentTool]) {
        nameEl.textContent = `${activeAgents[currentTool].agent} (${tools[currentTool]?.name})`;
        btnEl.style.display = 'block';
    } else {
        nameEl.textContent = '未激活';
        btnEl.style.display = 'none';
    }
}

function renderAgents() {
    const container = document.getElementById('agentGrid');
    const tagsContainer = document.getElementById('departmentTags');
    const countEl = document.getElementById('installedCount');
    
    container.innerHTML = '';
    
    if (!currentTool) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px; grid-column: 1/-1;">请先选择工具分区</p>';
        return;
    }
    
    const tool = tools[currentTool];
    countEl.textContent = tool.agent_count;
    
    // 更新筛选按钮
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === currentFilter);
    });
    
    // 部门标签
    if (currentFilter === 'category') {
        tagsContainer.style.display = 'flex';
        tagsContainer.innerHTML = `
            <button class="dept-tag ${currentDept === 'all' ? 'active' : ''}" onclick="selectDept('all')">全部</button>
            ${Object.keys(departments).map(dept => 
                `<button class="dept-tag ${currentDept === dept ? 'active' : ''}" onclick="selectDept('${dept}')">${dept}</button>`
            ).join('')}
        `;
    } else {
        tagsContainer.style.display = 'none';
    }
    
    // 过滤智能体
    let items = Object.entries(agents);
    
    if (currentFilter === 'installed') {
        items = items.filter(([name]) => tool.agents.includes(name));
    }
    
    if (currentFilter === 'category' && currentDept !== 'all') {
        items = items.filter(([_, agent]) => agent.category === currentDept);
    }
    
    const search = document.getElementById('searchInput').value.toLowerCase();
    if (search) {
        items = items.filter(([name, agent]) => 
            name.toLowerCase().includes(search) || 
            agent.name.toLowerCase().includes(search) ||
            agent.category.toLowerCase().includes(search)
        );
    }
    
    // 渲染卡片
    for (const [agentId, agent] of items) {
        const isInstalled = tool.agents.includes(agentId);
        const isActive = activeAgents[currentTool]?.agent === agentId;
        
        const card = document.createElement('div');
        card.className = `agent-card ${isActive ? 'active' : ''}`;
        
        card.innerHTML = `
            <div class="agent-card-header">
                <span class="agent-name">${agent.name}</span>
                ${isActive ? '<span class="agent-badge active">激活</span>' : 
                  isInstalled ? '<span class="agent-badge installed">已安装</span>' : ''}
            </div>
            <div class="agent-card-body">
                <div class="agent-category">${agent.category}</div>
                <div class="agent-id">${agentId}</div>
            </div>
            <div class="agent-card-actions">
                <button class="btn btn-sm" onclick="viewAgentContent('${agentId}')">查看</button>
                ${isInstalled ? 
                    `<button class="btn btn-sm ${isActive ? 'btn-primary' : ''}" onclick="toggleAgent('${agentId}')">
                        ${isActive ? '已激活' : '激活'}
                    </button>
                     <button class="btn btn-sm btn-danger" onclick="uninstallAgent('${agentId}')">卸载</button>` :
                    `<button class="btn btn-sm btn-primary" onclick="installAgent('${agentId}')">安装</button>`
                }
            </div>
        `;
        
        container.appendChild(card);
    }
    
    if (items.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 40px; grid-column: 1/-1;">暂无智能体</p>';
    }
}

function setFilter(filter) {
    currentFilter = filter;
    renderAgents();
}

function selectDept(dept) {
    currentDept = dept;
    renderAgents();
}

function filterAgents() {
    renderAgents();
}

async function toggleAgent(agentId) {
    try {
        const res = await fetch(`/api/active-agents/${currentTool}/${agentId}`, { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            activeAgents[currentTool] = { agent: agentId };
            showToast(data.message, 'success');
            
            if (data.need_restart) {
                showToast(`需要重启 ${tools[currentTool].name}`, 'warning');
            }
            
            if (data.instruction) {
                showToast(`指令: ${data.instruction}`, 'success');
            }
            
            await loadAgents();
            updateActiveAgent();
            renderAgents();
        }
    } catch (e) {
        showToast('操作失败', 'error');
    }
}

async function deactivateAgent() {
    if (currentTool && activeAgents[currentTool]) {
        await toggleAgent(activeAgents[currentTool].agent);
    }
}

async function installTool(toolName) {
    if (!confirm(`确定安装 ${tools[toolName].name}?`)) return;
    
    try {
        showInstallModal(`安装 ${tools[toolName].name}`);
        
        const res = await fetch(`/api/install/${toolName}`, { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            pollInstallStatus(data.task_id);
        } else {
            hideInstallModal();
            showToast('安装失败', 'error');
        }
    } catch (e) {
        hideInstallModal();
        showToast('请求失败', 'error');
    }
}

async function pollInstallStatus(taskId) {
    try {
        const res = await fetch(`/api/install/status/${taskId}`);
        const data = await res.json();
        
        updateInstallLog(data.log);
        
        if (data.status === 'completed') {
            showToast('安装完成', 'success');
            setTimeout(() => {
                hideInstallModal();
                refreshTools();
            }, 1000);
        } else if (data.status === 'failed') {
            showToast('安装失败', 'error');
        } else {
            setTimeout(() => pollInstallStatus(taskId), 500);
        }
    } catch (e) {
        console.error('轮询失败:', e);
    }
}

function showInstallModal(title) {
    document.getElementById('installModalTitle').textContent = title;
    document.getElementById('installProgress').style.width = '0%';
    document.getElementById('installLog').querySelector('pre').textContent = '';
    document.getElementById('installModal').classList.add('show');
}

function hideInstallModal() {
    document.getElementById('installModal').classList.remove('show');
}

function closeInstallModal() {
    hideInstallModal();
}

function updateInstallLog(log) {
    document.getElementById('installLog').querySelector('pre').textContent = log;
}

async function installAgent(agentId) {
    showToast(`开始安装 ${agentId}`, 'success');
    await refreshTools();
}

async function uninstallAgent(agentId) {
    if (!confirm(`确定卸载 ${agentId}?`)) return;
    showToast('卸载功能开发中', 'warning');
}

async function startTool(toolName) {
    try {
        const res = await fetch(`/api/tool/${toolName}/start`, { method: 'POST' });
        const data = await res.json();
        showToast(data.message, data.success ? 'success' : 'error');
        await refreshTools();
    } catch (e) {
        showToast('启动失败', 'error');
    }
}

async function stopTool(toolName) {
    try {
        const res = await fetch(`/api/tool/${toolName}/stop`, { method: 'POST' });
        const data = await res.json();
        showToast(data.message, data.success ? 'success' : 'error');
        await refreshTools();
    } catch (e) {
        showToast('停止失败', 'error');
    }
}

async function restartTool(toolName) {
    try {
        const res = await fetch(`/api/tool/${toolName}/restart`, { method: 'POST' });
        const data = await res.json();
        showToast(data.message, data.success ? 'success' : 'error');
        await refreshTools();
    } catch (e) {
        showToast('重启失败', 'error');
    }
}

async function showLogs(toolName) {
    try {
        const res = await fetch(`/api/logs/${toolName}`);
        const data = await res.json();
        
        if (data.logs.length === 0) {
            showToast('暂无日志', 'warning');
            return;
        }
        
        document.getElementById('logList').innerHTML = data.logs.map(log => `
            <div class="log-item" onclick="showLogContent(\`${log.content.replace(/`/g, '\\`')}\`)">
                <div class="filename">${log.file}</div>
                <div class="timestamp">${log.timestamp}</div>
            </div>
        `).join('');
        
        document.getElementById('logModal').classList.add('show');
    } catch (e) {
        showToast('获取日志失败', 'error');
    }
}

function showLogContent(content) {
    document.getElementById('logList').innerHTML = `
        <div class="log-viewer">
            <pre>${content}</pre>
        </div>
    `;
}

function closeLogModal() {
    document.getElementById('logModal').classList.remove('show');
}

async function checkUpdateSilent() {
    try {
        const res = await fetch('/api/update/check');
        const data = await res.json();
        
        if (data.has_update) {
            document.getElementById('updateBanner').style.display = 'flex';
        }
    } catch (e) {
        console.error('检查更新失败:', e);
    }
}

async function checkUpdate() {
    try {
        const res = await fetch('/api/update/check');
        const data = await res.json();
        
        document.getElementById('updateInfo').innerHTML = `
            <p>当前: ${data.current_commit?.hash || '未知'}</p>
            <p>最新: ${data.latest_commit?.hash || '已是最新'}</p>
            ${data.has_update ? `<p>落后: ${data.behind_count} 个提交</p>` : ''}
        `;
        
        document.getElementById('updateBtn').style.display = data.has_update ? 'block' : 'none';
        document.getElementById('updateModal').classList.add('show');
    } catch (e) {
        showToast('检查更新失败', 'error');
    }
}

function showUpdateModal() {
    checkUpdate();
}

function closeUpdateModal() {
    document.getElementById('updateModal').classList.remove('show');
}

function dismissUpdate() {
    document.getElementById('updateBanner').style.display = 'none';
}

async function executeUpdate() {
    try {
        const res = await fetch('/api/update/execute', { method: 'POST' });
        const data = await res.json();
        
        if (data.success) {
            showToast('开始更新', 'success');
            document.getElementById('updateBtn').disabled = true;
            document.getElementById('updateLog').style.display = 'block';
            pollUpdateStatus();
        }
    } catch (e) {
        showToast('更新失败', 'error');
    }
}

async function pollUpdateStatus() {
    try {
        const res = await fetch('/api/update/status');
        const data = await res.json();
        
        if (data.log) {
            document.getElementById('updateLog').querySelector('pre').textContent = data.log;
        }
        
        if (data.status === 'completed') {
            showToast('更新完成', 'success');
            document.getElementById('updateBtn').disabled = false;
            document.getElementById('updateBtn').textContent = '完成';
            await refreshTools();
        } else if (data.status === 'failed') {
            showToast('更新失败', 'error');
            document.getElementById('updateBtn').disabled = false;
        } else if (data.status === 'running') {
            setTimeout(pollUpdateStatus, 500);
        }
    } catch (e) {
        console.error('轮询更新状态失败:', e);
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
    
    document.getElementById('statusText').textContent = message;
}

// 查看智能体内容
async function viewAgentContent(agentId) {
    try {
        const res = await fetch(`/api/agent/${agentId}`);
        const data = await res.json();
        
        document.getElementById('agentModalTitle').textContent = `智能体详情 - ${agentId}`;
        
        // 显示元信息
        const metaEl = document.getElementById('agentMeta');
        metaEl.innerHTML = `
            <div class="meta-item">
                <span class="label">ID</span>
                <span class="value">${data.id}</span>
            </div>
            <div class="meta-item">
                <span class="label">文件路径</span>
                <span class="value">${data.file}</span>
            </div>
        `;
        
        // 显示内容
        document.getElementById('agentContent').querySelector('pre').textContent = data.content;
        
        document.getElementById('agentModal').classList.add('show');
    } catch (e) {
        showToast('获取智能体内容失败', 'error');
    }
}

function closeAgentModal() {
    document.getElementById('agentModal').classList.remove('show');
}

function copyAgentContent() {
    const content = document.getElementById('agentContent').querySelector('pre').textContent;
    navigator.clipboard.writeText(content);
    showToast('已复制内容', 'success');
}