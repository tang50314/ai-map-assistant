from fastapi import FastAPI, HTTPException, Depends, status, Request, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.responses import StreamingResponse
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from typing import List, Optional
import os
import json
import asyncio
from teams import process_map_query
from pydantic import BaseModel
from models import Base, User, Conversation, Message, ModelConfig

class ConversationOut(BaseModel):
    id: int
    title: str
    mode: str
    created_at: datetime
    updated_at: datetime
    spa_task_id: Optional[str] = None  # SPA任务ID
    spa_content: Optional[str] = None  # 生成的HTML内容
    generated_code: Optional[str] = None  # 生成的代码内容

class MessageOut(BaseModel):
    id: int
    content: str
    sender: str
    timestamp: datetime
    conversation_id: int
    agent: Optional[str] = None
    type: Optional[str] = None
    thinking_process: Optional[str] = None

class ConversationDetailOut(BaseModel):
    id: int
    title: str
    mode: str
    created_at: datetime
    updated_at: datetime
    spa_task_id: Optional[str] = None  # SPA任务ID
    spa_content: Optional[str] = None  # 生成的HTML内容
    generated_code: Optional[str] = None  # 生成的代码内容
    messages: List[MessageOut]

class ModelConfigOut(BaseModel):
    id: int
    user_id: int
    api_key: Optional[str]
    model_name: str
    base_url: str
    temperature: float
    max_tokens: int

app = FastAPI(title="AI地图助手后端服务", description="集成百度地图MCP的智能对话系统")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SQLALCHEMY_DATABASE_URL = "sqlite:///./sqlitedb/aimapassistant.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

SECRET_KEY = "your-secret-key"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class MessageCreate(BaseModel):
    content: str
    sender: str
    agent: Optional[str] = None
    type: Optional[str] = None
    thinking_process: Optional[str] = None
    user_location: Optional[dict] = None  # 用户位置信息

class ConversationCreate(BaseModel):
    title: str
    mode: Optional[str] = "general"

class ModelConfigUpdate(BaseModel):
    api_key: Optional[str] = None
    model_name: Optional[str] = None
    base_url: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 启动服务器
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)

def get_password_hash(password: str):
    return pwd_context.hash(password)

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
        token_data = {"username": username}
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.username == token_data["username"]).first()
    if user is None:
        raise credentials_exception
    return user

async def get_current_active_user(current_user: User = Depends(get_current_user)):
    return current_user

@app.post("/token")
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    if not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/users/", status_code=201)
async def create_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(user.password)
    new_user = User(username=user.username, email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"msg": "User created"}

@app.get("/users/me")
async def read_users_me(current_user: User = Depends(get_current_active_user)):
    return current_user

