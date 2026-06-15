import {resolveLocalServiceUrl} from './serviceUrl';

export const BACKEND_URL = resolveLocalServiceUrl({
  envKeys: ['BACKEND_URL'],
  port: 5000,
  path: '/api',
});

export const getDefaultLocalBaseUrl = () => BACKEND_URL;