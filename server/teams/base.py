# 基础功能模块
import os
import sys
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_ext.tools.mcp import McpWorkbench, SseServerParams

# 百度地图API配置
BAIDU_MAPS_API_KEY = os.getenv("BAIDU_MAPS_API_KEY", "REMOVED")

# 创建模型客户端
model_client = OpenAIChatCompletionClient(
    model="deepseek-ai/DeepSeek-V3",
    api_key="REMOVEDwbrhdtkdwmpfyemxrcwmpcnkapjbzkhcdmyblvmczbckhpnr",
    base_url="https://api.siliconflow.cn/v1/",
    model_info={
        "vision": False,
        "function_calling": True,
        "json_output": False,
        "family": "qwen",
        "structured_output": True,
        "multiple_system_messages": True,
    }
)

# 实时刷新打印函数
def flush_print(*args, **kwargs):
    """确保输出立即显示"""
    print(*args, **kwargs)
    sys.stdout.flush()

# 创建MCP Workbench
async def create_mcp_workbench():
    """创建百度地图MCP Workbench"""
    try:
        server_params = SseServerParams(
            url=f"https://mcp.map.baidu.com/sse?ak={BAIDU_MAPS_API_KEY}",
            timeout=30
        )
        workbench = McpWorkbench(server_params=server_params)
        await workbench.start()
        flush_print("✅ MCP Workbench 启动成功")
        return workbench
    except Exception as e:
        flush_print(f"❌ 创建 MCP Workbench 失败: {str(e)}")
        raise