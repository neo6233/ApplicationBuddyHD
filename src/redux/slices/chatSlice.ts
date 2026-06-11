import {createAsyncThunk, createSlice, PayloadAction} from '@reduxjs/toolkit';
import {Message, ChatRequest, ChatResponse} from '../../models/ChatModel';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import {processChat} from '../../services/ChatEngine';
import {PROGRAM_CATALOG} from '../../data/programCatalog';

const uuidv4 = () => uuid.v4() as string;

const CHAT_STORAGE_KEY = '@aria_chat_history';

interface ChatState {
  messages: Message[];
  isTyping: boolean;
  loading: boolean;
  error: string | null;
  totalChats: number;
  hydratedMessageCount: number;
}

const initialState: ChatState = {
  messages: [],
  isTyping: false,
  loading: false,
  error: null,
  totalChats: 0,
  hydratedMessageCount: 0,
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

// ─── Send message via local ChatEngine (direct Gemini API) ───────────────────
export const sendMessage = createAsyncThunk(
  'chat/sendMessage',
  async (
    {userMessage, history, image}: {userMessage: string; history: Message[]; image?: string | null},
    {rejectWithValue},
  ) => {
    try {
      const directHistory = history.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        image: m.image || null,
        programs: m.programs,
      }));

      const result = await processChat(userMessage, directHistory, image);

      if (!result?.reply) {
        return rejectWithValue('No response received from AI service');
      }

      return {
        reply: result.reply,
        responseLanguage: result.responseLanguage,
        responseType: result.responseType,
        programs: (result.programs ?? []).map(p => ({
          name: p.name,
          university: p.university,
          country: p.country,
          duration: p.duration,
          intake: p.intake,
          eligibility: p.eligibility,
          careerOpportunities: p.careerOpportunities,
          matchScore: (p as any).matchScore ?? 0,
        })),
        timestamp: result.timestamp ?? Date.now(),
      };
    } catch (error: any) {
      console.error('Chat processing failed:', error?.message || error);
      return rejectWithValue(error?.message || 'Failed to process message');
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
      action: PayloadAction<string | {content: string; image?: string | null; inputMode?: 'voice' | 'text'}>,
    ) => {
      const content = typeof action.payload === 'string' ? action.payload : action.payload.content;
      const image = typeof action.payload === 'string' ? null : (action.payload.image || null);
      const inputMode = typeof action.payload === 'string' ? 'text' : (action.payload.inputMode || 'text');
      const msg: Message = {
        id: uuidv4(),
        role: 'user',
        content,
        image,
        inputMode,
        timestamp: Date.now(),
      };
      state.messages.push(msg);
      state.totalChats += 1;
      saveToChatStorage(state.messages);
    },
    addAssistantMessage: (
      state,
      action: PayloadAction<{
        content: string;
        responseLanguage?: 'hi' | 'en';
        responseType?: 'recommendation' | 'detail' | 'general';
        programs?: Message['programs'];
        timestamp?: number;
      }>,
    ) => {
      state.messages.push({
        id: uuidv4(),
        role: 'assistant',
        content: action.payload.content,
        responseLanguage: action.payload.responseLanguage,
        responseType: action.payload.responseType,
        programs: action.payload.programs?.length ? action.payload.programs : undefined,
        timestamp: action.payload.timestamp || Date.now(),
      });
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
        state.hydratedMessageCount = action.payload.length;
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
          responseLanguage: action.payload.responseLanguage,
          responseType: action.payload.responseType,
          programs: action.payload.programs?.length ? action.payload.programs : undefined,
          timestamp: action.payload.timestamp,
        });
        saveToChatStorage(state.messages);
      })
      .addCase(clearChatHistory.fulfilled, state => {
        state.messages = [];
        state.totalChats = 0;
        state.error = null;
        state.hydratedMessageCount = 0;
      });
  },
});

export const {addUserMessage, addAssistantMessage, clearError, setTyping} = chatSlice.actions;
export default chatSlice.reducer;