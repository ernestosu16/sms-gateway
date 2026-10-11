import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const SESSION_ERRORS = new Set(['authentication_required', 'invalid_token', 'token_revoked']);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only a rejected session signs the user out. Other 401s, such as a wrong
    // current password or failed login, are answered where they happen.
    if (error.response?.status === 401 && SESSION_ERRORS.has(error.response.data?.code)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;
