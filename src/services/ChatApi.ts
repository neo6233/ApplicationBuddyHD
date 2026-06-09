import ApiClient from './ApiClient';
import Endpoints from '../constants/Endpoints';
import {ChatRequest, ChatResponse} from '../models/ChatModel';
import {BACKEND_URL} from '../config/backend';

const ChatApi = {
  sendMessage: async (request: ChatRequest): Promise<ChatResponse> => {
    const baseUrl = BACKEND_URL || undefined;
    const response = await ApiClient.post<ChatResponse>(
      Endpoints.CHAT,
      request,
      baseUrl ? {baseURL: baseUrl} : undefined,
    );
    return response.data;
  },
};

export default ChatApi;