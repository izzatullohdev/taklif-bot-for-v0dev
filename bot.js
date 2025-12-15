const TelegramBot = require("node-telegram-bot-api");
const APIClient = require("./api/apiClient");
const LocalStorage = require("./utils/localStorage");
const SyncManager = require("./utils/syncManager");
const ErrorHandler = require("./utils/errorHandler");
const Validator = require("./utils/validator");
const logger = require("./utils/logger");
require("dotenv").config();

// Validate environment variables
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  logger.error("TELEGRAM_BOT_TOKEN is not set in environment variables");
  console.error("❌ ERROR: TELEGRAM_BOT_TOKEN is required!");
  console.error("Please set TELEGRAM_BOT_TOKEN in your .env file");
  process.exit(1);
}

// Admin chat IDs from environment variable (comma-separated)
const ADMIN_CHAT_IDS = process.env.ADMIN_CHAT_IDS
  ? process.env.ADMIN_CHAT_IDS.split(",").map((id) => id.trim())
  : [];

if (ADMIN_CHAT_IDS.length === 0) {
  logger.warn("No ADMIN_CHAT_IDS set - admin commands will be disabled");
}

const bot = new TelegramBot(token, { polling: true });

// Rate limiting for scalability (10000 users)
const rateLimiter = new Map();
const RATE_LIMIT = {
  messages: 10, // 10 messages per window
  window: 60000, // 1 minute window
  commands: 30, // 30 commands per window
};

function checkRateLimit(chatId, type = "messages") {
  const key = `${chatId}_${type}`;
  const now = Date.now();
  const limit = type === "commands" ? RATE_LIMIT.commands : RATE_LIMIT.messages;
  const window = RATE_LIMIT.window;

  if (!rateLimiter.has(key)) {
    rateLimiter.set(key, { count: 1, resetTime: now + window });
    return true;
  }

  const record = rateLimiter.get(key);
  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + window;
    return true;
  }

  if (record.count >= limit) {
    return false;
  }

  record.count++;
  return true;
}

// Clean up old rate limit records periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimiter.entries()) {
    if (now > record.resetTime) {
      rateLimiter.delete(key);
    }
  }
}, 300000); // Clean every 5 minutes

