const axios = require("axios");

class APIClient {
  constructor(baseURL, localStorage = null) {
    this.baseURL = baseURL;
    this.isOnline = false;
    this.authBaseURL = "http://std-back.usat-ai-lab.uz/api/v1";
    this.accessToken = null;
    this.refreshToken = null;
    this.localStorage = localStorage;
    this.isRefreshing = false;
    this.failedQueue = [];
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "USAT-Telegram-Bot/1.0",
      },
    });

    // Request interceptor for logging and adding auth token
    this.client.interceptors.request.use(
      (config) => {
        console.log(`[API] ${config.method?.toUpperCase()} ${config.url}`);
        // Add access token to requests if available
        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        return config;
      },
      (error) => {
        console.error("[API] Request error:", error.message);
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling and token refresh
    this.client.interceptors.response.use(
      (response) => {
        console.log(
          `[API] Response ${response.status} from ${response.config.url}`
        );
        this.isOnline = true;
        return response;
      },
      async (error) => {
        const originalRequest = error.config;

        // Handle 401 Unauthorized - token expired
        if (
          error.response?.status === 401 &&
          !originalRequest._retry &&
          this.refreshToken
        ) {
          // Check if error message indicates token expiration
          const errorDetail = error.response?.data?.detail || "";
          if (
            errorDetail.includes("Invalid or expired token") ||
            errorDetail.includes("expired") ||
            errorDetail.includes("Invalid")
          ) {
            originalRequest._retry = true;

            // If already refreshing, wait for it
            if (this.isRefreshing) {
              return new Promise((resolve, reject) => {
                this.failedQueue.push({ resolve, reject });
              })
                .then((token) => {
                  originalRequest.headers.Authorization = `Bearer ${token}`;
                  return this.client(originalRequest);
                })
                .catch((err) => {
                  return Promise.reject(err);
                });
            }

            this.isRefreshing = true;

            try {
              console.log("[API] Access token expired, refreshing...");
              const newTokens = await this.refreshAccessToken();

              // Update token in original request
              originalRequest.headers.Authorization = `Bearer ${newTokens.access}`;

              // Process queued requests
              this.failedQueue.forEach((prom) => {
                prom.resolve(newTokens.access);
              });
              this.failedQueue = [];

              this.isRefreshing = false;

              // Retry original request
              return this.client(originalRequest);
            } catch (refreshError) {
              console.error("[API] Token refresh failed:", refreshError.message);
              this.isRefreshing = false;

              // Process queued requests with error
              this.failedQueue.forEach((prom) => {
                prom.reject(refreshError);
              });
              this.failedQueue = [];

              // If refresh fails, try to login again
              try {
                console.log("[API] Attempting to login again...");
                const tokens = await this.login("admin", "admin123");
                if (tokens.access) {
                  originalRequest.headers.Authorization = `Bearer ${tokens.access}`;
                  return this.client(originalRequest);
                }
              } catch (loginError) {
                console.error("[API] Re-login failed:", loginError.message);
              }

              return Promise.reject(refreshError);
            }
          }
        }

        console.error(
          `[API] Response error: ${error.response?.status} - ${error.message}`
        );
        this.isOnline = false;
        return Promise.reject(error);
      }
    );
  }

  async checkUserExists(chatId) {
    try {
      // Optimize: Use specific user endpoint if available, otherwise use query parameter
      const chatIdStr = String(chatId);
      let response;
      
      try {
        // Try to get specific user by chatId (more efficient)
        response = await this.client.get(`/users/${chatIdStr}`);
        const responseData = response.data;
        
        if (responseData && responseData.success && responseData.data) {
          const user = responseData.data.user || responseData.data;
          if (user && (String(user.chatId) === chatIdStr || String(user.userId) === chatIdStr)) {
            return user;
          }
        }
      } catch (specificError) {
        // If specific endpoint doesn't exist, fall back to query parameter
        if (specificError.response?.status === 404) {
          response = await this.client.get(`/users?chatId=${chatIdStr}`);
        } else {
          throw specificError;
        }
      }

      const responseData = response.data;

      // Check if response has the expected structure
      if (
        responseData &&
        responseData.success &&
        responseData.data
      ) {
        // Handle both single user and array of users
        const users = Array.isArray(responseData.data.users) 
          ? responseData.data.users 
          : Array.isArray(responseData.data) 
          ? responseData.data 
          : [responseData.data];
          
        if (Array.isArray(users) && users.length > 0) {
          const foundUser = users.find(
            (user) => String(user.chatId) === chatIdStr || String(user.userId) === chatIdStr
          );
          return foundUser || null;
        }
      }

      return null;
    } catch (error) {
      console.error("Error checking user existence:", error.message);
      this.isOnline = false;

      if (error.code === "ECONNABORTED") {
        throw new Error("Connection timeout - server may be slow");
      }
      if (error.response?.status === 404) {
        return null; // User doesn't exist
      }
      throw new Error("Failed to check user existence");
    }
  }

  async registerUser(userData) {
    try {
      // Validate required fields according to API requirements
      // API requires: userId, chatId, fullName, phone, course, direction, language
      const requiredFields = [
        "userId",
        "chatId",
        "fullName",
        "phone",
        "course",
        "direction",
        "language",
      ];
      
      const missingFields = [];
      for (const field of requiredFields) {
        if (!userData[field]) {
          missingFields.push(field);
        }
      }
      
      if (missingFields.length > 0) {
        console.error("[API] Missing required fields:", missingFields);
        console.error("[API] User data received:", JSON.stringify(userData, null, 2));
        throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
      }

      // Prepare clean API data - send all required fields
      const apiUserData = {
        userId: String(userData.userId || userData.chatId),
        chatId: String(userData.chatId),
        fullName: String(userData.fullName),
        phone: String(userData.phone),
        course: String(userData.course),
        direction: String(userData.direction),
        language: String(userData.language || "uz"),
      };

      console.log("[API] Sending registration data to API:", JSON.stringify(apiUserData, null, 2));

      const response = await this.client.post("/users", apiUserData);
      console.log(`[API] User registered successfully: ${userData.fullName || userData.chatId}`);
      this.isOnline = true;
      return response.data;
    } catch (error) {
      console.error("[API] Error registering user:", error.message);
      if (error.response) {
        console.error("[API] Error response status:", error.response.status);
        console.error("[API] Error response data:", JSON.stringify(error.response.data, null, 2));
      }
      this.isOnline = false;

      if (error.response?.status === 409) {
        throw new Error("User already exists");
      }
      if (error.response?.status === 400) {
        const errorMessage = error.response?.data?.message || error.response?.data?.error || "Invalid user data provided";
        throw new Error(errorMessage);
      }
      throw new Error("Failed to register user: " + error.message);
    }
  }

  async saveMessage(messageData) {
    try {
      const requiredFields = [
        "messageId",
        "userId",
        "chatId",
        "timestamp",
        "status",
        "ticketType",
        "text",
        "language",
        "isactive",
      ];
      for (const field of requiredFields) {
        if (!messageData[field] && messageData[field] !== false) {
          // Allow false for isactive
          throw new Error(`Missing required field: ${field}`);
        }
      }

      // For suggestions, substatus can be null, for complaints it's required
      if (messageData.ticketType === "complaint" && !messageData.substatus) {
        throw new Error("Missing required field: substatus");
      }

      if (messageData.text.trim().length === 0) {
        throw new Error("Message text cannot be empty");
      }

      if (messageData.text.length > 1000) {
        throw new Error("Message text too long (max 1000 characters)");
      }

      const {
        synced,
        ticketNumber,
        fullName,
        category,
        priority,
        ...apiMessageData
      } = messageData;

      console.log(
        "[API] Sending message data to API:",
        JSON.stringify(apiMessageData, null, 2)
      );

      const response = await this.client.post("/messages", apiMessageData);
      console.log(
        `[API] Message saved successfully: ${messageData.ticketType}`
      );
      this.isOnline = true;
      return response.data;
    } catch (error) {
      console.error("Error saving message:", error.message);
      this.isOnline = false;

      if (error.response?.status === 400) {
        throw new Error("Invalid message data provided");
      }
      if (error.response?.status === 413) {
        throw new Error("Message too large");
      }
      throw new Error("Failed to save message");
    }
  }

  async getUserMessages(chatId, limit = 10) {
    try {
      const response = await this.client.get(
        `/messages?userId=${chatId}&limit=${limit}`
      );
      this.isOnline = true;
      return response.data;
    } catch (error) {
      console.error("Error fetching user messages:", error.message);
      this.isOnline = false;
      throw new Error("Failed to fetch user messages");
    }
  }

  async updateUserActivity(chatId) {
    try {
      // Check if user exists first
      const user = await this.checkUserExists(chatId);
      if (!user) {
        console.log(`[API] User ${chatId} not found, skipping activity update`);
        return;
      }

      const updateData = {
        lastActivity: new Date().toISOString(),
      };

      // Try to update via PUT instead of PATCH, or skip if endpoint doesn't exist
      try {
        await this.client.put(`/users/${chatId}`, updateData);
        this.isOnline = true;
        console.log(`[API] User activity updated for ${chatId}`);
      } catch (updateError) {
        if (updateError.response?.status === 404) {
          console.log(
            `[API] User activity update endpoint not available for ${chatId}`
          );
          // Don't treat this as an error since the endpoint might not exist
          return;
        }
        throw updateError;
      }
    } catch (error) {
      console.error("Error updating user activity:", error.message);
      this.isOnline = false;
      // Don't throw error for activity updates as it's not critical
    }
  }

  async healthCheck() {
    try {
      // Use lightweight health check endpoint if available
      const response = await this.client.get("/health", {
        timeout: 3000, // Shorter timeout for health check
      });
      this.isOnline = true;
      return response.status === 200;
    } catch (error) {
      // Fallback to root endpoint
      try {
        const response = await this.client.get("/", {
          timeout: 3000,
        });
        this.isOnline = true;
        return response.status === 200;
      } catch (fallbackError) {
        // Last resort: try users endpoint with limit
        try {
          const response = await this.client.get("/users?limit=1", {
            timeout: 5000,
          });
          this.isOnline = response.status === 200;
          return response.status === 200;
        } catch (lastError) {
          this.isOnline = false;
          return false;
        }
      }
    }
  }

  async login(username = "admin", password = "admin123") {
    try {
      console.log("[API] ========== LOGIN START ==========");
      console.log("[API] Login URL:", `${this.authBaseURL}/auth/login`);
      console.log("[API] Login credentials:", { username, password: "***" });

      const authClient = axios.create({
        baseURL: this.authBaseURL,
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
        },
      });

      const response = await authClient.post("/auth/login", {
        username,
        password,
      });

      console.log("[API] Login response status:", response.status);
      console.log("[API] Login response headers:", response.headers);
      console.log("[API] Login response data:", JSON.stringify(response.data, null, 2));

      // Check different possible response formats
      let accessToken = null;
      let refreshToken = null;

      if (response.data) {
        // Format 1: { access: "...", refresh: "..." }
        if (response.data.access && response.data.refresh) {
          accessToken = response.data.access;
          refreshToken = response.data.refresh;
        }
        // Format 2: { data: { access: "...", refresh: "..." } }
        else if (response.data.data && response.data.data.access && response.data.data.refresh) {
          accessToken = response.data.data.access;
          refreshToken = response.data.data.refresh;
        }
        // Format 3: { token: "...", refresh_token: "..." }
        else if (response.data.token && response.data.refresh_token) {
          accessToken = response.data.token;
          refreshToken = response.data.refresh_token;
        }
        // Format 4: { access_token: "...", refresh_token: "..." }
        else if (response.data.access_token && response.data.refresh_token) {
          accessToken = response.data.access_token;
          refreshToken = response.data.refresh_token;
        }
      }

      if (accessToken && refreshToken) {
        this.accessToken = accessToken;
        this.refreshToken = refreshToken;
        console.log("[API] ✅ Login successful, tokens extracted");
        console.log("[API] Access token preview:", accessToken.substring(0, 30) + "...");
        console.log("[API] Refresh token preview:", refreshToken.substring(0, 30) + "...");

        // Save tokens to localStorage if available
        if (this.localStorage) {
          const saved = await this.localStorage.saveTokens(
            this.accessToken,
            this.refreshToken
          );
          console.log("[API] Tokens saved to localStorage:", saved);
        }

        // Save tokens callback (will be set from bot.js)
        if (this.onTokensReceived) {
          this.onTokensReceived(accessToken, refreshToken);
        }

        console.log("[API] ========== LOGIN SUCCESS ==========");
        return {
          access: this.accessToken,
          refresh: this.refreshToken,
        };
      }

      console.error("[API] ❌ Invalid login response format");
      console.error("[API] Response structure:", {
        hasData: !!response.data,
        dataKeys: response.data ? Object.keys(response.data) : [],
        fullResponse: JSON.stringify(response.data, null, 2),
      });
      throw new Error("Invalid login response format - tokens not found");
    } catch (error) {
      console.error("[API] ========== LOGIN ERROR ==========");
      console.error("[API] Error during login:", error.message);
      if (error.response) {
        console.error("[API] Login error status:", error.response.status);
        console.error("[API] Login error response data:", JSON.stringify(error.response.data, null, 2));
        console.error("[API] Login error response headers:", error.response.headers);
      } else if (error.request) {
        console.error("[API] Login request error - no response received");
        console.error("[API] Request config:", {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL,
        });
      } else {
        console.error("[API] Login setup error:", error.message);
      }
      console.error("[API] ====================================");
      throw new Error("Failed to login: " + error.message);
    }
  }

  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error("No refresh token available");
    }

    try {
      const authClient = axios.create({
        baseURL: this.authBaseURL,
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
        },
      });

      // Standard refresh token endpoint - POST /auth/refresh with refresh token in body
      const response = await authClient.post("/auth/refresh", {
        refresh: this.refreshToken,
      });

      if (response.data && response.data.access) {
        this.accessToken = response.data.access;
        // Update refresh token if provided in response
        if (response.data.refresh) {
          this.refreshToken = response.data.refresh;
        }

        console.log("[API] Token refreshed successfully");

        // Save tokens to localStorage if available
        if (this.localStorage) {
          await this.localStorage.saveTokens(
            this.accessToken,
            this.refreshToken
          );
        }

        return {
          access: this.accessToken,
          refresh: this.refreshToken,
        };
      }

      throw new Error("Invalid refresh response format");
    } catch (error) {
      console.error("Error refreshing token:", error.message);
      if (error.response) {
        console.error("Refresh error response:", error.response.data);
        console.error("Refresh error status:", error.response.status);
      }
      throw new Error("Failed to refresh token");
    }
  }

  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    // Save to localStorage if available
    if (this.localStorage && accessToken && refreshToken) {
      this.localStorage.saveTokens(accessToken, refreshToken).catch((err) => {
        console.error("[API] Failed to save tokens:", err.message);
      });
    }
  }

  getTokens() {
    return {
      access: this.accessToken,
      refresh: this.refreshToken,
    };
  }

  async ensureAuthenticated() {
    // Check if we have a valid token in memory
    if (this.accessToken) {
      return true;
    }

    // Try to load from localStorage
    if (this.localStorage) {
      const savedTokens = this.localStorage.readTokens();
      if (savedTokens.access && savedTokens.refresh) {
        this.accessToken = savedTokens.access;
        this.refreshToken = savedTokens.refresh;
        console.log("[API] ✅ Loaded token from localStorage");
        return true;
      }
    }

    // Try to load from tokens.json file (via callback)
    if (this.readTokensCallback) {
      const savedTokens = this.readTokensCallback();
      if (savedTokens.access && savedTokens.refresh) {
        this.accessToken = savedTokens.access;
        this.refreshToken = savedTokens.refresh;
        console.log("[API] ✅ Loaded token from tokens.json");
        return true;
      }
    }

    // If no token, login
    console.log("[API] ⚠️ No token found, logging in...");
    await this.login("admin", "admin123");
    return true;
  }

  async checkStudentByPINFL(pinfl) {
    try {
      console.log("[API] ========================================");
      console.log("[API] Checking student by PINFL:", pinfl);

      // Load token from tokens.json file first
      if (this.readTokensCallback) {
        const savedTokens = this.readTokensCallback();
        if (savedTokens.access) {
          this.accessToken = savedTokens.access;
          this.refreshToken = savedTokens.refresh;
          console.log("[API] ✅ Loaded token from tokens.json");
        }
      }

      // Ensure we have a valid token (will use saved token or login once at startup)
      await this.ensureAuthenticated();

      console.log("[API] Current accessToken exists:", !!this.accessToken);
      console.log("[API] Token preview:", this.accessToken ? this.accessToken.substring(0, 30) + "..." : "N/A");

      // Create a separate client for students API with auth token
      const studentsClient = axios.create({
        baseURL: this.authBaseURL,
        timeout: 15000,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      // Use specific endpoint: /students/by-pinfl/{pinfl}
      const endpoint = `/students/by-pinfl/${pinfl}`;
      const fullUrl = `${this.authBaseURL}${endpoint}`;

      console.log("[API] ========================================");
      console.log("[API] Sending GET request to:", fullUrl);
      console.log("[API] Request headers:", {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken ? this.accessToken.substring(0, 30) + "..." : "MISSING"}`,
      });
      console.log("[API] ========================================");

      // Get student by PINFL using specific endpoint
      const response = await studentsClient.get(endpoint);

      console.log("[API] Student check response status:", response.status);
      console.log("[API] Student check response data:", JSON.stringify(response.data, null, 2));

      if (response.data && response.data.pinfl) {
        // Response contains student data directly
        const student = response.data;
        console.log("[API] ✅ Student found by PINFL:", {
          id: student.id,
          fullName: student.full_name,
          pinfl: student.pinfl,
          phone: student.phone,
          groupId: student.group_id,
          course: student.group?.course,
          field: student.group?.field?.title,
        });
        return student;
      }

      console.log("[API] ❌ No student data in response");
      return null;
    } catch (error) {
      console.error("[API] Error checking student by PINFL:", error.message);
      if (error.response) {
        console.error("[API] Student check error response:", JSON.stringify(error.response.data, null, 2));
        console.error("[API] Student check error status:", error.response.status);
        console.error("[API] Student check error headers:", error.response.headers);

        // If 404, student not found
        if (error.response.status === 404) {
          console.log("[API] 404 - Student not found with PINFL:", pinfl);
          return null; // Return null instead of throwing error
        }

        // If 401, try to refresh token and retry
        if (error.response.status === 401) {
          console.log("[API] 401 error, attempting token refresh...");
          try {
            await this.refreshAccessToken();
            console.log("[API] Token refreshed, retrying student check...");
            // Retry the request
            return await this.checkStudentByPINFL(pinfl);
          } catch (refreshError) {
            console.error("[API] Token refresh failed during student check:", refreshError.message);
            throw new Error("Authentication failed");
          }
        }
      } else if (error.request) {
        console.error("[API] No response received:", error.request);
      } else {
        console.error("[API] Request setup error:", error.message);
      }
      throw new Error("Failed to check student");
    }
  }

  async getCourses() {
    try {
      // Try to get courses from auth API first
      await this.ensureAuthenticated();
      
      const studentsClient = axios.create({
        baseURL: this.authBaseURL,
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      // Try different possible endpoints
      try {
        const response = await studentsClient.get("/courses");
        if (response.data && Array.isArray(response.data)) {
          return response.data;
        }
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
          return response.data.data;
        }
        if (response.data && response.data.courses && Array.isArray(response.data.courses)) {
          return response.data.courses;
        }
      } catch (error) {
        // If courses endpoint doesn't exist, return default courses
        console.warn("[API] Courses endpoint not found, using default courses");
      }

      // Return default courses if API doesn't have endpoint
      return [
        { id: 1, name: "1-kurs", name_uz: "1-kurs", name_ru: "1-курс" },
        { id: 2, name: "2-kurs", name_uz: "2-kurs", name_ru: "2-курс" },
        { id: 3, name: "3-kurs", name_uz: "3-kurs", name_ru: "3-курс" },
        { id: 4, name: "4-kurs", name_uz: "4-kurs", name_ru: "4-курс" },
      ];
    } catch (error) {
      console.error("[API] Error fetching courses:", error.message);
      // Return default courses on error
      return [
        { id: 1, name: "1-kurs", name_uz: "1-kurs", name_ru: "1-курс" },
        { id: 2, name: "2-kurs", name_uz: "2-kurs", name_ru: "2-курс" },
        { id: 3, name: "3-kurs", name_uz: "3-kurs", name_ru: "3-курс" },
        { id: 4, name: "4-kurs", name_uz: "4-kurs", name_ru: "4-курс" },
      ];
    }
  }

  async getDirections() {
    try {
      // Try to get directions from auth API first
      await this.ensureAuthenticated();
      
      const studentsClient = axios.create({
        baseURL: this.authBaseURL,
        timeout: 10000,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      // Try different possible endpoints
      try {
        const response = await studentsClient.get("/directions");
        if (response.data && Array.isArray(response.data)) {
          return response.data;
        }
        if (response.data && response.data.data && Array.isArray(response.data.data)) {
          return response.data.data;
        }
        if (response.data && response.data.directions && Array.isArray(response.data.directions)) {
          return response.data.directions;
        }
        if (response.data && response.data.fields && Array.isArray(response.data.fields)) {
          return response.data.fields;
        }
      } catch (error) {
        // If directions endpoint doesn't exist, return default directions
        console.warn("[API] Directions endpoint not found, using default directions");
      }

      // Return default directions if API doesn't have endpoint
      return [
        { id: 1, name: "Dasturiy injiniring", name_uz: "Dasturiy injiniring", name_ru: "Программная инженерия" },
        { id: 2, name: "Kompyuter injiniringi", name_uz: "Kompyuter injiniringi", name_ru: "Компьютерная инженерия" },
        { id: 3, name: "Bank ishi", name_uz: "Bank ishi", name_ru: "Банковское дело" },
        { id: 4, name: "Moliya va moliyaviy texnologiyalar", name_uz: "Moliya va moliyaviy texnologiyalar", name_ru: "Финансы и финансовые технологии" },
        { id: 5, name: "Logistika", name_uz: "Logistika", name_ru: "Логистика" },
        { id: 6, name: "Iqtisodiyot", name_uz: "Iqtisodiyot", name_ru: "Экономика" },
        { id: 7, name: "Buxgalteriya hisobi", name_uz: "Buxgalteriya hisobi", name_ru: "Бухгалтерский учет" },
        { id: 8, name: "Turizm va mehmondo'stlik", name_uz: "Turizm va mehmondo'stlik", name_ru: "Туризм и гостеприимство" },
        { id: 9, name: "Maktabgacha taʼlim", name_uz: "Maktabgacha taʼlim", name_ru: "Дошкольное образование" },
        { id: 10, name: "Boshlangʻich taʼlim", name_uz: "Boshlangʻich taʼlim", name_ru: "Начальное образование" },
        { id: 11, name: "Maxsus pedagogika", name_uz: "Maxsus pedagogika", name_ru: "Специальная педагогика" },
        { id: 12, name: "O'zbek tili va adabiyoti", name_uz: "O'zbek tili va adabiyoti", name_ru: "Узбекский язык и литература" },
        { id: 13, name: "Xorijiy til va adabiyoti", name_uz: "Xorijiy til va adabiyoti", name_ru: "Иностранный язык и литература" },
        { id: 14, name: "Tarix", name_uz: "Tarix", name_ru: "История" },
        { id: 15, name: "Matematika", name_uz: "Matematika", name_ru: "Математика" },
        { id: 16, name: "Psixologiya", name_uz: "Psixologiya", name_ru: "Психология" },
        { id: 17, name: "Arxitektura", name_uz: "Arxitektura", name_ru: "Архитектура" },
        { id: 18, name: "Ijtimoiy ish", name_uz: "Ijtimoiy ish", name_ru: "Социальная работа" },
      ];
    } catch (error) {
      console.error("[API] Error fetching directions:", error.message);
      // Return default directions on error
      return [
        { id: 1, name: "Dasturiy injiniring", name_uz: "Dasturiy injiniring", name_ru: "Программная инженерия" },
        { id: 2, name: "Kompyuter injiniringi", name_uz: "Kompyuter injiniringi", name_ru: "Компьютерная инженерия" },
        { id: 3, name: "Bank ishi", name_uz: "Bank ishi", name_ru: "Банковское дело" },
        { id: 4, name: "Moliya va moliyaviy texnologiyalar", name_uz: "Moliya va moliyaviy texnologiyalar", name_ru: "Финансы и финансовые технологии" },
        { id: 5, name: "Logistika", name_uz: "Logistika", name_ru: "Логистика" },
        { id: 6, name: "Iqtisodiyot", name_uz: "Iqtisodiyot", name_ru: "Экономика" },
        { id: 7, name: "Buxgalteriya hisobi", name_uz: "Buxgalteriya hisobi", name_ru: "Бухгалтерский учет" },
        { id: 8, name: "Turizm va mehmondo'stlik", name_uz: "Turizm va mehmondo'stlik", name_ru: "Туризм и гостеприимство" },
        { id: 9, name: "Maktabgacha taʼlim", name_uz: "Maktabgacha taʼlim", name_ru: "Дошкольное образование" },
        { id: 10, name: "Boshlangʻich taʼlim", name_uz: "Boshlangʻich taʼlim", name_ru: "Начальное образование" },
        { id: 11, name: "Maxsus pedagogika", name_uz: "Maxsus pedagogika", name_ru: "Специальная педагогика" },
        { id: 12, name: "O'zbek tili va adabiyoti", name_uz: "O'zbek tili va adabiyoti", name_ru: "Узбекский язык и литература" },
        { id: 13, name: "Xorijiy til va adabiyoti", name_uz: "Xorijiy til va adabiyoti", name_ru: "Иностранный язык и литература" },
        { id: 14, name: "Tarix", name_uz: "Tarix", name_ru: "История" },
        { id: 15, name: "Matematika", name_uz: "Matematika", name_ru: "Математика" },
        { id: 16, name: "Psixologiya", name_uz: "Psixologiya", name_ru: "Психология" },
        { id: 17, name: "Arxitektura", name_uz: "Arxitektura", name_ru: "Архитектура" },
        { id: 18, name: "Ijtimoiy ish", name_uz: "Ijtimoiy ish", name_ru: "Социальная работа" },
      ];
    }
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      baseURL: this.baseURL,
      hasToken: !!this.accessToken,
    };
  }
}

module.exports = APIClient;
