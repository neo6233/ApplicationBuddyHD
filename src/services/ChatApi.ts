import ApiClient from './ApiClient';
import Endpoints from '../constants/Endpoints';
import {ChatRequest, ChatResponse} from '../models/ChatModel';

const ChatApi = {
  sendMessage: async (request: ChatRequest): Promise<ChatResponse> => {
    const response = await ApiClient.post<ChatResponse>(Endpoints.CHAT, request);
    return response.data;
  },
};

export default ChatApi;