// Memory management for userStates (limit to prevent memory leaks)
const MAX_USER_STATES = 10000;
function cleanupUserStates() {
  if (userStates.size > MAX_USER_STATES) {
    // Remove oldest states (FIFO)
    const entries = Array.from(userStates.entries());
    const toRemove = entries.slice(0, entries.length - MAX_USER_STATES);
    toRemove.forEach(([chatId]) => {
      userStates.delete(chatId);
    });
    logger.warn(`Cleaned up ${toRemove.length} old user states`);
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupUserStates, 600000);

// Initialize API client and local storage
const API_BASE_URL =
  process.env.API_BASE_URL || "https://usat-taklif-backend.onrender.com/api";
const localStorage = new LocalStorage();
const apiClient = new APIClient(API_BASE_URL, localStorage);
const syncManager = new SyncManager(apiClient, localStorage);

let isOfflineMode = false;

// User states for conversation flow
const userStates = new Map();

// State constants
const STATES = {
  IDLE: "idle",
  WAITING_LANGUAGE: "waiting_language",
  WAITING_PASSPORT: "waiting_passport",
  WAITING_MESSAGE_TEXT: "waiting_message_text",
};

// Comprehensive translation system
const TRANSLATIONS = {
  uz: {
    // Language selection
    languageSelection: "🌍 Tilni tanlang",
    languageUzbek: "🇺🇿 O'zbek",
    languageRussian: "🇷🇺 Русский",

    // Welcome messages
    welcome: (name) =>
      `👋 Hurmatli ${name}!\n\n🎓 Fan va texnologiyalar universitetining rasmiy botiga xush kelibsiz! Bu yerda siz o'z taklif va shikoyatlaringizni yuborishingiz mumkin:\n\nQuyidagilardan birini tanlang:`,
    welcomeRegistration:
      "Assalomu alaykum! Ro'yxatdan o'tish uchun ism familiyangizni kiriting:",

    // Main menu
    suggestion: "✏️ Taklif",
    complaint: "⚠️ Shikoyat",
    back: "🔙 Orqaga",
    sendMessageButton: "✉️ Xabar yuborish",
    sendKeyboardHint: "📱 Xabar yuborish uchun tugmani bosing",

    // Registration flow
    enterPassportJSHIR: "🆔 Iltimos, passport JSHIR ingizni kiriting (14 ta raqam):",
    invalidPassportJSHIR: "❌ Passport JSHIR noto'g'ri formatda. Iltimos, 14 ta raqam kiriting:",
    checkingStudent: "🔍 Talaba ma'lumotlari tekshirilmoqda...",
    studentNotFound: "❌ Siz talaba emassiz. Iltimos, to'g'ri JSHIR kiriting yoki ma'muriyatga murojaat qiling.",
    studentFound: "✅ Talaba ma'lumotlari topildi!",
    registrationComplete: "✅ Ro'yxatdan o'tish muvaffaqiyatli yakunlandi!",
    registrationCompleteOffline:
      "✅ Ro'yxatdan o'tish muvaffaqiyatli yakunlandi! (Offline rejim - ma'lumotlar keyinroq sinxronlanadi)",

    // Category options
    categories: {
      sharoit: "🏢 Sharoit",
      qabul: "📝 Qabul",
      dars: "📚 Dars jarayoni",
      teacher: "👨‍🏫 O'qituvchi",
      tutor: "🎓 Tyutor",
      dekanat: "🏛️ Dekanat",
      other: "❓ Boshqa sabab",
    },

    // Category descriptions
    categoryDescriptions: {
      sharoit:
        "Bino, xonalar, jihozlar va infratuzilma bilan bog'liq masalalar",
      qabul: "Qabul jarayoni, hujjatlar va ro'yxatga olish masalalari",
      dars: "Ta'lim sifati, dars jadvali va o'quv jarayoni",
      teacher: "Professor-o'qituvchilar bilan bog'liq masalalar",
      tutor: "Tyutorlar va ularning faoliyati haqida",
      dekanat: "Ma'muriy masalalar va dekanat xizmatlari",
      other: "Yuqoridagi kategoriyalarga kirmaydigan boshqa masalalar",
    },

    // Message types
    messageTypes: {
      suggestion: "taklif",
      complaint: "shikoyat",
    },

    // Form messages
    selectCategory: (type) => `📝 ${type} qaysi mavzuda?`,
    categorySelected: (category) => `✅ Kategoriya: ${category}`,
    enterMessage: (type) => {
      const tCap = type ? type.charAt(0).toUpperCase() + type.slice(1) : "";
      return `📝 ${tCap}ingizni batafsil yozing (kamida 10 ta belgi):`;
    },
    messageTooShort: "❌ Xabar juda qisqa. Kamida 10 ta belgi kiriting:",
    messageTooLong: "❌ Xabar juda uzun. Maksimal 1000 ta belgi:",

    // Success messages
    messageSubmitted: (type) =>
      `✅ ${type}ingiz muvaffaqiyatli yuborildi!\n⏰ Holat: Ko'rib chiqilmoqda\n\nJavob 24-48 soat ichida beriladi.`,
    messageSubmittedOffline: (type) =>
      `✅ ${type}ingiz qabul qilindi! (Offline rejim)\n\n📤 Xabar keyinroq yuboriladi.`,

    // Error messages
    errorOccurred: "❌ Xatolik yuz berdi",
    invalidName:
      "❌ Ism faqat harflardan iborat bo'lishi kerak va kamida 2 ta so'zdan iborat bo'lishi kerak. Qaytadan kiriting:",
    invalidPhone:
      "❌ Telefon raqam noto'g'ri formatda. +998XXXXXXX formatida kiriting:",
    messageError:
      "❌ Xabar yuborishda xatolik yuz berdi. Qaytadan urinib ko'ring.",
    registrationError:
      "❌ Xatolik yuz berdi. Ro'yxatdan o'tish uchun ism familiyangizni kiriting:",
    menuError:
      "❌ Xatolik yuz berdi. /start buyrug'ini bosib qaytadan urinib ko'ring.",
    callbackError:
      "❌ Xatolik yuz berdi. /menu buyrug'ini bosib qaytadan urinib ko'ring.",

    // Commands
    commands: {
      start: "Botni ishga tushirish",
      help: "Yordam",
      status: "Holat",
      admin: "Admin",
      menu: "Menyu",
    },

    // Help text
    helpText: `🤖 Bot buyruqlari:

/start - Botni ishga tushirish
/help - Yordam
/menu - Asosiy menyu

📝 Bot orqali siz:
• Takliflaringizni yuborishingiz
• Shikoyatlaringizni bildirshingiz  
• Turli mavzular bo'yicha murojaat qilishingiz mumkin

Har bir murojaat universitet ma'muriyati tomonidan ko'rib chiqiladi.`,

    // Status text
    statusText: (
      apiStatus,
      userCount,
      messageCount,
      syncStatus,
      isOfflineMode,
      time
    ) => `🔧 Bot Holati:

🌐 API Holati: ${apiStatus.isOnline ? "✅ Online" : "❌ Offline"}
📡 API URL: ${apiStatus.baseURL}
🗂️ Rejim: ${isOfflineMode ? "Offline" : "Online"}

📊 Mahalliy saqlash:
👥 Foydalanuvchilar: ${userCount}
💬 Xabarlar: ${messageCount}

🔄 Sinxronlash: ${syncStatus.isRunning ? "✅ Ishlayapti" : "❌ To'xtatilgan"}

🤖 Bot: Ishlayapti
⏰ Vaqt: ${time}`,

    // Admin text
    adminText: (
      userCount,
      messageCount,
      apiStatus,
      isOfflineMode,
      recentUsers,
      recentMessages
    ) => `👨‍💼 Admin Panel:

📊 Statistika:
• Jami foydalanuvchilar: ${userCount}
• Jami xabarlar: ${messageCount}
• API holati: ${apiStatus.isOnline ? "Online" : "Offline"}
• Bot rejimi: ${isOfflineMode ? "Offline" : "Online"}

📁 So'nggi foydalanuvchilar (oxirgi 5):
${recentUsers}

💬 So'nggi xabarlar (oxirgi 3):
${recentMessages}`,

    // Offline messages
    offlineMode:
      "⚠️ Bot hozirda offline rejimda ishlayapti. Xabarlaringiz keyinroq yuboriladi.",
    offlineModeMenu: "⚠️ Bot hozirda offline rejimda ishlayapti.",

    // Navigation
    nextPage: "⏩ Keyingi sahifa",
    prevPage: "⏪ Oldingi sahifa",

    // General
    pleaseRegister: "Ro'yxatdan o'tish uchun /start buyrug'ini bosing.",
    useMenu:
      "Menyu uchun /start buyrug'ini bosing yoki quyidagi tugmalardan foydalaning.",
    adminOnly: "❌ Bu buyruq faqat administratorlar uchun.",
    noUsers: "Foydalanuvchilar yo'q",
    noMessages: "Xabarlar yo'q",
  },

  ru: {
    // Language selection
    languageSelection: "🌍 Выберите язык",
    languageUzbek: "🇺🇿 O'zbek",
    languageRussian: "🇷🇺 Русский",

    // Welcome messages
    welcome: (name) =>
      `👋 Добро пожаловать, ${name}!\n\n🎓 USAT Университет\nСистема предложений и жалоб\n\nВыберите одно из:`,
    welcomeRegistration:
      "Здравствуйте! Для регистрации введите ваше имя и фамилию:",

    // Main menu
    suggestion: "✏️ Предложение",
    complaint: "⚠️ Жалоба",
    back: "🔙 Назад",
    sendMessageButton: "✉️ Отправить сообщение",
    sendKeyboardHint: "📱 Нажмите кнопку для отправки сообщения",

    // Registration flow
    enterPassportJSHIR: "🆔 Пожалуйста, введите JSHIR вашего паспорта (14 цифр):",
    invalidPassportJSHIR: "❌ Неверный формат JSHIR паспорта. Пожалуйста, введите 14 цифр:",
    checkingStudent: "🔍 Проверка данных студента...",
    studentNotFound: "❌ Вы не являетесь студентом. Пожалуйста, введите правильный JSHIR или обратитесь в администрацию.",
    studentFound: "✅ Данные студента найдены!",
    registrationComplete: "✅ Регистрация успешно завершена!",
    registrationCompleteOffline:
      "✅ Регистрация успешно завершена! (Офлайн режим - данные будут синхронизированы позже)",

    // Category options
    categories: {
      sharoit: "🏢 Условия",
      qabul: "📝 Прием",
      dars: "📚 Учебный процесс",
      teacher: "👨‍🏫 Преподаватель",
      tutor: "🎓 Тьютор",
      dekanat: "🏛️ Деканат",
      other: "❓ Другая причина",
    },

    // Category descriptions
    categoryDescriptions: {
      sharoit:
        "Вопросы, связанные со зданиями, помещениями, оборудованием и инфраструктурой",
      qabul: "Вопросы процесса приема, документов и регистрации",
      dars: "Качество образования, расписание и учебный процесс",
      teacher: "Вопросы, связанные с профессорско-преподавательским составом",
      tutor: "О тьюторах и их деятельности",
      dekanat: "Административные вопросы и услуги деканата",
      other: "Другие вопросы, не входящие в вышеперечисленные категории",
    },

    // Message types
    messageTypes: {
      suggestion: "предложение",
      complaint: "жалоба",
    },

    // Form messages
    selectCategory: (type) => `📝 Выберите категорию ${type}:`,
    categorySelected: (category) => `✅ Категория: ${category}`,
    enterMessage: (type) => {
      const tCap = type ? type.charAt(0).toUpperCase() + type.slice(1) : "";
      return `📝 Подробно опишите ваше ${tCap} (минимум 10 символов):`;
    },
    messageTooShort:
      "❌ Сообщение слишком короткое. Введите минимум 10 символов:",
    messageTooLong: "❌ Сообщение слишком длинное. Максимум 1000 символов:",

    // Success messages
    messageSubmitted: (type) =>
      `✅ Ваше ${type} успешно отправлено!\n⏰ Статус: На рассмотрении\n\nОтвет будет дан в течение 24-48 часов.`,
    messageSubmittedOffline: (type) =>
      `✅ Ваше ${type} принято! (Офлайн режим)\n\n📤 Сообщение будет отправлено позже.`,

    // Error messages
    errorOccurred: "❌ Произошла ошибка",
    invalidName:
      "❌ Имя должно содержать только буквы и состоять минимум из 2 слов. Введите заново:",
    invalidPhone:
      "❌ Неверный формат номера телефона. Введите в формате +998XXXXXXX:",
    messageError: "❌ Ошибка при отправке сообщения. Попробуйте еще раз.",
    registrationError:
      "❌ Произошла ошибка. Для регистрации введите ваше имя и фамилию:",
    menuError: "❌ Произошла ошибка. Нажмите /start и попробуйте еще раз.",
    callbackError: "❌ Произошла ошибка. Нажмите /menu и попробуйте еще раз.",

    // Commands
    commands: {
      start: "Запустить бота",
      help: "Помощь",
      status: "Статус",
      admin: "Админ",
      menu: "Меню",
    },

    // Help text
    helpText: `🤖 Команды бота:

/start - Запустить бота
/help - Помощь
/menu - Главное меню

📝 Через бота вы можете:
• Отправлять предложения
• Подавать жалобы
• Обращаться по различным вопросам

Каждое обращение рассматривается администрацией университета.`,

    // Status text
    statusText: (
      apiStatus,
      userCount,
      messageCount,
      syncStatus,
      isOfflineMode,
      time
    ) => `🔧 Статус бота:

🌐 Статус API: ${apiStatus.isOnline ? "✅ Online" : "❌ Offline"}
📡 API URL: ${apiStatus.baseURL}
🗂️ Режим: ${isOfflineMode ? "Offline" : "Online"}

📊 Локальное хранилище:
👥 Пользователи: ${userCount}
💬 Сообщения: ${messageCount}

🔄 Синхронизация: ${syncStatus.isRunning ? "✅ Работает" : "❌ Остановлена"}

🤖 Бот: Работает
⏰ Время: ${time}`,

    // Admin text
    adminText: (
      userCount,
      messageCount,
      apiStatus,
      isOfflineMode,
      recentUsers,
      recentMessages
    ) => `👨‍💼 Админ панель:

📊 Статистика:
• Всего пользователей: ${userCount}
• Всего сообщений: ${messageCount}
• Статус API: ${apiStatus.isOnline ? "Online" : "Offline"}
• Режим бота: ${isOfflineMode ? "Offline" : "Online"}

📁 Последние пользователи (последние 5):
${recentUsers}

💬 Последние сообщения (последние 3):
${recentMessages}`,

    // Offline messages
    offlineMode:
      "⚠️ Бот сейчас работает в офлайн режиме. Ваши сообщения будут отправлены позже.",
    offlineModeMenu: "⚠️ Бот сейчас работает в офлайн режиме.",

    // Navigation
    nextPage: "⏩ Следующая страница",
    prevPage: "⏪ Предыдущая страница",

    // General
    pleaseRegister: "Нажмите /start для регистрации.",
    useMenu: "Нажмите /start для меню или используйте кнопки ниже.",
    adminOnly: "❌ Эта команда только для администраторов.",
    noUsers: "Нет пользователей",
    noMessages: "Нет сообщений",
  },
};

// Language options
const LANGUAGE_OPTIONS = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "🇺🇿 O'zbek", callback_data: "lang_uz" },
        { text: "🇷🇺 Русский", callback_data: "lang_ru" },
      ],
    ],
  },
};

