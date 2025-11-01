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
from autogen_core.memory import Memory
from sqlalchemy.orm import Session
from .base import model_client, create_mcp_workbench, flush_print

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

async def create_agents(workbench, model_client, memories: List[Memory] | None = None):
    # PreferenceAgent: 解析偏好并写入长期 profile memory
    preference_agent = AssistantAgent(
        name="PreferenceAgent",
        description="解析用户偏好，输出严格 JSON schema",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        system_message="""
你是一个专业的用户偏好分析专家。
请从用户输入中提取以下信息，并以严格的 JSON 格式输出：
{
  "budget": "string or null",
  "duration": "string or null",
  "interests": ["string"],
  "travel_style": "string or null",
  "constraints": ["string"]
}
如果无法提取某项，设为 null 或空数组。
        """
    )

    # PlanningAgent: 制定详细行程计划
    planning_agent = AssistantAgent(
        name="PlanningAgent",
        description="制定详细的旅行计划",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        system_message="""
你是一个专业的旅行规划师。
根据用户偏好和地图数据，制定一个详细、可执行的行程计划。
输出格式：
1. 每日行程（时间段 + 活动 + 交通方式）
2. 餐饮推荐
3. 预算估算
4. 注意事项
        """
    )

    # MapToolAgent: 执行地图工具调用
    map_tool_agent = AssistantAgent(
        name="MapToolAgent",
        description="调用百度地图MCP工具获取地理数据",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        system_message="""
你是一个地图工具专家。
请使用 MCP Workbench 调用以下工具：
- search_poi: 搜索景点、餐厅
- route_plan: 规划驾车/公共交通路线
- weather_query: 查询天气
输出工具调用结果，不做解释。
        """
    )

    # ValidatorAgent: 验证计划合理性
    validator_agent = AssistantAgent(
        name="ValidatorAgent",
        description="验证行程的可行性",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        system_message="""
你是一个行程验证专家。
检查以下问题：
1. 时间安排是否合理（避免赶路）
2. 预算是否超标
3. 天气影响
4. 景点开放时间
如有问题，提出修改建议。
        """
    )

    # ComparatorAgent: 提供备选方案
    comparator_agent = AssistantAgent(
        name="ComparatorAgent",
        description="提供多个方案对比",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        system_message="""
提供 2-3 个不同的行程方案，并用表格对比：
| 方案 | 总时长 | 预算 | 亮点 | 适合人群 |
输出 Markdown 表格。
        """
    )

    # ResultAgent: 整理最终用户可读输出
    result_agent = AssistantAgent(
        name="ResultAgent",
        description="输出最终用户友好的 Markdown 攻略",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        system_message="请将最终入选方案整理为用户可读的 Markdown 攻略（含 TL;DR）"
    )

    # EndAgent: 负责决定是否结束
    end_agent = AssistantAgent(
        name="EndAgent",
        description="判定任务是否完整并输出 TERMINATE",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        system_message="如果结果满足要求，输出 'TERMINATE'；否则指出缺失内容。"
    )

    return [preference_agent, planning_agent, map_tool_agent, validator_agent, comparator_agent, result_agent, end_agent]

