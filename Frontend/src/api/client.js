import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor to attach JWT access token if present
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('hookrelay_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for consistent error extraction
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.detail ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

// API Service Functions
export const fetchHealth = async () => {
  const response = await apiClient.get('/api/v1/health');
  return response.data;
};

export const registerApi = async (email, password) => {
  const response = await apiClient.post('/auth/register', { email, password });
  return response.data;
};

export const loginApi = async (email, password) => {
  const response = await apiClient.post('/auth/login', { email, password });
  return response.data;
};

export const getMeApi = async () => {
  const response = await apiClient.get('/auth/me');
  return response.data;
};

// Endpoints APIs (Module 2)
export const fetchEndpoints = async () => {
  const response = await apiClient.get('/endpoints');
  return response.data;
};

export const fetchEndpoint = async (id) => {
  const response = await apiClient.get(`/endpoints/${id}`);
  return response.data;
};

export const createEndpoint = async ({ target_url, provider_type = 'custom', name = null }) => {
  const response = await apiClient.post('/endpoints', {
    target_url,
    provider_type,
    name,
  });
  return response.data;
};

export const updateEndpoint = async (id, { target_url, provider_type, is_active }) => {
  const payload = {};
  if (target_url !== undefined) payload.target_url = target_url;
  if (provider_type !== undefined) payload.provider_type = provider_type;
  if (is_active !== undefined) payload.is_active = is_active;
  const response = await apiClient.patch(`/endpoints/${id}`, payload);
  return response.data;
};

export const deleteEndpoint = async (id) => {
  const response = await apiClient.delete(`/endpoints/${id}`);
  return response.data;
};

export const rotateSigningSecret = async (id) => {
  const response = await apiClient.post(`/endpoints/${id}/rotate-secret`);
  return response.data;
};

// Events APIs (Module 2 & 4)
export const fetchEndpointEvents = async (
  id,
  { limit = 20, offset = 0, status = null } = {}
) => {
  const params = { limit, offset };
  if (status && status !== 'all') {
    params.status = status;
  }
  const response = await apiClient.get(`/endpoints/${id}/events`, {
    params,
  });
  return response.data;
};

export const fetchEventDetail = async (id) => {
  const response = await apiClient.get(`/events/${id}`);
  return response.data;
};

// Public Webhook Ingestion API (for live test console)
export const sendIngestWebhook = async (slug, payload, headers = {}) => {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
  const response = await axios.post(`${baseURL}/h/${slug}`, payload, {
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    timeout: 10000,
  });
  return response.data;
};

// Delivery & Replay APIs (Module 3)
export const fetchEventDeliveries = async (eventId) => {
  const response = await apiClient.get(`/events/${eventId}/deliveries`);
  return response.data;
};

export const replayEvent = async (eventId) => {
  const response = await apiClient.post(`/events/${eventId}/replay`);
  return response.data;
};

export const replayFailedDeliveries = async (endpointId) => {
  const response = await apiClient.post(`/endpoints/${endpointId}/replay-failed`);
  return response.data;
};

// Analytics & Stats APIs (Module 5)
export const fetchStatsSummary = async (endpointId = null) => {
  const params = {};
  if (endpointId && endpointId !== 'all') {
    params.endpoint_id = endpointId;
  }
  const response = await apiClient.get('/stats/summary', { params });
  return response.data;
};

export const fetchStatsTimeseries = async (endpointId = null, hours = 24) => {
  const params = { hours };
  if (endpointId && endpointId !== 'all') {
    params.endpoint_id = endpointId;
  }
  const response = await apiClient.get('/stats/timeseries', { params });
  return response.data;
};

export const triggerRetentionCleanup = async (retentionDays = 30) => {
  const response = await apiClient.post('/stats/cleanup', null, {
    params: { retention_days: retentionDays },
  });
  return response.data;
};

export default apiClient;


