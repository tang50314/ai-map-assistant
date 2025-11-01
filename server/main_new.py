# main_new.py - 展示如何使用新的team模块结构
from fastapi import FastAPI, HTTPException, Depends, status, Request, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import asyncio
import json
from typing import AsyncGenerator

# 从新的team模块导入功能
from teams import (
    process_general_query,
    process_route_query,
    process_travel_query,
    process_map_query_stream
)

app = FastAPI(title="多代理Team API", version="2.0")

# 通用聊天端点
@app.post("/api/chat/general")
async def chat_general(
    user_query: str = Form(...),
    conversation_id: int = Form(0),
    db: Session = Depends(get_db)  # 你需要实现get_db函数
):
    """通用聊天端点"""
    async def generate():
        async for chunk in process_general_query(user_query, conversation_id, db):
            yield f"data: {json.dumps(chunk)}\n\n"
    
    return StreamingResponse(generate(), media_type="text/plain")

# 路线规划端点
@app.post("/api/chat/route")
async def chat_route(
    user_query: str = Form(...),
    conversation_id: int = Form(0),
    db: Session = Depends(get_db)
):
    """路线规划端点"""
    async def generate():
        async for chunk in process_route_query(user_query, conversation_id, db):
            yield f"data: {json.dumps(chunk)}\n\n"
    
    return StreamingResponse(generate(), media_type="text/plain")

# 旅行规划端点
@app.post("/api/chat/travel")
async def chat_travel(
    user_query: str = Form(...),
    conversation_id: int = Form(0),
    db: Session = Depends(get_db)
):
    """旅行规划端点"""
    async def generate():
        async for chunk in process_travel_query(user_query, conversation_id, db):
            yield f"data: {json.dumps(chunk)}\n\n"
    
    return StreamingResponse(generate(), media_type="text/plain")

# 地图查询端点（流式）
@app.post("/api/chat/map/stream")
async def chat_map_stream(
    user_query: str = Form(...),
    memory_strategy: str = Form("file"),
    user_id: str = Form(None)
):
    """地图查询端点（流式返回）"""
    async def generate():
        async for chunk in process_map_query_stream(user_query, memory_strategy, user_id):
            yield f"data: {json.dumps(chunk)}\n\n"
    
    return StreamingResponse(generate(), media_type="text/plain")

# 健康检查端点
@app.get("/health")
async def health_check():
    return {"status": "healthy", "version": "2.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)