// Helper function to get course options based on language
// Removed getCourseOptions and getDirectionOptions - no longer needed
// Course and direction data now comes from API

// Helper function to get category options based on language
function getCategoryOptions(language = "uz") {
  const t = TRANSLATIONS[language];
  const categories = t.categories;

  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: categories.sharoit, callback_data: "cat_sharoit" }],
        [{ text: categories.qabul, callback_data: "cat_qabul" }],
        [{ text: categories.dars, callback_data: "cat_dars" }],
        [{ text: categories.teacher, callback_data: "cat_teacher" }],
        [{ text: categories.tutor, callback_data: "cat_tutor" }],
        [{ text: categories.dekanat, callback_data: "cat_dekanat" }],
        [{ text: categories.other, callback_data: "cat_other" }],
      ],
    },
  };
}

// Show language selection
function showLanguageSelection(chatId) {
  const message = `🌍 Tilni tanlang / Выберите язык

🇺🇿 O'zbek
🇷🇺 Русский`;

  bot.sendMessage(chatId, message, LANGUAGE_OPTIONS);
  userStates.set(chatId, { state: STATES.WAITING_LANGUAGE });
}

function showMainMenu(chatId, fullName, language = "uz") {
  const t = TRANSLATIONS[language] || TRANSLATIONS.uz;

  const enhancedMainMenu = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: t.suggestion, callback_data: "suggestion" },
          { text: t.complaint, callback_data: "complaint" },
        ],
      ],
    },
  };
  bot.sendMessage(chatId, t.welcome(fullName), enhancedMainMenu);
  // Also show persistent reply keyboard with send button
  try {
    if (t.sendKeyboardHint && t.sendKeyboardHint.trim()) {
      bot.sendMessage(chatId, t.sendKeyboardHint, {
        reply_markup: {
          keyboard: [[{ text: t.sendMessageButton }]],
          resize_keyboard: true,
          one_time_keyboard: false,
          selective: false,
        },
      });
    }
  } catch (error) {
    console.error("Error sending keyboard hint:", error.message);
  }
}

