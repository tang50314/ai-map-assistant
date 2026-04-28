# SPA生成器团队 - 用于旅行和路线规划的网页可视化

import uuid
import re
from typing import Any, Dict, Optional, List, AsyncGenerator
from datetime import datetime

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.conditions import TextMentionTermination
from autogen_agentchat.messages import TextMessage
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_core.memory import Memory

from .base import model_client, flush_print, get_mcp_workbench


def generate_default_template(content: str, content_type: str) -> str:
    """生成默认的SPA模板"""
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{content_type.title()}规划</title>
    <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://unpkg.com/aos@2.3.1/dist/aos.js"></script>
    <link href="https://unpkg.com/aos@2.3.1/dist/aos.css" rel="stylesheet">
</head>
<body class="bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
    <div class="container mx-auto px-4 py-8">
        <div class="max-w-4xl mx-auto">
            <div class="bg-white rounded-lg shadow-lg p-8" data-aos="fade-up">
                <h1 class="text-3xl font-bold text-gray-800 mb-6 text-center">
                    <i class="fas fa-route text-blue-600 mr-3"></i>
                    {content_type.title()}规划
                </h1>
                <div class="prose max-w-none">
                    <div class="bg-gray-50 rounded-lg p-6">
                        <h2 class="text-xl font-semibold text-gray-700 mb-4">内容摘要</h2>
                        <p class="text-gray-600 leading-relaxed">{content[:500]}...</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script>
        AOS.init({{duration: 1000}});
    </script>
