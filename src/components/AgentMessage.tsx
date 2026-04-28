import React from 'react';
import Markdown from './Markdown';

interface AgentMessageProps {
  content: string;
  agent?: string;
  type?: 'initial' | 'preference' | 'final';
  thinkingProcess?: Array<{ agent: string; content: string }>;
  isStreaming?: boolean;
}

export const AgentMessage: React.FC<AgentMessageProps> = ({ 
  content, 
  agent, 
  type = 'final',
  thinkingProcess,
  isStreaming = false 
}) => {
  if (type === 'initial') {
    return (
      <div className="text-[var(--text-tertiary)] text-sm">
        <div className="flex items-center space-x-3 mb-3">
          <div className="relative">
            <div className="w-2 h-2 bg-[var(--accent-secondary)] rounded-full animate-pulse"></div>
          <div className="absolute inset-0 w-2 h-2 bg-[var(--accent-secondary)]/70 rounded-full animate-ping"></div>
          </div>
          <span className="font-medium">正在初始化系统...</span>
        </div>
      </div>
    );
  }

  return (
    <Markdown content={content} isStreaming={isStreaming} />
  );
};