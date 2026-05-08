import os
import sys
from dotenv import load_dotenv
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_ext.tools.mcp import McpWorkbench, SseServerParams

# =====================
# 加载环境变量
# =====================
from pathlib import Path

# 自动定位项目根目录 .env
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path)


def get_required_env(key: str) -> str:
    """获取必须存在的环境变量"""
    value = os.getenv(key)
    if not value:
        raise ValueError(f"缺少环境变量: {key}")
    return value


# =====================
# API Keys
# =====================
AMAP_MCP_KEY = get_required_env("AMAP_MCP_KEY")
BAIDU_MCP_KEY = get_required_env("BAIDU_MAPS_API_KEY")
SILICONFLOW_API_KEY = get_required_env("SILICONFLOW_API_KEY")

MODEL_BASE_URL = os.getenv("MODEL_BASE_URL", "https://api.siliconflow.cn/v1/")


# =====================
# 模型客户端
# =====================
model_client = OpenAIChatCompletionClient(
    model="deepseek-ai/DeepSeek-V3",
    api_key=SILICONFLOW_API_KEY,
    base_url=MODEL_BASE_URL,
    max_tokens=8000,
    model_info={
        "vision": False,
        "function_calling": True,
        "json_output": False,
        "family": "qwen",
        "structured_output": True,
        "multiple_system_messages": True,
    }
)


def flush_print(*args, **kwargs):
    """确保输出立即显示"""
    print(*args, **kwargs)
    sys.stdout.flush()


# =====================
# 高德 MCP Workbench
# =====================
async def create_mcp_workbench():
    try:
        flush_print("🔄 正在连接高德 MCP Server...")

        server_params = SseServerParams(
            url=f"https://mcp.amap.com/sse?key={AMAP_MCP_KEY}",
            timeout=60,
            headers={
                "Accept": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            }
        )

        workbench = McpWorkbench(server_params=server_params)
        await workbench.start()

        flush_print("✅ 高德 MCP Server 连接成功")
        return workbench

    except Exception as e:
        flush_print(f"❌ 连接高德 MCP Server 失败: {str(e)}")
        return None


# =====================
# 百度地图 MCP Workbench
# =====================
async def create_baidu_mcp_workbench():
    try:
        flush_print("🔄 正在连接百度地图 MCP Server...")

        server_params = SseServerParams(
            url=f"https://mcp.map.baidu.com/sse?ak={BAIDU_MCP_KEY}",
            timeout=60,
            headers={
                "Accept": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            }
        )

        workbench = McpWorkbench(server_params=server_params)
        await workbench.start()

        flush_print("✅ 百度地图 MCP Server 连接成功")
        return workbench

    except Exception as e:
        flush_print(f"❌ 连接百度地图 MCP Server 失败: {str(e)}")
        return None


# =====================
# 缓存实例
# =====================
_mcp_workbench_cache = None
_baidu_mcp_workbench_cache = None


class CachedMcpWorkbench:
    def __init__(self, workbench):
        self.workbench = workbench
        self._stopped = False

    async def stop(self):
        global _mcp_workbench_cache

        if not self._stopped and self.workbench:
            await self.workbench.stop()
            self._stopped = True
            _mcp_workbench_cache = None

    def __getattr__(self, name):
        return getattr(self.workbench, name)


async def get_mcp_workbench():
    global _mcp_workbench_cache

    if _mcp_workbench_cache is None:
        workbench = await create_mcp_workbench()
        if workbench:
            _mcp_workbench_cache = CachedMcpWorkbench(workbench)

    return _mcp_workbench_cache


async def get_baidu_mcp_workbench():
    global _baidu_mcp_workbench_cache

    if _baidu_mcp_workbench_cache is None:
        workbench = await create_baidu_mcp_workbench()
        if workbench:
            _baidu_mcp_workbench_cache = CachedMcpWorkbench(workbench)

    return _baidu_mcp_workbench_cache