import { Routes, Route } from "react-router-dom";
import Home from "@/pages/Home";
import { useState, useEffect } from "react";
import { AuthContext } from '@/contexts/authContext';
import { toast } from 'sonner';
import { API_ENDPOINTS } from '@/config/endpoints';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState({
    id: null as string | null,
    username: null as string | null,
  });

  // Load and validate auth state from localStorage on mount
  useEffect(() => {
    const savedAuth = localStorage.getItem('auth');
    const savedToken = localStorage.getItem('token');
    if (savedAuth && savedToken) {
      try {
        const authData = JSON.parse(savedAuth);
        if (authData.isAuthenticated && authData.user) {
          fetch(API_ENDPOINTS.auth.me, {
            headers: {
              Authorization: `Bearer ${savedToken}`,
            },
          })
            .then(async (response) => {
              if (!response.ok) {
                throw new Error('Token expired');
              }
              const userData = await response.json();
              setIsAuthenticated(true);
              setUser({
                id: userData.id.toString(),
                username: userData.username,
              });
            })
            .catch(() => {
              localStorage.removeItem('auth');
              localStorage.removeItem('token');
              setIsAuthenticated(false);
              setUser({ id: null, username: null });
            });
        }
      } catch (error) {
        console.error('Error parsing auth data:', error);
        localStorage.removeItem('auth');
        localStorage.removeItem('token');
      }
    } else {
      localStorage.removeItem('auth');
      localStorage.removeItem('token');
    }
  }, []);

  // Save auth state to localStorage whenever it changes
  useEffect(() => {
    if (isAuthenticated && user.id && user.username) {
      localStorage.setItem('auth', JSON.stringify({
        isAuthenticated,
        user,
      }));
    } else {
      localStorage.removeItem('auth');
    }
  }, [isAuthenticated, user]);

  const logout = () => {
    setIsAuthenticated(false);
    setUser({
      id: null,
      username: null,
    });
    localStorage.removeItem('auth');
    localStorage.removeItem('token');
    toast.success('已成功登出');
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch(API_ENDPOINTS.auth.token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          username: username,
          password: password,
        }),
      });
      
      if (!response.ok) {
        toast.error('用户名或密码错误');
        return false;
      }
      
      const data = await response.json();
      localStorage.setItem('token', data.access_token);
      
      // 获取用户信息
      const userResponse = await fetch(API_ENDPOINTS.auth.me, {
        headers: {
          'Authorization': `Bearer ${data.access_token}`,
        },
      });
      
      if (userResponse.ok) {
        const userData = await userResponse.json();
        setIsAuthenticated(true);
        setUser({
          id: userData.id.toString(),
          username: userData.username,
        });
        toast.success('登录成功');
        return true;
      }
      
      toast.error('登录失败，请重试');
      return false;
    } catch (error) {
      console.error('Login error:', error);
      toast.error('登录失败，请检查网络连接');
      return false;
    }
  };

  const register = async (username: string, password: string, email: string): Promise<boolean> => {
    try {
      const response = await fetch(API_ENDPOINTS.auth.users, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username,
          password: password,
          email: email,
        }),
      });
      
      if (response.ok) {
        toast.success('注册成功，请登录');
        return true;
      } else {
        try {
          const errorData = await response.json();
          toast.error(errorData.detail || '注册失败，请重试');
        } catch (jsonError) {
          toast.error(`注册失败，HTTP状态码：${response.status}`);
        }
        return false;
      }
    } catch (error) {
      console.error('Registration error:', error);
      // 更详细的错误信息
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        toast.error('无法连接到服务器，请确保后端服务已启动');
      } else {
        toast.error('注册失败，请检查网络连接和后端服务状态');
      }
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, setIsAuthenticated, logout, user, login, register }}
    >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Home />} />
        <Route path="/register" element={<Home />} />
        <Route path="/other" element={<div className="text-center text-xl">Other Page - Coming Soon</div>} />
      </Routes>
    </AuthContext.Provider>
  );
}
