import {Platform} from 'react-native';

export const BACKEND_URL =
  (typeof process !== 'undefined' && (process as any)?.env?.BACKEND_URL) || '';

export const getDefaultLocalBaseUrl = () => {
  if (__DEV__) {
    return Platform.OS === 'android' ? 'http://10.132.248.142:5000' : 'http://10.132.248.142:5000';
  }
  return '';
};