# 流式响应
async def handle_autogen_stream(content: str, conversation_id: int, db: Session, mode: str = "general", user_location: Optional[dict] = None):
    """
    纯粹的 Autogen 流式处理逻辑。
    根据对话模式选择对应的处理函数。
    """
    full_response = ""
    thinking_process = []  # 存储思考过程
    final_result = ""
    
    print(f"🤖 收到用户输入，模式: {mode}, 内容: {content}")
    
    try:
        # 根据模式选择对应的处理函数
        if mode == "general":
            print(f"🎯 使用普通聊天代理处理")
            from teams import process_general_query
            async for chunk in process_general_query(content, conversation_id, db):
                if chunk.get("agent") and chunk.get("content"):
                    # 为ResultAgent启用逐字符流式输出，实现打字机效果
                    if chunk["agent"] == "ResultAgent":
                        # 逐字符发送，实现打字机效果
                        for char in chunk["content"]:
                            yield f"data: {json.dumps({'agent': chunk['agent'], 'content': char, 'type': 'agent_output', 'done': False})}\n\n"
                            await asyncio.sleep(0.01)
                    else:
                        # 其他agent一次性发送
                        yield f"data: {json.dumps({'agent': chunk['agent'], 'content': chunk['content'], 'type': 'agent_output', 'done': False})}\n\n"
                    
                    # 收集思考过程
                    if chunk["agent"] != "ResultAgent":
                        thinking_process.append({
                            "agent": chunk["agent"],
                            "content": chunk["content"]
                        })
                    else:
                        final_result += chunk["content"]
                        
                if chunk.get("done"):
                    break
                    
        elif mode == "route":
            print(f"🎯 使用路线规划代理处理")
            from teams import process_route_query
            async for chunk in process_route_query(content, conversation_id, db, user_location):
                if chunk.get("agent") and chunk.get("content"):
                    # 为ResultAgent启用逐字符流式输出，实现打字机效果
                    if chunk["agent"] == "ResultAgent":
                        # 逐字符发送，实现打字机效果
                        for char in chunk["content"]:
                            yield f"data: {json.dumps({'agent': chunk['agent'], 'content': char, 'type': 'agent_output', 'done': False})}\n\n"
                            await asyncio.sleep(0.01)  # 控制打字速度
                    else:
                        # 其他agent一次性发送
                        yield f"data: {json.dumps({'agent': chunk['agent'], 'content': chunk['content'], 'type': 'agent_output', 'done': False})}\n\n"
                    
                    # 收集思考过程
                    if chunk["agent"] != "ResultAgent":
                        thinking_process.append({
                            "agent": chunk["agent"],
                            "content": chunk["content"]
                        })
                    else:
                        final_result += chunk["content"]
                        
                if chunk.get("done"):
                    break
                    
        elif mode == "travel":
            print(f"🎯 使用旅行规划代理处理")
            from teams import process_travel_query
            async for chunk in process_travel_query(content, conversation_id, db):
                if chunk.get("agent") and chunk.get("content"):
                    # 为ResultAgent启用逐字符流式输出，实现打字机效果
                    if chunk["agent"] == "ResultAgent":
                        # 逐字符发送，实现打字机效果
                        for char in chunk["content"]:
                            yield f"data: {json.dumps({'agent': chunk['agent'], 'content': char, 'type': 'agent_output', 'done': False})}\n\n"
                            await asyncio.sleep(0.01)  # 控制打字速度
                    else:
                        # 其他agent一次性发送
                        yield f"data: {json.dumps({'agent': chunk['agent'], 'content': chunk['content'], 'type': 'agent_output', 'done': False})}\n\n"
                    
                    # 收集思考过程
                    if chunk["agent"] != "ResultAgent":
                        thinking_process.append({
                            "agent": chunk["agent"],
                            "content": chunk["content"]
                        })
                    else:
                        final_result += chunk["content"]
                        
                if chunk.get("done"):
                    print(f"✅ 收到完成信号，final_result长度: {len(final_result)}, thinking_process数量: {len(thinking_process)}")
                    break
                    
        else:
            # 默认使用地图查询
            print(f"🎯 使用地图查询代理处理")
            final_result = await process_map_query(content)
            for char in final_result:
                yield f"data: {json.dumps({'content': char, 'type': 'simple_output', 'done': False})}\n\n"
                await asyncio.sleep(0.005)  # 模拟流式延迟

    except Exception as e:
        # 如果 Autogen 或 MCP 失败，直接返回错误信息
        error_message = f"多代理系统调用失败 (Autogen/MCP 错误)：{str(e)}。请检查 MCP Key 和 Autogen 配置。"
        print(f"❌ 严重错误: {error_message}")
        print(f"错误详情: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        
        for char in error_message:
            yield f"data: {json.dumps({'content': char, 'type': 'error', 'done': False})}\n\n"
            await asyncio.sleep(0.005)
        final_result = error_message
    
    finally:
        # 保存完整的AI响应到数据库
        print(f"💾 准备保存AI消息，final_result长度: {len(final_result)}, thinking_process数量: {len(thinking_process)}")
        if final_result or thinking_process:  # 只要有结果或思考过程就保存
            try:
                # 使用一个新的 Session 来确保线程安全
                db_save = SessionLocal()
                
                # 确定最终显示的内容：优先使用final_result，如果没有则使用思考过程中的最后一个输出
                display_content = final_result
                if not display_content and thinking_process:
                    # 使用思考过程中的最后一个输出作为显示内容
                    display_content = thinking_process[-1]["content"]
                if not display_content:
                    display_content = "无最终输出"
                
                # 确定agent类型：优先使用ResultAgent，如果没有则使用思考过程中的最后一个agent
                agent_type = "ResultAgent" if final_result else None
                if not agent_type and thinking_process:
                    agent_type = thinking_process[-1]["agent"]
                
                ai_message = Message(
                    content=display_content,
                    sender="ai",
                    conversation_id=conversation_id,
                    agent=agent_type,
                    type="final",
                    thinking_process=json.dumps(thinking_process, ensure_ascii=False) if thinking_process else None
                )
                db_save.add(ai_message)
                db_save.commit()
                db_save.close()
                print(f"✅ AI消息已保存到数据库，内容长度: {len(display_content)}, 思考过程: {len(thinking_process)} 条, agent: {agent_type}")
            except Exception as db_e:
                print(f"❌ 数据库保存失败: {db_e}")
                import traceback
                traceback.print_exc()
        else:
            print("⚠️ 没有内容需要保存")
        
        # 发送结束信号
        yield f"data: {json.dumps({'content': '', 'type': 'final', 'done': True})}\n\n"

@app.post("/conversations/{conversation_id}/messages/stream/general/")
async def stream_general_message(
    conversation_id: int,
    message: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """普通聊天流式响应"""
    return await create_message_stream(conversation_id, message, current_user, db)

@app.post("/conversations/{conversation_id}/messages/stream/route/")
async def stream_route_message(
    conversation_id: int,
    message: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """路线规划流式响应"""
    return await create_message_stream(conversation_id, message, current_user, db)

@app.post("/conversations/{conversation_id}/messages/stream/travel/")
async def stream_travel_message(
    conversation_id: int,
    message: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """旅行规划流式响应"""
    return await create_message_stream(conversation_id, message, current_user, db)

async def create_message_stream(
    conversation_id: int,
    message: MessageCreate,
    current_user: User,
    db: Session,
):
    """
    创建用户消息并返回纯粹的 Autogen 流式 AI 响应。
    这是唯一的 AI 响应生成路径。
    """
    # 检查对话是否存在且属于当前用户
    conversation = (
        db.query(Conversation)
        .filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id)
        .first()
    )

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # 创建用户消息
    db_message = Message(content=message.content, sender=message.sender, conversation_id=conversation_id)
    db.add(db_message)

    # 更新对话的更新时间
    conversation.updated_at = datetime.now()

    db.commit()
    db.refresh(db_message)  # 确保用户消息已存入

    # 直接调用 Autogen 流处理函数
    if message.sender == "user":
        # 根据对话的模式选择对应的处理函数
        mode = conversation.mode or "general"
        print(f"🔄 对话模式: {mode}, 用户消息: {message.content}")
        
        # 注意：这里传递的 db 是请求的 Session， handle_autogen_stream 在内部创建新的 Session 保存 AI 消息。
        return StreamingResponse(
            handle_autogen_stream(message.content, conversation_id, db, mode, message.user_location),
            media_type="text/event-stream",
        )

    # 如果不是用户消息，返回空流
    async def empty_stream():
        yield f"data: {json.dumps({'content': '', 'done': True})}\n\n"
    return StreamingResponse(empty_stream(), media_type="text/event-stream")

@app.get("/conversations/", response_model=List[ConversationOut])
async def get_conversations(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversations = db.query(Conversation).filter(Conversation.user_id == current_user.id).all()
    return conversations

@app.get("/conversations/{conversation_id}", response_model=ConversationDetailOut)
async def get_conversation(conversation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    # 获取对话的所有消息
    messages = db.query(Message).filter(Message.conversation_id == conversation_id).order_by(Message.timestamp.asc()).all()
    
    return ConversationDetailOut(
        id=conversation.id,
        title=conversation.title,
        mode=conversation.mode,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        spa_task_id=conversation.spa_task_id,
        spa_content=conversation.spa_content,
        generated_code=conversation.generated_code,
        messages=[MessageOut(
            id=msg.id,
            content=msg.content,
            sender=msg.sender,
            timestamp=msg.timestamp,
            conversation_id=msg.conversation_id,
            agent=msg.agent,
            type=msg.type,
            thinking_process=msg.thinking_process
        ) for msg in messages]
    )

@app.post("/conversations/", response_model=ConversationOut)
async def create_conversation(conversation: ConversationCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = Conversation(title=conversation.title, mode=conversation.mode, user_id=current_user.id)
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return conv

@app.put("/conversations/{conversation_id}")
async def update_conversation(conversation_id: int, conversation: ConversationCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    conv.title = conversation.title
    conv.mode = conversation.mode
    db.commit()
    return {"msg": "Conversation updated"}

@app.delete("/conversations/{conversation_id}")
async def delete_conversation(conversation_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conv = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    db.delete(conv)
    db.commit()
    return {"msg": "Conversation deleted"}

@app.patch("/conversations/{conversation_id}/title")
async def update_conversation_title(conversation_id: int, title_update: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """更新对话标题"""
    conv = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    new_title = title_update.get("title")
    if not new_title or not new_title.strip():
        raise HTTPException(status_code=400, detail="Title cannot be empty")
    
    conv.title = new_title.strip()
    db.commit()
    return {"msg": "Conversation title updated", "title": conv.title}

@app.patch("/conversations/{conversation_id}/spa-task")
async def update_conversation_spa_task(conversation_id: int, spa_task_update: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """更新对话的SPA任务ID"""
    conv = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    spa_task_id = spa_task_update.get("spa_task_id")
    conv.spa_task_id = spa_task_id
    db.commit()
    return {"msg": "Conversation SPA task ID updated", "spa_task_id": conv.spa_task_id}

@app.patch("/conversations/{conversation_id}/spa-content")
async def update_conversation_spa_content(conversation_id: int, spa_content_update: dict, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """更新对话的SPA内容"""
    conv = db.query(Conversation).filter(Conversation.id == conversation_id, Conversation.user_id == current_user.id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    
    spa_content = spa_content_update.get("spa_content")
    generated_code = spa_content_update.get("generated_code")
    
    conv.spa_content = spa_content
    conv.generated_code = generated_code
    db.commit()
    return {"msg": "Conversation SPA content updated", "spa_content": conv.spa_content, "generated_code": conv.generated_code}

@app.get("/model-config/", response_model=ModelConfigOut)
async def get_model_config(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    model_config = db.query(ModelConfig).filter(ModelConfig.user_id == current_user.id).first()
    if not model_config:
        model_config = ModelConfig(user_id=current_user.id)
        db.add(model_config)
        db.commit()
        db.refresh(model_config)
    return model_config

@app.put("/model-config/", response_model=ModelConfigOut)
async def update_model_config(config: ModelConfigUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    model_config = db.query(ModelConfig).filter(ModelConfig.user_id == current_user.id).first()
    if not model_config:
        model_config = ModelConfig(user_id=current_user.id)
        db.add(model_config)
    if config.api_key is not None:
        model_config.api_key = config.api_key
    if config.model_name is not None:
        model_config.model_name = config.model_name
    if config.base_url is not None:
        model_config.base_url = config.base_url
    if config.temperature is not None:
        model_config.temperature = config.temperature
    if config.max_tokens is not None:
        model_config.max_tokens = config.max_tokens

    db.commit()
    db.refresh(model_config)
    return model_config

os.makedirs("./sqlitedb", exist_ok=True)

@app.on_event("startup")
async def startup_event():
    Base.metadata.create_all(bind=engine)
    print("数据库已初始化完成")

    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "testuser").first():
            hashed_password = get_password_hash("testpassword")
            test_user = User(username="testuser", email="test@example.com", hashed_password=hashed_password)
            db.add(test_user)
            db.commit()
            print("测试用户已创建: 用户名=testuser, 密码=testpassword")
            
            test_user = db.query(User).filter(User.username == "testuser").first()
            if not db.query(ModelConfig).filter(ModelConfig.user_id == test_user.id).first():
                default_config = ModelConfig(user_id=test_user.id)
                db.add(default_config)
                db.commit()
                print("测试用户的默认模型配置已创建")
    except Exception as e:
        print(f"创建测试用户时出错: {str(e)}")
    finally:
        db.close()