function getCategoryDescription(category, language = "uz") {
  const t = TRANSLATIONS[language] || TRANSLATIONS.uz;
  const descriptions = t.categoryDescriptions;

  // Map category names to translation keys
  const categoryMap = {
    Sharoit: "sharoit",
    Qabul: "qabul",
    "Dars jarayoni": "dars",
    "O'qituvchi": "teacher",
    Tyutor: "tutor",
    Dekanat: "dekanat",
    "Boshqa sabab": "other",
    // Russian mappings
    Условия: "sharoit",
    Прием: "qabul",
    "Учебный процесс": "dars",
    Преподаватель: "teacher",
    Тьютор: "tutor",
    Деканат: "dekanat",
    "Другая причина": "other",
  };

  const key = categoryMap[category];
  return key ? descriptions[key] : "";
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Rate limiting
  if (!checkRateLimit(chatId, "commands")) {
    logger.warn("Rate limit exceeded for /start", { chatId });
    return;
  }

  logger.info("Start command received", {
    chatId,
    username: msg.from?.username,
  });

  try {
    let existingUser = null;

    // Try API first
    try {
      existingUser = await ErrorHandler.retryOperation(
        () => apiClient.checkUserExists(chatId),
        2,
        1000
      );
      isOfflineMode = false;
    } catch (apiError) {
      logger.warn("API unavailable, checking local storage", {
        error: apiError.message,
      });
      existingUser = localStorage.findUser(chatId);
      isOfflineMode = true;
    }

    if (existingUser) {
      logger.info("Existing user found", {
        fullName: existingUser.fullName,
        chatId,
        language: existingUser.language,
      });

      // Update user activity
      if (!isOfflineMode) {
        apiClient.updateUserActivity(chatId);
      } else {
        localStorage.updateUserActivity(chatId);
      }

      // User exists, show main menu with their language
      const userLanguage = existingUser.language || "uz";
      showMainMenu(chatId, existingUser.fullName, userLanguage);
      userStates.set(chatId, {
        state: STATES.IDLE,
        fullName: existingUser.fullName,
        language: userLanguage,
      });

      if (isOfflineMode) {
        const t = TRANSLATIONS[userLanguage] || TRANSLATIONS.uz;
        bot.sendMessage(chatId, t.offlineMode);
      }
    } else {
      logger.info("New user registration started", { chatId });

      // User doesn't exist, start with language selection
      showLanguageSelection(chatId);
    }
  } catch (error) {
    logger.error("Start command error", { error: error.message, chatId });

    const t = TRANSLATIONS.uz; // Default to Uzbek for error messages
    bot.sendMessage(chatId, t.registrationError);
    userStates.set(chatId, { state: STATES.IDLE });
  }
});

