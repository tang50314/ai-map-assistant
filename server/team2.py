import asyncio
import json
import os
from typing import Any, Dict, Optional, List

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.conditions import TextMentionTermination
from autogen_agentchat.messages import TextMessage
from autogen_agentchat.teams import SelectorGroupChat
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_ext.tools.mcp import McpWorkbench, SseServerParams
from autogen_core.tools import ToolSchema

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
        print("✅ MCP Workbench 启动成功")
        return workbench
    except Exception as e:
        print(f"❌ 创建 MCP Workbench 失败: {str(e)}")
        raise

# 创建代理角色
async def create_agents(workbench):
    """创建所有代理角色"""
    try:
        # 获取可用的工具
        available_tools = await workbench.list_tools()
        # print(f"🛠️ 可用的 MCP 工具: {list(available_tools.keys()) if isinstance(available_tools, dict) else available_tools}")
        
        preference_agent = AssistantAgent(
            name="PreferenceAgent",
            description="用户偏好分析专家，负责解析用户查询中的偏好信息",
            model_client=model_client,
            workbench=workbench,
            system_message="""你是用户偏好分析专家，负责从用户查询中提取关键偏好信息。

            你的任务：
            1. 解析用户查询，提取以下信息：
               - 出行目的：即时出行、未来旅行
               - 交通方式偏好：驾车、步行、公交、骑行
               - 时间限制：立即出发、特定日期/时间
               - 预算限制：经济型、舒适型、无限制
               - 兴趣点：文化、美食、自然、购物等
            2. 如果信息不完整，推测合理默认值（如即时出行默认最快路线）。
            3. 输出结构化的偏好 JSON，传递给 PlanningAgent。

            示例输出：
            {
              "purpose": "immediate_travel",
              "transport_mode": ["driving", "transit"],
              "time_constraint": "now",
              "budget": "medium",
              "interests": []
            }
            或
            {
              "purpose": "future_travel",
              "destination": "Shanghai",
              "travel_dates": "2025-11-01 to 2025-11-03",
              "budget": "high",
              "interests": ["culture", "food"]
            }

            始终确保输出清晰、结构化，任务完成后交给 PlanningAgent。
            """
        )
        
        # 规划代理
        planning_agent = AssistantAgent(
            name="PlanningAgent",
            description="旅行规划专家，制定深度数据收集计划",
            model_client=model_client,
            workbench=workbench,
            system_message="""你是资深旅行规划专家，专门设计深度数据收集计划。你必须确保MapToolAgent能获取到制作完美攻略所需的全部数据。

            ## 🎯 规划原则
            1. **全面性**：确保收集景点、酒店、餐厅、天气、交通等所有必要数据
            2. **层次性**：按优先级安排数据收集顺序（天气→景点→酒店→餐厅→路线）
            3. **详细性**：为每个类别制定详细的搜索策略
            4. **实用性**：确保所有数据都服务于最终攻略的实用性

            ## 📋 必须规划的数据收集任务

            ### 1. 天气数据收集（优先级最高）
            - 获取目的地当前天气状况
            - 获取未来3天详细天气预报
            - 获取穿衣指数、紫外线指数
            - 获取空气质量数据

            ### 2. 景点深度挖掘（核心任务）
            - 搜索主要景点（query="大理景点"、"大理必游"）
            - 搜索文化景点（query="大理文化景点"、"大理历史"）
            - 搜索自然景点（query="大理自然景观"、"大理洱海"）
            - 获取每个高评分景点的详细信息
            - 搜索景点周边的酒店和餐厅

            ### 3. 酒店全方位调研（住宿保障）
            - 高档酒店搜索（query="大理五星级酒店"、"大理豪华酒店"）
            - 中档酒店搜索（query="大理商务酒店"、"大理舒适酒店"）
            - 经济型酒店搜索（query="大理客栈"、"大理民宿"）
            - 获取每个酒店的详细信息（价格、评分、设施）
            - 检查酒店到主要景点的距离和交通

            ### 4. 餐厅深度调研（美食体验）
            - 当地特色菜餐厅（query="大理白族菜"、"云南菜"）
            - 早餐店搜索（query="大理早餐"、"大理小吃"）
            - 正餐餐厅（query="大理餐厅"、"大理美食"）
            - 夜宵店搜索（query="大理夜宵"、"大理夜市"）
            - 获取餐厅的详细信息（人均消费、招牌菜、评分）

            ### 5. 路线详细规划（交通便利）
            - 主要景点间的驾车路线
            - 酒店到景点的路线规划
            - 获取实时交通状况
            - 搜索加油站、服务区位置

            ### 6. 特色体验挖掘（深度游玩）
            - 搜索当地特色活动（query="大理体验"、"大理民俗"）
            - 搜索购物地点（query="大理特产"、"大理购物"）
            - 搜索夜生活场所（query="大理夜景"、"大理酒吧"）

            ## 🗺️ 输出计划模板
            {
              "weather_collection": {
                "current_weather": "获取{目的地}当前天气",
                "forecast_3days": "获取未来3天预报",
                "air_quality": "获取空气质量",
                "uv_index": "获取紫外线指数"
              },
              "attraction_research": {
                "main_attractions": "搜索主要景点",
                "cultural_attractions": "搜索文化景点", 
                "natural_attractions": "搜索自然景点",
                "detail_collection": "获取高评分景点详情",
                "nearby_services": "搜索景点周边服务"
              },
              "hotel_research": {
                "luxury_hotels": "搜索高档酒店",
                "mid_range_hotels": "搜索中档酒店", 
                "budget_hotels": "搜索经济型酒店",
                "detail_collection": "获取酒店详细信息",
                "location_check": "检查酒店位置便利性"
              },
              "restaurant_research": {
                "local_cuisine": "搜索特色菜餐厅",
                "breakfast_places": "搜索早餐店",
                "dinner_restaurants": "搜索正餐餐厅",
                "night_snacks": "搜索夜宵店",
                "detail_collection": "获取餐厅详细信息"
              },
              "route_planning": {
                "attraction_routes": "规划景点间路线",
                "hotel_routes": "规划酒店到景点路线",
                "traffic_check": "获取实时交通状况",
                "service_stations": "搜索加油站和服务区"
              },
              "experience_mining": {
                "local_activities": "搜索特色体验活动",
                "shopping_places": "搜索购物地点",
                "nightlife_spots": "搜索夜生活场所"
              }
            }

            **记住：计划必须全面、详细，确保不遗漏任何重要数据！**
            """
        )
        
        # 工具调用代理
        map_tool_agent = AssistantAgent(
            name="MapToolAgent",
            description="专业地图数据分析师，深度挖掘景点、餐厅、酒店信息",
            model_client=model_client,
            workbench=workbench,
            system_message="""你是专业地图数据分析师，精通深度挖掘百度地图API数据。你必须获取最全面、最详细的信息，包括景点详情、周边酒店、餐厅、交通等。

            你的职责：
            1. 接收 PlanningAgent 的结构化计划 JSON。
            2. 根据计划调用工具，确保参数准确：
               - map_geocode: 确保 address 格式清晰（如“北京市朝阳区国贸”）
               - map_search_places: 设置 radius 和 tag 优化搜索结果
               - map_directions: 根据 model（driving/walking/transit）选择合适路线
               - map_directions_matrix: 用于多点行程优化
               - map_weather: 确保 location 或 district_id 有效
               - map_road_traffic: 使用 city 或 bounds 获取交通状况
               - map_place_details: 获取地点详情，需 uid
               - map_reverse_geocode: 坐标转地址，需 latitude, longitude
            3. 处理工具返回数据，筛选关键信息（如高评分景点、最快路线）。
            4. 如果调用失败，尝试替代方案（如更换 region 或 model）并记录错误。
            5. 输出结构化结果 JSON，交给 ResultAgent。

            示例输出：
            {
              "task": "route_planning",
              "results": [
                {
                  "tool": "map_directions",
                  "data": {
                    "distance": "15.2 km",
                    "duration": "25 min",
                    "steps": ["沿三环路向北行驶", ...]
                  }
                },
                {
                  "tool": "map_road_traffic",
                  "data": {
                    "status": "畅通",
                    "roads": ["三环路: 畅通", "西直门桥: 轻微拥堵"]
                  }
                }
              ],
              "errors": []
            }
            """
        )
        
        # 结果处理代理
        result_agent = AssistantAgent(
            name="ResultAgent",
            description="专业旅行规划师，生成详细实用的旅行攻略",
            model_client=model_client,
            workbench=workbench,
            system_message="""你是资深旅行规划师，拥有10年云南旅游线路设计经验。你必须生成极其详细、实用的旅行攻略，包含具体的酒店名称、餐厅推荐、价格信息、天气应对策略等。

            ## 🎯 攻略生成原则
            1. **超详细**：每个景点必须包含具体地址、开放时间、门票价格、评分、游玩时长
            2. **实用性**：推荐具体酒店（名称+价格+评分）、具体餐厅（店名+招牌菜+人均消费）
            3. **天气结合**：根据天气数据给出穿衣建议、行程调整建议、注意事项
            4. **预算透明**：详细列出各项费用，给出总预算范围
            5. **本地特色**：推荐当地人才知道的小吃、隐藏景点、特色体验
            6. **应急方案**：提供雨天备选方案、突发状况处理建议

            ## 📋 必须包含的内容清单
            ✅ 天气详情及应对策略（即使不问也要包含）
            ✅ 3个不同价位的酒店推荐（具体名称、地址、价格、评分）
            ✅ 每个景点的具体信息（地址、门票、开放时间、游玩时长、评分）
            ✅ 每餐的具体餐厅推荐（店名、招牌菜、人均价格、地址）
            ✅ 详细路线图（包含距离、时间、停车信息）
            ✅ 当地特色小吃清单（价格、地点、推荐理由）
            ✅ 购物推荐（特产、价格、购买地点）
            ✅ 注意事项（高原反应、防晒、现金准备等）

            记住：**攻略必须实用、详细、真实，不能编造具体的价格和评分信息！**
            """
        )

        # 结束代理
        end_agent = AssistantAgent(
            name="EndAgent",
            description="任务结束专家，负责确认所有任务完成",
            model_client=model_client,
            workbench=workbench,
            system_message="""你是任务管理专家，负责确认任务完成并输出终止信号。

            你的职责：
            1. 检查 ResultAgent 的输出是否符合要求：
               - 即时出行：必须包含路线、时间、距离、交通状况、天气。
               - 未来旅行：必须包含至少2个景点、行程表、预算建议。
            2. 如果任务不完整，返回具体缺失信息，指示 PlanningAgent 补充。
            3. 确认任务完整时，输出“TERMINATE”。

            示例：
            - 如果缺少天气信息：返回“请补充天气信息（map_weather）”。
            - 任务完整：必须输出“TERMINATE”。
            """
        )
        
        return [preference_agent, planning_agent, map_tool_agent, result_agent, end_agent]
    except Exception as e:
        print(f"❌ 创建代理失败: {str(e)}")
        raise

