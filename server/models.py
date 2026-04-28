from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    created_at = Column(DateTime, default=datetime.now)
    conversations = relationship("Conversation", back_populates="owner")

class Conversation(Base):
    __tablename__ = "conversations"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now)
    mode = Column(String, default="general")  # 对话模式: general, route, travel
    spa_task_id = Column(String, nullable=True)  # SPA任务ID，用于保存和重新加载HTML内容
    spa_content = Column(Text, nullable=True)  # 生成的HTML内容
    generated_code = Column(Text, nullable=True)  # 生成的代码内容
    owner = relationship("User", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    content = Column(Text, nullable=False)
    sender = Column(String, nullable=False)
    timestamp = Column(DateTime, default=datetime.now)
    conversation_id = Column(Integer, ForeignKey("conversations.id"))
    conversation = relationship("Conversation", back_populates="messages")
    agent = Column(String, nullable=True)  # 代理名称
    type = Column(String, nullable=True)  # 消息类型: simple_output, agent_output, final, error
    thinking_process = Column(Text, nullable=True)  # 思考过程，JSON格式存储

class ModelConfig(Base):
    __tablename__ = "model_configs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    api_key = Column(String, nullable=True)
    model_name = Column(String, default="gpt-4o")
    base_url = Column(String, default="https://api.openai.com/v1")
    temperature = Column(Float, default=0.7)
    max_tokens = Column(Integer, default=4096)
    owner = relationship("User")