// Help command handler
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Rate limiting
  if (!checkRateLimit(chatId, "commands")) {
    return;
  }

  // Try to get user's language preference
  let userLanguage = "uz";
  try {
    const existingUser =
      localStorage.findUser(chatId) ||
      (await apiClient.checkUserExists(chatId).catch(() => null));
    if (existingUser && existingUser.language) {
      userLanguage = existingUser.language;
    }
  } catch (error) {
    // Default to Uzbek if can't determine language
  }

  const t = TRANSLATIONS[userLanguage] || TRANSLATIONS.uz;
  bot.sendMessage(chatId, t.helpText);
});

bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Rate limiting
  if (!checkRateLimit(chatId, "commands")) {
    return;
  }

  // Try to get user's language preference
  let userLanguage = "uz";
  try {
    const existingUser =
      localStorage.findUser(chatId) ||
      (await apiClient.checkUserExists(chatId).catch(() => null));
    if (existingUser && existingUser.language) {
      userLanguage = existingUser.language;
    }
  } catch (error) {
    // Default to Uzbek if can't determine language
  }

  const apiStatus = apiClient.getStatus();
  const userCount = localStorage.readUsers().length;
  const messageCount = localStorage.readMessages().length;
  const syncStatus = syncManager.getStatus();
  const time = new Date().toLocaleString(
    userLanguage === "ru" ? "ru-RU" : "uz-UZ"
  );

  const t = TRANSLATIONS[userLanguage] || TRANSLATIONS.uz;
  const statusText = t.statusText(
    apiStatus,
    userCount,
    messageCount,
    syncStatus,
    isOfflineMode,
    time
  );

  bot.sendMessage(chatId, statusText);
});

bot.onText(/\/admin/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Rate limiting
  if (!checkRateLimit(chatId, "commands")) {
    return;
  }

  // Try to get user's language preference
  let userLanguage = "uz";
  try {
    const existingUser =
      localStorage.findUser(chatId) ||
      (await apiClient.checkUserExists(chatId).catch(() => null));
    if (existingUser && existingUser.language) {
      userLanguage = existingUser.language;
    }
  } catch (error) {
    // Default to Uzbek if can't determine language
  }

  const t = TRANSLATIONS[userLanguage] || TRANSLATIONS.uz;

  // Check admin access from environment variable
  const chatIdStr = String(chatId);
  if (ADMIN_CHAT_IDS.length === 0 || !ADMIN_CHAT_IDS.includes(chatIdStr)) {
    logger.warn("Unauthorized admin access attempt", { chatId: chatIdStr });
    bot.sendMessage(chatId, t.adminOnly);
    return;
  }

  const users = localStorage.readUsers();
  const messages = localStorage.readMessages();
  const apiStatus = apiClient.getStatus();

  const recentUsers =
    users
      .slice(-5)
      .map((user) => `• ${user.fullName} (${user.course})`)
      .join("\n") || t.noUsers;

  const recentMessages =
    messages
      .slice(-3)
      .map((msg) => `• ${msg.ticketType}: ${msg.text.substring(0, 50)}...`)
      .join("\n") || t.noMessages;

  const adminText = t.adminText(
    users.length,
    messages.length,
    apiStatus,
    isOfflineMode,
    recentUsers,
    recentMessages
  );

  bot.sendMessage(chatId, adminText);
});

bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  
  // Rate limiting
  if (!checkRateLimit(chatId, "commands")) {
    return;
  }

  try {
    let existingUser = null;

    // Try API first, then local storage
    try {
      existingUser = await ErrorHandler.retryOperation(
        () => apiClient.checkUserExists(chatId),
        2,
        1000
      );
      isOfflineMode = false;
    } catch (apiError) {
      logger.warn("API unavailable for menu command", {
        error: apiError.message,
      });
      existingUser = localStorage.findUser(chatId);
      isOfflineMode = true;
    }

    if (existingUser) {
      const userLanguage = existingUser.language || "uz";
      showMainMenu(chatId, existingUser.fullName, userLanguage);
      userStates.set(chatId, {
        state: STATES.IDLE,
        fullName: existingUser.fullName,
        language: userLanguage,
      });

      if (isOfflineMode) {
        const t = TRANSLATIONS[userLanguage] || TRANSLATIONS.uz;
        bot.sendMessage(chatId, t.offlineModeMenu);
      }
    } else {
      const t = TRANSLATIONS.uz; // Default to Uzbek for new users
      bot.sendMessage(chatId, t.pleaseRegister);
    }
  } catch (error) {
    logger.error("Menu command error", { error: error.message, chatId });
    const t = TRANSLATIONS.uz; // Default to Uzbek for error messages
    bot.sendMessage(chatId, t.menuError);
  }
});

