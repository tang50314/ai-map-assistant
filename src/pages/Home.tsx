// src/pages/Home.tsx
import React, { useState, useEffect, useRef, useContext } from 'react';
import { toast } from 'sonner';
import { useTheme } from '@/hooks/useTheme';
import { 
  MessageCircle, Navigation, Plane, Send, Menu, X, Settings, Moon, Sun, LogOut, Plus, MapPin,
  MoreVertical, Edit, Trash2
} from 'lucide-react';
import { AuthContext } from '@/contexts/authContext';
import Markdown from '@/components/Markdown';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  messages: Message[];
  mode: 'general' | 'route' | 'travel';
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

  // 还原您的原始登录注册弹窗状态和表单
  const [isLoginModalOpen, setIsLoginModalOpen] = useState<boolean>(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);
  const [loginForm, setLoginForm] = useState<LoginFormData>({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState<RegisterFormData>({ username: '', password: '', email: '' });
  
  // 重命名状态
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  
  // 侧边栏拖拽调整宽度状态
  const [sidebarWidth, setSidebarWidth] = useState(288); // 默认宽度 18rem = 288px
  const [isResizing, setIsResizing] = useState(false);

  const currentConversation = currentConversationId
    ? conversations.find(c => c.id === currentConversationId)
    : null;

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
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (currentConversationId && isAuthenticated) {
      loadConversationMessages(currentConversationId);
    }
  }, [currentConversationId, isAuthenticated]);

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
          mode: c.mode || 'general'
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
        // 更新会话列表中的消息
        setConversations(prev => prev.map(conv => 
          conv.id === conversationId 
            ? {
                ...conv,
                messages: Array.isArray(data.messages) ? data.messages.map((msg: any) => ({
                  id: msg.id.toString(),
                  content: msg.content,
                  sender: msg.sender as 'user' | 'ai',
                  timestamp: new Date(msg.timestamp)
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
        mode
      };
      setConversations(prev => [conv, ...prev]);
      setCurrentConversationId(data.id.toString());
      setChatMode(mode);
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

    const endpoint = `/messages/stream/${chatMode}/`;
    try {
      const res = await fetch(`http://localhost:8001/conversations/${currentConversationId}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ content: newMessage, sender: 'user' })
      });

      if (!res.body) throw new Error('No response body');

      const reader = res.body.getReader();
      let aiContent = '';
      const aiMsgId = Date.now().toString() + '-ai';
      const aiMsg: Message = { id: aiMsgId, content: '', sender: 'ai', timestamp: new Date() };

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
              if (data.content) {
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
              if (data.done && currentConversation?.title.includes('新对话')) {
                const newTitle = `${MODE_PREFIX[chatMode]} ${newMessage.slice(0, 25)}...`;
                await fetch(`http://localhost:8001/conversations/${currentConversationId}`, {
                  method: 'PUT',
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 shadow-sm px-4 py-3 flex items-center justify-between fixed top-0 left-0 right-0 z-10 h-16">
        <div className="flex items-center space-x-3">
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 lg:hidden">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h1 className="text-2xl font-bold text-sky-600 dark:text-sky-400">AI地图助手</h1>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
          {isAuthenticated ? (
            <>
              <button className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
                <Settings size={20} />
              </button>
              <button onClick={logout} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700">
                <LogOut size={20} />
              </button>
              <span className="font-medium">{user.username}</span>
            </>
          ) : (
            <>
              <button onClick={() => setIsLoginModalOpen(true)} className="px-4 py-2 rounded-xl bg-sky-600 text-white hover:bg-sky-700 transition-colors font-medium">
                登录
              </button>
              <button onClick={() => setIsRegisterModalOpen(true)} className="px-4 py-2 rounded-xl border border-sky-600 text-sky-600 hover:bg-sky-50 dark:hover:bg-slate-700 transition-colors font-medium">
                注册
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex-1 flex pt-16">
        {/* 侧边栏 */}
        <aside 
          className={`bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col fixed h-full left-0 top-16 transition-transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
          style={{ width: `${sidebarWidth}px` }}
        >
          <div className="p-4 space-y-3">
            <button onClick={() => createNewConversation('general')} className="w-full py-3 bg-sky-600 text-white rounded-xl hover:bg-sky-700 flex items-center justify-center space-x-2">
              <Plus size={18} />
              <span>新对话</span>
            </button>
            {(['general', 'route', 'travel'] as const).map(mode => {
              const Icon = MODE_ICONS[mode];
              return (
                <button key={mode} onClick={() => createNewConversation(mode)} className="w-full p-3 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center space-x-3 transition-colors">
                  <Icon size={20} className="text-sky-600 dark:text-sky-400" />
                  <span className="font-medium">{MODE_LABELS[mode]}</span>
                </button>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {conversations.map(conv => (
              <div key={conv.id} className={`p-3 rounded-xl cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-700 ${currentConversationId === conv.id ? 'bg-sky-100 dark:bg-sky-900/30' : ''}`}>
                <div className="flex items-center justify-between group">
                  <div className="flex-1" onClick={() => { 
                    setCurrentConversationId(conv.id); 
                    setChatMode(conv.mode);
                    loadConversationMessages(conv.id); // 重新加载对话消息
                  }}>
                    {editingConversationId === conv.id ? (
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onKeyDown={handleTitleKeyPress}
                        onBlur={saveTitleEdit}
                        className="w-full text-sm font-medium bg-transparent border-b border-sky-600 focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <p className="text-sm font-medium truncate">{conv.title}</p>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400">{new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(conv.createdAt)}</p>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 ml-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditingTitle(conv.id, conv.title);
                      }}
                      className="p-1 hover:bg-gray-200 dark:hover:bg-slate-600 rounded"
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('确定要删除这个对话吗？')) {
                          deleteConversation(conv.id);
                        }
                      }}
                      className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded"
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

        {/* 主聊天区 */}
        <main className="flex-1 flex flex-col h-screen" style={{ marginLeft: `${sidebarWidth}px` }}>
          {currentConversation ? (
            <>
              {/* 聊天内容区域 - 只这里滚动 */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6" style={{ height: 'calc(100vh - 16rem)', paddingBottom: '8rem' }}>
                {currentConversation.messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                     <div className={`max-w-2xl mx-4 ${msg.sender === 'user' ? 'ml-auto' : 'mr-auto'}`}>
                       <div className={`chat-bubble ${msg.sender === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}`}>
                         <Markdown content={msg.content} />
                       </div>
                       <div className={`chat-bubble-timestamp ${msg.sender === 'user' ? 'text-right' : 'text-left'}`}>
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
                    <div className="w-2 h-2 bg-sky-500 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-sky-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              {/* 输入框 - 固定底部 */}
              <div className="p-4 bg-white dark:bg-slate-800 border-t fixed bottom-0 right-0 z-10" style={{ left: `${sidebarWidth}px`, width: (chatMode === 'route' || chatMode === 'travel') ? `calc(100% - ${sidebarWidth}px - 24rem)` : `calc(100% - ${sidebarWidth}px)` }}>
                <div className="max-w-4xl mx-auto flex space-x-3">
                  <input
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                    placeholder="输入消息..."
                    className="flex-1 px-5 py-3 rounded-xl border bg-gray-50 dark:bg-slate-700"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={isLoading || !newMessage.trim()}
                    className="p-3 bg-sky-600 text-white rounded-xl hover:bg-sky-700 disabled:opacity-50"
                  >
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8">
              <h1 className="text-4xl font-bold text-gray-800 dark:text-white">AI地图助手</h1>
              <input
                placeholder="在这里输入内容，输入地点可查询地图..."
                className="w-full max-w-2xl px-6 py-4 rounded-2xl border bg-white dark:bg-slate-800 text-lg"
                readOnly
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-4xl">
                {(['general', 'route', 'travel'] as const).map(mode => {
                  const Icon = MODE_ICONS[mode];
                  return (
                    <button
                      key={mode}
                      onClick={() => createNewConversation(mode)}
                      className="p-6 rounded-2xl bg-white dark:bg-slate-800 border hover:shadow-lg transition-shadow text-left"
                    >
                      <Icon size={24} className="text-sky-600 dark:text-sky-400 mb-3" />
                      <h3 className="font-bold text-lg">{MODE_LABELS[mode]}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {mode === 'general' ? '回答日常问题' : mode === 'route' ? '生成最优路径' : '定制完整行程'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* 右侧地图视图 */}
        {(chatMode === 'route' || chatMode === 'travel') && (
          <aside className="w-96 bg-gray-50 dark:bg-slate-800 border-l p-4" style={{ marginLeft: `${sidebarWidth}px` }}>
            <div className="h-full bg-sky-50 dark:bg-slate-900 rounded-2xl border-2 border-dashed border-sky-200 dark:border-slate-700 flex items-center justify-center">
              <div className="text-center">
                <MapPin size={48} className="mx-auto text-sky-500 mb-4" />
                <p className="font-bold text-lg">地图视图</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  此处将显示{chatMode === 'route' ? '路线' : '行程'}地图
                </p>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* 还原您的原始登录弹窗 */}
      {isLoginModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-bold mb-4">登录</h3>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">用户名</label>
                <input
                  type="text"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">密码</label>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>
              <button type="submit" className="w-full py-2 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white transition-colors font-medium">
                登录
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 还原您的原始注册弹窗 */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-xl max-w-sm w-full">
            <h3 className="text-lg font-bold mb-4">注册</h3>
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">用户名</label>
                <input
                  type="text"
                  value={registerForm.username}
                  onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">邮箱</label>
                <input
                  type="email"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">密码</label>
                <input
                  type="password"
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                  className="w-full px-4 py-2 rounded-xl border border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-sky-500"
                  required
                />
              </div>
              <button type="submit" className="w-full py-2 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white transition-colors font-medium">
                注册
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}