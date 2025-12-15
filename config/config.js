module.exports = {
  api: {
    baseURL: process.env.API_BASE_URL || "https://usat-taklif-backend.onrender.com/api",
    timeout: Number.parseInt(process.env.API_TIMEOUT) || 10000,
    retryAttempts: Number.parseInt(process.env.API_RETRY_ATTEMPTS) || 3,
    retryDelay: Number.parseInt(process.env.API_RETRY_DELAY) || 1000,
  },
  bot: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    polling: {
      interval: 300,
      autoStart: true,
    },
  },
  validation: {
    maxMessageLength: 1000,
    minMessageLength: 10,
    maxNameLength: 50,
    minNameWords: 2,
  },
  features: {
    enableRetry: true,
    enableValidation: true,
    enableActivityTracking: true,
    enableHealthCheck: true,
  },
}