// Handle text messages for registration flow
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Skip if it's a command
  if (text && text.startsWith("/")) {
    return;
  }

  // Rate limiting for messages
  if (!checkRateLimit(chatId, "messages")) {
    logger.warn("Rate limit exceeded for messages", { chatId });
    const userState = userStates.get(chatId);
    const language = userState?.language || "uz";
    const t = TRANSLATIONS[language] || TRANSLATIONS.uz;
    bot.sendMessage(chatId, "⚠️ Juda ko'p xabar yuborildi. Iltimos, biroz kuting.");
    return;
  }

  const userState = userStates.get(chatId);
  if (!userState) {
    return;
  }

  logger.info(`Processing message in state: ${userState.state}`, {
    chatId,
    text: text?.substring(0, 50),
  });

  try {
    switch (userState.state) {
      case STATES.WAITING_PASSPORT:
        const passportLanguage = userState.language || "uz";
        const passportT = TRANSLATIONS[passportLanguage] || TRANSLATIONS.uz;

        if (!text || text.trim().length === 0) {
          bot.sendMessage(chatId, passportT.enterPassportJSHIR);
          return;
        }

        // Clean and validate passport JSHIR
        const cleanedJSHIR = text.replace(/[\s\-]/g, "");
        if (!Validator.validatePassportJSHIR(cleanedJSHIR)) {
          bot.sendMessage(chatId, passportT.invalidPassportJSHIR);
          return;
        }

        // Show checking message
        const checkingMsg = await bot.sendMessage(chatId, passportT.checkingStudent);

        try {
          logger.info("Checking student by PINFL", {
            chatId,
            pinfl: cleanedJSHIR,
          });

          // Check if student exists by PINFL
          const student = await apiClient.checkStudentByPINFL(cleanedJSHIR);

          logger.info("Student check result", {
            chatId,
            pinfl: cleanedJSHIR,
            found: !!student,
            studentData: student ? {
              id: student.id,
              firstName: student.first_name,
              lastName: student.last_name,
              pinfl: student.pinfl,
            } : null,
          });

          if (!student) {
            // Student not found
            logger.warn("Student not found", {
              chatId,
              pinfl: cleanedJSHIR,
            });
            await bot.editMessageText(passportT.studentNotFound, {
              chat_id: chatId,
              message_id: checkingMsg.message_id,
            });
            // Reset state to allow retry
            userState.state = STATES.WAITING_PASSPORT;
            userStates.set(chatId, userState);
            return;
          }

          // Student found - save student data and complete registration
          userState.passportJSHIR = cleanedJSHIR;
          userState.studentData = student; // To'liq student ma'lumotlarini saqlash

          logger.info("Student found, completing registration", {
            chatId,
            pinfl: cleanedJSHIR,
            studentId: student.id,
            fullName: student.full_name,
            phone: student.phone,
            course: student.group?.course,
            direction: student.group?.field?.title,
          });

          // Complete registration immediately with API data
          // Update checking message to show registration success
          const language = userState.language || "uz";
          const t = TRANSLATIONS[language] || TRANSLATIONS.uz;
          const successMessage = isOfflineMode
            ? t.registrationCompleteOffline
            : t.registrationComplete;
          
          await bot.editMessageText(
            `${passportT.studentFound}\n\n${successMessage}`,
            {
              chat_id: chatId,
              message_id: checkingMsg.message_id,
            }
          );

          // Complete registration and show main menu
          await completeRegistration(chatId, userState);
        } catch (error) {
          logger.error("Error checking student", {
            error: error.message,
            stack: error.stack,
            chatId,
            pinfl: cleanedJSHIR,
          });

          console.error("[BOT] Full error details:", {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            config: error.config?.url,
          });

          // Show error message
          await bot.editMessageText(
            `${passportT.studentNotFound}\n\n⚠️ ${passportT.errorOccurred}`,
            {
              chat_id: chatId,
              message_id: checkingMsg.message_id,
            }
          );

          // Reset state to allow retry
          userState.state = STATES.WAITING_PASSPORT;
          userStates.set(chatId, userState);
        }
        break;

      case STATES.WAITING_MESSAGE_TEXT:
        const messageLanguage = userState.language || "uz";
        const messageT = TRANSLATIONS[messageLanguage] || TRANSLATIONS.uz;

        if (!text || text.trim().length < 10) {
          bot.sendMessage(chatId, messageT.messageTooShort);
          return;
        }

        if (text.length > 1000) {
          bot.sendMessage(chatId, messageT.messageTooLong);
          return;
        }

        await handleMessageSubmission(chatId, userState, text.trim());
        break;

      default:
        const existingUser =
          localStorage.findUser(chatId) ||
          (await apiClient.checkUserExists(chatId).catch(() => null));
        if (existingUser) {
          const userLanguage = existingUser.language || "uz";
          const t = TRANSLATIONS[userLanguage] || TRANSLATIONS.uz;
          bot.sendMessage(chatId, t.useMenu);
          showMainMenu(chatId, existingUser.fullName, userLanguage);
        } else {
          const t = TRANSLATIONS.uz; // Default to Uzbek for new users
          bot.sendMessage(chatId, t.pleaseRegister);
        }
        break;
    }
  } catch (error) {
    logger.error("Message handling error", {
      error: error.message,
      chatId,
      state: userState.state,
    });
    const t = TRANSLATIONS.uz; // Default to Uzbek for error messages
    bot.sendMessage(chatId, t.menuError);
    userStates.delete(chatId);
  }
});

