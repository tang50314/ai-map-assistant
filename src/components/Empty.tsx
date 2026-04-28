import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MessageSquare, MapPin, Info, Plus, Minus, Search } from 'lucide-react';

// Empty component for different sections
interface EmptyProps {
  type?: 'chat' | 'map' | 'conversations' | 'default';
  message?: string;
}

export function Empty({ type = 'default', message }: EmptyProps) {
  const getContent = () => {
    if (message) {
      return (
        <>
          <Info className="h-12 w-12 mb-4 opacity-50 text-[var(--accent-primary)] dark:text-[var(--accent-primary)]" />
          <p className="text-center text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-lg font-medium">{message}</p>
        </>
      );
    }

    switch (type) {
      case 'chat':
        return (
          <>
            <MessageSquare className="h-20 w-20 mb-6 text-[var(--accent-primary)] opacity-60" />
            <h3 className="text-2xl font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">开始新对话</h3>
            <p className="text-center max-w-md text-[var(--text-secondary)] dark:text-[var(--text-secondary)] text-lg">
              我是您的AI地图助手，可以帮您<strong className="text-[var(--accent-primary)] dark:text-[var(--accent-primary)]">规划路线</strong>、<strong className="text-[var(--accent-primary)] dark:text-[var(--accent-primary)]">查询地点</strong>和<strong className="text-[var(--accent-primary)] dark:text-[var(--accent-primary)]">天气信息</strong>
            </p>
            <div className="mt-8 flex space-x-4">
              <div className="flex items-center space-x-2 text-[var(--accent-primary)] dark:text-[var(--accent-primary)] font-medium">
                <MapPin size={18} />
                <span>路线规划</span>
              </div>
              <div className="flex items-center space-x-2 text-[var(--accent-primary)] dark:text-[var(--accent-primary)] font-medium">
                <Search size={18} />
                <span>地点查询</span>
              </div>
            </div>
          </>
        );
      case 'map':
        return (
          <>
            <div className="w-full h-full relative p-4">
              {/* 模拟地图界面 - 在实际应用中会集成百度地图 */}
              <div className="absolute inset-0 bg-[var(--bg-secondary)] dark:bg-[var(--bg-secondary)] rounded-2xl border-4 border-dashed border-[var(--border-primary)] flex items-center justify-center flex-col">
                <MapPin className="h-16 w-16 mb-4 text-[var(--accent-primary)] opacity-70" />
                <div className="text-center">
                  <p className="text-xl font-bold text-[var(--accent-primary)] dark:text-[var(--accent-primary)]">智能地图集成</p>
                  <p className="text-base mt-2 text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">集成了百度地图MCP服务的智能视图</p>
                  <p className="text-sm mt-4 text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)] max-w-sm mx-auto p-2 bg-[var(--surface-primary)]/50 dark:bg-[var(--surface-primary)]/50 rounded-lg">
                    在实际应用中，这里会显示根据对话生成的路线规划、POI标记等功能
                  </p>
                </div>
              </div>
              
              {/* 模拟地图控件 */}
              <div className="absolute top-8 right-8 flex flex-col space-y-3">
                <button className="w-10 h-10 bg-[var(--surface-primary)] dark:bg-[var(--surface-secondary)] rounded-full shadow-lg border border-[var(--border-primary)] flex items-center justify-center text-[var(--accent-primary)] dark:text-[var(--accent-primary)] hover:scale-105 transition-transform">
                  <Plus size={20} />
                </button>
                <button className="w-10 h-10 bg-[var(--surface-primary)] dark:bg-[var(--surface-secondary)] rounded-full shadow-lg border border-[var(--border-primary)] flex items-center justify-center text-[var(--accent-primary)] dark:text-[var(--accent-primary)] hover:scale-105 transition-transform">
                  <Minus size={20} />
                </button>
              </div>
            </div>
          </>
        );
      case 'conversations':
        return (
          <>
            <MessageSquare className="h-12 w-12 mb-3 text-[var(--accent-primary)] opacity-60" />
            <p className="text-[var(--text-secondary)] dark:text-[var(--text-secondary)] font-medium">暂无对话记录</p>
            <p className="text-sm mt-1 text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">点击左上角"新对话"开始聊天</p>
          </>
        );
      default:
        return (
          <>
            <Info className="h-12 w-12 mb-4 text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]" />
            <p className="text-center text-[var(--text-secondary)] dark:text-[var(--text-secondary)]">未找到内容</p>
          </>
        );
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center text-center text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">
      {type === 'map' ? (
        // Map should fill the container
        getContent()
      ) : (
        // Default empty state for chat/sidebar
        <div className="flex flex-col items-center p-8 bg-[var(--surface-primary)] dark:bg-[var(--surface-primary)] rounded-2xl shadow-soft border border-[var(--border-secondary)]/50">
          {getContent()}
        </div>
      )}
    </div>
  );
}