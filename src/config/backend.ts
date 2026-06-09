import {Platform} from 'react-native';

export const BACKEND_URL =
  (typeof process !== 'undefined' && (process as any)?.env?.BACKEND_URL) || '';

export const getDefaultLocalBaseUrl = () => {
  if (__DEV__) {
    return Platform.OS === 'android' ? 'http://10.0.2.2:5000' : 'http://localhost:5000';
  }
  return '';
};