// Handle callback queries (inline button presses)
bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  const messageId = callbackQuery.message.message_id;

  logger.info("Callback query received", { chatId, data });

  // Answer the callback query to remove loading state
  bot.answerCallbackQuery(callbackQuery.id);

  const userState = userStates.get(chatId) || { state: STATES.IDLE };

  try {
    // Handle language selection
    if (data.startsWith("lang_")) {
      const language = data.replace("lang_", "");
      userState.language = language;
      userState.state = STATES.WAITING_PASSPORT;

      const t = TRANSLATIONS[language] || TRANSLATIONS.uz;
      const passportMessage = t.enterPassportJSHIR;

      bot.editMessageText(passportMessage, {
        chat_id: chatId,
        message_id: messageId,
      });

      userStates.set(chatId, userState);
      return;
    }

    // Course and direction selection removed - data comes from API

    // Handle main menu actions
    if (data === "suggestion") {
      userState.ticketType = data; // suggestion
      userState.state = STATES.WAITING_MESSAGE_TEXT;
      userState.category = null; // No category for suggestions
      userState.substatus = null; // No substatus for suggestions

      const language = userState.language || "uz";
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz;
      const translatedType =
        t.messageTypes[userState.ticketType] || userState.ticketType;
      const messageText = t.enterMessage(translatedType);

      bot.editMessageText(messageText, {
        chat_id: chatId,
        message_id: messageId,
      });

      userStates.set(chatId, userState);
      return;
    }

    if (data === "complaint") {
      userState.ticketType = data; // complaint
      userState.state = STATES.WAITING_MESSAGE_TEXT;

      const language = userState.language || "uz";
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz;
      const translatedType =
        t.messageTypes[userState.ticketType] || userState.ticketType;
      const categoryText = t.selectCategory(translatedType);

      bot.editMessageText(categoryText, {
        chat_id: chatId,
        message_id: messageId,
        ...getCategoryOptions(language),
      });

      userStates.set(chatId, userState);
      return;
    }

    // Handle category selection
    if (data.startsWith("cat_")) {
      const language = userState.language || "uz";
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz;
      const categories = t.categories;

      const categoryMap = {
        cat_sharoit: { uz: "Sharoit", ru: "Условия", en: "Conditions" },
        cat_qabul: { uz: "Qabul", ru: "Прием", en: "Admission" },
        cat_dars: {
          uz: "Dars jarayoni",
          ru: "Учебный процесс",
          en: "Learning Process",
        },
        cat_teacher: { uz: "O'qituvchi", ru: "Преподаватель", en: "Teacher" },
        cat_tutor: { uz: "Tyutor", ru: "Тьютор", en: "Tutor" },
        cat_dekanat: { uz: "Dekanat", ru: "Деканат", en: "Dean Office" },
        cat_other: { uz: "Boshqa sabab", ru: "Другая причина", en: "Other" },
      };

      const categoryData = categoryMap[data];
      const category = language === "ru" ? categoryData.ru : categoryData.uz;
      const substatus = categoryData.en;
      const description = getCategoryDescription(category, language);

      userState.category = category;
      userState.substatus = substatus;

      const translatedType =
        t.messageTypes[userState.ticketType] || userState.ticketType;
      const messageText = t.enterMessage(translatedType);

      bot.editMessageText(`${t.categorySelected(category)}\n\n${messageText}`, {
        chat_id: chatId,
        message_id: messageId,
      });

      userStates.set(chatId, userState);
      return;
    }

    // Handle help info
    if (data === "help_info") {
      const language = userState.language || "uz";
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz;
      const helpText = `${t.help}\n\n${t.helpText}\n\n🔄 ${t.useMenu}`;

      bot.editMessageText(helpText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: t.back, callback_data: "back_to_menu" }]],
        },
      });
      return;
    }

    // Handle back to menu
    if (data === "back_to_menu") {
      const existingUser =
        localStorage.findUser(chatId) ||
        (await apiClient.checkUserExists(chatId).catch(() => null));
      if (existingUser) {
        const userLanguage = existingUser.language || "uz";
        const t = TRANSLATIONS[userLanguage] || TRANSLATIONS.uz;
        const welcomeText = t.welcome(existingUser.fullName);

        bot.editMessageText(welcomeText, {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [
                { text: t.suggestion, callback_data: "suggestion" },
                { text: t.complaint, callback_data: "complaint" },
              ],
            ],
          },
        });

        userStates.set(chatId, {
          state: STATES.IDLE,
          fullName: existingUser.fullName,
          language: userLanguage,
        });
      }
      return;
    }
  } catch (error) {
    logger.error("Callback query error", {
      error: error.message,
      chatId,
      data,
    });
    const t = TRANSLATIONS.uz; // Default to Uzbek for error messages
    bot.sendMessage(chatId, t.callbackError);
  }
});

