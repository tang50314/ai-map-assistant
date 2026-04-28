# 旅行规划团队
import asyncio
import json
import os
import uuid
from typing import Any, Dict, Optional, List, AsyncGenerator
from datetime import datetime
import time
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
    """创建带有记忆功能的代理团队"""

    # PreferenceAgent 不变
    preference_agent = AssistantAgent(
        name="PreferenceAgent",
        description="解析用户偏好，输出严格 JSON schema",
        model_client=model_client,
        memory=memories,
        model_client_stream=True,
        handoffs=["MapToolAgent", "PlanningAgent", "EndAgent"],
        system_message="""你是一个专业的用户偏好分析专家。
请从用户输入中提取用户预算、时长、兴趣、风格、约束等信息。
如果无法提取足够信息，则请求用户补充后结束任务。
如果提取到至少三项信息，请将结果传递给 MapToolAgent 和 PlanningAgent 继续任务。"""
    )

    # MapToolAgent：调用高德 MCP 地图服务
    map_tool_agent = AssistantAgent(
        name="MapToolAgent",
        description="调用高德地图 MCP 服务获取地理数据",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        model_client_stream=True,
        system_message="""你是一个地图数据工具专家，你可以和 PlanningAgent 组成旅行规划小组，来回讨论攻略直到满足用户目标。
请使用高德地图 MCP 服务进行以下操作：
- maps_geo             地理编码
- maps_regeocode       逆地理编码
- maps_text_search     关键字 POI 搜索
- maps_around_search   周边搜索
- maps_search_detail   POI 详细信息
- maps_direction_driving    驾车路线
- maps_direction_walking    步行路线
- maps_bicycling      骑行路线
- maps_direction_transit_integrated 公交综合路线
- maps_weather        天气查询
- maps_distance       距离测量
调用路线规划工具获取起点和终点坐标，然后输出 **高德地图导航唤端链接**：
输出查询过程和结果，并将数据交给 PlanningAgent 使用。"""
    )

    # PlanningAgent：行程规划
    planning_agent = AssistantAgent(
        name="PlanningAgent",
        description="制定详细的旅行计划",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        model_client_stream=True,
        system_message="""你是专业旅行规划师，基于 MapToolAgent 提供的高德 MCP 数据和用户偏好设计可执行详细行程。
输出要求：
1. 每日行程安排（活动 + 时间 + 交通）
2. 餐饮推荐
3. 预算估算
4. 注意事项
5. 天气预报（若用户指定日期超出高德 MCP 天气范围，请提示）
不要反问用户，不输出无效错误数据。"""
    )

    # ResultAgent：整理输出
    result_agent = AssistantAgent(
        name="ResultAgent",
        description="输出最终用户友好的攻略",
        model_client=model_client,
        memory=memories,
        model_client_stream=True,
        system_message="""你负责接收 PlanningAgent 的结果，并输出完整旅行攻略。
包含每日详细安排、交通说明、POI 信息、天气、预算等，如果可以还可以添加可视化的图标表格等。
你不得反问用户。不得输出无效错误数据。完成任务后马上把内容传给 EndAgent。"""
    )

    # EndAgent 判定完成
    end_agent = AssistantAgent(
        name="EndAgent",
        description="判定任务是否完成并输出 TERMINATE",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        system_message="""如果收到有效的 ResultAgent 输出，请输出 'TERMINATE'。
如果任务不完整，则继续推进，不要随意结束。你只需要判断输出'TERMINATE'，不要做多余的事"""
    )

    return [preference_agent, map_tool_agent, planning_agent, result_agent, end_agent]