# 流式处理查询的主函数
async def process_map_query_stream(user_query: str, memory_strategy: str = "file", user_id: Optional[str] = None) -> AsyncGenerator[Dict[str, Any], None]:
    """流式处理地图相关查询，实时返回结果"""
    flush_print(f"🗺️ 收到查询: {user_query}")
    
    # 创建任务状态跟踪
    task_status = TaskStatus()
    task_status.set_status("running")
    
    # 创建MCP Workbench
    workbench = await create_mcp_workbench()
    
    try:
        # 创建代理团队
        agents = await create_agents(workbench, model_client)
        
        # 设置终止条件
        termination_condition = TextMentionTermination("TERMINATE")
        
        # 创建选择器团队
        team = SelectorGroupChat(
            agents,
            model_client=model_client,
            termination_condition=termination_condition,
        )
        
        # 构建优化的查询任务
        enhanced_query = f"""
        用户查询：{user_query}
        
        请按照以下要求处理：
        1. PreferenceAgent 提取用户偏好。
        2. PlanningAgent 制定详细计划。
        3. MapToolAgent 执行工具调用。
        4. ResultAgent 提供结构化回答。
        5. EndAgent 确认任务完成。
        
        确保信息准确、实用，在10-20秒内完成。
        """
        
        flush_print(f"🤖 多代理协作开始...")
        
        # 收集所有消息
        messages = []
        final_response = ""
        
        # 运行团队并实时输出
        async for message in team.run_stream(task=enhanced_query):
            if isinstance(message, TextMessage):
                timestamp = time.strftime("%H:%M:%S")
                flush_print(f"[{timestamp}] 📢 {message.source}: {message.content}")
                
                # 收集消息
                msg_dict = {
                    "source": message.source,
                    "content": message.content
                }
                messages.append(msg_dict)
                
                # 实时返回消息
                yield {
                    "type": "agent_message",
                    "source": message.source,
                    "content": message.content,
                    "timestamp": timestamp
                }
                
                # 捕获ResultAgent的最终结果
                if message.source == "ResultAgent":
                    content = message.content.strip()
                    if content and content.upper() != "TERMINATE":
                        final_response = message.content
                        yield {
                            "type": "result",
                            "content": content,
                            "timestamp": timestamp
                        }
        
        # 处理消息并提取最终结果
        final_response = await process_messages(messages, task_status)
        
        flush_print(f"✅ 多代理协作完成！")
        
        # 返回最终结果
        yield {
            "type": "final_result",
            "content": final_response if final_response else "处理完成",
            "done": True
        }
        
    except Exception as e:
        error_msg = f"❌ 处理查询时出错: {str(e)}"
        flush_print(error_msg)
        task_status.set_status("failed")
        task_status.set_result(f"错误: {str(e)}")
        yield {
            "type": "error",
            "content": error_msg,
            "done": True
        }
    
    finally:
        # 确保Workbench正确关闭
        if workbench:
            try:
                await workbench.stop()
                flush_print("🔚 MCP Workbench已关闭")
            except Exception as e:
                flush_print(f"❌ 关闭 MCP Workbench 失败: {str(e)}")

# 处理查询的主函数（保持向后兼容）
async def process_map_query(user_query: str, memory_strategy: str = "file", user_id: Optional[str] = None) -> str:
    """处理地图相关查询，返回总结性结果"""
    result_content = ""
    async for message in process_map_query_stream(user_query, memory_strategy, user_id):
        if message.get("type") in ["result", "final_result"]:
            result_content = message.get("content", "")
        if message.get("done"):
            break
    return result_content

async def process_travel_query(user_query: str, conversation_id: int, db: Session) -> AsyncGenerator[Dict, None]:
    """旅行规划专用：完整版原团队（复用 process_map_query 逻辑）"""
    flush_print(f"🧳 收到旅行规划请求: {user_query}")
    
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
        agents = await create_agents(workbench, model_client)
        team = SelectorGroupChat(
            agents,
            model_client=model_client,
            termination_condition=TextMentionTermination("TERMINATE")
        )

        # 构建包含历史上下文的查询
        context_str = ""
        if context_messages:
            context_str = "\n之前的对话历史：\n"
            for ctx_msg in context_messages:
                context_str += f"{ctx_msg['role']}: {ctx_msg['content']}\n"
        
        enhanced_query = f"""
        旅行规划任务：{user_query}
        
        {context_str}
        
        请完整执行：偏好提取 → 行程规划 → 地图查询 → 验证 → 对比 → 最终攻略
        参考之前的对话历史来更好地理解用户需求和偏好。
        """

        async for msg in team.run_stream(task=enhanced_query):
            if isinstance(msg, TextMessage):
                flush_print(f"🌍 {msg.source}: {msg.content}")
                if msg.source == "ResultAgent" and msg.content.strip() and msg.content.upper() != "TERMINATE":
                    yield {"content": msg.content}

        yield {"content": "", "done": True}

    finally:
        await workbench.stop()