async function handleMessageSubmission(chatId, userState, messageText) {
  try {
    // Generate unique messageId using timestamp + random + chatId to prevent collisions
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${chatId}`;
    const messageId = uniqueId;

    const messageData = {
      messageId: messageId,
      userId: String(chatId),
      chatId: String(chatId),
      timestamp: new Date().toISOString(),
      status: isOfflineMode ? "offline_pending" : "pending",
      ticketType: userState.ticketType, // suggestion or complaint (English for API)
      text: messageText,
      language: userState.language || "uz",
      isactive: false,
      synced: !isOfflineMode,
      substatus:
        userState.ticketType === "suggestion" ? null : userState.substatus, // null for suggestions, category for complaints
    };

    logger.info("Message submission started", {
      chatId,
      ticketType: userState.ticketType,
      isOfflineMode,
    });

    let result = null;
    let savedLocally = false;

    // Try API first if not in offline mode
    if (!isOfflineMode) {
      try {
        result = await ErrorHandler.retryOperation(
          () => apiClient.saveMessage(messageData),
          2,
          2000
        );
        messageData.synced = true;
        messageData.status = "pending";
        logger.info("Message sent to API successfully", { messageId });
      } catch (apiError) {
        logger.warn("API message submission failed, saving locally", {
          error: apiError.message,
          messageId,
        });
        isOfflineMode = true;
        messageData.status = "offline_pending";
        messageData.synced = false;
      }
    }

    // Save locally if offline or API failed
    if (isOfflineMode || !result) {
      try {
        savedLocally = await localStorage.saveMessage(messageData);
        if (savedLocally) {
          logger.info("Message saved locally", { messageId });
        }
      } catch (localError) {
        logger.error("Failed to save message locally", {
          error: localError.message,
          messageId,
        });
      }
    }

    const language = userState.language || "uz";
    const t = TRANSLATIONS[language] || TRANSLATIONS.uz;
    const translatedType =
      t.messageTypes[userState.ticketType] || userState.ticketType;

    // Send appropriate success message
    if (result) {
      const statusMessage = t.messageSubmitted(translatedType);
      bot.sendMessage(chatId, statusMessage);
    } else if (savedLocally) {
      const statusMessage = t.messageSubmittedOffline(translatedType);
      bot.sendMessage(chatId, statusMessage);
    } else {
      bot.sendMessage(chatId, t.messageError);
      return;
    }

    // Return to main menu
    setTimeout(() => {
      showMainMenu(chatId, userState.fullName, userState.language);
      userStates.set(chatId, {
        state: STATES.IDLE,
        fullName: userState.fullName,
        language: userState.language,
      });
    }, 2000);
  } catch (error) {
    logger.error("Message submission error", {
      error: error.message,
      chatId,
      stack: error.stack,
    });
    const language = userState?.language || "uz";
    const t = TRANSLATIONS[language] || TRANSLATIONS.uz;
    bot.sendMessage(chatId, t.messageError);
  }
}

// Removed unused determinePriority function - not used in code

async function completeRegistration(chatId, userState) {
  // API dan kelgan student ma'lumotlarini to'g'ridan-to'g'ri ishlatish
  const studentData = userState.studentData;

  if (!studentData) {
    throw new Error("Student data not found in userState");
  }

  // Ma'lumotlarni to'liq va to'g'ri formatda tayyorlash
  const userData = {
    userId: chatId, // chatId ni userId sifatida
    chatId: chatId,
    fullName: studentData.full_name || "",
    phone: studentData.phone || "",
    course: studentData.group?.course ? `${studentData.group.course}-kurs` : "",
    direction: studentData.group?.field?.title || "",
    language: userState.language || "uz", // Til tanlashdan saqlangan
    lastActivity: new Date(), // ISOString emas, Date object
    synced: false,
  };

  console.log(
    "[v0] User registration data being sent to API:",
    JSON.stringify(userData, null, 2)
  );

  try {
    let result = null;

    // Try API first
    if (!isOfflineMode) {
      try {
        console.log("[v0] Attempting API registration call...");
        result = await ErrorHandler.retryOperation(
          () => apiClient.registerUser(userData),
          2,
          2000
        );
        userData.synced = true; // Mark as synced if API call succeeds
        console.log("[v0] API registration successful:", result);
      } catch (apiError) {
        console.log("[v0] API registration failed:", apiError.message);
        logger.warn("API registration failed, saving locally", {
          error: apiError.message,
        });
        isOfflineMode = true;
      }
    }

    // Fallback to local storage
    if (isOfflineMode || !result) {
      result = localStorage.saveUser(userData);
      logger.info("User saved to local storage", {
        fullName: userData.fullName,
      });
    }

    if (result) {
      const language = userState.language || "uz";
      // Success message already shown in WAITING_PASSPORT case
      // Just show main menu
      showMainMenu(chatId, userData.fullName, language);
      userStates.set(chatId, {
        state: STATES.IDLE,
        fullName: userData.fullName,
        language: language,
      });
    }
  } catch (error) {
    logger.error("Registration error", { error: error.message, chatId });
    const errorInfo = ErrorHandler.handleAPIError(error, "User registration");
    const t = TRANSLATIONS.uz; // Default to Uzbek for error messages
    bot.sendMessage(chatId, `${t.errorOccurred} ${errorInfo.userMessage}`);

    if (errorInfo.errorType !== "DUPLICATE") {
      bot.sendMessage(chatId, t.pleaseRegister);
      userStates.delete(chatId);
    }
  }
}

// Error handling for bot polling
bot.on("polling_error", (error) => {
  logger.error("Polling error", { error: error.message });
});

// Graceful shutdown
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down gracefully...");
  syncManager.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully...");
  syncManager.stop();
  process.exit(0);
});

// Initialize bot
async function initializeBot() {
  logger.info("Initializing bot...");
  logger.info(`API Base URL: ${API_BASE_URL}`);
  logger.info(`Bot Token: ${token ? "Set" : "Missing"}`);

  // Initialize local storage
  logger.info("📁 Local storage initialized");

  // Try to load saved tokens first (bot qayta ishga tushganda)
  const savedTokens = localStorage.readTokens();
  if (savedTokens.access && savedTokens.refresh) {
    apiClient.setTokens(savedTokens.access, savedTokens.refresh);
    logger.info("✅ Loaded saved authentication tokens from storage");
    logger.info(`Token preview: ${savedTokens.access.substring(0, 30)}...`);
    
    // Test token validity by making a simple request
    try {
      await apiClient.ensureAuthenticated();
      logger.info("✅ Token is valid and ready to use");
    } catch (error) {
      logger.warn("⚠️ Saved token may be invalid, will refresh if needed");
    }
  } else {
    // Perform login if no tokens are saved (only once at startup)
    try {
      logger.info("🔐 No saved tokens found, performing initial login...");
      const tokens = await apiClient.login("admin", "admin123");
      if (tokens.access && tokens.refresh) {
        logger.info("✅ Initial login successful, tokens saved to storage");
        logger.info("✅ Bot is ready to use API with authentication");
      }
    } catch (loginError) {
      logger.error("❌ Initial login failed:", loginError.message);
      logger.warn("Bot will continue, but API calls may fail");
    }
  }

  const isHealthy = await apiClient.healthCheck();
  if (!isHealthy) {
    logger.warn("⚠️ API health check failed - bot will run in offline mode");
    logger.warn("Please check if the API server is running and accessible");
    isOfflineMode = true;
  } else {
    logger.info("✅ API health check passed - online mode");
    isOfflineMode = false;

    // Start sync manager if API is available
    syncManager.start(5); // Sync every 5 minutes
  }

  logger.info("🤖 Bot started successfully!");
  logger.info(`Mode: ${isOfflineMode ? "Offline" : "Online"}`);
}

initializeBot();
