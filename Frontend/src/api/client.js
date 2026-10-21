import axios from 'axios';

// Create configured Axios instance for FastAPI backend
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Helper function to test connection
export const fetchHealth = async () => {
  const response = await apiClient.get('/api/v1/health');
  return response.data;
};

export default apiClient;
