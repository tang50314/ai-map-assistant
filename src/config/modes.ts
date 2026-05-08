import { MessageCircle, Navigation, Plane } from 'lucide-react';
import type { ChatMode, ModeMeta } from '@/types/domain';

export const MODE_META: Record<ChatMode, ModeMeta> = {
  general: {
    icon: MessageCircle,
    label: '普通聊天',
    prefix: '[普通]',
    description: '回答日常问题，支持基础信息咨询和连续追问',
  },
  route: {
    icon: Navigation,
    label: '路线规划',
    prefix: '[路线]',
    description: '结合当前位置、目的地和交通方式生成出行路线',
  },
  travel: {
    icon: Plane,
    label: '旅行规划',
    prefix: '[旅行]',
    description: '生成多日行程、景点推荐和可视化旅行页面',
  },
};

export const CHAT_MODES = Object.keys(MODE_META) as ChatMode[];
