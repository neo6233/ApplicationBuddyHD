import {createAsyncThunk, createSlice, PayloadAction} from '@reduxjs/toolkit';
import {Message, ChatRequest, ChatResponse} from '../../models/ChatModel';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import ChatApi from '../../services/ChatApi'; // ← use backend API, not Gemini directly

const uuidv4 = () => uuid.v4() as string;

const CHAT_STORAGE_KEY = '@aria_chat_history';

interface ChatState {
  messages: Message[];
  isTyping: boolean;
  loading: boolean;
  error: string | null;
  totalChats: number;
}

const initialState: ChatState = {
  messages: [],
  isTyping: false,
  loading: false,
  error: null,
  totalChats: 0,
};

// ─── Load history from AsyncStorage ──────────────────────────────────────────
export const loadChatHistory = createAsyncThunk('chat/loadHistory', async () => {
  try {
    const stored = await AsyncStorage.getItem(CHAT_STORAGE_KEY);
    return stored ? (JSON.parse(stored) as Message[]) : [];
  } catch {
    return [];
  }
});

// ─── Send message → backend → Ollama ─────────────────────────────────────────
export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (
    {userMessage, history, image}: {userMessage: string; history: Message[]; image?: string | null},
    {rejectWithValue},
  ) => {
    try {
      const request: ChatRequest = {
        message: userMessage,
        history: history.map(m => ({
          role: m.role,
          content: m.content,
          image: m.image || null,
        })),
        image: image || null,
      };

      // Calls your backend /chat endpoint which talks to Ollama
      const result: ChatResponse = await ChatApi.sendMessage(request);

      if (!result?.reply) {
        return rejectWithValue('No response received from AI service');
      }

      return {
        reply: result.reply,
        programs: result.programs ?? [],
        timestamp: result.timestamp ?? Date.now(),
      };
    } catch (error: any) {
      return rejectWithValue(error?.message || 'Failed to connect to AI service');
    }
  },
);

// ─── Clear history ────────────────────────────────────────────────────────────
export const clearChatHistory = createAsyncThunk('chat/clearHistory', async () => {
  await AsyncStorage.removeItem(CHAT_STORAGE_KEY);
  return true;
});

const saveToChatStorage = async (messages: Message[]) => {
  try {
    await AsyncStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  } catch {}
};

// ─── Slice ────────────────────────────────────────────────────────────────────
const chatSlice = createSlice({
  name: 'chat',
  initialState,
  reducers: {
    addUserMessage: (
      state,
      action: PayloadAction<string | {content: string; image?: string | null}>,
    ) => {
      const content = typeof action.payload === 'string' ? action.payload : action.payload.content;
      const image = typeof action.payload === 'string' ? null : (action.payload.image || null);
      const msg: Message = {
        id: uuidv4(),
        role: 'user',
        content,
        image,
        timestamp: Date.now(),
      };
      state.messages.push(msg);
      state.totalChats += 1;
      saveToChatStorage(state.messages);
    },
    clearError: state => {
      state.error = null;
    },
    setTyping: (state, action: PayloadAction<boolean>) => {
      state.isTyping = action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(loadChatHistory.fulfilled, (state, action) => {
        state.messages = action.payload;
        state.totalChats = action.payload.filter(m => m.role === 'user').length;
      })
      .addCase(sendMessage.pending, state => {
        state.loading = true;
        state.isTyping = true;
        state.error = null;
      })
      .addCase(sendMessage.rejected, (state, action) => {
        state.loading = false;
        state.isTyping = false;
        // Show the error as an assistant message so the UI doesn't break
        state.messages.push({
          id: uuidv4(),
          role: 'assistant',
          content:
            typeof action.payload === 'string'
              ? action.payload
              : 'AI service unavailable. Please try again.',
          timestamp: Date.now(),
        });
      })
      .addCase(sendMessage.fulfilled, (state, action) => {
        state.loading = false;
        state.isTyping = false;
        state.messages.push({
          id: uuidv4(),
          role: 'assistant',
          content: action.payload.reply,
          timestamp: action.payload.timestamp,
        });
        saveToChatStorage(state.messages);
      })
      .addCase(clearChatHistory.fulfilled, state => {
        state.messages = [];
        state.totalChats = 0;
        state.error = null;
      });
  },
});

export const {addUserMessage, clearError, setTyping} = chatSlice.actions;
export default chatSlice.reducer;