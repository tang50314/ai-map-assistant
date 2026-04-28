# 马克地图生成服务

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, AsyncGenerator
import asyncio
import json
from datetime import datetime

from teams.map_mark_team import process_map_mark_generation_stream
from teams.base import get_baidu_mcp_workbench

app = FastAPI(title="马克地图生成服务", version="1.0.0")

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173", "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# 请求/响应模型
# =========================
class MapMarkGenerationRequest(BaseModel):
    content: str
    content_type: str = "travel"  # travel, route, general


class MapMarkGenerationResponse(BaseModel):
    task_id: str
    map_url: Optional[str] = None
    qr_code: Optional[str] = None
    status: str
    message: str


# =========================
# 任务存储（简单内存存储）
# =========================
class TaskStore:
    def __init__(self):
        self.tasks: Dict[str, Dict[str, Any]] = {}
    
    def create_task(self, task_id: str):
        self.tasks[task_id] = {
            "task_id": task_id,
            "status": "pending",
            "map_url": None,
            "qr_code": None,
            "created_at": datetime.now(),
            "messages": []
        }
    
    def update_task(self, task_id: str, **kwargs):
        if task_id in self.tasks:
            self.tasks[task_id].update(kwargs)
    
    def get_task(self, task_id: str):
        return self.tasks.get(task_id)
    
    def add_message(self, task_id: str, message: Dict[str, Any]):
        if task_id in self.tasks:
            self.tasks[task_id]["messages"].append(message)


task_store = TaskStore()


# =========================
# API端点
# =========================
@app.post("/map/generate/stream")
async def generate_map_mark_stream(request: MapMarkGenerationRequest):
    """生成马克地图（流式接口）"""
    
    async def event_stream() -> AsyncGenerator[str, None]:
        task_id = None
        try:
            # 开始生成流程
            async for result in process_map_mark_generation_stream(request.content):
                if "task_id" in result and not task_id:
                    task_id = result["task_id"]
                    task_store.create_task(task_id)
                
                if task_id:
                    # 更新任务状态
                    if result.get("type") == "map_result":
                        task_store.update_task(
                            task_id,
                            map_url=result.get("map_url"),
                            qr_code=result.get("qr_code"),
                            status="completed"
                        )
                    elif result.get("type") == "error":
                        task_store.update_task(task_id, status="error")
                    elif result.get("type") == "complete":
                        task_store.update_task(
                            task_id,
                            map_url=result.get("map_url"),
                            qr_code=result.get("qr_code"),
                            status="completed"
                        )
                    
                    # 添加消息到任务历史
                    task_store.add_message(task_id, result)
                
                # 发送SSE事件
                yield f"data: {json.dumps(result)}\n\n"
            
            # 发送完成信号
            yield f"data: {json.dumps({'done': True})}\n\n"
            
        except Exception as e:
            error_data = {
                "type": "error",
                "content": f"生成失败: {str(e)}",
                "task_id": task_id
            }
            yield f"data: {json.dumps(error_data)}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
    
    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/map/status/{task_id}")
async def get_map_mark_status(task_id: str):
    """获取马克地图生成任务状态"""
    task = task_store.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务未找到")
    
    return {
        "task_id": task_id,
        "status": task.get("status", "pending"),
        "map_url": task.get("map_url"),
        "qr_code": task.get("qr_code"),
        "created_at": task.get("created_at").isoformat() if task.get("created_at") else None
    }


@app.get("/map/html/{task_id}")
async def get_map_mark_html(task_id: str):
    """获取生成的马克地图HTML内容"""
    task = task_store.get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务未找到")
    
    map_url = task.get("map_url")
    if not map_url:
        raise HTTPException(status_code=404, detail="地图URL未生成")
    
    # 返回一个包含iframe的简单HTML页面
    html_content = f"""
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>马克地图 - {task_id}</title>
        <style>
            body {{ margin: 0; padding: 0; font-family: Arial, sans-serif; }}
            .map-container {{ width: 100vw; height: 100vh; }}
            .map-header {{ 
                position: fixed; 
                top: 0; 
                left: 0; 
                right: 0; 
                background: rgba(255,255,255,0.9); 
                padding: 10px; 
                z-index: 1000;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }}
            .map-iframe {{ width: 100%; height: 100%; border: none; }}
        </style>
    </head>
    <body>
        <div class="map-header">
            <h3>马克地图 - 行程规划</h3>
            <p>地图链接: <a href="{map_url}" target="_blank">{map_url}</a></p>
        </div>
        <div class="map-container">
            <iframe 
                src="{map_url}" 
                class="map-iframe"
                title="马克地图"
                allowfullscreen
            ></iframe>
        </div>
    </body>
    </html>
    """
    
    return html_content


@app.get("/health")
async def health_check():
    """健康检查"""
    try:
        # 检查百度地图MCP连接
        workbench = await get_baidu_mcp_workbench()
        if workbench:
            return {"status": "healthy", "baidu_mcp": "connected"}
        else:
            return {"status": "degraded", "baidu_mcp": "disconnected"}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}


# =========================
# 启动服务
# =========================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8003, reload=False)