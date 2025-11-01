# 路线规划团队
from typing import Dict, AsyncGenerator
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.conditions import TextMentionTermination,SourceMatchTermination
from autogen_agentchat.messages import TextMessage
from autogen_agentchat.teams import SelectorGroupChat
from sqlalchemy.orm import Session
from .base import model_client, create_mcp_workbench, flush_print

async def process_route_query(user_query: str, conversation_id: int, db: Session) -> AsyncGenerator[Dict, None]:
    """路线规划专用：精简版地图团队"""
    flush_print(f"🛣️ 收到路线规划请求: {user_query}")
    
    # 获取对话历史消息（最近10条）
    from main import Message
    history_messages = db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.sender != "system"  # 排除系统消息
    ).order_by(Message.timestamp.asc()).all()
    
    # 构建包含历史的消息列表
    context_messages = []
    for msg in history_messages[-10:]:  # 只取最近10条消息，避免上下文过长
        if msg.sender == "user":
            context_messages.append({"role": "user", "content": msg.content})
        elif msg.sender == "ai":
            context_messages.append({"role": "assistant", "content": msg.content})
    
    workbench = await create_mcp_workbench()
    try:
        # 精简代理团队
        planning = AssistantAgent(
            name="RoutePlanner",
            description="规划最优路线",
            model_client=model_client,
            workbench=workbench,
            system_message="分析起点终点，规划最优驾车/步行/公交路线，考虑时间、距离、拥堵。参考历史对话理解用户偏好。"
        )
        tool = AssistantAgent(
            name="MapTool",
            description="调用地图工具",
            model_client=model_client,
            workbench=workbench,
            system_message="使用 MCP 工具调用 route_plan 和 search_poi，输出原始结果。"
        )
        result = AssistantAgent(
            name="ResultAgent",
            description="输出用户友好路线",
            model_client=model_client,
            workbench=workbench,
            system_message="整理为 Markdown 路线卡：起点→终点、步数、时间、导航提示。参考历史对话提供个性化建议。"
        )

        team = SelectorGroupChat(
            [planning, tool, result],
            model_client=model_client,
            termination_condition=SourceMatchTermination("end")
        )

        # 构建包含历史上下文的查询
        context_str = ""
        if context_messages:
            context_str = "\n之前的对话历史：\n"
            for ctx_msg in context_messages:
                context_str += f"{ctx_msg['role']}: {ctx_msg['content']}\n"
        
        enhanced_query = f"""
        路线规划任务：{user_query}
        
        {context_str}
        
        请参考之前的对话历史来更好地理解用户的出行偏好和需求。
        """

        async for msg in team.run_stream(task=enhanced_query):
            if isinstance(msg, TextMessage):
                flush_print(f"📍 {msg.source}: {msg.content}")
                if msg.source == "ResultAgent" and msg.content.strip() and msg.content.upper() != "TERMINATE":
                    yield {"content": msg.content}

        yield {"content": "", "done": True}

    finally:
        await workbench.stop()