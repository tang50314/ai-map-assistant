// src/pages/Home.tsx
import React, { useState, useEffect, useRef, useContext } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/hooks/useTheme';
import { 
  MessageCircle, Navigation, Plane, Send, Menu, X, Settings, Moon, Sun, LogOut, Plus, MapPin,
  MoreVertical, Edit, Trash2, Globe, Code, Copy, RefreshCw, Save
} from 'lucide-react';
import { AuthContext } from '@/contexts/authContext';
import Markdown from '@/components/Markdown';
import { AgentMessage } from '@/components/AgentMessage';
import ThinkingProcess from '@/components/ThinkingProcess';
import MapView from '@/components/MapView';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  agent?: string;  // 代理名称
  type?: 'agent_output' | 'simple_output' | 'error' | 'final';  // 消息类型
  thinkingProcess?: Array<{agent: string; content: string}>;  // 思考过程
  isLoading?: boolean;  // 加载状态
  isStreaming?: boolean;  // 流式输出状态
}

interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  messages: Message[];
  mode: 'general' | 'route' | 'travel';
  spaTaskId?: string; // SPA任务ID，用于保存和重新加载HTML内容
  spaContent?: string; // SPA内容，存储生成的HTML代码
  generatedCode?: string; // 生成的代码，用于代码查看
}

interface LoginFormData {
  username: string;
  password: string;
}

interface RegisterFormData {
  username: string;
  password: string;
  email: string;
}

const MODE_ICONS = {
  general: MessageCircle,
  route: Navigation,
  travel: Plane
};

const MODE_LABELS = {
  general: '普通聊天',
  route: '路线规划',
  travel: '旅行规划'
};

const MODE_PREFIX = {
  general: '[普通]',
  route: '[路线]',
  travel: '[旅行]'
};

