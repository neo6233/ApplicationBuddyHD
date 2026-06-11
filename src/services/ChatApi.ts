import ApiClient from './ApiClient';
import Endpoints from '../constants/Endpoints';
import {ChatRequest, ChatResponse} from '../models/ChatModel';
import {BACKEND_URL} from '../config/backend';
import {
  directGeminiChat,
  isDirectGeminiAvailable,
  summarizeDirectGeminiError,
} from './directGemini';

const ChatApi = {
  sendMessage: async (request: ChatRequest): Promise<ChatResponse> => {
    const baseUrl = BACKEND_URL || undefined;
    try {
      const response = await ApiClient.post<ChatResponse>(
        Endpoints.CHAT,
        request,
        baseUrl ? {baseURL: baseUrl} : undefined,
      );
      return response.data;
    } catch (error) {
      if (!isDirectGeminiAvailable()) {
        throw error;
      }

      try {
        const reply = await directGeminiChat(request.message, request.history, {
          userImage: request.image || null,
          temperature: 0.2,
          maxOutputTokens: 256,
        });

        return {
          reply,
          timestamp: Date.now(),
          responseType: 'general',
        };
      } catch (fallbackError) {
        const message = summarizeDirectGeminiError(fallbackError);
        throw new Error(message);
      }
    }
  },
};

export default ChatApi;