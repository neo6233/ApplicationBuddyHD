import axios, {
  AxiosInstance,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {BASE_URL} from '../constants/Endpoints';
import {resolveReachableServiceUrl} from '../config/serviceUrl';

const AUTH_TOKEN_KEY = '@aria_auth_token';
let currentBaseURL = BASE_URL;
let baseURLResolutionPromise: Promise<string> | null = null;

const resolveAndCacheBaseURL = async (): Promise<string> => {
  if (!baseURLResolutionPromise) {
    baseURLResolutionPromise = resolveReachableServiceUrl({
      envKeys: ['BACKEND_URL'],
      port: 5000,
      path: '/api',
      healthPath: '/health',
      timeoutMs: 1200,
    }).then(resolvedBaseURL => {
      currentBaseURL = resolvedBaseURL.replace(/\/+$/, '');
      ApiClient.defaults.baseURL = currentBaseURL;
      return currentBaseURL;
    });
  }

  return baseURLResolutionPromise;
};

const ApiClient: AxiosInstance = axios.create({
  baseURL: currentBaseURL,
  timeout: 60000, // 60 seconds for AI responses
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request interceptor — attach Bearer token if available
ApiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      await resolveAndCacheBaseURL();

      const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      config.baseURL = currentBaseURL;
    } catch {
      // Silently fail if AsyncStorage unavailable
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor — global error handling
ApiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    if (error.response) {
      const {status, data} = error.response;
      switch (status) {
        case 400:
          error.message = data?.message || 'Bad request';
          break;
        case 401:
          error.message = 'Unauthorized. Please log in again.';
          // Could dispatch a logout action here
          break;
        case 403:
          error.message = 'Access denied.';
          break;
        case 404:
          error.message = 'Resource not found.';
          break;
        case 429:
          error.message = 'Too many requests. Please wait before retrying.';
          break;
        case 500:
          error.message = 'Server error. Please try again later.';
          break;
        default:
          error.message = data?.message || `Error ${status}`;
      }
    } else if (error.request) {
      error.message =
        'Cannot reach the backend. The app now tries the resolved backend URL automatically, so this usually means the backend is not running, the phone cannot reach your Mac on port 5000, or an old build is still installed.';
    } else {
      error.message = 'An unexpected error occurred.';
    }
    return Promise.reject(error);
  },
);

export const setAuthToken = async (token: string) => {
  await AsyncStorage.setItem(AUTH_TOKEN_KEY, token);
};

export const clearAuthToken = async () => {
  await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
};

export const setApiBaseURL = (baseURL: string) => {
  currentBaseURL = baseURL.replace(/\/+$/, '');
  ApiClient.defaults.baseURL = currentBaseURL;
  baseURLResolutionPromise = Promise.resolve(currentBaseURL);
};

export default ApiClient;