</body>
</html>"""


def is_valid_html(html: str) -> bool:
    """验证HTML内容是否有效"""
    if not html.strip():
        return False
    
    # 检查基本HTML结构
    required_tags = ['<!DOCTYPE html>', '<html', '<head>', '<body>', '</html>']
    for tag in required_tags:
        if tag.lower() not in html.lower():
            return False
    
    # 检查是否有实际内容
    content = re.sub(r'<[^>]+>', '', html)
    if len(content.strip()) < 10:
        return False
    
    return True


# =========================
# 任务状态
# =========================
class TaskStatus:
    def __init__(self):
        self.task_id = str(uuid.uuid4())
        self.status = "pending"
        self.messages = []
        self.result = None
    
    def add_message(self, source: str, content: str):
        self.messages.append({
            "source": source,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
    
    def set_result(self, result: str):
        self.result = result
        self.status = "completed"


# =========================
# Agent 创建
# =========================
async def create_agents(
    workbench,
    content_type: str,
    memories: List[Memory] | None = None
):
    html_parser_agent = AssistantAgent(
        name="HTMLParserAgent",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        system_message=f"""
        你是网页结构规划专家。
        页面类型：{content_type}
        请将内容整理为【网页结构草稿（HTML片段）】：
        - 不要输出 JSON
        - 不要输出 TERMINATE
        - 只输出 HTML 结构内容
        任务完成后，将你整理好的信息交给 CodeGeneratorAgent
        """
    )
    
    code_generator_agent = AssistantAgent(
        name="CodeGeneratorAgent",
        model_client=model_client,
        workbench=workbench,
        memory=memories,
        system_message=f"""
        你是前端工程专家，生成一个内容详尽、样式美观且响应式的可视化、交互性强的网页HTML+CSS代码。
        页面类型：{content_type}
        
        你是一个html生成专家，你需要根据要求内容，生成一个内容详尽、样式美观且响应式的可视化网页HTML+CSS代码。

        ## 内容分析与结构化
            - 逻辑划分: 将报告内容分解为清晰、有逻辑的部分（如：引言、背景、核心发现、数据分析、结论等）。使用适当的标题和副标题来组织内容，增强可读性。
            - 详尽呈现: 确保每个部分的内容都得到充分展示。如果报告中有列表或分步说明，请使用HTML的有序或无序列表进行清晰呈现。如果报告包含数据，必须使用图表或表格进行可视化。
            - 观点全面: 在网页中体现报告中涉及的各个方面，避免只突出某一部分而忽略其他内容，确保整体内容的平衡性。如果内容不完整，请合理推断缺失部分。

        ## 技术要求
            - 核心技术栈: 使用 HTML5 和 TailwindCSS 进行基础架构和样式设计，确保页面的灵活性和响应式。
            - 动态交互库: 引入 Alpine.js (通过 CDN 引用)，用于处理前端的简单交互和状态管理，如可折叠菜单、模态框、下拉菜单和选项卡切换。这能避免使用复杂的 JavaScript 框架。
            - 图表可视化: 使用 Chart.js (通过 CDN 引用) 来为数据部分生成交互式图表，如条形图、饼图或折线图，以直观地展示数据。
            - 动画效果: 引入 Animate.css 和 AOS (Animate On Scroll) 库，为页面元素添加丰富的淡入、滑入等动画效果，增强用户的视觉体验。
            - 图标库: 使用 Font Awesome 或 Remix Icon (通过 CDN 引用)，提供更丰富的矢量图标来美化标题和功能模块。
            - **重要**: 使用 TailwindCSS CLI 构建版本替代 CDN 版本以避免生产环境警告。在 HTML 的 `<head>` 中添加 `<link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">` 替代 cdn.tailwindcss.com。

        ## 设计与优化
            - 响应式布局: 页面必须完全响应式，利用 TailwindCSS 的 flexbox 和 grid 布局，确保在不同尺寸的设备上都能完美显示。
            - 代码结构: 提供完整可运行的单一 HTML 文件，包含所有必要的 CSS 和 JavaScript 引用，确保代码干净且有适当注释。
            - 视觉效果: 页面根据报告内容和用户提问灵活配色，例如使用渐变背景、卡片悬停时有阴影加深效果，以及按钮悬停时有轻微的放大效果等。
            - 性能: 确保所有引入的库都通过 CDN 引用，以优化加载速度。

        ## 图标要求
            - 使用Font Awesome或Material Icons等专业图标库(通过CDN引用)
            - 避免使用emoji作为图标替代品

        ## 交互细节
            - 按钮悬停时有轻微放大效果
            - 表单输入框聚焦时显示渐变边框
            - 卡片在悬停时有阴影加深效果

        ## Chart.js图表生成规范
            - 数据数组必须正确使用逗号分隔
            - 颜色数组必须正确使用逗号分隔
            - 确保所有Chart.js配置项的语法正确，避免NaN值
            - 在生成图表前验证数据的有效性
            - 使用合适的图表类型展示不同类型的数据

        ## 特别注意
            - 提供完整可运行的HTML文件，包含所有必要引用
            - 在页面上不得出现虚假的数据内容，确保数据真实可靠，不得凭空捏造
            - 页面在不同浏览器中保持一致的外观和功能
            - 最后只输出相关代码，不输出其他无关内容
            - 要求最后生成的html页面，每页的高度都是100vh，页面内容充实，叙述详尽，不得有太多空白
            - 要求生成页面逻辑清晰，样式、字体排版整齐美观
            - 确保最后生成html网页内容交互性强，用户操作方便，形式多样，符合主题
            - 如果发现代码不完整，必须继续生成，直到检查通过。
            - 如果代码生成错误，必须修复错误，直到检查通过。
            - 注意：必须保证代码正确，无缺少任何结构，包含必要的HTML标签、CSS类名和JavaScript函数。
        请根据整理好的报告内容和用户要求，创建最适合展示该内容的可视化网页。  
        生成的网页必须符合HTML5标准，不得缺少任何必要的标签、属性或元素。
        
        最后要求必须输出完整的HTML 
        输出完成后，单独输出一行：TERMINATE
        """
    )
    
    return [html_parser_agent, code_generator_agent]


# =========================
# 主处理函数（签名不变）
# =========================
async def process_spa_generation_stream(
    content: str,
    content_type: str = "travel",
    memory_strategy: str = "file",
    user_id: Optional[str] = None
) -> AsyncGenerator[Dict[str, Any], None]:
    flush_print(f"🌐 收到SPA生成请求: {content_type}")
    
    task_status = TaskStatus()
    workbench = await get_mcp_workbench()
    agents = await create_agents(workbench, content_type)
    
    team = RoundRobinGroupChat(
        agents,
        termination_condition=TextMentionTermination("TERMINATE")
    )
    
    final_html = ""
    
    try:
        async for msg in team.run_stream(task=content):
            if isinstance(msg, TextMessage):
                flush_print(f"🌐 {msg.source}: {msg.content[:200]}")
                task_status.add_message(msg.source, msg.content)
                
                # 只从 CodeGeneratorAgent 收集 HTML
                if msg.source == "CodeGeneratorAgent":
                    if msg.content.strip().upper() == "TERMINATE":
                        break
                    final_html += msg.content
                
                yield {
                    "source": msg.source,
                    "content": msg.content
                }
        
        if not final_html.strip():
            # 使用默认模板
            default_html = generate_default_template(content, content_type)
            final_html = default_html
            flush_print("⚠️ 未生成有效HTML，使用默认模板")
        
        # 验证HTML内容是否有效
        if not is_valid_html(final_html):
            final_html = generate_default_template(content, content_type)
            flush_print("⚠️ HTML内容无效，使用默认模板")
        
        task_status.set_result(final_html)
        yield {
            "done": True,
            "task_id": task_status.task_id,
            "type": "html",
            "content": final_html
        }
    
    except Exception as e:
        yield {
            "error": True,
            "content": f"SPA生成失败: {str(e)}"
        }
    
    finally:
        if workbench:
            await workbench.stop()


# =========================
# 对外封装（保持不变）
# =========================
async def process_travel_spa_stream(
    content: str,
    memory_strategy: str = "file",
    user_id: Optional[str] = None
):
    async for r in process_spa_generation_stream(content, "travel", memory_strategy, user_id):
        yield r


async def process_route_spa_stream(
    content: str,
    memory_strategy: str = "file",
    user_id: Optional[str] = None
):
    async for r in process_spa_generation_stream(content, "route", memory_strategy, user_id):
        yield r