export default function Home() {
  const { isAuthenticated, logout, user, login, register } = useContext(AuthContext);
  const { theme, toggleTheme } = useTheme();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [chatMode, setChatMode] = useState<'general' | 'route' | 'travel'>('general');
  const [activeTab, setActiveTab] = useState<'map' | 'preview'>('map');
  const [previewTab, setPreviewTab] = useState<'effect' | 'code'>('effect');
  const [autoGenerateSPA, setAutoGenerateSPA] = useState(true); // 自动生成功能开关
  const [isGeneratingSPA, setIsGeneratingSPA] = useState(false);
  const [isGeneratingMapMark, setIsGeneratingMapMark] = useState(false); // 马克地图生成状态
  const [lastAIResponse, setLastAIResponse] = useState('');
  const [spaContent, setSpaContent] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [editableCode, setEditableCode] = useState('');
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // 还原您的原始登录注册弹窗状态和表单
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);
  const [loginForm, setLoginForm] = useState<LoginFormData>({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState<RegisterFormData>({ username: '', password: '', email: '' });
  
  // 重命名状态
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  
  // 添加CSS样式用于代码高亮
  const codeStyles = `
    .code-keyword { color: #ff6b6b; font-weight: 600; }
    .code-string { color: #51cf66; }
    .code-number { color: #74c0fc; }
    .code-comment { color: #868e96; font-style: italic; }
    .code-tag { color: #339af0; }
    .code-attribute { color: #fd7e14; }
    .code-value { color: #51cf66; }
  `;

  // 简单的代码语法高亮函数
  const highlightCode = (code: string) => {
    return code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\/(\*|\/.*)/g, '<span class="code-comment">$&</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this)\b/g, '<span class="code-keyword">$&</span>')
      .replace(/(['"`])([^'"`]*)\1/g, '<span class="code-string">$&</span>')
      .replace(/\b\d+\.?\d*\b/g, '<span class="code-number">$&</span>')
      .replace(/&lt;([a-zA-Z][a-zA-Z0-9]*)\b/g, '&lt;<span class="code-tag">$1</span>')
      .replace(/([a-zA-Z-]+)\s*=\s*['"`]([^'"`]*)['"`]/g, '<span class="code-attribute">$1</span>=<span class="code-value">$2</span>');
  };

  // 侧边栏拖拽调整宽度状态
  const [sidebarWidth, setSidebarWidth] = useState(288); // 默认宽度 18rem = 288px
  const [isResizing, setIsResizing] = useState(false);
  const [chatWidth, setChatWidth] = useState(0); // 聊天区域宽度，0表示使用flex布局
  const [isResizingChat, setIsResizingChat] = useState(false);

  const currentConversation = currentConversationId
    ? conversations.find(c => c.id === currentConversationId)
    : null;

  // 检查当前对话是否有ResultAgent输出
  const hasResultAgentOutput = () => {
    if (!currentConversation) {
      console.log('hasResultAgentOutput: 无当前对话');
      return false;
    }
    
    // 直接从消息中查找ResultAgent内容
    const resultAgentMsg = currentConversation.messages.find(msg => 
      msg.sender === 'ai' && msg.agent === 'ResultAgent' && msg.content && msg.content.length > 100
    );
    
    const hasResultAgentMsg = !!resultAgentMsg;
    const hasLastAiResponse = !!currentConversation.lastAiResponse;
    const hasGlobalLastAIResponse = !!lastAIResponse && lastAIResponse.length > 100;
    
    console.log('hasResultAgentOutput 检查:', {
      hasResultAgentMsg,
      hasLastAiResponse,
      hasGlobalLastAIResponse,
      resultAgentContent: resultAgentMsg?.content?.substring(0, 100) + '...',
      lastAiResponse: currentConversation.lastAiResponse?.substring(0, 100) + '...',
      globalLastAIResponse: lastAIResponse?.substring(0, 100) + '...'
    });
    
    return hasResultAgentMsg || hasLastAiResponse || hasGlobalLastAIResponse;
  };

  useEffect(() => {
    if (currentConversation?.messages.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [currentConversationId, conversations]);

  useEffect(() => {
    if (isAuthenticated) {
      loadConversations();
    } else {
      // 用户退出登录时清除所有相关状态
      setConversations([]);
      setCurrentConversationId(null);
      setNewMessage('');
      setEditingConversationId(null);
      setEditingTitle('');
      // 用户登出时清空SPA内容
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (currentConversationId && isAuthenticated) {
      loadConversationMessages(currentConversationId);
    }
  }, [currentConversationId, isAuthenticated]);

  // 当generatedCode变化时，更新editableCode（如果不在编辑模式）
  useEffect(() => {
    if (!isEditingCode && generatedCode) {
      setEditableCode(generatedCode);
    }
  }, [generatedCode, isEditingCode]);

  const loadConversations = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:8001/conversations/', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.map((c: any) => ({
          id: c.id.toString(),
          title: c.title,
          createdAt: new Date(c.created_at),
          messages: [],
          mode: c.mode || 'general',
          spaTaskId: c.spa_task_id || undefined,
          spaContent: c.spa_content || undefined,
          generatedCode: c.generated_code || undefined,
          lastAiResponse: c.last_ai_response || undefined
        })));
      }
    } catch (error) {
      toast.error('加载对话失败');
    }
  };

  const deleteConversation = async (conversationId: string) => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:8001/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setConversations(prev => prev.filter(c => c.id !== conversationId));
        if (currentConversationId === conversationId) {
          setCurrentConversationId(null);
          // 删除当前对话时清空SPA内容
        }
        toast.success('对话已删除');
      } else {
        toast.error('删除对话失败');
      }
    } catch (error) {
      toast.error('删除对话失败');
    }
  };

  const startEditingTitle = (conversationId: string, currentTitle: string) => {
    setEditingConversationId(conversationId);
    setEditingTitle(currentTitle);
  };

  const saveTitleEdit = async () => {
    if (!editingConversationId || !editingTitle.trim()) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:8001/conversations/${editingConversationId}/title`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ title: editingTitle.trim() })
      });
      if (res.ok) {
        setConversations(prev => prev.map(c => 
          c.id === editingConversationId 
            ? { ...c, title: editingTitle.trim() }
            : c
        ));
        setEditingConversationId(null);
        setEditingTitle('');
        toast.success('标题已更新');
      } else {
        toast.error('更新标题失败');
      }
    } catch (error) {
      toast.error('更新标题失败');
    }
  };

  const cancelTitleEdit = () => {
    setEditingConversationId(null);
    setEditingTitle('');
  };

  const saveCodeEdit = async () => {
    if (!currentConversationId || !editableCode.trim()) return;
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`http://localhost:8001/conversations/${currentConversationId}/spa-content`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ 
          generated_code: editableCode.trim(),
          spa_content: editableCode.trim() // 同时更新spa_content以保持同步
        })
      });
      if (res.ok) {
        setGeneratedCode(editableCode.trim());
        setConversations(prev => prev.map(c => 
          c.id === currentConversationId 
            ? { ...c, generatedCode: editableCode.trim(), spaContent: editableCode.trim() }
            : c
        ));
        setIsEditingCode(false);
        setHasUnsavedChanges(false);
        toast.success('代码已保存');
      } else {
        toast.error('保存代码失败');
      }
    } catch (error) {
      toast.error('保存代码失败');
    }
  };

  const startEditingCode = () => {
    setEditableCode(generatedCode);
    setIsEditingCode(true);
    setHasUnsavedChanges(false);
  };

  const cancelCodeEdit = () => {
    setIsEditingCode(false);
    setHasUnsavedChanges(false);
    setEditableCode('');
  };

  const handleCodeChange = (newCode: string) => {
    setEditableCode(newCode);
    setHasUnsavedChanges(newCode !== generatedCode);
  };

  const handleTitleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveTitleEdit();
    } else if (e.key === 'Escape') {
      cancelTitleEdit();
    }
  };

  // 侧边栏拖拽调整宽度函数
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isResizing) return;
    const newWidth = e.clientX;
    if (newWidth >= 200 && newWidth <= 500) { // 限制最小和最大宽度
      setSidebarWidth(newWidth);
    }
  };

  const handleMouseUp = () => {
    setIsResizing(false);
  };

  // 聊天区域拖拽调整宽度函数
  const handleChatMouseDown = (e: React.MouseEvent) => {
    setIsResizingChat(true);
    e.preventDefault();
  };

  const handleChatMouseMove = (e: MouseEvent) => {
    if (!isResizingChat) return;
    // 计算新的聊天区域宽度（从左侧到鼠标位置）
    const newWidth = e.clientX - sidebarWidth;
    const minWidth = 400;
    const maxWidth = window.innerWidth - sidebarWidth - 384; // 减去侧边栏和地图区域固定宽度
    
    if (newWidth >= minWidth && newWidth <= maxWidth) {
      setChatWidth(newWidth);
    }
  };

  const handleChatMouseUp = () => {
    setIsResizingChat(false);
  };

  // 添加全局鼠标事件监听
  useEffect(() => {
    if (isResizing) {
      document.body.classList.add('resizing');
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.body.classList.remove('resizing');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing]);

  // 添加聊天区域拖拽监听
  useEffect(() => {
    if (isResizingChat) {
      document.body.classList.add('resizing');
      document.addEventListener('mousemove', handleChatMouseMove);
      document.addEventListener('mouseup', handleChatMouseUp);
      return () => {
        document.body.classList.remove('resizing');
        document.removeEventListener('mousemove', handleChatMouseMove);
        document.removeEventListener('mouseup', handleChatMouseUp);
      };
    }
  }, [isResizingChat, sidebarWidth]);

  const loadConversationMessages = async (conversationId: string) => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem('token');
    if (!token) return;
    
    try {
      const res = await fetch(`http://localhost:8001/conversations/${conversationId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (res.ok) {
        const data = await res.json();
        // 更新当前对话的聊天模式
        setChatMode(data.mode || 'general');
        
        // 如果对话有SPA内容，直接使用，否则清空
        if (data.spa_content) {
          // 更新当前对话的SPA内容
          setConversations(prev => prev.map(conv => 
            conv.id === conversationId 
              ? { ...conv, spaContent: data.spa_content, generatedCode: data.generated_code || '' }
              : conv
          ));
        } else {
          // 清空当前对话的SPA内容
          setConversations(prev => prev.map(conv => 
            conv.id === conversationId 
              ? { ...conv, spaContent: '', generatedCode: '' }
              : conv
          ));
        }
        
        // 更新会话列表中的消息
        setConversations(prev => prev.map(conv => 
          conv.id === conversationId 
            ? {
                ...conv,
                messages: Array.isArray(data.messages) ? data.messages.map((msg: any) => ({
                  id: msg.id.toString(),
                  content: msg.content,
                  sender: msg.sender as 'user' | 'ai',
                  timestamp: new Date(msg.timestamp),
                  agent: msg.agent,
                  type: msg.type,
                  thinkingProcess: msg.thinking_process ? JSON.parse(msg.thinking_process) : []
                })) : []
              }
            : conv
        ));
      }
    } catch (error) {
      console.error('加载对话消息失败:', error);
    }
  };



  const createNewConversation = async (mode: 'general' | 'route' | 'travel') => {
    if (!isAuthenticated) return toast.error('请登录');
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:8001/conversations/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: `${MODE_PREFIX[mode]} 新对话`, mode })
    });
    if (res.ok) {
      const data = await res.json();
      const conv: Conversation = {
        id: data.id.toString(),
        title: data.title,
        createdAt: new Date(data.created_at),
        messages: [],
        mode,
        spaContent: '',
        generatedCode: ''
      };
      setConversations(prev => [conv, ...prev]);
      setCurrentConversationId(data.id.toString());
      setChatMode(mode);
      // 创建新对话时清空当前对话的SPA内容
      setConversations(prev => prev.map(conv => 
        conv.id === data.id.toString() 
          ? { ...conv, spaContent: '', generatedCode: '' }
          : conv
      ));
    }
  };

  // 重新生成SPA网页
  const handleRegenerateSPA = async () => {
    console.log('=== 重新生成网页按钮被点击 ===');
    const currentConv = conversations.find(c => c.id === currentConversationId);
    
    // 直接从当前对话的消息中获取最新的ResultAgent内容（与handleGenerateSPA相同逻辑）
    const resultAgentMsg = currentConv?.messages.find(msg => 
      msg.sender === 'ai' && msg.agent === 'ResultAgent' && msg.content && msg.content.length > 100
    );
    
    const aiResponse = resultAgentMsg?.content || lastAIResponse || currentConv?.lastAiResponse;
    
    console.log('重新生成-ResultAgent消息:', resultAgentMsg?.content?.substring(0, 100) + '...');
    console.log('重新生成-全局lastAIResponse:', lastAIResponse?.substring(0, 100) + '...');
    console.log('重新生成-对话lastAiResponse:', currentConv?.lastAiResponse?.substring(0, 100) + '...');
    console.log('重新生成-最终AI响应内容:', aiResponse?.substring(0, 200) + '...');
    
    if (!aiResponse?.trim() || isGeneratingSPA) {
      console.log('重新生成被阻止，原因:', !aiResponse?.trim() ? '无AI响应内容' : '正在生成中');
      return;
    }
    
    console.log('开始重新生成SPA，AI响应长度:', aiResponse.length);
    
    // 直接调用生成函数，让它处理清空逻辑
    await handleGenerateSPA();
  };

  // 生成马克地图
  const handleGenerateMapMark = async () => {
    console.log('=== 生成马克地图按钮被点击 ===');
    const currentConv = conversations.find(c => c.id === currentConversationId);
    
    // 获取AI响应内容
    const resultAgentMsg = currentConv?.messages.find(msg => 
      msg.sender === 'ai' && msg.agent === 'ResultAgent' && msg.content && msg.content.length > 100
    );
    
    const aiResponse = resultAgentMsg?.content || lastAIResponse || currentConv?.lastAiResponse;
    
    console.log('当前对话ID:', currentConversationId);
    console.log('AI响应内容长度:', aiResponse?.length);
    console.log('是否正在生成地图:', isGeneratingMapMark);
    
    if (!aiResponse?.trim() || isGeneratingMapMark) {
      console.log('生成被阻止，原因:', !aiResponse?.trim() ? '无AI响应内容' : '正在生成中');
      return;
    }
    
    setIsGeneratingMapMark(true);
    setActiveTab('map');
    
    try {
      const token = localStorage.getItem('token');
      
      // 获取用户消息内容
      const userMessages = currentConv?.messages
        .filter(msg => msg.sender === 'user' && msg.content)
        .map(msg => msg.content)
        .join('\n') || '';
      
      // 使用当前对话的模式
      const messageMode = currentConv?.mode || chatMode;
      
      // 创建AbortController用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
      
      const res = await fetch('http://localhost:8003/map/generate/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          content: aiResponse,
          content_type: messageMode === 'route' ? 'route' : 'travel'
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      let mapUrl = '';
      let qrCode = '';
      let taskId = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('马克地图生成数据:', data);
              
              if (data.type === 'map_result' || data.type === 'complete') {
                if (data.map_url) {
                  mapUrl = data.map_url;
                  console.log('✅ 获取到地图URL:', data.map_url);
                }
                if (data.qr_code) {
                  qrCode = data.qr_code;
                  console.log('✅ 获取到二维码:', data.qr_code);
                }
                if (data.task_id) {
                  taskId = data.task_id;
                }
              }
              
              if (data.done === true && data.task_id) {
                taskId = data.task_id;
              }
              
              if (data.type === 'error') {
                throw new Error(data.message || '马克地图生成失败');
              }
            } catch (e) {
              console.error('解析马克地图生成数据失败:', e);
            }
          }
        }
      }
      
      if (mapUrl) {
        // 成功获取到地图URL，更新对话数据
        setConversations(prev => prev.map(conv => 
          conv.id === currentConversationId 
            ? { ...conv, mapUrl: mapUrl, mapQrCode: qrCode, mapTaskId: taskId }
            : conv
        ));

        // 保存到数据库
        try {
          await fetch(`http://localhost:8001/conversations/${currentConversationId}/map-content`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              map_url: mapUrl,
              map_qr_code: qrCode
            })
          });
          
          if (taskId) {
            await fetch(`http://localhost:8001/conversations/${currentConversationId}/map-task`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ map_task_id: taskId })
            });
          }
        } catch (saveError) {
          console.error('保存地图内容到数据库失败:', saveError);
        }
        
        toast.success('马克地图生成成功！');
      } else {
        throw new Error('未获取到地图URL');
      }
      
    } catch (error) {
      console.error('马克地图生成失败:', error);
      let errorMessage = '马克地图生成失败';
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = '生成超时，请稍后重试';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast.error(errorMessage);
    } finally {
      setIsGeneratingMapMark(false);
    }
  };

  // 生成SPA网页
  const handleGenerateSPA = async () => {
    console.log('=== 生成网页按钮被点击 ===');
    const currentConv = conversations.find(c => c.id === currentConversationId);
    
    // 直接从当前对话的消息中获取最新的ResultAgent内容
    const resultAgentMsg = currentConv?.messages.find(msg => 
      msg.sender === 'ai' && msg.agent === 'ResultAgent' && msg.content && msg.content.length > 100
    );
    
    const aiResponse = resultAgentMsg?.content || lastAIResponse || currentConv?.lastAiResponse;
    
    console.log('当前对话ID:', currentConversationId);
    console.log('ResultAgent消息:', resultAgentMsg?.content?.substring(0, 100) + '...');
    console.log('全局lastAIResponse:', lastAIResponse?.substring(0, 100) + '...');
    console.log('对话lastAiResponse:', currentConv?.lastAiResponse?.substring(0, 100) + '...');
    console.log('最终AI响应内容:', aiResponse?.substring(0, 200) + '...');
    console.log('是否正在生成SPA:', isGeneratingSPA);
    
    if (!aiResponse?.trim() || isGeneratingSPA) {
      console.log('生成被阻止，原因:', !aiResponse?.trim() ? '无AI响应内容' : '正在生成中');
      return;
    }
    
    setIsGeneratingSPA(true);
    setActiveTab('preview');
    
    // 清空之前的SPA内容
    if (currentConversationId) {
      setConversations(prev => prev.map(conv => 
        conv.id === currentConversationId 
          ? { ...conv, spaContent: '', spaTaskId: undefined, generatedCode: '' }
          : conv
      ));
    }
    
    // 使用当前对话的模式，而不是chatMode状态变量
    const messageMode = currentConv?.mode || chatMode;
    
    try {
      const token = localStorage.getItem('token');
      
      // 优化内容大小，避免413错误 - 截断过长的响应内容
      let optimizedContent = aiResponse;
      if (optimizedContent.length > 12000) {
        // 提取关键信息：标题、主要景点、行程概览
        const lines = optimizedContent.split('\n');
        const keyLines = lines.filter(line => 
          line.includes('##') || // 标题
          line.includes('行程') || // 行程相关
          line.includes('景点') || // 景点相关
          line.includes('推荐') || // 推荐内容
          line.includes('注意') || // 注意事项
          line.match(/^\d+\./) || // 编号列表
          line.match(/^-/) // 无序列表
        ).slice(0, 80); // 增加行数限制
        
        optimizedContent = keyLines.join('\n');
        if (optimizedContent.length > 10000) {
          optimizedContent = optimizedContent.substring(0, 10000) + '...';
        }
      }
      
      const res = await fetch('http://localhost:8002/spa/generate/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          content: optimizedContent,
          content_type: messageMode === 'route' ? 'route' : 'travel'  // general模式也使用travel
        })
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      let htmlContent = '';
      let taskId = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = new TextDecoder().decode(value);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              console.log('SPA生成数据:', data);
              
              // 检查是否包含HTML内容（来自CodeGeneratorAgent或ResultAgent）
              if (data.content && (data.source === 'CodeGeneratorAgent' || data.source === 'ResultAgent')) {
                if (data.content.includes('<!DOCTYPE html>') || data.content.includes('<html') || data.content.includes('<head>')) {
                  htmlContent = data.content;
                  console.log('✅ 捕获到HTML内容，长度:', data.content.length);
                }
              }
              
              if (data.type === 'html_content' && data.content) {
                // 直接获取完整的HTML内容
                htmlContent = data.content;
                console.log('✅ 获取完整HTML内容，长度:', data.content.length);
              } else if (data.type === 'html_chunk' && data.content) {
                // 累积HTML内容块
                htmlContent += data.content;
                console.log('接收到HTML块，长度:', data.content.length);
              }
              
              if (data.type === 'complete' && data.task_id) {
                // 任务完成，保存task_id
                taskId = data.task_id;
                console.log('SPA生成完成，任务ID:', taskId);
              }
              
              if (data.done === true) {
                // 任务完成信号
                if (data.content && data.content.includes('<!DOCTYPE html>')) {
                  htmlContent = data.content;
                }
                if (data.task_id) {
                  taskId = data.task_id;
                }
              }
              
              if (data.type === 'error') {
                throw new Error(data.message || 'SPA生成失败');
              }
            } catch (e) {
              console.error('解析SPA生成数据失败:', e);
            }
          }
        }
      }
      
      if (htmlContent) {
        // 成功获取到HTML内容
        setSpaContent(htmlContent);
        
        // 同时保存生成的代码和HTML内容到当前对话，并保存到数据库
        setConversations(prev => prev.map(conv => 
          conv.id === currentConversationId 
            ? { ...conv, spaContent: htmlContent, generatedCode: htmlContent, spaTaskId: taskId || conv.spaTaskId }
            : conv
        ));

        // 保存到数据库
        try {
          await fetch(`http://localhost:8001/conversations/${currentConversationId}/spa-content`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              spa_content: htmlContent,
              generated_code: htmlContent
            })
          });
          
          // 如果有task_id，也保存到数据库
          if (taskId) {
            await fetch(`http://localhost:8001/conversations/${currentConversationId}/spa-task`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ spa_task_id: taskId })
            });
          }
        } catch (saveError) {
          console.error('保存SPA内容到数据库失败:', saveError);
        }
        
        toast.success('可视化网页生成成功！');
      } else {
        throw new Error('未获取到HTML内容');
      }
      
    } catch (error) {
      console.error('SPA生成失败:', error);
      toast.error('可视化网页生成失败');
    } finally {
      setIsGeneratingSPA(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || isLoading || !currentConversationId) return;
    setIsLoading(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      content: newMessage,
      sender: 'user',
      timestamp: new Date()
    };

    setConversations(prev => prev.map(c =>
      c.id === currentConversationId
        ? { ...c, messages: [...c.messages, userMsg] }
        : c
    ));
    setNewMessage('');

    // 使用当前对话的模式，而不是chatMode状态变量
    const currentConv = conversations.find(c => c.id === currentConversationId);
    const messageMode = currentConv?.mode || chatMode;
    const endpoint = `/messages/stream/${messageMode}/`;
    
    // 构建请求体，如果是路线规划模式且用户有位置信息，则包含位置数据
    const requestBody: any = { content: newMessage, sender: 'user' };
    if (messageMode === 'route' && userLocation) {
      requestBody.user_location = userLocation;
      console.log('路线规划模式，包含用户位置信息:', userLocation);
    } else {
      console.log('路线规划模式，但没有用户位置信息，userLocation:', userLocation, 'messageMode:', messageMode);
    }
    
    try {
      const res = await fetch(`http://localhost:8001/conversations/${currentConversationId}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestBody)
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      let aiContent = '';
      let thinkingProcess: Array<{agent: string; content: string}> = [];
      let finalContent = '';
      const aiMsgId = Date.now().toString() + '-ai';
      const aiMsg: Message = { 
        id: aiMsgId, 
        content: '', 
        sender: 'ai', 
        timestamp: new Date(),
        thinkingProcess: [],
        isLoading: true,  // 添加加载状态
        isStreaming: true  // 初始化为流式输出状态
      };

      setConversations(prev => prev.map(c =>
        c.id === currentConversationId
          ? { ...c, messages: [...c.messages, aiMsg] }
          : c
      ));

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder().decode(value);
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'agent_output' && data.agent && data.content) {
                 // 处理agent输出
                 if (data.agent === 'ResultAgent') {
                   // ResultAgent的输出采用逐字符累积方式，实现打字机效果
                   finalContent += data.content;
                   setConversations(prev => prev.map(c =>
                     c.id === currentConversationId
                       ? {
                           ...c,
                           messages: c.messages.map(m =>
                             m.id === aiMsgId ? { 
                               ...m, 
                               content: finalContent,
                               agent: data.agent,
                               type: data.type,
                               thinkingProcess: thinkingProcess,
                               isStreaming: true  // 保持流式状态
                             } : m
                           )
                         }
                       : c
                   ));
                 } else if (data.agent === 'System' && data.type === 'initial_response') {
                   // 系统初始响应，立即显示给用户
                   setConversations(prev => prev.map(c =>
                     c.id === currentConversationId
                       ? {
                           ...c,
                           messages: c.messages.map(m =>
                             m.id === aiMsgId ? { 
                               ...m, 
                               content: data.content,
                               agent: data.agent,
                               type: data.type
                             } : m
                           )
                         }
                       : c
                   ));
                 } else {
                   // 其他agent的输出收集到思考过程
                   thinkingProcess.push({
                     agent: data.agent,
                     content: data.content
                   });
                   
                   // RoutePlanner、MapTool和PreferenceAgent的输出直接显示，但仍然保留在思考过程中以便保存
                   if (data.agent === 'PreferenceAgent' || data.agent === 'RoutePlanner' || data.agent === 'MapTool') {
                     setConversations(prev => prev.map(c =>
                       c.id === currentConversationId
                         ? {
                             ...c,
                             messages: c.messages.map(m =>
                               m.id === aiMsgId ? { 
                                 ...m, 
                                 content: data.content,  // 直接显示RoutePlanner、MapTool和PreferenceAgent的内容
                                 agent: data.agent,
                                 type: data.type,
                                 thinkingProcess: thinkingProcess  // 保留完整的思考过程
                               } : m
                             )
                           }
                         : c
                     ));
                   } else {
                     // 其他代理（如EndAgent）：更新消息的思考过程
                     setConversations(prev => prev.map(c =>
                       c.id === currentConversationId
                         ? {
                             ...c,
                             messages: c.messages.map(m =>
                               m.id === aiMsgId ? { 
                                 ...m, 
                                 thinkingProcess: thinkingProcess
                               } : m
                             )
                           }
                         : c
                     ));
                   }
                 }
               } else if (data.content && data.type === 'simple_output') {
                // 简单输出模式（兼容旧逻辑）
                aiContent += data.content;
                setConversations(prev => prev.map(c =>
                  c.id === currentConversationId
                    ? {
                        ...c,
                        messages: c.messages.map(m =>
                          m.id === aiMsgId ? { ...m, content: aiContent } : m
                        )
                      }
                    : c
                ));
              }
              
              if (data.done && data.type === 'final') {
                // 保存最后一条AI回复用于网页生成
                const displayContent = finalContent || aiContent;
                setLastAIResponse(displayContent);
                
                // 同时更新当前对话的最后AI响应到数据库
                if (displayContent && currentConversationId) {
                  try {
                    await fetch(`http://localhost:8001/conversations/${currentConversationId}/last-ai-response`, {
                      method: 'PATCH',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                      },
                      body: JSON.stringify({ last_ai_response: displayContent })
                    });
                  } catch (error) {
                    console.error('保存最后AI响应到数据库失败:', error);
                  }
                }
                
                // 自动触发SPA生成 - 当检测到ResultAgent输出且内容足够长时
                if (autoGenerateSPA && data.agent === 'ResultAgent' && displayContent && displayContent.length > 100) {
                  // 延迟1.5秒自动触发SPA生成，给用户看到结果的时间
                  setTimeout(() => {
                    // 检查当前对话是否已有SPA内容
                    const currentConv = conversations.find(c => c.id === currentConversationId);
                    if (!currentConv?.spaContent) {
                      handleGenerateSPA();
                    }
                  }, 1500);
                }
                
                // 移除加载状态，同时设置isStreaming为false表示流式输出结束
                setConversations(prev => prev.map(c =>
                  c.id === currentConversationId
                    ? {
                        ...c,
                        messages: c.messages.map(m =>
                          m.id === aiMsgId ? { ...m, isLoading: false, isStreaming: false } : m
                        )
                      }
                    : c
                ));
                
                if (currentConversation?.title.includes('新对话')) {
                  // 使用当前对话的模式，而不是chatMode状态变量
                  const currentConv = conversations.find(c => c.id === currentConversationId);
                  const messageMode = currentConv?.mode || chatMode;
                  const newTitle = `${MODE_PREFIX[messageMode]} ${newMessage.slice(0, 25)}...`;
                  await fetch(`http://localhost:8001/conversations/${currentConversationId}/title`, {
                    method: 'PATCH',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${localStorage.getItem('token')}`
                    },
                    body: JSON.stringify({ title: newTitle })
                  });
                  setConversations(prev => prev.map(c =>
                    c.id === currentConversationId ? { ...c, title: newTitle } : c
                  ));
                }
              }
            } catch (e) {
              console.error('Parse error:', e);
            }
          }
        }
      }
    } catch (error) {
      toast.error('发送失败');
    } finally {
      setIsLoading(false);
    }
  };

  // 还原您的原始 handleLogin
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(loginForm.username, loginForm.password);
    if (success) {
      setIsLoginModalOpen(false);
    }
  };

  // 还原您的原始 handleRegister
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await register(registerForm.username, registerForm.password, registerForm.email);
    if (success) {
      setIsRegisterModalOpen(false);
    }
  };

  // 获取用户地理位置
  const getUserLocation = async (): Promise<{latitude: number, longitude: number} | null> => {
    console.log('开始获取用户位置...');
    
    if (!navigator.geolocation) {
      console.log('浏览器不支持地理定位');
      setLocationError('您的浏览器不支持地理定位');
      return null;
    }

    // 检查当前的地理位置权限状态
    if ('permissions' in navigator) {
      try {
        const permission = await (navigator as any).permissions.query({ name: 'geolocation' });
        console.log('当前地理位置权限状态:', permission.state);
        if (permission.state === 'denied') {
          console.log('用户已拒绝地理位置权限');
          setLocationError('您已拒绝地理位置权限，请在浏览器设置中允许位置访问');
          return null;
        }
      } catch (e) {
        console.log('无法检查权限状态:', e);
      }
    }

    console.log('浏览器支持地理定位，开始获取位置');
    setLocationLoading(true);
    setLocationError(null);

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        console.log('调用navigator.geolocation.getCurrentPosition');
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5分钟内缓存
        });
      });

      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
      
      console.log('成功获取位置:', location);
      setUserLocation(location);
      return location;
    } catch (error) {
      let errorMessage = '获取位置失败';
      
      switch ((error as GeolocationPositionError).code) {
        case error.PERMISSION_DENIED:
          errorMessage = '用户拒绝了位置访问权限';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = '位置信息不可用';
          break;
        case error.TIMEOUT:
          errorMessage = '获取位置超时';
          break;
      }
      
      console.log('获取位置失败:', errorMessage);
      setLocationError(errorMessage);
      console.warn('获取地理位置失败:', errorMessage);
      return null;
    } finally {
      setLocationLoading(false);
    }
  };

  // 修改创建新对话函数，添加地理位置获取逻辑
  const createNewConversationWithLocation = async (mode: 'general' | 'route' | 'travel') => {
    console.log('createNewConversationWithLocation被调用，模式:', mode);
    
    // 如果是路线规划模式，先获取用户位置
    if (mode === 'route') {
      console.log('路线规划模式，开始获取用户位置');
      
      // 显示提示信息，让用户知道我们正在获取位置
      setLocationLoading(true);
      
      const location = await getUserLocation();
      if (location) {
        console.log('成功获取用户位置:', location);
        // 位置获取成功，使用toast显示成功提示
        toast.success('正在获取用户位置');
        setTimeout(() => {
          setLocationLoading(false);
        }, 1000);
      } else {
        console.log('使用默认位置或等待用户输入起始地');
        // 位置获取失败，错误信息已经在getUserLocation中设置
        setLocationLoading(false);
      }
    }
    
    // 调用原有的创建对话函数
    console.log('创建新对话，模式:', mode);
    await createNewConversation(mode);
  };

  const switchToConversationWithLocation = async (conversation: any) => {
    console.log('switchToConversationWithLocation被调用，对话模式:', conversation.mode);
    
    // 设置当前对话
    setCurrentConversationId(conversation.id);
    setChatMode(conversation.mode);
    
    // 重置预览标签状态
    setPreviewTab('effect');
    
    // 重置AI响应状态，使其与当前对话关联
    setLastAIResponse(conversation.lastAiResponse || '');
    
    // 如果是路线规划模式，获取用户位置
    if (conversation.mode === 'route') {
      console.log('切换到路线规划对话，开始获取用户位置');
      
      // 显示提示信息，让用户知道我们正在获取位置
      setLocationLoading(true);
      
      const location = await getUserLocation();
      if (location) {
        console.log('成功获取用户位置:', location);
        // 位置获取成功，使用toast显示成功提示
        toast.success('成功获取用户位置');
        setTimeout(() => {
          setLocationLoading(false);
        }, 1000);
      } else {
        console.log('使用默认位置或等待用户输入起始地');
        // 位置获取失败，错误信息已经在getUserLocation中设置
        setLocationLoading(false);
      }
    }
    
    // 加载对话消息
    loadConversationMessages(conversation.id);
  };

  return (
    <div className="h-screen bg-[var(--bg-primary)] dark:bg-[var(--bg-primary)] flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: codeStyles }} />
      {/* 位置获取状态提示 */}
      {locationLoading && (
        <div className="fixed bottom-4 right-4 z-50 bg-[var(--surface-secondary)] dark:bg-[var(--surface-secondary)] rounded-xl shadow-lg border border-[var(--border-secondary)] p-4 flex items-center space-x-3">
          <div className="w-5 h-5 border-2 border-[var(--accent-secondary)] border-t-transparent rounded-full animate-spin"></div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)] dark:text-[var(--text-primary)]">正在获取您的位置</p>
            <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">请查看浏览器地址栏附近的位置权限请求并点击"允许"</p>
          </div>
        </div>
      )}
      
      {locationError && (
        <div className="fixed bottom-4 right-4 z-50 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl shadow-lg p-4 flex items-center space-x-3 max-w-sm">
          <div className="w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
            <span className="text-white text-xs">!</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">{locationError}</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-300 mb-2">我们将使用默认位置或等待您手动输入起始地</p>
            <div className="flex space-x-2">
              <button 
                onClick={() => {
                  setLocationError(null);
                  // 可以在这里添加手动输入位置的逻辑
                  const manualLocation = prompt('请输入您的当前位置（如：杭州市西湖区某路某号）:');
                  if (manualLocation) {
                    // 这里可以添加将地址转换为坐标的逻辑
                    console.log('用户手动输入位置:', manualLocation);
                  }
                }}
                className="px-3 py-1 text-xs bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded-lg hover:bg-yellow-200 dark:hover:bg-yellow-700"
              >
                手动输入位置
              </button>
              <button 
                onClick={() => setLocationError(null)}
                className="px-3 py-1 text-xs text-yellow-600 dark:text-yellow-300 hover:text-yellow-800 dark:hover:text-yellow-200"
              >
                忽略
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 头部导航 - 玻璃拟态效果 */}
      <header className="bg-[var(--surface-primary)]/90 dark:bg-[var(--surface-primary)]/90 backdrop-blur-2xl border-b border-[var(--border-primary)] px-8 py-4 flex items-center justify-between fixed top-0 left-0 right-0 z-50 h-16">
        <div className="flex items-center space-x-4">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-xl hover:bg-[var(--surface-secondary)] transition-all duration-200 lg:hidden">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            AI地图助手
          </h1>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={toggleTheme} className="p-2 rounded-xl hover:bg-[var(--surface-secondary)] transition-all duration-200">
            {theme === 'light' ? <Moon size={18} className="text-[var(--text-secondary)]" /> : <Sun size={18} className="text-[var(--text-secondary)]" />}
          </button>
          {isAuthenticated ? (
            <div className="flex items-center space-x-3">
              <div className="hidden sm:flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center text-[var(--text-primary)] text-sm font-medium">
                  {user.username?.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm font-medium text-[var(--text-primary)]">{user.username}</span>
              </div>
              <button onClick={logout} className="p-2 rounded-xl hover:bg-[var(--surface-secondary)] text-[var(--text-secondary)] hover:text-red-500 dark:hover:text-red-400 transition-all duration-200">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <button onClick={() => setIsLoginModalOpen(true)} className="px-4 py-2 rounded-xl bg-[var(--accent-secondary)] text-white font-medium text-sm">
                登录
              </button>
              <button onClick={() => setIsRegisterModalOpen(true)} className="px-4 py-2 rounded-xl border border-[var(--border-primary)] text-[var(--text-secondary)] font-medium text-sm">
                注册
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex pt-16 h-[calc(100vh-4rem)] relative">
        {/* 侧边栏 - 高级极简设计 */}
        <aside 
          className={`bg-[var(--surface-primary)]/80 dark:bg-[var(--surface-primary)]/80 backdrop-blur-2xl border-r border-[var(--border-primary)] flex flex-col fixed left-0 top-16 bottom-0 transition-all duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
          style={{ width: `${sidebarWidth}px` }}
        >
          <div className="p-4 space-y-3 flex-shrink-0">
            <button onClick={() => createNewConversation('general')} className="w-full py-3 bg-[var(--accent-secondary)] text-white rounded-xl flex items-center justify-center space-x-2 shadow-sm">
              <Plus size={18} />
              <span className="font-medium">新对话</span>
            </button>
            {(['general', 'route', 'travel'] as const).map(mode => {
              const Icon = MODE_ICONS[mode];
              return (
                <button key={mode} onClick={() => createNewConversationWithLocation(mode)} className="w-full p-3 rounded-xl flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-[var(--surface-secondary)] flex items-center justify-center">
                    <Icon size={18} className="text-[var(--text-secondary)]" />
                  </div>
                  <span className="font-medium text-[var(--text-primary)]">{MODE_LABELS[mode]}</span>
                  {mode === 'route' && locationLoading && (
                    <div className="ml-auto">
                      <div className="w-4 h-4 border-2 border-[var(--accent-secondary)] border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {conversations.map(conv => (
              <div key={conv.id} className={`group relative p-3 rounded-xl cursor-pointer ${currentConversationId === conv.id ? 'bg-[var(--surface-secondary)] shadow-soft' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0" onClick={() => switchToConversationWithLocation(conv)}>
                    {editingConversationId === conv.id ? (
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={handleTitleKeyPress}
                        onBlur={saveTitleEdit}
                        className="w-full text-sm font-medium bg-transparent border-b border-[var(--accent-primary)] focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)]"></div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{conv.title}</p>
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)]">{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(conv.createdAt)}</p>
                      </div>
                    )}
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingTitle(conv.id, conv.title);
                      }}
                      className="p-1.5 rounded-lg"
                    >
                      <Edit size={14} className="text-[var(--text-tertiary)]" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('确定要删除这个对话吗？')) {
                          deleteConversation(conv.id);
                        }
                      }}
                      className="p-1.5 text-red-500 dark:text-red-400 rounded-lg"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* 拖拽条 */}
          <div 
            className={`resize-handle ${isResizing ? 'resizing' : ''}`}
            onMouseDown={handleMouseDown}
          />
        </aside>

        {/* 主聊天区 - 沉浸式背景 */}
        <main 
          className="flex flex-col h-[calc(100vh-4rem)] relative" 
          style={{ 
            marginLeft: `${sidebarWidth}px`, 
            width: chatWidth > 0 ? `${chatWidth}px` : (chatMode === 'route' || chatMode === 'travel') ? `calc(100% - ${sidebarWidth}px - 384px)` : `calc(100% - ${sidebarWidth}px)`,
            flex: 'none'
          }}
        >
          {currentConversation ? (
            <>
              {/* 聊天内容区域 - 沉浸式滚动 */}
              <div className="flex-1 overflow-y-auto px-8 py-8 space-y-8 min-h-0" style={{ height: 'calc(100vh - 4rem - 12rem)', paddingBottom: '6rem' }}>
                {currentConversation.messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                     <div className={`max-w-3xl mx-3 ${msg.sender === 'user' ? 'ml-auto' : 'mr-auto'}`}>
                       {msg.sender === 'ai' && msg.thinkingProcess && msg.thinkingProcess.length > 0 && (
                         <ThinkingProcess thinkingProcess={msg.thinkingProcess} />
                       )}
                       <div className={`chat-bubble ${msg.sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'} ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
                         {msg.sender === 'user' ? (
                           <div className="text-left">{msg.content}</div>
                         ) : (
                           <>
                             {msg.isLoading && !msg.content ? (
                               <div className="flex items-center space-x-2 text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">
                                <div className="w-2 h-2 bg-[var(--accent-secondary)] rounded-full"></div>
                                <span className="text-sm">正在思考中...</span>
                              </div>
                             ) : (
                               <AgentMessage 
                                 content={msg.content}
                                 agent={msg.agent}
                                 type={msg.type}
                                 thinkingProcess={msg.thinkingProcess}
                                 isStreaming={msg.isStreaming || false}
                               />
                             )}
                           </>
                         )}
                       </div>
                       <div className={`chat-bubble-timestamp ${msg.sender === 'user' ? 'text-right' : 'text-left'} mt-2`}>
                         {new Intl.DateTimeFormat('zh-CN', { 
                           hour: '2-digit', 
                           minute: '2-digit' 
                         }).format(msg.timestamp)}
                       </div>
                      </div>
                   </div>
                ))}
                {isLoading && (
                  <div className="flex space-x-1 justify-start ml-4">
                    <div className="w-2 h-2 bg-[var(--accent-secondary)] rounded-full"></div>
                    <div className="w-2 h-2 bg-[var(--accent-secondary)] rounded-full"></div>
                    <div className="w-2 h-2 bg-[var(--accent-secondary)] rounded-full"></div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              
              {/* 悬浮式输入框 - 极简高级设计 */}
              <div className="absolute bottom-8 left-0 right-0 px-8">
                <div className="max-w-3xl mx-auto">
                  <div className="relative">
                    <div className="absolute inset-0 bg-[var(--surface-secondary)]/60 dark:bg-[var(--surface-secondary)]/60 backdrop-blur-2xl rounded-2xl shadow-md border border-[var(--border-secondary)]/40"></div>
                    <div className="relative flex items-center p-3">
                      <input
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                        placeholder="输入消息，开始对话..."
                        className="flex-1 px-4 py-3 bg-transparent border-0 focus:outline-none focus:ring-0 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={isLoading || !newMessage.trim()}
                        className="ml-3 p-3 bg-[var(--accent-secondary)] text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                      >
                        <Send size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-12">
              <div className="text-center space-y-4">
                <h1 className="text-5xl font-bold text-[var(--text-primary)]">
                  AI地图助手
                </h1>
                <p className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto">
                  智能路线规划与旅行助手，让每一次出行都更加便捷
                </p>
              </div>
              
              {/* 功能卡片网格 - 使用柔和配色 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-5xl">
                {(['general', 'route', 'travel'] as const).map((mode, index) => {
                  const Icon = MODE_ICONS[mode];
                  const colors = [
                    'bg-[var(--surface-secondary)]',
                    'bg-[var(--surface-secondary)]', 
                    'bg-[var(--surface-secondary)]'
                  ];
                  const hoverColors = [
                    'hover:bg-[var(--surface-tertiary)]',
                    'hover:bg-[var(--surface-tertiary)]',
                    'hover:bg-[var(--surface-tertiary)]'
                  ];
                  
                  return (
                    <button
                      key={mode}
                      onClick={() => createNewConversationWithLocation(mode)}
                      className={`group relative p-6 rounded-2xl ${colors[index]} text-[var(--text-primary)] text-left overflow-hidden border border-[var(--border-secondary)]`}
                    >
                      <div className="relative z-10">
                        <div className="w-12 h-12 rounded-xl bg-[var(--surface-tertiary)] flex items-center justify-center mb-4">
                          <Icon size={24} className="text-[var(--accent-secondary)]" />
                        </div>
                        <h3 className="font-bold text-xl mb-2">{MODE_LABELS[mode]}</h3>
                        <p className="text-sm opacity-90">
                          {mode === 'general' ? '回答日常问题，提供实用信息' : mode === 'route' ? '智能规划最优出行路线' : '定制个性化旅行行程'}
                        </p>
                      </div>
                      <div className="absolute inset-0 bg-gradient-to-t from-[var(--accent-primary)]/5 to-transparent"></div>
                    </button>
                  );
                })}
              </div>
              
              {/* 快速开始提示 */}
              <div className="text-center space-y-3">
                <p className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">或者点击上方按钮开始新的对话</p>
                <div className="flex items-center justify-center space-x-2 text-sm text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">
                  <div className="w-1 h-1 rounded-full bg-[var(--text-tertiary)]"></div>
                  <span className="text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">支持路线规划、旅行定制等多种模式</span>
                  <div className="w-1 h-1 rounded-full bg-gray-400"></div>
                </div>
              </div>
            </div>
          )}
        </main>

        {/* 聊天区域拖拽条 */}
        {(chatMode === 'route' || chatMode === 'travel') && (
          <div 
            className={`resize-handle-horizontal ${isResizingChat ? 'resizing' : ''}`}
            onMouseDown={handleChatMouseDown}
            style={{ 
              left: chatWidth > 0 ? `${sidebarWidth + chatWidth}px` : `calc(100% - 384px)`,
              top: '4rem',
              bottom: '0'
            }}
          />
        )}

        {/* 右侧地图视图 - 玻璃拟态效果 */}
        {(chatMode === 'route' || chatMode === 'travel') && (
          <aside 
            className="bg-[var(--surface-primary)]/70 dark:bg-[var(--surface-primary)]/70 backdrop-blur-xl border-l border-[var(--border-secondary)]/30 h-[calc(100vh-4rem)]" 
            style={{ 
              width: chatWidth > 0 ? `calc(100% - ${sidebarWidth}px - ${chatWidth}px)` : '384px',
              flex: 'none'
            }}
          >
            {/* 选项卡导航 - 玻璃拟态 */}
            <div className="flex p-4 border-b border-white/30 dark:border-slate-700/30">
              <button
                onClick={() => setActiveTab('map')}
                className={`flex-1 px-4 py-3 text-sm font-medium rounded-xl ${
                  activeTab === 'map'
                    ? 'bg-[var(--accent-secondary)] text-white shadow-lg'
                    : 'bg-[var(--surface-secondary)]/50 dark:bg-[var(--surface-secondary)]/50 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]'
                }`}
              >
                <MapPin size={16} className="inline mr-2" />
                地图视图
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`flex-1 px-4 py-3 text-sm font-medium rounded-xl ${
                  activeTab === 'preview'
                    ? 'bg-[var(--accent-secondary)] text-white shadow-lg'
                    : 'bg-[var(--surface-secondary)]/50 dark:bg-[var(--surface-secondary)]/50 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]'
                }`}
              >
                <Globe size={16} className="inline mr-2" />
                HTML预览
              </button>
            </div>

            {/* 选项卡内容 */}
            <div className="p-4 h-[calc(100%-80px)]">
              {activeTab === 'map' && (
                <div className="h-full bg-[var(--surface-secondary)]/50 dark:bg-[var(--surface-secondary)]/50 rounded-2xl border border-[var(--border-secondary)]/30 shadow-soft overflow-hidden">
                  {/* 地图生成控制区域 */}
                  {conversations.find(c => c.id === currentConversationId)?.mapUrl ? (
                    <div className="flex p-3 border-b border-white/30 dark:border-slate-700/30">
                      <div className="flex items-center space-x-2 flex-1">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                          地图已生成
                        </span>
                      </div>
                      <button
                        onClick={handleGenerateMapMark}
                        disabled={isGeneratingMapMark}
                        className="ml-2 p-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white shadow-md disabled:shadow-none disabled:cursor-not-allowed transition-colors"
                        title="重新生成地图"
                      >
                        <RefreshCw size={16} className={`${isGeneratingMapMark ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  ) : (
                    !conversations.find(c => c.id === currentConversationId)?.mapUrl && hasResultAgentOutput() && (
                      <div className="flex items-center justify-between p-3 border-b border-white/30 dark:border-slate-700/30 bg-[var(--surface-secondary)]/30 dark:bg-[var(--surface-secondary)]/30">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                          <span className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                            检测到旅行规划结果
                          </span>
                        </div>
                        <button
                          onClick={handleGenerateMapMark}
                          disabled={!hasResultAgentOutput() || isGeneratingMapMark}
                          className="px-4 py-2 bg-[var(--accent-secondary)] text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                          title={!hasResultAgentOutput() ? "等待AI回复后生成地图" : isGeneratingMapMark ? "正在生成中..." : "生成个性化地图"}
                        >
                          {isGeneratingMapMark ? (
                            <>
                              <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--text-primary)] mr-2"></div>
                              生成中...
                            </>
                          ) : (
                            <>
                              <MapPin size={16} className="inline mr-2" />
                              生成地图
                            </>
                          )}
                        </button>
                      </div>
                    )
                  )}
                  
                  {/* 地图显示区域 */}
                  <div className="h-[calc(100%-48px)]">
                    {isGeneratingMapMark ? (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center space-y-4">
                          <div className="w-12 h-12 mx-auto rounded-full bg-[var(--accent-secondary)] flex items-center justify-center">
                            <MapPin size={32} className="text-white" />
                          </div>
                          <p className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-medium">正在生成个性化地图...</p>
                          <p className="text-sm text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">请稍候片刻</p>
                        </div>
                      </div>
                    ) : conversations.find(c => c.id === currentConversationId)?.mapUrl ? (
                      <MapView 
                        mapUrl={conversations.find(c => c.id === currentConversationId)?.mapUrl}
                        conversationContent={currentConversation?.messages
                          .filter(msg => msg.sender === 'user' && msg.content)
                          .map(msg => msg.content)
                          .join('\n')}
                        onMapMarkGenerated={(mapUrl, qrCode) => {
                          toast.success('马克地图生成成功！');
                          console.log('马克地图生成完成:', { mapUrl, qrCode });
                        }}
                        className="h-full"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center space-y-4 p-6">
                          <div className="w-16 h-16 mx-auto rounded-full bg-[var(--surface-tertiary)] flex items-center justify-center shadow-lg">
                            <MapPin size={32} className="text-[var(--accent-primary)]" />
                          </div>
                          <div className="space-y-2">
                            <p className="font-bold text-lg text-[var(--text-primary)] dark:text-[var(--text-primary)]">
                              {chatMode === 'route' ? '智能路线规划地图' : '个性化旅行地图'}
                            </p>
                            <p className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                              {hasResultAgentOutput()
                                ? '点击下方按钮生成精美的个性化地图'
                                : '等待AI回复后生成可视化地图'
                              }
                            </p>
                          </div>
                          {!hasResultAgentOutput() && (
                            <button
                              onClick={handleGenerateMapMark}
                              disabled={!hasResultAgentOutput() || isGeneratingMapMark}
                              className="px-6 py-3 bg-[var(--accent-secondary)] text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                              title={!hasResultAgentOutput() ? "等待AI回复后生成地图" : isGeneratingMapMark ? "正在生成中..." : "生成个性化地图"}
                            >
                              {isGeneratingMapMark ? (
                                <>
                                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--text-primary)] mr-2"></div>
                                  生成中...
                                </>
                              ) : (
                                <>
                                  <MapPin size={16} className="inline mr-2" />
                                  生成地图
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'preview' && (
                <div className="h-full bg-[var(--surface-secondary)]/50 dark:bg-[var(--surface-secondary)]/50 rounded-2xl border border-[var(--border-secondary)]/30 shadow-soft overflow-hidden">
                  {/* 子选项卡导航 - 效果/代码切换 */}
                  {conversations.find(c => c.id === currentConversationId)?.spaContent && (
                    <div className="flex p-3 border-b border-white/30 dark:border-slate-700/30">
                      <button
                        onClick={() => setPreviewTab('effect')}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg ${
                          previewTab === 'effect'
                            ? 'bg-[var(--accent-secondary)] text-white shadow-md'
                            : 'bg-[var(--surface-secondary)]/30 dark:bg-[var(--surface-secondary)]/30 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]'
                        }`}
                      >
                        <Globe size={14} className="inline mr-1" />
                        效果预览
                      </button>
                      <button
                        onClick={() => setPreviewTab('code')}
                        className={`flex-1 px-3 py-2 text-sm font-medium rounded-lg ${
                          previewTab === 'code'
                            ? 'bg-[var(--accent-secondary)] text-white shadow-md'
                            : 'bg-[var(--surface-secondary)]/30 dark:bg-[var(--surface-secondary)]/30 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]'
                        }`}
                      >
                        <Code size={14} className="inline mr-1" />
                        代码查看
                      </button>
                      <button
                        onClick={handleRegenerateSPA}
                        disabled={isGeneratingSPA}
                        className="ml-2 p-2 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white shadow-md disabled:shadow-none disabled:cursor-not-allowed transition-colors"
                        title="重新生成网页"
                      >
                        <RefreshCw size={16} className={`${isGeneratingSPA ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  )}
                  
                  {/* 自动生成开关 - 只在有内容但没有SPA内容时显示 */}
                  {!conversations.find(c => c.id === currentConversationId)?.spaContent && hasResultAgentOutput() && (
                    <div className="flex items-center justify-between p-3 border-b border-white/30 dark:border-slate-700/30 bg-[var(--surface-secondary)]/30 dark:bg-[var(--surface-secondary)]/30">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                          检测到旅行规划结果
                        </span>
                      </div>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <span className="text-xs text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">
                          自动生成网页
                        </span>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={autoGenerateSPA}
                            onChange={(e) => setAutoGenerateSPA(e.target.checked)}
                            className="sr-only"
                          />
                          <div className={`w-10 h-6 rounded-full transition-colors ${
                            autoGenerateSPA ? 'bg-[var(--accent-secondary)]' : 'bg-gray-300 dark:bg-gray-600'
                          }`}>
                            <div className={`w-4 h-4 bg-white rounded-full transition-transform transform ${
                              autoGenerateSPA ? 'translate-x-5' : 'translate-x-1'
                            } mt-1`}></div>
                          </div>
                        </div>
                      </label>
                    </div>
                  )}
                  
                  <div className="h-[calc(100%-48px)]">
                    {isGeneratingSPA ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center space-y-4">
                        <div className="w-12 h-12 mx-auto rounded-full bg-[var(--accent-secondary)] flex items-center justify-center">
                          <Globe size={32} className="text-white" />
                        </div>
                        <p className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-medium">正在生成可视化网页...</p>
                        <p className="text-sm text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">请稍候片刻</p>
                      </div>
                    </div>
                  ) : conversations.find(c => c.id === currentConversationId)?.spaContent ? (
                      previewTab === 'effect' ? (
                        <iframe
                            srcDoc={conversations.find(c => c.id === currentConversationId)?.spaContent || ''}
                            className="w-full h-full border-0 rounded-2xl"
                            title="HTML预览"
                            sandbox="allow-scripts"
                          />
                      ) : (
                        <div className="h-full flex flex-col">
                            <div className="flex-1 relative bg-[var(--bg-tertiary)] dark:bg-[var(--bg-tertiary)] rounded-2xl m-3 overflow-hidden border border-[var(--border-secondary)]/20">
                              {isEditingCode ? (
                                <textarea
                                  value={editableCode}
                                  onChange={(e) => handleCodeChange(e.target.value)}
                                  className="h-full w-full overflow-auto p-4 text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] font-mono whitespace-pre-wrap break-all leading-relaxed bg-transparent border-none outline-none resize-none"
                                  placeholder="在此编辑HTML代码..."
                                />
                              ) : (
                                <pre 
                                  className="h-full overflow-auto p-4 text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] font-mono whitespace-pre-wrap break-all leading-relaxed"
                                >
                                  {conversations.find(c => c.id === currentConversationId)?.generatedCode || ''}
                                </pre>
                              )}
                              <div className="absolute top-3 right-3 flex space-x-2">
                                {isEditingCode ? (
                                  <>
                                    <button
                                      onClick={saveCodeEdit}
                                      disabled={!hasUnsavedChanges}
                                      className="p-2 bg-green-500 dark:bg-green-600 text-white rounded-lg hover:bg-green-600 dark:hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-md"
                                      title="保存代码"
                                    >
                                      <Save size={16} />
                                    </button>
                                    <button
                                      onClick={cancelCodeEdit}
                                      className="p-2 bg-gray-500 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-600 dark:hover:bg-gray-700 transition-colors shadow-md"
                                      title="取消编辑"
                                    >
                                      <X size={16} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={startEditingCode}
                                      className="p-2 bg-[var(--accent-secondary)] dark:bg-[var(--accent-secondary)] text-white rounded-lg hover:bg-[var(--accent-secondary)]/80 dark:hover:bg-[var(--accent-secondary)]/80 transition-colors shadow-md"
                                      title="编辑代码"
                                    >
                                      <Edit size={16} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(conversations.find(c => c.id === currentConversationId)?.generatedCode || '');
                                        toast.success('代码已复制到剪贴板');
                                      }}
                                      className="p-2 bg-[var(--surface-secondary)] dark:bg-[var(--surface-secondary)] rounded-lg hover:bg-[var(--surface-tertiary)] dark:hover:bg-[var(--surface-tertiary)] transition-colors shadow-md"
                                      title="复制代码"
                                    >
                                      <Copy size={16} className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)]" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="px-3 pb-3 flex justify-between items-center">
                              <div className="text-xs text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">
                                由 code_generator_agent 生成的完整HTML代码，包含TailwindCSS、Alpine.js、Chart.js等技术栈
                              </div>
                              {hasUnsavedChanges && (
                                <div className="text-xs text-orange-500 dark:text-orange-400 font-medium">
                                  有未保存的更改
                                </div>
                              )}
                            </div>
                          </div>
                      )
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        <div className="text-center space-y-4 p-6">
                          <div className="w-16 h-16 mx-auto rounded-full bg-[var(--surface-tertiary)] flex items-center justify-center shadow-lg">
                            <Globe size={32} className="text-[var(--accent-primary)]" />
                          </div>
                          <div className="space-y-2">
                            <p className="font-bold text-lg text-[var(--text-primary)] dark:text-[var(--text-primary)]">HTML预览</p>
                            <p className="text-sm text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">
                              {hasResultAgentOutput()
                                ? '点击下方按钮生成精美的可视化网页'
                                : '等待AI回复后生成可视化网页'
                              }
                            </p>
                          </div>
                          <button
                            onClick={handleGenerateSPA}
                            disabled={!hasResultAgentOutput() || isGeneratingSPA || !!conversations.find(c => c.id === currentConversationId)?.spaContent}
                            className="px-6 py-3 bg-[var(--accent-secondary)] text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                            title={!hasResultAgentOutput() ? "等待AI回复后生成可视化网页" : isGeneratingSPA ? "正在生成中..." : !!conversations.find(c => c.id === currentConversationId)?.spaContent ? "该对话已生成网页" : "生成可视化网页"}
                          >
                            {isGeneratingSPA ? (
                              <>
                                <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--text-primary)] mr-2"></div>
                                生成中...
                              </>
                            ) : (
                              <>
                                <Globe size={16} className="inline mr-2" />
                                生成网页
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* 还原您的原始登录弹窗 */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface-secondary)] dark:bg-[var(--surface-secondary)] p-6 rounded-xl shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-bold mb-4">登录</h3>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">用户名</label>
                <input
                  type="text"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-primary)] dark:border-[var(--border-primary)] bg-[var(--bg-tertiary)] dark:bg-[var(--bg-tertiary)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-secondary)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">密码</label>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-primary)] dark:border-[var(--border-primary)] bg-[var(--bg-tertiary)] dark:bg-[var(--bg-tertiary)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-secondary)]"
                  required
                />
              </div>
              <button type="submit" className="w-full py-2 px-4 rounded-xl bg-[var(--accent-secondary)] text-white font-medium">
                登录
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 还原您的原始注册弹窗 */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-[var(--surface-secondary)] dark:bg-[var(--surface-secondary)] p-6 rounded-xl shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-bold mb-4">注册</h3>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">用户名</label>
                <input
                  type="text"
                  value={registerForm.username}
                  onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-primary)] dark:border-[var(--border-primary)] bg-[var(--bg-tertiary)] dark:bg-[var(--bg-tertiary)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-secondary)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">邮箱</label>
                <input
                  type="email"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-primary)] dark:border-[var(--border-primary)] bg-[var(--bg-tertiary)] dark:bg-[var(--bg-tertiary)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-secondary)]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--text-primary)] mb-1">密码</label>
                <input
                  type="password"
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-[var(--border-primary)] dark:border-[var(--border-primary)] bg-[var(--bg-tertiary)] dark:bg-[var(--bg-tertiary)] text-[var(--text-primary)] dark:text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-secondary)]"
                  required
                />
              </div>
              <button type="submit" className="w-full py-2 px-4 rounded-xl bg-[var(--accent-secondary)] text-white font-medium">
                注册
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}