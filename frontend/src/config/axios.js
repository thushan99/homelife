import axios from "axios";

// Automatically detect the environment and set the appropriate baseURL
const getBaseURL = () => {
  // If we're in production (hosted on the domain), use the domain's API
  if (window.location.hostname === "homelife.brokeragelead.ca") {
    return "https://homelife.brokeragelead.ca/api";
  }
  // For development, use localhost
  return "http://localhost:8001/api";
};

const axiosInstance = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000, // 30 second timeout instead of 10 seconds
  headers: {
    "Content-Type": "application/json",
  },
});

export default axiosInstance;
