import type { LucideIcon } from 'lucide-react';

export type ChatMode = 'general' | 'route' | 'travel';
export type WorkspaceTab = 'map' | 'preview';
export type PreviewTab = 'effect' | 'code';

export interface ThinkingStep {
  agent: string;
  content: string;
}

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  agent?: string;
  type?: 'agent_output' | 'simple_output' | 'error' | 'final' | 'initial_response';
  thinkingProcess?: ThinkingStep[];
  isLoading?: boolean;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  messages: Message[];
  mode: ChatMode;
  spaTaskId?: string;
  spaContent?: string;
  generatedCode?: string;
  lastAiResponse?: string;
  mapUrl?: string;
  mapQrCode?: string;
  mapTaskId?: string;
}

export interface LoginFormData {
  username: string;
  password: string;
}

export interface RegisterFormData {
  username: string;
  password: string;
  email: string;
}

export interface ModeMeta {
  icon: LucideIcon;
  label: string;
  prefix: string;
  description: string;
}
