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
          <Info className="h-12 w-12 mb-4 opacity-50 text-sky-500" />
          <p className="text-center text-gray-600 dark:text-gray-300 text-lg font-medium">{message}</p>
        </>
      );
    }

    switch (type) {
      case 'chat':
        return (
          <>
            <MessageSquare className="h-20 w-20 mb-6 text-sky-400 opacity-60" />
            <h3 className="text-2xl font-bold text-gray-800 dark:text-white">开始新对话</h3>
            <p className="mt-4 text-center max-w-md text-gray-500 dark:text-gray-400 text-lg">
              我是您的AI地图助手，可以帮您<strong className="text-sky-500 dark:text-sky-400">规划路线</strong>、<strong className="text-sky-500 dark:text-sky-400">查询地点</strong>和<strong className="text-sky-500 dark:text-sky-400">天气信息</strong>
            </p>
            <div className="mt-8 flex space-x-4">
              <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 font-medium">
                <MapPin size={18} />
                <span>路线规划</span>
              </div>
              <div className="flex items-center space-x-2 text-sky-600 dark:text-sky-400 font-medium">
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
              <div className="absolute inset-0 bg-sky-50 dark:bg-slate-800/50 rounded-2xl border-4 border-dashed border-sky-200 dark:border-slate-700/80 flex items-center justify-center flex-col">
                <MapPin className="h-16 w-16 mb-4 text-sky-500 opacity-70" />
                <div className="text-center">
                  <p className="text-xl font-bold text-sky-600 dark:text-sky-400">智能地图集成</p>
                  <p className="text-base mt-2 text-gray-600 dark:text-gray-300">集成了百度地图MCP服务的智能视图</p>
                  <p className="text-sm mt-4 text-gray-400 dark:text-slate-500 max-w-sm mx-auto p-2 bg-white/50 dark:bg-slate-900/50 rounded-lg">
                    在实际应用中，这里会显示根据对话生成的路线规划、POI标记等功能
                  </p>
                </div>
              </div>
              
              {/* 模拟地图控件 */}
              <div className="absolute top-8 right-8 flex flex-col space-y-3">
                <button className="w-10 h-10 bg-white dark:bg-slate-700 rounded-full shadow-lg border border-gray-200 dark:border-slate-600 flex items-center justify-center text-sky-600 dark:text-sky-400 hover:scale-105 transition-transform">
                  <Plus size={20} />
                </button>
                <button className="w-10 h-10 bg-white dark:bg-slate-700 rounded-full shadow-lg border border-gray-200 dark:border-slate-600 flex items-center justify-center text-sky-600 dark:text-sky-400 hover:scale-105 transition-transform">
                  <Minus size={20} />
                </button>
              </div>
            </div>
          </>
        );
      case 'conversations':
        return (
          <>
            <MessageSquare className="h-12 w-12 mb-3 text-sky-400 opacity-60" />
            <p className="text-gray-600 dark:text-gray-300 font-medium">暂无对话记录</p>
            <p className="text-sm mt-1 text-gray-500 dark:text-gray-400">点击左上角"新对话"开始聊天</p>
          </>
        );
      default:
        return (
          <>
            <Info className="h-12 w-12 mb-4 text-gray-400" />
            <p className="text-center text-gray-600 dark:text-gray-300">未找到内容</p>
          </>
        );
    }
  };

  return (
    <div className="h-full w-full flex items-center justify-center text-center text-gray-400 dark:text-slate-600">
      {type === 'map' ? (
        // Map should fill the container
        getContent()
      ) : (
        // Default empty state for chat/sidebar
        <div className="flex flex-col items-center p-8 bg-white dark:bg-slate-900/50 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700/50">
          {getContent()}
        </div>
      )}
    </div>
  );
}