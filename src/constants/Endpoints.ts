// BASE_URL is now configurable via the backend config.
// Priority: BACKEND_URL env (mobile app) → hardcoded fallback for local testing.
// To point the app at a live server, set BACKEND_URL in your environment.
// Example: BACKEND_URL=https://aria-backend.onrender.com

import {Platform} from 'react-native';
import {BACKEND_URL as backendUrl} from '../config/backend';

export const BASE_URL = backendUrl || (Platform.OS === 'android' ? 'http://10.132.248.142:5000' : 'http://10.132.248.142:5000');

const Endpoints = {
  CHAT: '/api/chat',
  PROGRAM_FINDER: '/api/program-finder',
  ELIGIBILITY_CHECK: '/api/eligibility-check',
  HEALTH: '/api/health',
};

export default Endpoints;
