export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8001';

export const SPA_API_BASE_URL =
  import.meta.env.VITE_SPA_API_BASE_URL ?? 'http://localhost:8002';

export const MAP_API_BASE_URL =
  import.meta.env.VITE_MAP_API_BASE_URL ?? 'http://localhost:8003';

export const API_ENDPOINTS = {
  auth: {
    token: `${API_BASE_URL}/token`,
    me: `${API_BASE_URL}/users/me`,
    users: `${API_BASE_URL}/users/`,
  },
  conversations: {
    list: `${API_BASE_URL}/conversations/`,
    detail: (conversationId: string | number) => `${API_BASE_URL}/conversations/${conversationId}`,
    title: (conversationId: string | number) => `${API_BASE_URL}/conversations/${conversationId}/title`,
    stream: (conversationId: string | number, mode: string) =>
      `${API_BASE_URL}/conversations/${conversationId}/messages/stream/${mode}/`,
    spaContent: (conversationId: string | number) => `${API_BASE_URL}/conversations/${conversationId}/spa-content`,
    spaTask: (conversationId: string | number) => `${API_BASE_URL}/conversations/${conversationId}/spa-task`,
    mapContent: (conversationId: string | number) => `${API_BASE_URL}/conversations/${conversationId}/map-content`,
    mapTask: (conversationId: string | number) => `${API_BASE_URL}/conversations/${conversationId}/map-task`,
    lastAiResponse: (conversationId: string | number) =>
      `${API_BASE_URL}/conversations/${conversationId}/last-ai-response`,
  },
  generation: {
    spaStream: `${SPA_API_BASE_URL}/spa/generate/stream`,
    mapStream: `${MAP_API_BASE_URL}/map/generate/stream`,
  },
};

export function getAuthHeaders(contentType = true): HeadersInit {
  const token = localStorage.getItem('token');
  return {
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
