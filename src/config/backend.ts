import {Platform} from 'react-native';

export const BACKEND_URL =
  (typeof process !== 'undefined' &&
    (process as any)?.env?.BACKEND_URL) ||
  (Platform.OS === 'android'
    ? 'http://192.168.6.180:5000/api'
    : 'http://192.168.6.180:5000/api');

export const getDefaultLocalBaseUrl = () => BACKEND_URL;