# 通用聊天团队
from typing import Dict, AsyncGenerator, List
from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.conditions import TextMentionTermination
from autogen_agentchat.messages import TextMessage, BaseChatMessage
from autogen_agentchat.teams import SelectorGroupChat
from sqlalchemy.orm import Session
from .base import model_client, flush_print, get_mcp_workbench

async def process_general_query(user_query: str, conversation_id: int, db: Session) -> AsyncGenerator[Dict, None]:
    """普通聊天：单代理快速响应，支持上下文记忆"""
    flush_print(f"💬 收到普通聊天请求: {user_query}")
    
    # 获取对话历史消息（排除当前刚插入的消息）
    from models import Message
    history_messages = db.query(Message).filter(
        Message.conversation_id == conversation_id,
        Message.sender != "system"  # 排除系统消息
    ).order_by(Message.timestamp.asc()).all()
    
    # 构建包含历史的消息列表
    messages = []
    for msg in history_messages[-10:]:  # 只取最近10条消息，避免上下文过长
        if msg.sender == "user":
            messages.append(TextMessage(content=msg.content, source="user"))
        elif msg.sender == "ai":
            messages.append(TextMessage(content=msg.content, source="assistant"))
    
    # 添加当前用户消息
    current_message = TextMessage(content=user_query, source="user")
    messages.append(current_message)
    
    workbench = await get_mcp_workbench()


    agent = AssistantAgent(
        name="GeneralAgent",
        description="通用对话助手",
        model_client=model_client,
        workbench=workbench,
        model_client_stream=True,
        system_message='''你是一个友好的AI助手，回答用户日常问题。
        可以调用workbench中的工具回答用户提问，但必须将调用后得到的结果以markdown的格式结构化输出。
        不得随意输出
        参考对话历史来理解上下文，保持对话的连贯性。'''
    )
    
    flush_print(f"🗣️ GeneralAgent 正在处理: {user_query}")
    flush_print(f"📚 历史消息数量: {len(messages) - 1}")  # 减1因为不包含当前消息
    
    try:
        # 将所有消息（历史+当前）一起发送给代理
        response = await agent.run(task=messages)
        flush_print(f"📨 代理返回类型: {type(response)}")
        
        # 提取实际的回复内容
        if hasattr(response, 'messages') and response.messages:
            # 获取最后一条消息（AI的回复）
            last_message = response.messages[-1]
            if hasattr(last_message, 'content'):
                content = last_message.content
                flush_print(f"🗣️ GeneralAgent: {content}")
                yield {"content": content}
            else:
                content = "抱歉，无法解析代理的回复。"
                flush_print(f"❌ 无法解析消息内容: {last_message}")
                yield {"content": content}
        elif hasattr(response, 'content'):
            content = response.content
            flush_print(f"🗣️ GeneralAgent: {content}")
            yield {"content": content}
        else:
            # 如果没有找到合适的属性，尝试转换为字符串
            content = str(response)
            flush_print(f"🗣️ GeneralAgent (字符串): {content}")
            yield {"content": content}
            
    except Exception as e:
        error_msg = f"代理处理失败: {str(e)}"
        flush_print(f"❌ 错误: {error_msg}")
        yield {"content": error_msg}
    
    yield {"content": "", "done": True}