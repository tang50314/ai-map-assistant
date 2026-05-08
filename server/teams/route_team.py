# 路线规划团队
import asyncio
import json
import os
import uuid
from typing import Dict, AsyncGenerator, Any, Optional, List
from datetime import datetime
import time
import re
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.conditions import TextMentionTermination
from autogen_agentchat.messages import TextMessage
from autogen_agentchat.teams import SelectorGroupChat
from autogen_core.memory import Memory, ListMemory, MemoryContent, MemoryMimeType
from sqlalchemy.orm import Session
from .base import model_client, get_mcp_workbench, flush_print

# 任务状态管理
class TaskStatus:
    def __init__(self):
        self.task_id = str(uuid.uuid4())
        self.status = "pending"
        self.messages = []
        self.result = None
        self.created_at = datetime.now()
        self.updated_at = datetime.now()

    def add_message(self, source: str, content: str):
        self.messages.append({
            "source": source,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
        self.updated_at = datetime.now()

    def set_status(self, status: str):
        self.status = status
        self.updated_at = datetime.now()

    def set_result(self, result: str):
        self.result = result
        self.status = "completed"
        self.updated_at = datetime.now()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "status": self.status,
            "messages": self.messages,
            "result": self.result,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat()
        }

# 消息处理函数
async def process_messages(messages: List[Dict[str, Any]], task_status: TaskStatus) -> str:
    """处理消息并提取最终结果"""
    final_response = ""
    
    for message in messages:
        source = message.get("source", "")
        content = message.get("content", "").strip()
        
        # 记录消息到任务状态
        task_status.add_message(source, content)
        
        # 实时捕获ResultAgent的最终结果，且排除TERMINATE指令
        if source == "ResultAgent" and content and content.upper() != "TERMINATE":
            final_response = content
    
    return final_response

# 创建代理团队
async def create_agents(workbench, model_client, memories: List[Memory] | None = None):
    """创建带有记忆功能的路线规划代理团队"""

    # 路线意图解析 Agent
    route_parser = AssistantAgent(
        name="RoutePlanner",
        description="解析用户路线需求信息",
        model_client=model_client,
        memory=memories,
        model_client_stream=True,
        system_message="""你是一个专业的路线规划意图解析专家。
        你是一个专业的路线规划专家。 分析起点终点，规划最优驾车/步行/公交路线，考虑时间、距离、拥堵情况。 
        若信息不足，要求用户补充，不必再交给别的agent，只需马上把结果交给EndAgent。
从用户输入及对话历史中抽取以下结构化信息：
{
  "origin_address": "string or needs_current_location",
  "destination_address": "string",
  "transport_mode": "driving|walking|bicycling|transit",
  "along_route_keywords": ["用户想顺路寻找的品牌/品类/POI关键词，例如 霸王茶姬、瑞幸、奶茶、咖啡、加油站、服务区"],
  "scenic_preferences": ["自然风光", "历史文化", "美食", "亲子", "休息补给"]
}

注意：
1. 若用户未给出起点，则输出 "needs_current_location" 作为 origin_address；
2. 若用户明确指定交通方式则使用该方式，否则默认为最优方式；
3. 如果用户说“沿途/路上/顺路/先去/途经/找一家/喝奶茶/买咖啡/加油/吃饭”，必须提取 along_route_keywords；
4. 如果用户只说品类（如“奶茶店”），保留品类；如果用户说品牌（如“霸王茶姬”“瑞幸”），优先保留品牌；
"""
    )

    # 地图工具执行 Agent
    map_tool_agent = AssistantAgent(
        name="MapTool",
        description="调用高德 MCP Server 路线规划工具获取精确路线数据",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        model_client_stream=True,
        system_message="""你是高德 MCP Server 的地图工具专家。

根据 RoutePlanner 输出的起点、终点、交通方式、沿途停靠关键词和用户偏好，
请按以下步骤使用 MCP 工具：

1. 使用 maps_direction_driving_by_coordinates 或 maps_direction_driving_by_address:
   获取起点 → 终点的驾车路线返回结构。
   返回内容须包含：距离(distance)、预计时间(duration)、路线点列表(paths/steps)。

2. 将返回路线中的关键坐标 (例如步骤中的经纬度点) 提取出来，遍历这些点调用：
   maps_around_search 或 maps_text_search：
   - maps_around_search:
     输入: 每个节点的坐标和 keywords=RoutePlanner.along_route_keywords 中的关键词
     目的是获取顺路停靠点 POI。
   - 若 maps_around_search 没有找到，则 fallback maps_text_search:
     输入: 关键词 + 沿途城市名 搜索附近。
   输出一定要包含每个找到的 POI 的名称、详细地址、距离、坐标、适合停靠的原因。

3. 对 POI 结果进行去重合并，优先选择：
   - 偏离主路线较少
   - 靠近高速出入口/服务区/城市主干道
   - 评分或知名度更高
   - 与用户偏好更匹配

4. 如果用户没有 along_route_keywords，但有“自然风光/历史文化”等 scenic_preferences，则搜索沿途适合短暂停留的景点。

请只返回真实 MCP 工具调用返回的 JSON 结构和整理好的沿路 POI 信息。不要编造 MCP 数据；如果工具失败，明确返回 tool_error 字段，并说明失败位置。

示例结构：
{
 "route": {... MCP route return ...},
 "pois_along_route": [
   { "keyword":"霸王茶姬", "name":"霸王茶姬 XX店", "address":"...", "location":"lng,lat", "distance_to_route": "...", "stop_reason":"偏离主线少，适合中途休息" },
   ...
 ],
 "tool_error": null
}

"""
    )

    # 用户友好输出 Agent
    result_agent = AssistantAgent(
        name="ResultAgent",
        description="整理地图工具返回的路线数据并输出用户可读路线卡",
        model_client=model_client,
        memory=memories,
        model_client_stream=True,
        system_message="""你负责接收 MapTool 返回的 MCP JSON 路线规划数据，
并将其格式化成 Markdown 路线卡。

输出内容应包含：
1. 起点 & 终点坐标和可读地址
2. 交通方式
3. 路线距离、时间
4. 步骤指导（turn‑by‑turn，若 MCP 返回）
5. 沿途顺路停靠推荐：如果 MapTool 返回 pois_along_route，要给出 2-5 个推荐点，说明适合什么时候停、为什么顺路、是否需要轻微绕行。
6. 📍 从 起点（展示起点地名） 到 终点 的路线规划：
🚶‍♀️ 步行路线（例）
https://ditu.amap.com/dir?from[lnglat]={起点地名}&to[lnglat]={终点地名}&type=walk
🚴‍♂️ 骑行路线（例）
https://ditu.amap.com/dir?from[lnglat]={起点地名}&to[lnglat]={终点地名}&type=ride   
🚗 驾车路线
https://ditu.amap.com/dir?from[lnglat]={起点地名}&to[lnglat]={终点地名}&type=drive
🚌 公交路线
https://ditu.amap.com/dir?from[lnglat]={起点地名}&to[lnglat]={终点地名}&type=transit


如果是 “needs_current_location”，并且 MapTool 已用 maps_ip_location 获取了当前位置，经纬度可作为起点。
不要生成无意义的解释段落，要结合结构化返回数据输出有用结果。
如果 MapTool 返回 tool_error，不要把技术错误直接甩给用户，要给出可执行的降级建议和下一步可补充的信息。
"""
    )

    # EndAgent 确保结束
    end_agent = AssistantAgent(
        name="EndAgent",
        description="确认任务完成并输出 TERMINATE",
        model_client=model_client,
        memory=memories,
        model_client_stream=True,
        system_message="""收到 ResultAgent 的有效输出后，请输出 'TERMINATE' 结束流程，只输出终止标识，不做其他解释。"""
    )

    return [route_parser, map_tool_agent, result_agent, end_agent]

def _has_explicit_origin(user_query: str) -> bool:
    patterns = [
        r"从.+?(出发|到|去|至)",
        r"起点[是为:]?.+",
        r"出发地[是为:]?.+",
    ]
    return any(re.search(pattern, user_query) for pattern in patterns)

def _route_fallback_response(user_query: str, reason: str) -> str:
    return f"""## 路线规划暂时降级

地图 MCP 服务本次响应不稳定，系统没有继续等待到超时崩溃，而是先给出可执行的备用方案。

**你的需求**：{user_query}

**建议方案**
- 如果是跨城自驾，先确认具体起点和终点，例如“上海人民广场 → 南京夫子庙”。
- 上海到南京自驾通常可优先考虑沪蓉高速/G42方向，实际路线以实时导航为准。
- 如果偏好自然风光和历史文化，可把中途停留点设置为苏州、无锡、镇江一带，再进入南京。

**我建议你下一步这样问**
“从上海人民广场自驾到南京夫子庙，沿途想看自然风光和历史文化，帮我规划2-3天路线。”

> 降级原因：{reason}
"""


# 公共函数：创建记忆存储
async def _create_memory_store(user_query: str, user_id: Optional[str] = None, user_location: Optional[dict] = None) -> List[Memory]:
    """创建记忆存储"""
    memories = []
    if user_id:
        conversation_memory = ListMemory()
        should_use_location = user_location and not _has_explicit_origin(user_query)
        location_info = f" (用户位置: 纬度{user_location['latitude']}, 经度{user_location['longitude']})" if should_use_location else ""
        await conversation_memory.add(
            MemoryContent(
                content=f"用户查询: {user_query}{location_info}",
                mime_type=MemoryMimeType.TEXT,
                metadata={"type": "user_query", "user_id": user_id, "timestamp": datetime.now().isoformat(), "user_location": user_location if should_use_location else None}
            )
        )
        memories.append(conversation_memory)
    return memories

# 公共函数：创建代理团队
async def _create_team(workbench, memories: List[Memory] | None = None) -> SelectorGroupChat:
    """创建代理团队"""
    agents = await create_agents(workbench, model_client, memories=memories)
    return SelectorGroupChat(
        agents,
        model_client=model_client,
        termination_condition=TextMentionTermination("TERMINATE"),
        selector_prompt="""你是一个智能助手，负责根据用户查询选择合适的代理。
        请按照以下要求处理路线规划任务：
        1. RoutePlanner 分析路线需求
        2. MapTool 执行地图工具调用
        3. ResultAgent 整理输出路线结果
        4. EndAgent 确认任务完成
        """
    )

# 公共函数：处理团队运行结果
async def _process_team_run(team: SelectorGroupChat, task: str, key_agents: List[str]) -> AsyncGenerator[Dict[str, Any], None]:
    """处理团队运行结果"""
    async for message in team.run_stream(task=task):
        if isinstance(message, TextMessage):
            timestamp = time.strftime("%H:%M:%S")
            flush_print(f"[{timestamp}] 📍 {message.source}: {message.content}")
            
            content = message.content.strip()
            if content and content.upper() != "TERMINATE":
                # 发送完整的agent信息，包括名称、内容和类型
                yield {
                    "agent": message.source,
                    "content": content,
                    "type": "agent_output"
                }

# 公共函数：清理资源
async def _cleanup_resources(workbench, memories: List[Memory] | None = None):
    """清理资源"""
    if memories:
        for memory in memories:
            await memory.close()

# 流式处理路线查询
async def process_route_query_stream(user_query: str, user_id: Optional[str] = None, user_location: Optional[dict] = None) -> AsyncGenerator[Dict[str, Any], None]:
    """流式处理路线规划查询，使用Memory机制管理上下文"""
    flush_print(f"🛣️ 收到路线规划请求: {user_query}")
    
    task_status = TaskStatus()
    task_status.set_status("running")
    
    # 立即发送初始响应，避免用户等待
    yield {"content": "正在分析您的路线需求，请稍候...", "agent": "System", "type": "initial_response"}
    
    # 使用缓存的workbench，避免重复初始化
    workbench = await get_mcp_workbench()
    
    try:
        # 创建记忆存储和团队
        memories = await _create_memory_store(user_query, user_id)
        team = await _create_team(workbench, memories)
        
        # 构建查询任务
        location_context = f"""
        用户当前位置：纬度 {user_location['latitude']}, 经度 {user_location['longitude']}
        如果用户没有明确指定起点，可以使用用户当前位置作为起点。
        """ if user_location else ""
        
        task = f"""
        路线规划任务：{user_query}
        
        {location_context}
        请按照完整流程规划路线：需求分析 → 地图查询 → 路线整理 → 最终输出
        系统会自动从对话记忆中提取相关的上下文信息。
        """
        
        flush_print(f"🤖 多代理协作开始...")
        
        # 处理团队运行结果
        async for result in _process_team_run(team, task, ["RoutePlanner", "ResultAgent"]):
            yield result
        
        # 标记完成
        yield {"done": True}
        
    except Exception as e:
        error_msg = f"❌ 处理路线规划时出错: {str(e)}"
        flush_print(error_msg)
        yield {"content": error_msg, "done": True}
    
    finally:
        await _cleanup_resources(workbench, memories)

# 处理路线查询（数据库版本）
async def process_route_query(user_query: str, conversation_id: int, db: Session, user_location: Optional[dict] = None) -> AsyncGenerator[Dict, None]:
    """路线规划专用：使用Memory机制管理对话历史"""
    flush_print(f"🛣️ 收到路线规划请求: {user_query}")
    
    # 立即发送初始响应，避免用户长时间等待
    yield {"content": "正在启动路线规划助手，请稍候...", "agent": "System", "type": "initial_response"}
    
    conversation_memory = ListMemory()
    
    # 快速分析用户意图，提供即时反馈
    query_lower = user_query.lower()
    if any(word in query_lower for word in ['驾车', '步行', '骑行', '公交', '地铁']):
        yield {"content": "检测到您询问的是交通方式，我正在快速获取相关路线信息...", "agent": "System", "type": "initial_response"}
    elif any(word in query_lower for word in ['距离', '时间', '多久']):
        yield {"content": "正在计算距离和时间，为您推荐最优路线...", "agent": "System", "type": "initial_response"}
    elif any(word in query_lower for word in ['拥堵', '交通', '路况']):
        yield {"content": "正在分析实时路况，为您避开拥堵路段...", "agent": "System", "type": "initial_response"}
    
    # 使用缓存的workbench，避免重复初始化
    workbench = await get_mcp_workbench()
    
    try:
        # 获取并筛选对话历史（只保留关键信息）
        from models import Message
        history_messages = db.query(Message).filter(
            Message.conversation_id == conversation_id,
            Message.sender != "system"
        ).order_by(Message.timestamp.asc()).all()
        
        # 只提取关键信息，避免上下文爆炸
        key_keywords = ['起点', '终点', '出发', '到达', '路线', '导航', '交通', '距离', '时间']
        
        for msg in history_messages[-10:]:  # 最近10条
            if any(keyword in msg.content.lower() for keyword in key_keywords):
                msg_type = "user_preference" if msg.sender == "user" else "ai_recommendation"
                content = msg.content[:200] if len(msg.content) > 200 else msg.content  # 截断过长内容
                
                await conversation_memory.add(
                    MemoryContent(
                        content=f"{msg_type}: {content}",
                        mime_type=MemoryMimeType.TEXT,
                        metadata={"type": msg_type, "timestamp": msg.timestamp.isoformat()}
                    )
                )
        
        # 添加当前查询和用户位置信息
        should_use_location = user_location and not _has_explicit_origin(user_query)
        location_info = f" (用户位置: 纬度{user_location['latitude']}, 经度{user_location['longitude']})" if should_use_location else ""
        await conversation_memory.add(
            MemoryContent(
                content=f"用户查询: {user_query}{location_info}",
                mime_type=MemoryMimeType.TEXT,
                metadata={"type": "user_query", "timestamp": datetime.now().isoformat(), "user_location": user_location if should_use_location else None}
            )
        )
        
        # 创建代理团队
        agents = await create_agents(workbench, model_client, memories=[conversation_memory])
        team = SelectorGroupChat(
            agents,
            model_client=model_client,
            termination_condition=TextMentionTermination("TERMINATE")
        )

        # 构建查询任务
        task = f"""
        路线规划任务：{user_query}
        
        重要约束：
        - 如果用户明确写了“从某地出发”，以用户文本中的起点为准，不要改用浏览器定位。
        - 浏览器定位只在用户没有给出起点时作为默认起点。
        
        请按照完整流程规划路线：需求分析 → 地图查询 → 路线整理 → 最终输出
        系统会自动从对话记忆中提取相关的上下文信息。
        """

        # 处理团队运行结果
        async with asyncio.timeout(150):
            async for result in _process_team_run(team, task, ["RoutePlanner", "MapTool", "ResultAgent", "EndAgent"]):
                yield result

    except Exception as e:
        error_msg = _route_fallback_response(user_query, type(e).__name__)
        flush_print(error_msg)
        yield {"content": error_msg, "agent": "ResultAgent", "type": "agent_output", "done": False}
        
    finally:
        try:
            await conversation_memory.close()
        except Exception as cleanup_error:
            flush_print(f"清理资源时出错: {cleanup_error}")
        
        # 确保始终发送完成信号
        yield {"done": True}
