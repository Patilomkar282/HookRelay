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

export const registerApi = async (email, password, full_name = null) => {
  const payload = { email, password };
  if (full_name) payload.full_name = full_name;
  const response = await apiClient.post('/auth/register', payload);
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

// Endpoints & Mailbox Management APIs
export const fetchEndpoints = async () => {
  const response = await apiClient.get('/endpoints');
  return response.data;
};

export const fetchEndpoint = async (id) => {
  const response = await apiClient.get(`/endpoints/${id}`);
  return response.data;
};

export const createEndpoint = async ({
  target_url,
  provider_type = 'custom',
  name = null,
  description = null,
  custom_signature_header = null,
  signing_secret = null,
}) => {
  const payload = { target_url, provider_type };
  if (name) payload.name = name;
  if (description) payload.description = description;
  if (custom_signature_header) payload.custom_signature_header = custom_signature_header;
  if (signing_secret) payload.signing_secret = signing_secret;

  const response = await apiClient.post('/endpoints', payload);
  return response.data;
};

export const updateEndpoint = async (
  id,
  { name, description, target_url, provider_type, custom_signature_header, is_active }
) => {
  const payload = {};
  if (name !== undefined) payload.name = name;
  if (description !== undefined) payload.description = description;
  if (target_url !== undefined) payload.target_url = target_url;
  if (provider_type !== undefined) payload.provider_type = provider_type;
  if (custom_signature_header !== undefined) payload.custom_signature_header = custom_signature_header;
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

// Circuit Breaker Management APIs
export const resetCircuit = async (id) => {
  const response = await apiClient.post(`/endpoints/${id}/circuit/reset`);
  return response.data;
};

export const fetchCircuitEvents = async (id, { limit = 20, offset = 0 } = {}) => {
  const response = await apiClient.get(`/endpoints/${id}/circuit-events`, {
    params: { limit, offset },
  });
  return response.data;
};

// Webhook Ingest & Event Observability APIs
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

// Outbound Delivery & Replay Engine APIs
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

// Telemetry & Aggregated Stats APIs
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

// User Settings, Profile, API Keys & Account Management APIs
export const updateProfileApi = async (data) => {
  const response = await apiClient.patch('/auth/profile', data);
  return response.data;
};

export const changePasswordApi = async ({ current_password, new_password }) => {
  const response = await apiClient.post('/auth/change-password', {
    current_password,
    new_password,
  });
  return response.data;
};

export const fetchApiKeys = async () => {
  const response = await apiClient.get('/auth/api-keys');
  return response.data;
};

export const createApiKey = async (name) => {
  const response = await apiClient.post('/auth/api-keys', { name });
  return response.data;
};

export const deleteApiKey = async (id) => {
  const response = await apiClient.delete(`/auth/api-keys/${id}`);
  return response.data;
};

export const purgeEventsApi = async () => {
  const response = await apiClient.post('/auth/danger/purge-events');
  return response.data;
};

export const deleteAccountApi = async (password) => {
  const response = await apiClient.post('/auth/danger/delete-account', { password });
  return response.data;
};

// Alert Channels APIs
export const fetchAlertChannels = async () => {
  const response = await apiClient.get('/alert-channels');
  return response.data;
};

export const createAlertChannel = async (data) => {
  const response = await apiClient.post('/alert-channels', data);
  return response.data;
};

export const testAlertChannel = async (id) => {
  const response = await apiClient.post(`/alert-channels/${id}/test`);
  return response.data;
};

export const verifyAlertChannel = async ({ id, code }) => {
  const response = await apiClient.post(`/alert-channels/${id}/verify`, { code });
  return response.data;
};

export const deleteAlertChannel = async (id) => {
  const response = await apiClient.delete(`/alert-channels/${id}`);
  return response.data;
};

// Alert Rules APIs
export const fetchAlertRules = async (endpointId = null) => {
  const url = endpointId ? `/alert-rules?endpoint_id=${endpointId}` : '/alert-rules';
  const response = await apiClient.get(url);
  return response.data;
};

export const createAlertRule = async (data) => {
  const response = await apiClient.post('/alert-rules', data);
  return response.data;
};

export const updateAlertRule = async (id, data) => {
  const response = await apiClient.patch(`/alert-rules/${id}`, data);
  return response.data;
};

export const deleteAlertRule = async (id) => {
  const response = await apiClient.delete(`/alert-rules/${id}`);
  return response.data;
};

// Alert Events (History & Outbox) APIs
export const fetchAlertEvents = async (endpointId = null, page = 1, limit = 20) => {
  const params = { page, limit };
  if (endpointId) {
    params.endpoint_id = endpointId;
  }
  const response = await apiClient.get('/alert-events', { params });
  return response.data;
};

export default apiClient;
