// BASE_URL is now configurable via the backend config.
// Priority: BACKEND_URL env (mobile app) → hardcoded fallback for local testing.
// To point the app at a live server, set BACKEND_URL in your environment.
// Example: BACKEND_URL=https://aria-backend.onrender.com

import {BACKEND_URL} from '../config/backend';

export const BASE_URL = BACKEND_URL;

const Endpoints = {
  CHAT: '/chat',
  PROGRAM_FINDER: '/program-finder',
  ELIGIBILITY_CHECK: '/eligibility-check',
  HEALTH: '/health',
};

export default Endpoints;