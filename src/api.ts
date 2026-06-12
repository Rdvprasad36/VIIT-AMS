import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Global Request Interceptor to append our identity JWT token autonomously
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("viit_ams_token");
    if (token && config.headers) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Global Response Interceptor to capture authentication drops and clear expired contexts
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      // If unauthorized, clear local context and force authentication state
      if (error.response.status === 401 || error.response.status === 403) {
        // Only trigger auth-logout if there is currently a user state being lost
        if (localStorage.getItem("viit_ams_token")) {
          localStorage.removeItem("viit_ams_token");
          localStorage.removeItem("viit_ams_user");
          window.dispatchEvent(new Event("auth_logout"));
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
