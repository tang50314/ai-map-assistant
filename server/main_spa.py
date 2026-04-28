#!/usr/bin/env python3
"""
SPA生成器服务器
提供单页应用生成功能的独立服务
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel
import asyncio
import json
import uuid
from datetime import datetime
from typing import Dict, Optional
import os
import sys

# 将当前目录添加到Python路径
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from teams.spa_generator_team import process_spa_generation_stream, process_route_spa_stream

app = FastAPI(
    title="AI地图助手 - SPA生成器",
    description="单页应用生成功能的独立服务",
    version="1.0.0"
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 存储生成的SPA内容
spa_storage: Dict[str, Dict] = {}

class SPAGenerationRequest(BaseModel):
    """SPA生成请求"""
    content: str
    conversation_id: Optional[int] = None
    content_type: Optional[str] = None  # 添加content_type字段

class SPAGenerationResponse(BaseModel):
    """SPA生成响应"""
    task_id: str
    status: str
    message: str

@app.post("/spa/generate/stream")
async def generate_spa_stream(request: SPAGenerationRequest):
    """
    流式生成SPA内容
    """
    task_id = str(uuid.uuid4())
    
    async def spa_generation_stream():
        """SPA生成流式处理"""
        try:
            print(f"🎯 开始SPA生成任务: {task_id}")
            print(f"📄 生成内容: {request.content}")
            
            # 初始化存储
            spa_storage[task_id] = {
                "content": "",
                "status": "generating",
                "created_at": datetime.now().isoformat(),
                "conversation_id": request.conversation_id
            }
            
            # 发送开始信号
            yield f"data: {json.dumps({'type': 'start', 'task_id': task_id, 'message': '开始生成SPA内容...'})}\n\n"
            
            # 根据content_type选择相应的处理函数
            full_html = ""
            
            # 选择处理函数
            if request.content_type == 'route':
                process_func = process_route_spa_stream
                print(f"🛣️ 使用路线规划模式生成SPA")
            elif request.content_type == 'travel' or request.content_type == 'general' or not request.content_type:
                process_func = process_spa_generation_stream
                print(f"📝 使用通用模式生成SPA")
            else:
                process_func = process_spa_generation_stream
                print(f"📝 使用默认通用模式生成SPA (未知类型: {request.content_type})")
            
            # 调用相应的处理函数
            if request.content_type == 'route':
                # route模式使用2个参数
                async for chunk in process_func(request.content, request.conversation_id):
                    if chunk.get("type") == "html" or chunk.get("type") == "html_content":
                        html_content = chunk.get("content", "")
                        full_html += html_content
                        
                        # 发送HTML内容
                        yield f"data: {json.dumps({
                            'type': 'html_chunk',
                            'content': html_content,
                            'task_id': task_id
                        })}\n\n"
                        
                    elif chunk.get("source") in ["CodeGeneratorAgent", "ResultAgent"] and chunk.get("content"):
                        # 直接输出代理内容，特别是HTML内容
                        content = chunk.get("content", "")
                        
                        # 检查是否包含HTML
                        if "<!DOCTYPE html>" in content or "<html" in content or "<head>" in content:
                            full_html = content
                            yield f"data: {json.dumps({
                                'type': 'html_content',
                                'content': content,
                                'source': chunk.get("source"),
                                'task_id': task_id
                            })}\n\n"
                        else:
                            # 发送代理输出
                            yield f"data: {json.dumps({
                                'type': 'agent_output',
                                'content': content,
                                'source': chunk.get("source"),
                                'task_id': task_id
                            })}\n\n"
                            
                    elif chunk.get("type") == "status":
                        # 发送状态更新
                        yield f"data: {json.dumps({
                            'type': 'status',
                            'message': chunk.get("content", ""),
                            'task_id': task_id
                        })}\n\n"
                        
                    elif chunk.get("type") == "error":
                        # 发送错误信息
                        yield f"data: {json.dumps({
                            'type': 'error',
                            'message': chunk.get("content", "生成失败"),
                            'task_id': task_id
                        })}\n\n"
                        
                    await asyncio.sleep(0.01)  # 小延迟避免过载
            else:
                # 通用模式使用4个参数
                async for chunk in process_func(request.content, request.content_type or "travel", "file", request.conversation_id):
                    if chunk.get("type") == "html" or chunk.get("type") == "html_content":
                        html_content = chunk.get("content", "")
                        full_html += html_content
                        
                        # 发送HTML内容
                        yield f"data: {json.dumps({
                            'type': 'html_chunk',
                            'content': html_content,
                            'task_id': task_id
                        })}\n\n"
                        
                    elif chunk.get("source") in ["CodeGeneratorAgent", "ResultAgent"] and chunk.get("content"):
                        # 直接输出代理内容，特别是HTML内容
                        content = chunk.get("content", "")
                        
                        # 检查是否包含HTML
                        if "<!DOCTYPE html>" in content or "<html" in content or "<head>" in content:
                            full_html = content
                            yield f"data: {json.dumps({
                                'type': 'html_content',
                                'content': content,
                                'source': chunk.get("source"),
                                'task_id': task_id
                            })}\n\n"
                        else:
                            # 发送代理输出
                            yield f"data: {json.dumps({
                                'type': 'agent_output',
                                'content': content,
                                'source': chunk.get("source"),
                                'task_id': task_id
                            })}\n\n"
                            
                    elif chunk.get("type") == "status":
                        # 发送状态更新
                        yield f"data: {json.dumps({
                            'type': 'status',
                            'message': chunk.get("content", ""),
                            'task_id': task_id
                        })}\n\n"
                        
                    elif chunk.get("type") == "error":
                        # 发送错误信息
                        yield f"data: {json.dumps({
                            'type': 'error',
                            'message': chunk.get("content", "生成失败"),
                            'task_id': task_id
                        })}\n\n"
                        
                    await asyncio.sleep(0.01)  # 小延迟避免过载
            
            # 保存完整的HTML内容
            spa_storage[task_id]["content"] = full_html
            spa_storage[task_id]["status"] = "completed"
            
            # 发送完成信号
            yield f"data: {json.dumps({
                'type': 'complete',
                'task_id': task_id,
                'message': 'SPA生成完成',
                'html_url': f'/spa/html/{task_id}'
            })}\n\n"
            
            print(f"✅ SPA生成任务完成: {task_id}")
            
        except Exception as e:
            error_msg = f"SPA生成失败: {str(e)}"
            print(f"❌ {error_msg}")
            
            spa_storage[task_id]["status"] = "failed"
            spa_storage[task_id]["error"] = error_msg
            
            yield f"data: {json.dumps({
                'type': 'error',
                'message': error_msg,
                'task_id': task_id
            })}\n\n"
        
        finally:
            # 发送结束信号
            yield f"data: {json.dumps({'type': 'end', 'task_id': task_id})}\n\n"
    
    return StreamingResponse(
        spa_generation_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@app.get("/spa/html/{task_id}", response_class=HTMLResponse)
async def get_spa_html(task_id: str):
    """
    获取生成的SPA HTML内容
    """
    if task_id not in spa_storage:
        raise HTTPException(status_code=404, detail="SPA任务未找到")
    
    spa_data = spa_storage[task_id]
    
    if spa_data["status"] != "completed":
        raise HTTPException(status_code=400, detail=f"SPA任务状态: {spa_data['status']}")
    
    html_content = spa_data.get("content", "")
    if not html_content:
        raise HTTPException(status_code=404, detail="SPA内容为空")
    
    return HTMLResponse(content=html_content)

@app.get("/spa/status/{task_id}")
async def get_spa_status(task_id: str):
    """
    获取SPA任务状态
    """
    if task_id not in spa_storage:
        raise HTTPException(status_code=404, detail="SPA任务未找到")
    
    spa_data = spa_storage[task_id]
    
    return {
        "task_id": task_id,
        "status": spa_data["status"],
        "created_at": spa_data["created_at"],
        "conversation_id": spa_data.get("conversation_id"),
        "has_content": bool(spa_data.get("content", ""))
    }

@app.get("/spa/list")
async def list_spa_tasks():
    """
    列出所有SPA任务（调试用）
    """
    return {
        "tasks": [
            {
                "task_id": task_id,
                "status": data["status"],
                "created_at": data["created_at"],
                "conversation_id": data.get("conversation_id")
            }
            for task_id, data in spa_storage.items()
        ],
        "total": len(spa_storage)
    }

@app.get("/health")
async def health_check():
    """
    健康检查端点
    """
    return {
        "status": "healthy",
        "service": "spa-generator",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }

if __name__ == "__main__":
    import uvicorn
    
    print("🚀 启动SPA生成器服务...")
    
    uvicorn.run(
        "main_spa:app",
        host="127.0.0.1",
        port=8002,
        reload=True,
        log_level="info"
    )