import {createAsyncThunk, createSlice, PayloadAction} from '@reduxjs/toolkit';
import {Message, ChatRequest, ChatResponse} from '../../models/ChatModel';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import ChatApi from '../../services/ChatApi';

const uuidv4 = () => uuid.v4() as string;

const CHAT_STORAGE_KEY = '@aria_chat_history';

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim();

const hasSchoolQualification = (text: string) => {
  const normalized = normalize(text);
  return (
    /\b(?:after\s+(?:my\s+)?|class\s*)12\b|\b12\s*(?:pass|standard|std|grade)\b/i.test(normalized) ||
    ['12th', '12 pass', 'class 12', 'high school', 'secondary', 'intermediate'].some(keyword =>
      normalized.includes(keyword),
    )
  );
};

const hasBachelorQualification = (text: string) =>
  /\b(passed|completed|done|finished|have|holding)\s+(a\s+)?(bachelor|bachelor's|btech|b\.tech|b\.sc|bsc|b\.e|be|graduation|graduate)\b/i.test(text) ||
  /\b(bachelor's degree|bachelor degree|graduation completed|graduate with)\b/i.test(text);

const hasSchoolOnlyProfile = (messages: Message[]) => {
  const userContext = messages
    .filter(message => message.role === 'user')
    .map(message => message.content)
    .join(' ');

  return hasSchoolQualification(userContext) && !hasBachelorQualification(userContext);
};

const sanitizeProgramsForProfile = (
  programs: Message['programs'] | undefined,
  messages: Message[],
) => {
  if (!programs?.length) {
    return undefined;
  }

  if (!hasSchoolOnlyProfile(messages)) {
    return programs;
  }

  const filtered = programs.filter(program => program.level !== 'PG');
  return filtered.length ? filtered : undefined;
};

const buildSanitizedReply = (
  originalReply: string,
  originalPrograms: Message['programs'] | undefined,
  filteredPrograms: Message['programs'] | undefined,
  language?: 'hi' | 'en',
) => {
  if (!originalPrograms?.length || filteredPrograms?.length === originalPrograms.length) {
    return originalReply;
  }

  if (!filteredPrograms?.length) {
    return language === 'hi'
      ? '12th ke baad direct master/PG course eligible nahi hota. Pehle undergraduate ya diploma course choose karein.'
      : 'After 12th, master/PG courses are not eligible directly. Please choose an undergraduate or diploma course first.';
  }

  return language === 'hi'
    ? '12th profile ke basis par ye undergraduate/diploma courses suitable hain:'
    : 'Based on your 12th profile, these undergraduate/diploma courses are suitable:';
};

const sanitizeStoredMessages = (messages: Message[]) =>
  messages.map(message => {
    if (message.role !== 'assistant' || !message.programs?.length) {
      return message;
    }

    const messagesUpToCurrent = messages.slice(0, messages.indexOf(message));
    const sanitizedPrograms = sanitizeProgramsForProfile(message.programs, messagesUpToCurrent);

    return {
      ...message,
      content: buildSanitizedReply(
        message.content,
        message.programs,
        sanitizedPrograms,
        message.responseLanguage,
      ),
      programs: sanitizedPrograms,
    };
  });

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

// ─── Send message via backend Chat API ───────────────────────────────────────
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

      const result = await ChatApi.sendMessage({
        message: userMessage,
        history: directHistory,
        image: image || null,
      });

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
          level: (p as any).level,
          matchScore: (p as any).matchScore ?? 0,
        })),
        timestamp: result.timestamp ?? Date.now(),
      };
    } catch (error: any) {
      console.warn('Chat processing failed:', error?.message || error);
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
        responseType?: 'recommendation' | 'final_recommendation' | 'detail' | 'general';
        programs?: Message['programs'];
        timestamp?: number;
      }>,
    ) => {
      const sanitizedPrograms = sanitizeProgramsForProfile(action.payload.programs, state.messages);
      state.messages.push({
        id: uuidv4(),
        role: 'assistant',
        content: buildSanitizedReply(
          action.payload.content,
          action.payload.programs,
          sanitizedPrograms,
          action.payload.responseLanguage,
        ),
        responseLanguage: action.payload.responseLanguage,
        responseType: action.payload.responseType,
        programs: sanitizedPrograms,
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
        const sanitizedMessages = sanitizeStoredMessages(action.payload);
        state.messages = sanitizedMessages;
        state.totalChats = sanitizedMessages.filter(m => m.role === 'user').length;
        state.hydratedMessageCount = sanitizedMessages.length;
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
        const sanitizedPrograms = sanitizeProgramsForProfile(action.payload.programs, state.messages);
        state.messages.push({
          id: uuidv4(),
          role: 'assistant',
          content: buildSanitizedReply(
            action.payload.reply,
            action.payload.programs,
            sanitizedPrograms,
            action.payload.responseLanguage,
          ),
          responseLanguage: action.payload.responseLanguage,
          responseType: action.payload.responseType,
          programs: sanitizedPrograms,
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
