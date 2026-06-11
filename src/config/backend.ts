import {Platform} from 'react-native';

export const BACKEND_URL =
  (typeof process !== 'undefined' &&
    (process as any)?.env?.BACKEND_URL) ||
  (Platform.OS === 'android'
    ? 'http://10.0.2.2:5000/api'
    : 'http://localhost:5000/api');

export const getDefaultLocalBaseUrl = () => BACKEND_URL;