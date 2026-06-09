import {configureStore} from '@reduxjs/toolkit';
import chatReducer from './slices/chatSlice';
import programReducer from './slices/programSlice';
import eligibilityReducer from './slices/eligibilitySlice';

const store = configureStore({
  reducer: {
    chat: chatReducer,
    programs: programReducer,
    eligibility: eligibilityReducer,
  },
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;