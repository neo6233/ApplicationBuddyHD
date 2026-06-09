import {createAsyncThunk, createSlice} from '@reduxjs/toolkit';
import {
  ProgramFinderRequest,
  ProgramFinderResponse,
  Program,
} from '../../models/ProgramModel';
import ProgramApi from '../../services/ProgramApi';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SAVED_PROGRAMS_KEY = '@aria_saved_programs';

interface ProgramState {
  results: ProgramFinderResponse | null;
  savedPrograms: Program[];
  loading: boolean;
  error: string | null;
}

const initialState: ProgramState = {
  results: null,
  savedPrograms: [],
  loading: false,
  error: null,
};

export const findPrograms = createAsyncThunk(
  'programs/findPrograms',
  async (request: ProgramFinderRequest, {rejectWithValue}) => {
    try {
      const response = await ProgramApi.findPrograms(request);
      return response;
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.message || 'Failed to find programs',
      );
    }
  },
);

export const loadSavedPrograms = createAsyncThunk(
  'programs/loadSaved',
  async () => {
    try {
      const stored = await AsyncStorage.getItem(SAVED_PROGRAMS_KEY);
      return stored ? (JSON.parse(stored) as Program[]) : [];
    } catch {
      return [];
    }
  },
);

export const saveProgram = createAsyncThunk(
  'programs/saveProgram',
  async (program: Program, {getState, rejectWithValue}) => {
    try {
      const state = getState() as {programs: ProgramState};
      const existing = state.programs.savedPrograms;
      const alreadySaved = existing.some(
        p => p.name === program.name && p.university === program.university,
      );
      if (alreadySaved) {
        return existing;
      }
      const updated = [...existing, program];
      await AsyncStorage.setItem(SAVED_PROGRAMS_KEY, JSON.stringify(updated));
      return updated;
    } catch (error: any) {
      return rejectWithValue('Failed to save program');
    }
  },
);

export const removeSavedProgram = createAsyncThunk(
  'programs/removeSaved',
  async (program: Program, {getState, rejectWithValue}) => {
    try {
      const state = getState() as {programs: ProgramState};
      const updated = state.programs.savedPrograms.filter(
        p => !(p.name === program.name && p.university === program.university),
      );
      await AsyncStorage.setItem(SAVED_PROGRAMS_KEY, JSON.stringify(updated));
      return updated;
    } catch {
      return rejectWithValue('Failed to remove program');
    }
  },
);

const programSlice = createSlice({
  name: 'programs',
  initialState,
  reducers: {
    clearResults: state => {
      state.results = null;
      state.error = null;
    },
    clearError: state => {
      state.error = null;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(findPrograms.pending, state => {
        state.loading = true;
        state.error = null;
        state.results = null;
      })
      .addCase(findPrograms.fulfilled, (state, action) => {
        state.loading = false;
        state.results = action.payload;
      })
      .addCase(findPrograms.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(loadSavedPrograms.fulfilled, (state, action) => {
        state.savedPrograms = action.payload;
      })
      .addCase(saveProgram.fulfilled, (state, action) => {
        state.savedPrograms = action.payload;
      })
      .addCase(removeSavedProgram.fulfilled, (state, action) => {
        state.savedPrograms = action.payload;
      });
  },
});

export const {clearResults, clearError} = programSlice.actions;
export default programSlice.reducer;