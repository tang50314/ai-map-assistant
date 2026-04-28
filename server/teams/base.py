

import os
import sys
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_ext.tools.mcp import McpWorkbench, SseServerParams

# ---------------------
# 高德 MCP Server Key
# ---------------------
AMAP_MCP_KEY = os.getenv("AMAP_MCP_KEY", "REMOVED")

# ---------------------
# 百度地图 MCP Server Key
# ---------------------
BAIDU_MCP_KEY = os.getenv("BAIDU_MCP_KEY", "REMOVED")

# =====================
# 模型客户端
# =====================
model_client = OpenAIChatCompletionClient(
    model="deepseek-ai/DeepSeek-V3",
    api_key="REMOVEDwbrhdtkdwmpfyemxrcwmpcnkapjbzkhcdmyblvmczbckhpnr",
    base_url="https://api.siliconflow.cn/v1/",
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
# MCP Workbench（高德 MCP SSE）
# =====================
async def create_mcp_workbench():
    """创建高德 MCP Workbench 连接"""
    try:
        flush_print("🔄 正在连接高德 MCP Server...")
        server_params = SseServerParams(
            # 注意：高德 MCP SSE 地址形式如下，key 是你在控制台申请的
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
    """创建百度地图 MCP Workbench 连接"""
    try:
        flush_print("🔄 正在连接百度地图 MCP Server...")
        server_params = SseServerParams(
            # 百度地图 MCP SSE 地址
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

# 缓存 MCP Workbench 实例
_mcp_workbench_cache = None
_baidu_mcp_workbench_cache = None

class CachedMcpWorkbench:
    """包装 MCP Workbench 并管理状态"""
    def __init__(self, workbench):
        self.workbench = workbench
        self._stopped = False

    async def stop(self):
        if not self._stopped and self.workbench:
            await self.workbench.stop()
            self._stopped = True
            global _mcp_workbench_cache
            _mcp_workbench_cache = None

    def __getattr__(self, name):
        return getattr(self.workbench, name)

async def get_mcp_workbench():
    """获取 MCP Workbench 实例（缓存）"""
    global _mcp_workbench_cache
    if _mcp_workbench_cache is None:
        workbench = await create_mcp_workbench()
        if workbench:
            _mcp_workbench_cache = CachedMcpWorkbench(workbench)
        else:
            return None
    return _mcp_workbench_cache

async def get_baidu_mcp_workbench():
    """获取百度地图 MCP Workbench 实例（缓存）"""
    global _baidu_mcp_workbench_cache
    if _baidu_mcp_workbench_cache is None:
        workbench = await create_baidu_mcp_workbench()
        if workbench:
            _baidu_mcp_workbench_cache = CachedMcpWorkbench(workbench)
        else:
            return None
    return _baidu_mcp_workbench_cache