# 马克地图生成团队 - 用于根据行程规划生成马克地图

import uuid
import re
import time
from typing import Any, Dict, Optional, List, AsyncGenerator
from datetime import datetime

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.conditions import TextMentionTermination
from autogen_agentchat.messages import TextMessage
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_core.memory import Memory

from .base import model_client, flush_print, get_baidu_mcp_workbench


# =========================
# 任务状态
# =========================
class MapMarkTaskStatus:
    def __init__(self):
        self.task_id = str(uuid.uuid4())
        self.status = "pending"
        self.messages = []
        self.result = None
        self.map_url = None
        self.qr_code = None
    
    def add_message(self, source: str, content: str):
        self.messages.append({
            "source": source,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
    
    def set_result(self, result: str, map_url: str = None, qr_code: str = None):
        self.result = result
        self.map_url = map_url
        self.qr_code = qr_code
        self.status = "completed"


# =========================
# Agent 创建
# =========================
async def create_map_mark_agents(
    workbench,
    memories: List[Memory] | None = None
):
    """创建马克地图生成Agent"""
    
    map_mark_parser_agent = AssistantAgent(
        name="MapMarkParserAgent",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        system_message="""
        你是行程内容解析专家，专门从旅行规划文本中提取结构化行程信息。
        
        你的任务：
        1. 从输入的旅行规划文本中提取每天的行程安排
        2. 识别景点名称、地点、顺序等关键信息
        3. 将提取的信息整理成简洁明了的文本格式
        
        提取规则：
        - 提取"第一天"、"第二天"等日期标识
        - 提取每个行程点的地点名称
        - 保持行程的时间顺序
        - 输出纯文本，不要添加额外解释
        
        输出格式示例：
        第一天：北京天安门→故宫博物院→景山公园
        第二天：长城→明十三陵→奥林匹克公园
        
        提取完成后，将整理好的行程文本交给MapMarkGeneratorAgent。
        不要输出JSON格式，只输出纯文本行程信息。
        """
    )
    
    map_mark_generator_agent = AssistantAgent(
        name="MapMarkGeneratorAgent",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        system_message="""
        你是马克地图生成专家，使用百度地图MCP工具创建可视化行程地图。
        
        你的任务：
        1. 接收解析后的行程文本
        2. 调用百度地图MCP的/map_mark接口
        3. 生成包含行程路线的马克地图
        
        调用工具规则：
        - 使用text_content参数传递行程文本
        - 确保行程文本包含清晰的地点信息
        - 等待工具返回结果
        
        结果处理：
        - 如果成功，提取返回的URL和二维码
        - 如果失败，返回错误信息
        
        最后输出格式：
        马克地图生成结果：
        - URL: [地图链接]
        - 二维码: [二维码链接]
        - 状态: [成功/失败]
        
        输出完成后，单独输出一行：TERMINATE
        """
    )
    
    return [map_mark_parser_agent, map_mark_generator_agent]


# =========================
# 主处理函数
# =========================
# 简单的内容缓存，避免重复处理相同内容
_content_cache = {}
_cache_timeout = 300  # 5分钟缓存

async def process_map_mark_generation_stream(
    travel_content: str,
    memory_strategy: str = "file",
    user_id: Optional[str] = None
) -> AsyncGenerator[Dict[str, Any], None]:
    """处理马克地图生成请求"""
    flush_print(f"🗺️ 收到马克地图生成请求")
    
    # 检查缓存
    content_hash = hash(travel_content)
    if content_hash in _content_cache:
        cache_data = _content_cache[content_hash]
        if time.time() - cache_data['timestamp'] < _cache_timeout:
            cache_age = time.time() - cache_data['timestamp']
            flush_print(f"🎯 缓存命中！缓存键: {content_hash}")
            flush_print(f"⏱️ 缓存年龄: {cache_age:.1f}秒")
            flush_print(f"🔗 缓存地图URL: {cache_data['map_url']}")
            flush_print(f"📱 缓存二维码: {cache_data['qr_code']}")
            
            yield {
                "type": "status",
                "content": "使用缓存结果...",
                "task_id": cache_data['task_id']
            }
            yield {
                "type": "map_result",
                "map_url": cache_data['map_url'],
                "qr_code": cache_data['qr_code'],
                "content": "缓存结果",
                "task_id": cache_data['task_id']
            }
            yield {
                "type": "complete",
                "content": "马克地图生成完成（缓存）",
                "map_url": cache_data['map_url'],
                "qr_code": cache_data['qr_code'],
                "task_id": cache_data['task_id']
            }
            return
    
    task_status = MapMarkTaskStatus()
    task_status.add_message("system", "开始处理马克地图生成请求")
    
    flush_print(f"🔍 缓存未命中，开始新处理流程")
    flush_print(f"📄 内容哈希: {content_hash}")
    flush_print(f"🆔 任务ID: {task_status.task_id}")
    
    yield {
        "type": "status",
        "content": "正在连接百度地图MCP服务...",
        "task_id": task_status.task_id
    }
    
    # 获取百度地图MCP Workbench
    workbench = await get_baidu_mcp_workbench()
    if not workbench:
        error_msg = "无法连接百度地图MCP服务"
        flush_print(f"❌ {error_msg}")
        task_status.add_message("system", error_msg)
        yield {
            "type": "error",
            "content": error_msg,
            "task_id": task_status.task_id
        }
        return
    
    flush_print(f"✅ 百度地图MCP服务连接成功")
    
    try:
        # 创建Agent
        agents = await create_map_mark_agents(workbench)
        flush_print(f"👥 Agent创建完成，数量: {len(agents)}")
        for agent in agents:
            flush_print(f"🤖 Agent: {agent.name}")
        
        # 创建团队
        team = RoundRobinGroupChat(
            agents,
            termination_condition=TextMentionTermination("TERMINATE")
        )
        flush_print(f"🔄 团队创建完成: RoundRobinGroupChat")
        
        yield {
            "type": "status",
            "content": "正在解析行程内容...",
            "task_id": task_status.task_id
        }
        
        flush_print(f"🔄 团队处理开始，任务ID: {task_status.task_id}")
        
        # 运行团队处理
        flush_print(f"🗣️ 地图团队开始处理，输入内容长度: {len(travel_content)}")
        async for message in team.run_stream(task=f"请根据以下旅行规划生成马克地图：\n{travel_content}"):
            if isinstance(message, TextMessage):
                content = message.content
                source = message.source
                
                task_status.add_message(source, content)
                
                # 输出Agent详细处理信息
                flush_print(f"🗣️ {source}: {content[:200]}{'...' if len(content) > 200 else ''}")
                
                # 发送Agent输出
                yield {
                    "type": "agent_output",
                    "source": source,
                    "content": content,
                    "task_id": task_status.task_id
                }
                
                # 检查是否包含地图URL或二维码（支持多种格式）
                if "URL:" in content or "地图链接" in content or "二维码" in content or "![二维码]" in content:
                    flush_print(f"🔍 检测到URL相关内容，开始提取...")
                    flush_print(f"📝 原始内容: {content}")
                    
                    # 提取URL - 支持多种格式
                    url_match = re.search(r'URL:\s*(?:\[.*?\]\()?((?:https?://[^\s\)]+)|data:image/[^\s\)]+)', content)
                    if url_match:
                        task_status.map_url = url_match.group(1).strip()
                        flush_print(f"✅ URL提取成功: {task_status.map_url}")
                    else:
                        # 尝试提取Markdown链接 [文本](url)
                        url_match2 = re.search(r'\[地图链接\]\(([^\)]+)\)', content)
                        if url_match2:
                            task_status.map_url = url_match2.group(1).strip()
                            flush_print(f"✅ 地图链接提取成功: {task_status.map_url}")
                        else:
                            # 尝试提取普通URL
                            url_match3 = re.search(r'(https?://[^\s\)]+)', content)
                            if url_match3:
                                task_status.map_url = url_match3.group(1).strip()
                                flush_print(f"✅ 普通URL提取成功: {task_status.map_url}")
                            else:
                                flush_print(f"❌ URL提取失败")
                    
                    # 提取二维码 - 支持多种格式
                    qr_match = re.search(r'二维码:\s*(?:!\[[^\]]*\]\()?((?:https?://[^\s\)]+)|data:image/[^;]+;base64,[A-Za-z0-9+/=]+)', content)
                    if qr_match:
                        task_status.qr_code = qr_match.group(1).strip()
                        flush_print(f"✅ 二维码提取成功: {task_status.qr_code[:50]}...")
                    else:
                        # 尝试提取Markdown图片 ![alt](url)
                        qr_match2 = re.search(r'!\[二维码\]\(([^\)]+)\)', content)
                        if qr_match2:
                            task_status.qr_code = qr_match2.group(1).strip()
                            flush_print(f"✅ 二维码图片提取成功: {task_status.qr_code[:50]}...")
                        else:
                            # 尝试提取base64图片数据
                            qr_match3 = re.search(r'(data:image/[^;]+;base64,[A-Za-z0-9+/=]+)', content)
                            if qr_match3:
                                task_status.qr_code = qr_match3.group(1).strip()
                                flush_print(f"✅ base64二维码提取成功: {task_status.qr_code[:50]}...")
                            else:
                                flush_print(f"❌ 二维码提取失败")
                    
                    flush_print(f"🎯 最终提取结果 - URL: {task_status.map_url}")
                    flush_print(f"📱 最终提取结果 - 二维码: {task_status.qr_code}")
                    
                    yield {
                        "type": "map_result",
                        "map_url": task_status.map_url,
                        "qr_code": task_status.qr_code,
                        "content": content,
                        "task_id": task_status.task_id
                    }
        
        # 任务完成
        task_status.set_result("马克地图生成完成", task_status.map_url, task_status.qr_code)
        
        flush_print(f"✅ 任务完成 - 地图URL: {task_status.map_url}")
        flush_print(f"✅ 任务完成 - 二维码: {task_status.qr_code}")
        
        # 缓存结果
        if task_status.map_url:
            _content_cache[content_hash] = {
                'task_id': task_status.task_id,
                'map_url': task_status.map_url,
                'qr_code': task_status.qr_code,
                'timestamp': time.time()
            }
            flush_print(f"💾 结果已缓存，缓存键: {content_hash}")
        
        yield {
            "type": "complete",
            "content": "马克地图生成完成",
            "map_url": task_status.map_url,
            "qr_code": task_status.qr_code,
            "task_id": task_status.task_id
        }
        
    except Exception as e:
        error_msg = f"马克地图生成失败: {str(e)}"
        flush_print(f"❌ 处理异常: {error_msg}")
        flush_print(f"❌ 异常类型: {type(e).__name__}")
        import traceback
        flush_print(f"❌ 异常堆栈: {traceback.format_exc()}")
        task_status.add_message("system", error_msg)
        yield {
            "type": "error",
            "content": error_msg,
            "task_id": task_status.task_id
        }
    
    finally:
        # 清理资源
        flush_print(f"🧹 开始清理资源...")
        if workbench:
            await workbench.stop()
            flush_print(f"✅ Workbench资源已清理")


# 对外封装的便捷函数
async def process_travel_map_mark_stream(travel_content: str) -> AsyncGenerator[Dict[str, Any], None]:
    """处理旅行规划的马克地图生成"""
    async for result in process_map_mark_generation_stream(
        travel_content, 
        content_type="travel"
    ):
        yield result