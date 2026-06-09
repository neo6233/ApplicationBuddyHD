import {createAsyncThunk, createSlice} from '@reduxjs/toolkit';
import {
  EligibilityRequest,
  EligibilityResponse,
} from '../../models/EligibilityModel';
import EligibilityApi from '../../services/EligibilityApi';

interface EligibilityState {
  results: EligibilityResponse | null;
  loading: boolean;
  error: string | null;
}

const initialState: EligibilityState = {
  results: null,
  loading: false,
  error: null,
};

export const checkEligibility = createAsyncThunk(
  'eligibility/check',
  async (request: EligibilityRequest, {rejectWithValue}) => {
    try {
      const response = await EligibilityApi.checkEligibility(request);
      return response;
    } catch (error: any) {
      return rejectWithValue(
        error?.response?.data?.message || 'Failed to check eligibility',
      );
    }
  },
);

const eligibilitySlice = createSlice({
  name: 'eligibility',
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
      .addCase(checkEligibility.pending, state => {
        state.loading = true;
        state.error = null;
        state.results = null;
      })
      .addCase(checkEligibility.fulfilled, (state, action) => {
        state.loading = false;
        state.results = action.payload;
      })
      .addCase(checkEligibility.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const {clearResults, clearError} = eligibilitySlice.actions;
export default eligibilitySlice.reducer;