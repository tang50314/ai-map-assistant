# AI地图助手 - 全栈AI对话应用

## 项目概述
这是一个集成百度地图MCP服务的智能对话应用，作为毕业设计项目。该应用允许用户与AI助手进行对话，并获取地图相关服务，如路线规划、地点查询和天气信息等。

## 技术栈
- **前端**: React 18+, TypeScript, Tailwind CSS, React Router
- **后端**: FastAPI, SQLAlchemy, Autogen
- **数据库**: SQLite
- **地图服务**: 百度地图MCP

## 快速开始

### 前置要求
- Node.js 16+
- Python 3.8+
- pnpm (或npm/yarn)

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
pnpm dev:client  # 启动前端 (http://localhost:3000)
pnpm dev:server  # 启动后端 (http://localhost:8001)
```

## 功能说明
- 用户认证系统（注册、登录）
- AI对话界面
- 多对话管理
- 模型配置
- 地图服务集成（路线规划、地点查询、天气查询等）
- 响应式设计，支持移动端和桌面端
- 明暗主题切换

## 测试账户
系统启动时会自动创建测试账户：
- 用户名: testuser
- 密码: testpassword

## 常见问题解决

### 注册失败问题
如果遇到"注册失败，请检查网络连接"的问题：
1. 确保后端服务已启动 (`pnpm dev:server`)
2. 检查控制台错误信息
3. 尝试使用测试账户直接登录

### 百度地图MCP配置
1. 在百度地图开放平台申请API Key
2. 创建`.env`文件（参考`.env.example`）
3. 设置`BAIDU_MAPS_API_KEY`环境变量

## 项目结构
- `src/`: 前端代码
- `server/`: 后端代码
- `sqlitedb/`: SQLite数据库文件

## 注意事项
- 本项目为毕业设计演示版，请勿用于生产环境
- 定期备份数据库文件
- 敏感信息（如API密钥）请使用环境变量配置