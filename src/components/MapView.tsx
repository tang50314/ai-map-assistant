import React, { useState } from 'react';
import { MapPin, ExternalLink, Loader2, MapIcon, Globe, QrCode } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { API_ENDPOINTS } from '@/config/endpoints';

interface MapViewProps {
  mapUrl: string | null;
  className?: string;
  // 新增：马克地图相关属性
  conversationContent?: string; // 当前对话内容，用于生成马克地图
  onMapMarkGenerated?: (mapUrl: string, qrCode: string) => void; // 马克地图生成回调
}

const MapView: React.FC<MapViewProps> = ({ 
  mapUrl, 
  className, 
  conversationContent,
  onMapMarkGenerated 
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingMapMark, setIsGeneratingMapMark] = useState(false);
  const [mapMarkUrl, setMapMarkUrl] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  // 当URL变化时重置加载状态
  React.useEffect(() => {
    if (mapUrl) {
      setIsLoading(true);
    }
  }, [mapUrl]);

  // 生成马克地图
  const handleGenerateMapMark = async () => {
    if (!conversationContent || conversationContent.trim().length < 50) {
      toast.error('需要更详细的行程信息才能生成马克地图');
      return;
    }

    setIsGeneratingMapMark(true);
    
    try {
      const token = localStorage.getItem('token');
      
      // 创建AbortController用于超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
      
      const response = await fetch(API_ENDPOINTS.generation.mapStream, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          content: conversationContent,
          content_type: 'travel'
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.body) {
        throw new Error('无响应数据');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let mapUrl = '';
      let qrCodeUrl = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'status') {
                // 显示状态更新
                console.log('地图生成状态:', data.content);
              } else if (data.type === 'map_result') {
                if (data.map_url) {
                  mapUrl = data.map_url;
                  setMapMarkUrl(mapUrl);
                }
                if (data.qr_code) {
                  qrCodeUrl = data.qr_code;
                  setQrCode(qrCodeUrl);
                }
              } else if (data.type === 'complete') {
                if (data.map_url) {
                  mapUrl = data.map_url;
                  setMapMarkUrl(mapUrl);
                }
                if (data.qr_code) {
                  qrCodeUrl = data.qr_code;
                  setQrCode(qrCodeUrl);
                }
                toast.success('马克地图生成成功！');
                if (onMapMarkGenerated) {
                  onMapMarkGenerated(mapUrl, qrCodeUrl);
                }
              } else if (data.type === 'error') {
                throw new Error(data.content || '生成失败');
              }
            } catch (e) {
              console.error('解析响应数据失败:', e);
            }
          }
        }
      }

      if (!mapUrl) {
        throw new Error('未能获取地图URL');
      }

    } catch (error) {
      console.error('生成马克地图失败:', error);
      let errorMessage = '生成失败';
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage = '生成超时，请稍后重试';
        } else {
          errorMessage = error.message;
        }
      }
      
      toast.error(`生成失败: ${errorMessage}`);
    } finally {
      setIsGeneratingMapMark(false);
    }
  };

  // 获取当前显示的地图URL
  const getCurrentMapUrl = () => {
    return mapMarkUrl || mapUrl;
  };

  // 重置马克地图
  const resetMapMark = () => {
    setMapMarkUrl(null);
    setQrCode(null);
    toast.info('已切换回原始地图');
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
  };

  if (!getCurrentMapUrl()) {
    return (
      <div className={cn("h-full flex flex-col items-center justify-center text-[var(--text-tertiary)] bg-[var(--surface-secondary)] rounded-2xl border-2 border-dashed border-[var(--border-primary)] p-8 text-center select-none", className)}>
        <div className="bg-[var(--surface-tertiary)] p-6 rounded-full mb-6">
            <MapPin className="w-12 h-12 opacity-50" />
        </div>
        <h3 className="text-lg font-semibold mb-2 text-[var(--text-secondary)]">等待地图数据</h3>
        <p className="text-sm max-w-xs leading-relaxed mb-6">
          在对话中进行路线规划或旅行设计，生成的交互式地图将在这里实时显示。
        </p>
        {conversationContent && conversationContent.trim().length >= 50 && (
          <button
            onClick={handleGenerateMapMark}
            disabled={isGeneratingMapMark}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isGeneratingMapMark ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MapIcon className="w-4 h-4" />
            )}
            {isGeneratingMapMark ? '生成中...' : '生成马克地图'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("h-full flex flex-col rounded-2xl overflow-hidden bg-white dark:bg-gray-800 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.1)] border border-gray-100 dark:border-gray-700/50 relative group", className)}>
      {/* Header / Controls */}
      <div className="absolute top-3 right-3 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {/* 地图控制按钮 */}
        {mapMarkUrl && (
          <>
            <button
              onClick={resetMapMark}
              className="p-2 bg-[var(--surface-primary)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] rounded-xl shadow-md hover:shadow-lg transition-all border border-[var(--border-primary)] backdrop-blur-sm"
              title="切换回原始地图"
            >
              <Globe className="w-4 h-4" />
            </button>
            {qrCode && (
              <button
                onClick={() => window.open(qrCode, '_blank')}
                className="p-2 bg-[var(--surface-primary)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] rounded-xl shadow-md hover:shadow-lg transition-all border border-[var(--border-primary)] backdrop-blur-sm"
                title="查看二维码"
              >
                <QrCode className="w-4 h-4" />
              </button>
            )}
          </>
        )}
        {/* 生成按钮 */}
        {conversationContent && conversationContent.trim().length >= 50 && !mapMarkUrl && (
          <button
            onClick={handleGenerateMapMark}
            disabled={isGeneratingMapMark}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="生成马克地图"
          >
            {isGeneratingMapMark ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <MapIcon className="w-4 h-4" />
            )}
            <span className="text-sm">{isGeneratingMapMark ? '生成中...' : '生成马克地图'}</span>
          </button>
        )}
        <a 
            href={getCurrentMapUrl()} 
            target="_blank" 
            rel="noopener noreferrer"
            className="p-2 bg-[var(--surface-primary)] text-[var(--text-secondary)] hover:text-[var(--accent-primary)] rounded-xl shadow-md hover:shadow-lg transition-all border border-[var(--border-primary)] backdrop-blur-sm"
            title="在新窗口打开"
        >
            <ExternalLink className="w-4 h-4" />
        </a>
      </div>
      
      {/* Loading State */}
      {isLoading && (
        <div className="absolute inset-0 z-0 flex flex-col items-center justify-center bg-white dark:bg-gray-800">
             <Loader2 className="w-8 h-8 text-[var(--accent-primary)] animate-spin mb-3" />
             <p className="text-sm text-[var(--text-tertiary)] font-medium animate-pulse">正在加载地图引擎...</p>
        </div>
      )}

      {/* Map Iframe */}
      <iframe
        src={getCurrentMapUrl()}
        className={cn("w-full h-full border-0 transition-opacity duration-500", isLoading ? 'opacity-0' : 'opacity-100')}
        title="AI Generated Map View"
        onLoad={handleIframeLoad}
        allowFullScreen
      />
    </div>
  );
};

export default MapView;
