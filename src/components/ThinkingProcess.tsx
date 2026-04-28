import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import Markdown from './Markdown';

interface ThinkingProcessProps {
  thinkingProcess?: Array<{agent: string; content: string}>;
}

const ThinkingProcess: React.FC<ThinkingProcessProps> = ({
  thinkingProcess = []
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // 如果没有思考过程，不渲染任何内容
  if (!thinkingProcess || thinkingProcess.length === 0) {
    return null;
  }

  return (
    <div className="thinking-process-outer">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="thinking-toggle-outer"
      >
        <div className={`transform ${isExpanded ? 'rotate-90' : ''}`}>
          <ChevronRight size={16} />
        </div>
        <Brain size={16} />
        <span className="text-xs">思考过程</span>
        <span className="text-xs bg-[var(--accent-secondary)] text-white px-1.5 py-0.5 rounded">
          {thinkingProcess.length}
        </span>
      </button>
      
      {isExpanded && (
        <div className="thinking-content-outer">
          {thinkingProcess.map((item, index) => (
            <div key={index} className="mb-2 last:mb-0">
              <div className="font-medium text-xs text-[var(--text-tertiary)] mb-0.5">
                {item.agent}
              </div>
              <div className="text-xs leading-relaxed">
                <Markdown content={item.content} isStreaming={false} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ThinkingProcess;