# 公共函数：创建记忆存储
async def _create_memory_store(user_query: str, user_id: Optional[str] = None) -> List[Memory]:
    """创建记忆存储"""
    memories = []
    if user_id:
        conversation_memory = ListMemory()
        await conversation_memory.add(
            MemoryContent(
                content=f"用户查询: {user_query}",
                mime_type=MemoryMimeType.TEXT,
                metadata={"type": "user_query", "user_id": user_id, "timestamp": datetime.now().isoformat()}
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
        注意，多次发现PreferenceAgent识别到满足触发条件，但并没有正确移交给MapToolAgent和PlanningAgent进行任务执行
        没有正确完成任务，必须要按照要求进行处理，不得随意结束任务。
        请按照以下要求处理：
        1. PreferenceAgent 提取用户偏好 （不得随意结束任务，若提取到详细信息，必须将流程完整进行，不得输出‘TERMINATE’）
        2. MapToolAgent 执行工具调用,同时输出问题处理过程包含工具调用结果
        3. PlanningAgent 制定详细计划  （MapToolAgent和PreferenceAgent合作）
        4. ResultAgent 提供结构化回答
        5. EndAgent 确认任务完成
        """
    )

# 公共函数：构建查询任务
def _build_query_task(user_query: str, is_travel: bool = False) -> str:
    """构建查询任务"""
    if is_travel:
        return f"""
        旅行规划任务：{user_query}
        
        请按照完整流程规划履行任务：偏好提取 → （地图查询 🔁 行程规划） → 最终攻略
        系统会自动从对话记忆中提取相关的用户偏好和历史建议。
        """
    else:
        return f"""
        用户查询：{user_query}
        
        请按照以下要求处理：
        1. PreferenceAgent 提取用户偏好 （不得随意结束任务，若提取到详细信息，必须将流程完整进行）
        2. MapToolAgent 执行工具调用
        3. PlanningAgent 制定详细计划  （MapToolAgent和PreferenceAgent合作）
        4. ResultAgent 提供结构化回答
        5. EndAgent 确认任务完成
        
        系统会自动从记忆中提取相关的上下文信息。
        """

# 公共函数：处理团队运行结果
async def _process_team_run(team: SelectorGroupChat, task: str, key_agents: List[str]) -> AsyncGenerator[Dict[str, Any], None]:
    """处理团队运行结果"""
    async for message in team.run_stream(task=task):
        if isinstance(message, TextMessage):
            timestamp = time.strftime("%H:%M:%S")
            flush_print(f"[{timestamp}] 📢 {message.source}: {message.content}")
            
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
    if workbench:
        await workbench.stop()
    if memories:
        for memory in memories:
            await memory.close()

# 流式处理地图查询
async def process_map_query_stream(user_query: str, memory_strategy: str = "file", user_id: Optional[str] = None) -> AsyncGenerator[Dict[str, Any], None]:
    """流式处理地图相关查询，使用Memory机制管理上下文"""
    flush_print(f"🗺️ 收到查询: {user_query}")
    
    task_status = TaskStatus()
    task_status.set_status("running")
    
    # 立即发送初始响应，避免用户等待
    yield {"content": "正在分析您的需求，请稍候...", "agent": "System", "type": "initial_response"}
    
    # 使用缓存的workbench，避免重复初始化
    workbench = await get_mcp_workbench()
    
    try:
        # 创建记忆存储和团队
        memories = await _create_memory_store(user_query, user_id)
        team = await _create_team(workbench, memories)
        
        # 构建查询任务
        task = _build_query_task(user_query)
        flush_print(f"🤖 多代理协作开始...")
        
        # 处理团队运行结果
        async for result in _process_team_run(team, task, ["PreferenceAgent", "ResultAgent"]):
            yield result
        
        # 标记完成
        yield {"done": True}
        
    except Exception as e:
        error_msg = f"❌ 处理查询时出错: {str(e)}"
        flush_print(error_msg)
        yield {"content": error_msg, "done": True}
    
    finally:
        await _cleanup_resources(workbench, memories)

# 处理地图查询（同步版本）
async def process_map_query(user_query: str, memory_strategy: str = "file", user_id: Optional[str] = None) -> str:
    """处理地图相关查询，返回总结结果"""
    result_content = ""
    async for message in process_map_query_stream(user_query, memory_strategy, user_id):
        if message.get("content") and not message.get("done"):
            result_content = message.get("content", "")
        if message.get("done"):
            break
    return result_content

# 旅行规划专用函数
async def process_travel_query(user_query: str, conversation_id: int, db: Session) -> AsyncGenerator[Dict, None]:
    """旅行规划专用：使用Memory机制管理对话历史"""
    flush_print(f"🧳 收到旅行规划请求: {user_query}")
    
    # 立即发送初始响应，避免用户长时间等待
    yield {"content": "正在启动旅行规划助手，请稍候...", "agent": "System", "type": "initial_response"}
    
    conversation_memory = ListMemory()
    
    # 快速分析用户意图，提供即时反馈
    query_lower = user_query.lower()
    if any(word in query_lower for word in ['北京', '上海', '广州', '深圳', '杭州', '成都', '西安', '重庆']):
        yield {"content": "检测到您询问的是热门城市，我正在快速获取相关信息...", "agent": "System", "type": "initial_response"}
    elif any(word in query_lower for word in ['预算', '价格', '费用']):
        yield {"content": "正在分析您的预算需求，为您推荐性价比最高的方案...", "agent": "System", "type": "initial_response"}
    elif any(word in query_lower for word in ['时间', '几天', '行程']):
        yield {"content": "正在根据您的时间安排制定最优行程...", "agent": "System", "type": "initial_response"}
    
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
        key_keywords = ['预算', 'budget', '价格', '时间', '天数', '兴趣', '偏好', '推荐', '建议', '行程']
        
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
        
        # 添加当前查询
        await conversation_memory.add(
            MemoryContent(
                content=f"用户查询: {user_query}",
                mime_type=MemoryMimeType.TEXT,
                metadata={"type": "user_query", "timestamp": datetime.now().isoformat()}
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
        task = _build_query_task(user_query, is_travel=True)

        # 处理团队运行结果
        async for result in _process_team_run(team, task, ["PreferenceAgent", "PlanningAgent", "MapToolAgent", "ResultAgent", "EndAgent"]):
            yield result

    except Exception as e:
        error_msg = f"❌ 处理旅行规划时出错: {str(e)}"
        flush_print(error_msg)
        yield {"content": error_msg, "agent": "ErrorAgent", "done": False}
        
    finally:
        try:
            await workbench.stop()
            await conversation_memory.close()
        except Exception as cleanup_error:
            flush_print(f"清理资源时出错: {cleanup_error}")
        
        # 确保始终发送完成信号
        yield {"done": True}