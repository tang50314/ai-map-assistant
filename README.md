# AI地图助手 - 全栈AI对话应用

## 🎯 项目目标

这是一个**集成大模型 + MCP工具调用**的实战项目，通过多Agent协作架构，解决真实的地图查询、路线规划、旅行规划等问题。

### 核心创新点
- ✨ **多Agent协作**：使用AutoGen框架，不同场景由不同Agent处理（通用对话、路线规划、旅行规划）
- 🗺️ **MCP工具集成**：调用百度地图、高德地图MCP服务，真正实现「AI+工具」的结合
- 🔄 **流式处理**：SSE事件流展示Agent思考过程，提升用户体验

## 🚀 AI解决的核心问题

### 问题1：传统地图应用缺乏对话交互
**解决方案**：用户可用自然语言询问地图相关问题，无需学习复杂的UI操作

### 问题2：Agent需要调用真实的地图工具
**解决方案**：通过MCP协议集成地图服务，Agent可直接调用：
- 路线规划 - 获取最优路线
- 地点搜索 - 查询周边POI
- 天气查询 - 出行前了解天气

### 问题3：复杂查询需要多步推理
**解决方案**：
- 一般查询 → GeneralAgent处理
- 路线规划 → RouteAgent 调用地图MCP → ResultAgent总结
- 旅行规划 → TravelAgent 多步规划 → ResultAgent生成方案

## 📊 技术架构

### 前端 (React 18 + TypeScript)
```
- 实时对话界面，支持流式消息展示
- Agent思考过程可视化
- 多对话管理
- 响应式设计 (Desktop + Mobile)
```

### 后端 (FastAPI + SQLAlchemy)
```
- SSE事件流处理
- 对话历史管理
- 多Agent编排
- MCP Workbench连接
```

### AI能力
```
- 模型：（可配置）
- 多Agent框架：AutoGen
- 工具调用：MCP Standard Protocol
```

## 主要设计

1. **大模型应用**
   - Prompt Engineering：为不同Agent编写专业化的system message
   - Token管理：处理对话历史上下文，避免超出limit
   - 流式处理：实时展示AI的thinking过程

2. **Agent系统设计**
   - 多Agent协作架构（AutoGen）
   - Agent角色划分与提示词优化
   - 代理间的通信与结果聚合

3. **工具调用（MCP）**
   - MCP Server连接与管理
   - 工具返回结果的解析与处理
   - 错误处理与重试机制

4. **工程化最佳实践**
   - 前后端分离
   - 数据库ORM设计
   - API文档与错误处理
   - 用户认证系统

## 🛠️ 技术栈

- **前端**: React 18+, TypeScript, Tailwind CSS, React Router
- **后端**: FastAPI, SQLAlchemy, AutoGen, MCP
- **数据库**: SQLite
- **地图服务**: 百度地图MCP, 高德地图MCP
- **模型**: OpenAI GPT-4/4o

## ⚡ 快速开始

### 前置要求
- Node.js 16+
- Python 3.8+
- pnpm (或npm/yarn)
- OpenAI API Key
- 百度地图 API Key

### 环境配置

```bash
# 复制环境变量文件
cp .env.example .env

# 编辑 .env 文件，填写：
# - OPENAI_API_KEY
# - BAIDU_MAPS_API_KEY
# - AMAP_MCP_KEY
```

### 安装依赖

```bash
# 安装前端依赖
pnpm install

# 安装后端依赖
cd server
pip install -r requirements.txt
cd ..
```

### 启动应用

```bash
# 同时启动前端和后端（推荐）
pnpm dev

# 或单独启动
pnpm dev:client  # 前端: http://localhost:3000
pnpm dev:server  # 后端: http://localhost:8001
```

## 📁 项目结构

```
ai-map-assistant/
├── src/                    # 前端代码
│   ├── components/         # React组件
│   │   ├── AgentMessage/   # Agent消息组件
│   │   └── ...
│   ├── pages/              # 页面
│   └── types/              # TypeScript类型定义
├── server/                 # 后端代码
│   ├── teams/              # 多Agent实现
│   │   ├── general_team.py # 通用对话Agent
│   │   ├── route_team.py   # 路线规划Agent
│   │   ├── travel_team.py  # 旅行规划Agent
│   │   └── base.py         # MCP基础配置
│   ├── main.py             # FastAPI主应用
│   ├── models.py           # 数据库模型
│   └── requirements.txt    # Python依赖
├── sqlitedb/               # SQLite数据库
└── package.json            # Node.js配置
```

## 🔑 核心代码示例

### 多Agent编排（server/main.py）
```python
if mode == "route":
    # 调用路线规划Agent
    async for chunk in process_route_query(content, conversation_id, db, user_location):
        # 流式处理Agent输出
        yield _sse_event({'agent': agent, 'content': chunk_content})
```

### MCP工具调用（server/teams/base.py）
```python
async def get_baidu_mcp_workbench():
    workbench = McpWorkbench(server_params=SseServerParams(
        url=f"https://mcp.map.baidu.com/sse?ak={BAIDU_MCP_KEY}"
    ))
    return workbench
```

## 🧪 测试账户

系统启动时自动创建：
- 用户名: `testuser`
- 密码: `testpassword`

## ⚠️ 常见问题

### 注册失败
1. 确保后端已启动：`pnpm dev:server`
2. 检查API连接：http://localhost:8001/docs

### MCP连接失败
1. 验证API Key是否正确
2. 检查网络连接和防火墙
3. 查看后端日志中的MCP连接状态

### Agent无响应
1. 检查OpenAI API额度
2. 查看Token使用情况
3. 检查模型是否可用

---

**最后更新**: 2026年5月