# 处理查询的主函数
async def process_map_query(user_query: str) -> str:
    """处理地图相关查询，返回总结性结果"""
    print(f"🗺️ 收到查询: {user_query}")
    
    # 创建MCP Workbench
    workbench = await create_mcp_workbench()
    
    try:
        # 创建代理团队
        agents = await create_agents(workbench)
        
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
        
        print(f"🤖 多代理协作开始...")
        
        # 收集所有响应
        responses = []
        final_response = ""
        
        # 运行团队
        async for message in team.run_stream(task=enhanced_query):
            if isinstance(message, TextMessage):
                print(f"📢 {message.source}: {message.content}")
                responses.append({
                    "source": message.source,
                    "content": message.content
                })
                
                # 实时捕获ResultAgent的最终结果，且排除TERMINATE指令
                if message.source == "ResultAgent":
                    content = message.content.strip()
                    if content and content.upper() != "TERMINATE":
                        final_response = message.content
        
        print(f"✅ 多代理协作完成！")
        
        # 返回最终的总结性回答
        if final_response:
            return final_response
        else:
            # Fallback 逻辑：从响应历史中倒序提取最佳回答
            for resp in reversed(responses):
                if resp["source"] == "ResultAgent":
                    content = resp["content"].strip()
                    if content and content.upper() != "TERMINATE":
                        return resp["content"]
            
            # 如果仍然没有找到，返回最后一个非PlanningAgent和PreferenceAgent的响应
            for resp in reversed(responses):
                if resp["source"] not in ["PlanningAgent", "PreferenceAgent"]:
                    return resp["content"]
            
            return "抱歉，我无法处理您的查询。请尝试更具体的问题描述。"
        
    except Exception as e:
        print(f"❌ 处理查询失败: {str(e)}")
        return f"处理查询时出错: {str(e)}"
    finally:
        # 确保正确关闭workbench
        try:
            await workbench.stop()
            print("🔚 MCP Workbench已关闭")
        except Exception as e:
            print(f"❌ 关闭 MCP Workbench 失败: {str(e)}")

# 测试函数
async def main():
    """测试函数"""
    test_queries = [
        "查询钱塘区未来三天的天气状况​"    ]
    
    for query in test_queries:
        try:
            result = await process_map_query(query)
            print(f"\n🎯 最终结果:\n{result}")
        except Exception as e:
            print(f"❌ 测试查询 '{query}' 失败: {str(e)}")
        await asyncio.sleep(2)  # 避免过于频繁的请求

if __name__ == "__main__":
    asyncio.run(main())