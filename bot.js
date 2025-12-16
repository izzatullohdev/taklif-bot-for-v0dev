const TelegramBot = require("node-telegram-bot-api")
const APIClient = require("./api/apiClient")
const ErrorHandler = require("./utils/errorHandler")
const Validator = require("./utils/validator")
const MemoryManager = require("./utils/memoryManager")
const logger = require("./utils/logger")
const fs = require("fs")
const path = require("path")
require("dotenv").config()

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  logger.error("TELEGRAM_BOT_TOKEN is required! Please set it in your .env file")
  process.exit(1)
}

// Production optimizations for bot
const botOptions = {
  polling: {
    interval: 300,
    autoStart: true,
    params: {
      timeout: 10
    }
  }
}

const bot = new TelegramBot(token, botOptions)

const API_BASE_URL = process.env.API_BASE_URL || "https://taklifback.djangoacademy.uz/"
const apiClient = new APIClient(API_BASE_URL)

// Token management functions
const TOKENS_FILE = path.join(__dirname, "data", "tokens.json")

function saveTokens(accessToken, refreshToken) {
  try {
    const tokensDir = path.dirname(TOKENS_FILE)
    if (!fs.existsSync(tokensDir)) {
      fs.mkdirSync(tokensDir, { recursive: true })
    }
    
    const tokensData = {
      access: accessToken,
      refresh: refreshToken,
      updatedAt: new Date().toISOString()
    }
    
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokensData, null, 2))
    logger.debug("[TOKENS] Tokens saved", { file: TOKENS_FILE })
    return true
  } catch (error) {
    logger.error("[TOKENS] Error saving tokens", error)
    return false
  }
}

function readTokens() {
  try {
    if (!fs.existsSync(TOKENS_FILE)) {
      return { access: null, refresh: null }
    }
    
    const tokensData = JSON.parse(fs.readFileSync(TOKENS_FILE, "utf8"))
    return {
      access: tokensData.access || null,
      refresh: tokensData.refresh || null
    }
  } catch (error) {
    logger.error("[TOKENS] Error reading tokens", error)
    return { access: null, refresh: null }
  }
}

// Set token callbacks for API client
apiClient.onTokensReceived = (accessToken, refreshToken) => {
  saveTokens(accessToken, refreshToken)
}

apiClient.readTokensCallback = readTokens



const userStates = new Map()

// Cache for courses and directions from API
let coursesCache = null
let directionsCache = null
let coursesCacheTime = null
let directionsCacheTime = null
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour

const STATES = {
  IDLE: "idle",
  WAITING_LANGUAGE: "waiting_language",
  WAITING_PASSPORT_JSHIR: "waiting_passport_jshir",
  WAITING_PHONE: "waiting_phone",
  WAITING_COURSE: "waiting_course",
  WAITING_DIRECTION: "waiting_direction",
  WAITING_MESSAGE_TEXT: "waiting_message_text",
}

const TRANSLATIONS = {
  uz: {
    languageSelection: "🌍 Tilni tanlang",
    languageUzbek: "🇺🇿 O'zbek",
    languageRussian: "🇷🇺 Русский",
    
    welcome: (name) => `👋 Hurmatli ${name}!

🎓 Fan va texnologiyalar universitetining rasmiy botiga xush kelibsiz! Bu yerda siz o'z taklif va shikoyatlaringizni yuborishingiz mumkin:

Quyidagilardan birini tanlang:`,
    welcomeRegistration: "Assalomu alaykum! Ro'yxatdan o'tish uchun PASSPORT JSHIR raqamingizni kiriting:",
    checkingStudent: "🔍 Talaba ma'lumotlari tekshirilmoqda...",
    
    suggestion: "✏️ Taklif",
    complaint: "⚠️ Shikoyat",
    back: "🔙 Orqaga",
    sendMessageButton: "✉️ Xabar yuborish",
    
    enterPassportJSHIR: "📝 PASSPORT JSHIR raqamingizni kiriting (14 ta raqam):",
    enterPhone: "📱 Telefon raqamingizni kiriting (+998XXXXXXX formatida):",
    registrationCompleting: "🎉 Ro'yxatdan o'tish yakunlanmoqda...",
    registrationComplete: "✅ Ro'yxatdan o'tish muvaffaqiyatli yakunlandi!\nQuyidagi \"✉️Xabar yuborish\" tugmasi orqali xabaringizni yuborishingiz mumkin!",
    
    
    categories: {
      sharoit: "🏢 Sharoit",
      qabul: "📝 Qabul", 
      dars: "📚 Dars jarayoni",
      teacher: "👨‍🏫 O'qituvchi",
      tutor: "🎓 Tyutor",
      dekanat: "🏛️ Dekanat",
      other: "❓ Boshqa sabab"
    },
    
    categoryDescriptions: {
      sharoit: "Bino, xonalar, jihozlar va infratuzilma bilan bog'liq masalalar",
      qabul: "Qabul jarayoni, hujjatlar va ro'yxatga olish masalalari",
      dars: "Ta'lim sifati, dars jadvali va o'quv jarayoni",
      teacher: "Professor-o'qituvchilar bilan bog'liq masalalar",
      tutor: "Tyutorlar va ularning faoliyati haqida",
      dekanat: "Ma'muriy masalalar va dekanat xizmatlari",
      other: "Yuqoridagi kategoriyalarga kirmaydigan boshqa masalalar"
    },
    
    messageTypes: {
      suggestion: "taklif",
      complaint: "shikoyat"
    },
    
    selectCategory: (type) => `📝 ${type} qaysi mavzuda?`,
    enterMessage: (type) => {
      const tCap = type ? type.charAt(0).toUpperCase() + type.slice(1) : "";
      return `📝 ${tCap}ingizni batafsil yozing (kamida 10 ta belgi):`;
    },
    messageTooShort: "❌ Xabar juda qisqa. Kamida 10 ta belgi kiriting:",
    messageTooLong: "❌ Xabar juda uzun. Maksimal 1000 ta belgi:",
    
    messageSubmitted: (type) => `✅ ${type}ingiz muvaffaqiyatli yuborildi!\n⏰ Holat: Ko'rib chiqilmoqda\n\nJavob 24-48 soat ichida beriladi.`,
    
    errorOccurred: "❌ Xatolik yuz berdi",
    invalidPassportJSHIR: "❌ PASSPORT JSHIR noto'g'ri formatda. 14 ta raqamdan iborat bo'lishi kerak. Qaytadan kiriting:",
    invalidPhone: "❌ Telefon raqam noto'g'ri formatda. +998XXXXXXX formatida kiriting:",
    messageError: "❌ Xabar yuborishda xatolik yuz berdi. Qaytadan urinib ko'ring.",
    registrationError: "❌ Xatolik yuz berdi. Ro'yxatdan o'tish uchun PASSPORT JSHIR raqamingizni kiriting:",
    menuError: "❌ Xatolik yuz berdi. /start buyrug'ini bosib qaytadan urinib ko'ring.",
    callbackError: "❌ Xatolik yuz berdi. /menu buyrug'ini bosib qaytadan urinib ko'ring.",
    
    commands: {
      start: "Botni ishga tushirish",
      help: "Yordam",
      status: "Holat",
      admin: "Admin",
      menu: "Menyu"
    },
    
    helpText: `🤖 Bot buyruqlari:

/start - Botni ishga tushirish
/help - Yordam
/menu - Asosiy menyu

📝 Bot orqali siz:
• Takliflaringizni yuborishingiz
• Shikoyatlaringizni bildirshingiz  
• Turli mavzular bo'yicha murojaat qilishingiz mumkin

Har bir murojaat universitet ma'muriyati tomonidan ko'rib chiqiladi.`,
    
    nextPage: "⏩ Keyingi sahifa",
    prevPage: "⏪ Oldingi sahifa",
    
    pleaseRegister: "Ro'yxatdan o'tish uchun /start buyrug'ini bosing.",
    adminOnly: "❌ Bu buyruq faqat administratorlar uchun.",
    noUsers: "Foydalanuvchilar yo'q",
    noMessages: "Xabarlar yo'q"
  },
  
  ru: {
    languageSelection: "🌍 Выберите язык",
    languageUzbek: "🇺🇿 O'zbek",
    languageRussian: "🇷🇺 Русский",
    
    welcome: (name) => `👋 Добро пожаловать, ${name}!

🎓 Добро пожаловать в официальный бот Университета науки и технологий! Здесь вы можете отправлять свои предложения и жалобы:

Выберите одно из:`,
    welcomeRegistration: "Здравствуйте! Для регистрации введите номер PASSPORT JSHIR:",
    checkingStudent: "🔍 Проверка данных студента...",
    
    suggestion: "✏️ Предложение",
    complaint: "⚠️ Жалоба",
    back: "🔙 Назад",
    sendMessageButton: "✉️ Отправить сообщение",
    
    enterPassportJSHIR: "📝 Введите номер PASSPORT JSHIR (14 цифр):",
    enterPhone: "📱 Введите номер телефона (+998XXXXXXX формат):",
    registrationCompleting: "🎉 Регистрация завершается...",
    registrationComplete: "✅ Регистрация успешно завершена!\nВы можете отправить свое сообщение через кнопку \"✉️Отправить сообщение\" ниже!",
    
    
    categories: {
      sharoit: "🏢 Условия",
      qabul: "📝 Прием",
      dars: "📚 Учебный процесс",
      teacher: "👨‍🏫 Преподаватель",
      tutor: "🎓 Тьютор",
      dekanat: "🏛️ Деканат",
      other: "❓ Другая причина"
    },
    
    categoryDescriptions: {
      sharoit: "Вопросы, связанные со зданиями, помещениями, оборудованием и инфраструктурой",
      qabul: "Вопросы процесса приема, документов и регистрации",
      dars: "Качество образования, расписание и учебный процесс",
      teacher: "Вопросы, связанные с профессорско-преподавательским составом",
      tutor: "О тьюторах и их деятельности",
      dekanat: "Административные вопросы и услуги деканата",
      other: "Другие вопросы, не входящие в вышеперечисленные категории"
    },
    
    messageTypes: {
      suggestion: "предложение",
      complaint: "жалоба"
    },
    
    selectCategory: (type) => `📝 Выберите категорию ${type}:`,
    enterMessage: (type) => {
      const tCap = type ? type.charAt(0).toUpperCase() + type.slice(1) : "";
      return `📝 Подробно опишите ваше ${tCap} (минимум 10 символов):`;
    },
    messageTooShort: "❌ Сообщение слишком короткое. Введите минимум 10 символов:",
    messageTooLong: "❌ Сообщение слишком длинное. Максимум 1000 символов:",
    
    messageSubmitted: (type) => `✅ Ваше ${type} успешно отправлено!\n⏰ Статус: На рассмотрении\n\nОтвет будет дан в течение 24-48 часов.`,
    
    errorOccurred: "❌ Произошла ошибка",
    invalidPassportJSHIR: "❌ Неверный формат PASSPORT JSHIR. Должно быть 14 цифр. Введите заново:",
    invalidPhone: "❌ Неверный формат номера телефона. Введите в формате +998XXXXXXX:",
    messageError: "❌ Ошибка при отправке сообщения. Попробуйте еще раз.",
    registrationError: "❌ Произошла ошибка. Для регистрации введите номер PASSPORT JSHIR:",
    menuError: "❌ Произошла ошибка. Нажмите /start и попробуйте еще раз.",
    callbackError: "❌ Произошла ошибка. Нажмите /menu и попробуйте еще раз.",
    
    commands: {
      start: "Запустить бота",
      help: "Помощь",
      status: "Статус",
      admin: "Админ",
      menu: "Меню"
    },
    
    helpText: `🤖 Команды бота:

/start - Запустить бота
/help - Помощь
/menu - Главное меню

📝 Через бота вы можете:
• Отправлять предложения
• Подавать жалобы
• Обращаться по различным вопросам

Каждое обращение рассматривается администрацией университета.`,
    
    statusText: (apiStatus, userCount, messageCount, syncStatus, isOfflineMode, time) => `🔧 Статус бота:

🌐 Статус API: ${apiStatus.isOnline ? "✅ Online" : "❌ Offline"}
📡 API URL: ${apiStatus.baseURL}
🗂️ Режим: ${isOfflineMode ? "Offline" : "Online"}

📊 Локальное хранилище:
👥 Пользователи: ${userCount}
💬 Сообщения: ${messageCount}

🔄 Синхронизация: ${syncStatus.isRunning ? "✅ Работает" : "❌ Остановлена"}

🤖 Бот: Работает
⏰ Время: ${time}`,
    
    adminText: (userCount, messageCount, apiStatus, isOfflineMode, recentUsers, recentMessages) => `👨‍💼 Админ панель:

📊 Статистика:
• Всего пользователей: ${userCount}
• Всего сообщений: ${messageCount}
• Статус API: ${apiStatus.isOnline ? "Online" : "Offline"}
• Режим бота: ${isOfflineMode ? "Offline" : "Online"}

📁 Последние пользователи (последние 5):
${recentUsers}

💬 Последние сообщения (последние 3):
${recentMessages}`,
    
    nextPage: "⏩ Следующая страница",
    prevPage: "⏪ Предыдущая страница",
    
    pleaseRegister: "Нажмите /start для регистрации.",
    adminOnly: "❌ Эта команда только для администраторов.",
    noUsers: "Нет пользователей",
    noMessages: "Нет сообщений"
  }
}

const LANGUAGE_OPTIONS = {
  reply_markup: {
    inline_keyboard: [
      [
        { text: "🇺🇿 O'zbek", callback_data: "lang_uz" },
        { text: "🇷🇺 Русский", callback_data: "lang_ru" },
      ],
    ],
  },
}

async function getCourseOptions(language = "uz") {
  try {
    // Check cache first
    const now = Date.now()
    if (!coursesCache || !coursesCacheTime || (now - coursesCacheTime) > CACHE_DURATION) {
      coursesCache = await apiClient.getCourses()
      coursesCacheTime = now
    }

    const t = TRANSLATIONS[language]
    
    // Build keyboard from API data, but use TRANSLATIONS for display text
    const keyboard = []
    for (let i = 0; i < coursesCache.length; i += 2) {
      const row = []
      if (coursesCache[i]) {
        // Use API course names
        const courseText = language === "ru" ? (coursesCache[i].name_ru || coursesCache[i].name) : (coursesCache[i].name_uz || coursesCache[i].name)
        row.push({ text: courseText, callback_data: `course_${coursesCache[i].id}` })
      }
      if (coursesCache[i + 1]) {
        const courseText = language === "ru" ? (coursesCache[i + 1].name_ru || coursesCache[i + 1].name) : (coursesCache[i + 1].name_uz || coursesCache[i + 1].name)
        row.push({ text: courseText, callback_data: `course_${coursesCache[i + 1].id}` })
      }
      if (row.length > 0) {
        keyboard.push(row)
      }
    }

    return {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    }
  } catch (error) {
    logger.error("Error getting courses from API", error)
    // Return empty keyboard if API fails
    return {
      reply_markup: {
        inline_keyboard: [],
      },
    }
  }
}

// Mapping API direction names to direction keys (for backward compatibility)
function mapDirectionToKey(directionName) {
  if (!directionName) return null
  
  // Create a simple key from direction name (lowercase, replace spaces with underscores)
  const key = directionName.toLowerCase().trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
  
  return key
}

async function getDirectionOptions(language = "uz", page = 1) {
  try {
    // Check cache first
    const now = Date.now()
    if (!directionsCache || !directionsCacheTime || (now - directionsCacheTime) > CACHE_DURATION) {
      directionsCache = await apiClient.getDirections()
      directionsCacheTime = now
    }

    const t = TRANSLATIONS[language]
    
    // Map API directions - use API names directly
    const mappedDirections = directionsCache.map((dir) => {
      const dirName = language === "ru" ? (dir.name_ru || dir.name) : (dir.name_uz || dir.name)
      const key = mapDirectionToKey(dirName) || mapDirectionToKey(dir.name) || null
      return {
        id: dir.id,
        key: key,
        name: dirName, // Use API name directly
        originalName: dirName
      }
    })

    const itemsPerPage = 6
    const startIndex = (page - 1) * itemsPerPage
    const endIndex = startIndex + itemsPerPage
    const pageDirections = mappedDirections.slice(startIndex, endIndex)
    const totalPages = Math.ceil(mappedDirections.length / itemsPerPage)

    const keyboard = []
    pageDirections.forEach((direction) => {
      // Use TRANSLATIONS key if available, otherwise use API name
      const callbackData = direction.key ? `dir_${direction.key}` : `dir_${direction.id}`
      keyboard.push([{ text: direction.name, callback_data: callbackData }])
    })

    // Add navigation buttons
    const navRow = []
    if (page > 1) {
      navRow.push({ text: t.prevPage, callback_data: `dir_page_${page - 1}` })
    }
    if (page < totalPages) {
      navRow.push({ text: t.nextPage, callback_data: `dir_page_${page + 1}` })
    }
    if (navRow.length > 0) {
      keyboard.push(navRow)
    }

    return {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    }
  } catch (error) {
    logger.error("Error getting directions from API", error)
    // Return empty keyboard if API fails
    const t = TRANSLATIONS[language]
    return {
      reply_markup: {
        inline_keyboard: [],
      },
    }
  }
}

function getCategoryOptions(language = "uz") {
  const t = TRANSLATIONS[language]
  const categories = t.categories
  
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
  }
}

function showLanguageSelection(chatId) {
  const message = `🌍 Tilni tanlang / Выберите язык

🇺🇿 O'zbek
🇷🇺 Русский`

  bot.sendMessage(chatId, message, LANGUAGE_OPTIONS)
  userStates.set(chatId, { state: STATES.WAITING_LANGUAGE })
}

function showMainMenu(chatId, fullName, language = "uz") {
  const t = TRANSLATIONS[language] || TRANSLATIONS.uz
  
  const enhancedMainMenu = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: t.suggestion, callback_data: "suggestion" },
          { text: t.complaint, callback_data: "complaint" },
        ],
      ],
    },
  }
  
  // Send the main menu while preserving the persistent keyboard
  bot.sendMessage(chatId, t.welcome(fullName), enhancedMainMenu)
}

function getCategoryDescription(category, language = "uz") {
  const t = TRANSLATIONS[language] || TRANSLATIONS.uz
  const descriptions = t.categoryDescriptions
  
  const categoryMap = {
    "Sharoit": "sharoit",
    "Qabul": "qabul", 
    "Dars jarayoni": "dars",
    "O'qituvchi": "teacher",
    "Tyutor": "tutor",
    "Dekanat": "dekanat",
    "Boshqa sabab": "other",
    "Условия": "sharoit",
    "Прием": "qabul",
    "Учебный процесс": "dars", 
    "Преподаватель": "teacher",
    "Тьютор": "tutor",
    "Деканат": "dekanat",
    "Другая причина": "other"
  }
  
  const key = categoryMap[category]
  return key ? descriptions[key] : ""
}

function getCategorySpecificMessage(categoryData, language = "uz") {
  const messages = {
    uz: {
      cat_sharoit: "🏢 Shikoyatingiz bino, xonalar, jihozlar va infratuzilma bilan bog'liq bo'lsa, u haqda batafsil yozing (kamida 10 ta belgi):",
      
      cat_qabul: "📝 Shikoyatingiz qabul jarayoni, hujjatlar va ro'yxatga olish bilan bog'liq bo'lsa, u haqda batafsil yozing (kamida 10 ta belgi):",
      
      cat_dars: "📚 Shikoyatingiz ta'lim sifati, dars jadvali va o'quv jarayoni bilan bog'liq bo'lsa, u haqda batafsil yozing. Bunda o'qituvchi ismi familiyasi, xona raqami, dars vaqti haqida tafsilotlarni yozishni unutmang (kamida 10 ta belgi):",
      
      cat_teacher: "👨‍🏫 Shikoyatingiz professor-o'qituvchilar bilan bog'liq bo'lsa, u haqda batafsil yozing. Bunda o'qituvchi ismi familiyasini ham yozishni unutmang (kamida 10 ta belgi):",
      
      cat_tutor: "🎓 Shikoyatingiz tyutorlar va ularning faoliyati bilan bog'liq bo'lsa, u haqda batafsil yozing. Bunda iloji bo'sa tyutorning ism familiyasini yozishni unutmang (kamida 10 ta belgi):",
      
      cat_dekanat: "🏛️ Shikoyatingiz ma'muriy masalalar, kafedra yoki dekanat xizmatlari bilan bog'liq bo'lsa, u haqda batafsil yozing (kamida 10 ta belgi):",
      
      cat_other: "❓ Shikoyatingiz haqida batafsil yozing. Masalani o'rganib chiqish uchun kerakli bo'lishi mumkin bo'lgan barcha tafsilotlarni ham yozishni unutmang (kamida 10 ta belgi):"
    },
    
    ru: {
      cat_sharoit: "🏢 Если ваша жалоба связана со зданиями, помещениями, оборудованием и инфраструктурой, подробно опишите её (минимум 10 символов):",
      
      cat_qabul: "📝 Если ваша жалоба связана с процессом приема, документами и регистрацией, подробно опишите её (минимум 10 символов):",
      
      cat_dars: "📚 Если ваша жалоба связана с качеством образования, расписанием и учебным процессом, подробно опишите её. Не забудьте указать имя и фамилию преподавателя, номер аудитории, время занятий (минимум 10 символов):",
      
      cat_teacher: "👨‍🏫 Если ваша жалоба связана с профессорско-преподавательским составом, подробно опишите её. Не забудьте указать имя и фамилию преподавателя (минимум 10 символов):",
      
      cat_tutor: "🎓 Если ваша жалоба связана с тьюторами и их деятельностью, подробно опишите её. По возможности укажите имя и фамилию тьютора (минимум 10 символов):",
      
      cat_dekanat: "🏛️ Если ваша жалоба связана с административными вопросами, кафедрой или услугами деканата, подробно опишите её (минимум 10 символов):",
      
      cat_other: "❓ Подробно опишите вашу жалобу. Не забудьте указать все детали, которые могут потребоваться для рассмотрения вопроса (минимум 10 символов):"
    }
  }
  
  const langMessages = messages[language] || messages.uz
  return langMessages[categoryData] || langMessages.cat_other
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id

  try {
    let existingUser = null

    try {
      existingUser = await ErrorHandler.retryOperation(() => apiClient.checkUserExists(chatId), 2, 1000)
    } catch (apiError) {
      showLanguageSelection(chatId)
      return
    }

    if (existingUser) {
      apiClient.updateUserActivity(chatId).catch(err => logger.debug("Activity update failed", err))

      const userLanguage = existingUser.language || "uz"
      // Ensure fullName is not passportJshir or chatId
      const displayName = existingUser.fullName && 
                         existingUser.fullName !== existingUser.passportJshir && 
                         existingUser.fullName !== String(chatId)
        ? existingUser.fullName 
        : (existingUser.fullName || "User")
      showMainMenu(chatId, displayName, userLanguage)
      userStates.set(chatId, { 
        state: STATES.IDLE, 
        fullName: displayName, 
        language: userLanguage,
        lastActivity: Date.now()
      })
      MemoryManager.updateActivity(userStates, chatId)
    } else {
      showLanguageSelection(chatId)
    }
  } catch (error) {
    const t = TRANSLATIONS.uz 
    bot.sendMessage(chatId, t.registrationError)
    userStates.set(chatId, { state: STATES.WAITING_PASSPORT_JSHIR })
  }
})

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id
  
  let userLanguage = "uz"
  try {
    const existingUser = await apiClient.checkUserExists(chatId).catch(() => null)
    if (existingUser && existingUser.language) {
      userLanguage = existingUser.language
    }
  } catch (error) {
  }
  
  const t = TRANSLATIONS[userLanguage] || TRANSLATIONS.uz
  bot.sendMessage(chatId, t.helpText)
})

bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id

  try {
    const existingUser = await apiClient.checkUserExists(chatId).catch(() => null)

    if (existingUser) {
      const userLanguage = existingUser.language || "uz"
      // Ensure fullName is not passportJshir or chatId
      const displayName = existingUser.fullName && 
                         existingUser.fullName !== existingUser.passportJshir && 
                         existingUser.fullName !== String(chatId)
        ? existingUser.fullName 
        : (existingUser.fullName || "User")
      showMainMenu(chatId, displayName, userLanguage)
      userStates.set(chatId, { state: STATES.IDLE, fullName: displayName, language: userLanguage })
    } else {
      const t = TRANSLATIONS.uz 
      bot.sendMessage(chatId, t.pleaseRegister)
    }
  } catch (error) {
    const t = TRANSLATIONS.uz 
    bot.sendMessage(chatId, t.menuError)
  }
})



bot.on("message", async (msg) => {
  const chatId = msg.chat.id
  const text = msg.text

  if (text && text.startsWith("/")) {
    return
  }

  // Check if user pressed the persistent "✉️Xabar yuborish" button
  if (text && (text === "✉️Xabar yuborish" || text === "✉️Отправить сообщение")) {
    try {
      const existingUser = await apiClient.checkUserExists(chatId).catch(() => null)
      if (existingUser) {
        const userLanguage = existingUser.language || "uz"
        // Ensure fullName is not passportJshir or chatId
        const displayName = existingUser.fullName && 
                           existingUser.fullName !== existingUser.passportJshir && 
                           existingUser.fullName !== String(chatId)
          ? existingUser.fullName 
          : (existingUser.fullName || "User")
        showMainMenu(chatId, displayName, userLanguage)
        userStates.set(chatId, { state: STATES.IDLE, fullName: displayName, language: userLanguage })
      } else {
        const t = TRANSLATIONS.uz
        bot.sendMessage(chatId, t.pleaseRegister)
      }
    } catch (error) {
      const t = TRANSLATIONS.uz
      bot.sendMessage(chatId, t.menuError)
    }
    return
  }

  const userState = userStates.get(chatId)
  if (!userState) {
    return
  }



  try {
    switch (userState.state) {
      case STATES.WAITING_PASSPORT_JSHIR:
        const jshirLanguage = userState.language || "uz"
        const jshirT = TRANSLATIONS[jshirLanguage] || TRANSLATIONS.uz
        
        if (!text || text.trim().length === 0) {
          bot.sendMessage(chatId, jshirT.enterPassportJSHIR)
          return
        }

        if (!Validator.validatePassportJSHIR(text)) {
          bot.sendMessage(chatId, jshirT.invalidPassportJSHIR)
          return
        }

        const pinfl = text.trim().replace(/[\s\-]/g, "")
        userState.passportJshir = pinfl

        // Check student by PINFL in backend
        try {
          bot.sendMessage(chatId, jshirT.checkingStudent || "🔍 Talaba ma'lumotlari tekshirilmoqda...")
          
          const student = await apiClient.checkStudentByPINFL(pinfl)
          
          if (student && student.full_name) {
            // Student found - extract information from API response
            userState.fullName = student.full_name
            userState.phone = student.phone || null
            
            // Send welcome message with full name
            const welcomeMsg = `👋 Hush kelibsiz, ${student.full_name}!`
            bot.sendMessage(chatId, welcomeMsg)
            
            // Get course from group.course (1, 2, 3, 4)
            if (student.group && student.group.course) {
              const courseNumber = student.group.course
              // Get course name from API cache
              if (coursesCache) {
                const courseData = coursesCache.find(c => c.id === courseNumber)
                if (courseData) {
                  const courseText = jshirLanguage === "ru" ? (courseData.name_ru || courseData.name) : (courseData.name_uz || courseData.name)
                  userState.course = courseText
                  userState.courseId = courseNumber
                } else {
                  // Fallback to simple format
                  userState.course = `${courseNumber}-kurs`
                  userState.courseId = courseNumber
                }
              } else {
                // Fallback to simple format
                userState.course = `${courseNumber}-kurs`
                userState.courseId = courseNumber
              }
            }
            
            // Get direction from group.field.title
            if (student.group && student.group.field && student.group.field.title) {
              const fieldTitle = student.group.field.title
              // Use field title directly from API
              userState.direction = fieldTitle
              
              // Try to map to direction key for compatibility
              const directionKey = mapDirectionToKey(fieldTitle)
              if (directionKey) {
                userState.directionKey = directionKey
              }
            }
            
            // Get group title
            if (student.group && student.group.title) {
              userState.group = student.group.title
            }
            
            logger.debug("[BOT] Student data extracted", {
              fullName: userState.fullName,
              phone: userState.phone,
              course: userState.course,
              direction: userState.direction,
              group: userState.group
            })
            
            // If phone is available, proceed to registration
            if (userState.phone) {
              // All data available, proceed to registration
              userState.state = STATES.IDLE
              await completeRegistration(chatId, userState)
            } else {
              // Phone is missing, ask for it
              userState.state = STATES.WAITING_PHONE
              bot.sendMessage(chatId, jshirT.enterPhone)
              userStates.set(chatId, userState)
            }
          } else {
            // Student not found, proceed with normal registration
            userState.state = STATES.WAITING_PHONE
            bot.sendMessage(chatId, jshirT.enterPhone)
            userStates.set(chatId, userState)
          }
        } catch (error) {
          logger.error("[BOT] Error checking student", error)
          // If error occurs, proceed with normal registration
          userState.state = STATES.WAITING_PHONE
          bot.sendMessage(chatId, jshirT.enterPhone)
          userStates.set(chatId, userState)
        }
        break

      case STATES.WAITING_PHONE:
        const phoneLanguage = userState.language || "uz"
        const phoneT = TRANSLATIONS[phoneLanguage] || TRANSLATIONS.uz
        
        if (!Validator.validatePhoneNumber(text)) {
          bot.sendMessage(chatId, phoneT.invalidPhone)
          return
        }

        userState.phone = text.trim()
        
        // If course and direction are already set from student data, proceed to registration
        if (userState.course && userState.direction) {
          // All data available from API, proceed to registration
          userState.state = STATES.IDLE
          await completeRegistration(chatId, userState)
        } else if (userState.course && !userState.direction) {
          // Course is set from API, but direction is missing - ask for direction only
          userState.state = STATES.WAITING_DIRECTION
          const directionOptions = await getDirectionOptions(phoneLanguage, 1)
          const directionText = phoneLanguage === "ru" ? "💻 Выберите направление:" : "💻 Yo'nalishni tanlang:"
          bot.sendMessage(chatId, directionText, directionOptions)
          userStates.set(chatId, userState)
        } else if (!userState.course && userState.direction) {
          // Direction is set but course is missing - ask for course
          userState.state = STATES.WAITING_COURSE
          const courseOptions = await getCourseOptions(phoneLanguage)
          const courseText = phoneLanguage === "ru" ? "🎓 Выберите курс:" : "🎓 Kursni tanlang:"
          bot.sendMessage(chatId, courseText, courseOptions)
          userStates.set(chatId, userState)
        } else {
          // If both are missing (student not found or data incomplete), ask for course first
          userState.state = STATES.WAITING_COURSE
          const courseOptions = await getCourseOptions(phoneLanguage)
          const courseText = phoneLanguage === "ru" ? "🎓 Выберите курс:" : "🎓 Kursni tanlang:"
          bot.sendMessage(chatId, courseText, courseOptions)
          userStates.set(chatId, userState)
        }
        break

      case STATES.WAITING_MESSAGE_TEXT:
        const messageLanguage = userState.language || "uz"
        const messageT = TRANSLATIONS[messageLanguage] || TRANSLATIONS.uz

        if (!text || text.trim().length < 10) {
          bot.sendMessage(chatId, messageT.messageTooShort)
          return
        }

        if (text.length > 1000) {
          bot.sendMessage(chatId, messageT.messageTooLong)
          return
        }

        await handleMessageSubmission(chatId, userState, text.trim())
        break

      default:
        const existingUser = await apiClient.checkUserExists(chatId).catch(() => null)
        if (existingUser) {
          const userLanguage = existingUser.language || "uz"
          showMainMenu(chatId, existingUser.fullName, userLanguage)
        } else {
          const t = TRANSLATIONS.uz
          bot.sendMessage(chatId, t.pleaseRegister)
        }
        break
    }
  } catch (error) {
    const t = TRANSLATIONS.uz 
    bot.sendMessage(chatId, t.menuError)
    userStates.delete(chatId)
  }
})


bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id
  const data = callbackQuery.data
  const messageId = callbackQuery.message.message_id



  bot.answerCallbackQuery(callbackQuery.id)

  const userState = userStates.get(chatId) || { state: STATES.IDLE }

  try {
    if (data.startsWith("lang_")) {
      const language = data.replace("lang_", "")
      userState.language = language
      userState.state = STATES.WAITING_PASSPORT_JSHIR

      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      const welcomeMessage = t.welcomeRegistration

      bot.editMessageText(welcomeMessage, {
        chat_id: chatId,
        message_id: messageId,
      })

      userStates.set(chatId, userState)
      return
    }

    if (data.startsWith("course_")) {
      const courseId = parseInt(data.replace("course_", ""))
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      
      // Get course name from API cache
      let course = null
      if (coursesCache) {
        const courseData = coursesCache.find(c => c.id === courseId)
        if (courseData) {
          course = language === "ru" ? (courseData.name_ru || courseData.name) : (courseData.name_uz || courseData.name)
        }
      }
      
      // Fallback if not found
      if (!course) {
        course = `${courseId}-kurs`
      }
      
      userState.course = course
      userState.courseId = courseId
      userState.state = STATES.WAITING_DIRECTION

      const directionOptions = await getDirectionOptions(language, 1)
      const directionText = language === "ru" ? "💻 Выберите направление:" : "💻 Yo'nalishni tanlang:"
      bot.editMessageText(directionText, {
        chat_id: chatId,
        message_id: messageId,
        ...directionOptions,
      })

      userStates.set(chatId, userState)
      return
    }

    if (data.startsWith("dir_page_")) {
      const pageNumber = parseInt(data.replace("dir_page_", ""))
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      const directionOptions = await getDirectionOptions(language, pageNumber)
      const directionText = language === "ru" ? "💻 Выберите направление:" : "💻 Yo'nalishni tanlang:"
      bot.editMessageText(directionText, {
        chat_id: chatId,
        message_id: messageId,
        ...directionOptions,
      })
      return
    }

    if (data.startsWith("dir_") && !data.startsWith("dir_page_")) {
      const directionKey = data.replace("dir_", "")
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      
      // Get direction name from API cache
      let direction = null
      let directionId = null
      
      // Try to find by ID first
      const parsedId = parseInt(directionKey)
      if (!isNaN(parsedId) && directionsCache) {
        const directionData = directionsCache.find(d => d.id === parsedId)
        if (directionData) {
          direction = language === "ru" ? (directionData.name_ru || directionData.name) : (directionData.name_uz || directionData.name)
          directionId = parsedId
        }
      }
      
      // If not found by ID, try to find by key
      if (!direction && directionsCache) {
        const directionData = directionsCache.find(d => {
          const dirKey = mapDirectionToKey(d.name_uz || d.name)
          return dirKey === directionKey
        })
        if (directionData) {
          direction = language === "ru" ? (directionData.name_ru || directionData.name) : (directionData.name_uz || directionData.name)
          directionId = directionData.id
        }
      }
      
      // Final fallback - use directionKey as name
      if (!direction) {
        direction = directionKey.replace(/_/g, ' ')
      }

      if (direction) {
        userState.direction = direction
        userState.directionId = directionId

        bot.editMessageText(`${t.registrationCompleting}`, {
          chat_id: chatId,
          message_id: messageId,
        })

        userStates.set(chatId, userState)

        setTimeout(async () => {
          await completeRegistration(chatId, userState)
          bot.deleteMessage(chatId, messageId).catch(() => {})
        }, 2000)
        return
      }
    }

    if (data === "suggestion") {
      userState.ticketType = data 
      userState.state = STATES.WAITING_MESSAGE_TEXT
      userState.category = null 
      userState.substatus = null 

      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      const translatedType = t.messageTypes[userState.ticketType] || userState.ticketType
      const messageText = t.enterMessage(translatedType)

      bot.editMessageText(messageText, {
        chat_id: chatId,
        message_id: messageId,
      })

      userStates.set(chatId, userState)
      return
    }

    if (data === "complaint") {
      userState.ticketType = data 
      userState.state = STATES.WAITING_MESSAGE_TEXT

      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      const translatedType = t.messageTypes[userState.ticketType] || userState.ticketType
      const categoryText = t.selectCategory(translatedType)

      bot.editMessageText(categoryText, {
        chat_id: chatId,
        message_id: messageId,
        ...getCategoryOptions(language),
      })

      userStates.set(chatId, userState)
      return
    }

    if (data.startsWith("cat_")) {
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      const categories = t.categories
      
      const categoryMap = {
        cat_sharoit: { uz: "Sharoit", ru: "Условия", en: "Conditions" },
        cat_qabul: { uz: "Qabul", ru: "Прием", en: "Admission" },
        cat_dars: { uz: "Dars jarayoni", ru: "Учебный процесс", en: "Learning Process" },
        cat_teacher: { uz: "O'qituvchi", ru: "Преподаватель", en: "Teacher" },
        cat_tutor: { uz: "Tyutor", ru: "Тьютор", en: "Tutor" },
        cat_dekanat: { uz: "Dekanat", ru: "Деканат", en: "Dean Office" },
        cat_other: { uz: "Boshqa sabab", ru: "Другая причина", en: "Other" },
      }

      const categoryData = categoryMap[data]
      const category = language === "ru" ? categoryData.ru : categoryData.uz
      const substatus = categoryData.en

      userState.category = category
      userState.substatus = substatus

      const categorySpecificMessage = getCategorySpecificMessage(data, language)

      bot.editMessageText(
        categorySpecificMessage,
        {
          chat_id: chatId,
          message_id: messageId,
        },
      )

      userStates.set(chatId, userState)
      return
    }

    if (data === "help_info") {
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      const helpText = `${t.help}

${t.helpText}

🔄 ${t.useMenu}`

      bot.editMessageText(helpText, {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: {
          inline_keyboard: [[{ text: t.back, callback_data: "back_to_menu" }]],
        },
      })
      return
    }

    if (data === "back_to_menu") {
      const existingUser = await apiClient.checkUserExists(chatId).catch(() => null)
      if (existingUser) {
        const userLanguage = existingUser.language || "uz"
        const t = TRANSLATIONS[userLanguage] || TRANSLATIONS.uz
        // Ensure fullName is not passportJshir or chatId
        const displayName = existingUser.fullName && 
                           existingUser.fullName !== existingUser.passportJshir && 
                           existingUser.fullName !== String(chatId)
          ? existingUser.fullName 
          : (existingUser.fullName || "User")
        const welcomeText = t.welcome(displayName)

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
        })

        // displayName is already declared above, reuse it
        userStates.set(chatId, { state: STATES.IDLE, fullName: displayName, language: userLanguage })
      }
      return
    }
  } catch (error) {
    const t = TRANSLATIONS.uz 
    bot.sendMessage(chatId, t.callbackError)
  }
})

async function handleMessageSubmission(chatId, userState, messageText) {
  try {
    const ticketNumber = `USAT-${Date.now().toString().slice(-6)}`

    const priority = determinePriority(userState.category, messageText)
    const messageId = Date.now() 

    const messageData = {
      messageId: messageId,
      userId: chatId, 
      chatId: chatId,
      timestamp: new Date().toISOString(),
      status: "pending",
      ticketType: userState.ticketType, 
      text: messageText,
      language: userState.language || "uz",
      isactive: false,
      substatus: userState.ticketType === "suggestion" ? null : userState.substatus,
    }

    logger.debug("Sending message to API", { ticketType: userState.ticketType, messageData })

    let result = null

    try {
      result = await ErrorHandler.retryOperation(() => apiClient.saveMessage(messageData), 2, 2000)
      logger.info("✅ Message sent to API successfully")
    } catch (apiError) {
      logger.error("❌ Error sending message to API", apiError)
    }

    if (result) {
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      const translatedType = t.messageTypes[userState.ticketType] || userState.ticketType

      const statusMessage = t.messageSubmitted(translatedType)
      bot.sendMessage(chatId, statusMessage)

      // Show main menu after 2.5 seconds (non-blocking)
      setTimeout(() => {
        showMainMenu(chatId, userState.fullName, userState.language)
        const state = userStates.get(chatId)
        if (state) {
          state.state = STATES.IDLE
          state.lastActivity = Date.now()
          MemoryManager.updateActivity(userStates, chatId)
        }
      }, 2500)
    } else {
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      bot.sendMessage(chatId, t.messageError)
    }
  } catch (error) {
    logger.error("Message submission error", { error, chatId })
    const t = TRANSLATIONS.uz 
    bot.sendMessage(chatId, t.messageError)
  }
}

function determinePriority(category, messageText) {
  const highPriorityKeywords = ["shoshilinch", "muhim", "zudlik", "tezkor"]
  const highPriorityCategories = ["Dekanat", "O'qituvchi"]

  const text = messageText.toLowerCase()
  const hasHighPriorityKeyword = highPriorityKeywords.some((keyword) => text.includes(keyword))
  const isHighPriorityCategory = highPriorityCategories.includes(category)

  if (hasHighPriorityKeyword || isHighPriorityCategory) {
    return "Yuqori"
  } else if (text.length > 200) {
    return "O'rta"
  } else {
    return "Past"
  }
}

async function completeRegistration(chatId, userState) {
  // Prepare user data according to API requirements
  // Required fields: userId, chatId, fullName, phone, course, direction, language
  // Ensure fullName is set from student data (student.full_name from API)
  // If fullName is not set or equals passportJshir, use "User" as fallback
  let fullName = userState.fullName
  
  // Check if fullName is valid (not passportJshir, not chatId, not all digits)
  // If userState.fullName is valid (from student API), use it
  if (fullName && 
      fullName !== userState.passportJshir && 
      fullName !== String(chatId) &&
      !/^\d+$/.test(fullName)) { // If it's not all digits (like passportJshir)
    // Use the fullName from student API
    logger.debug("[REGISTRATION] Using fullName from student API", { fullName })
  } else {
    // If fullName is not valid, use "User" as fallback
    fullName = "User"
    logger.debug("[REGISTRATION] fullName not valid, using 'User' as fallback")
  }
  
  logger.debug("[REGISTRATION] Final fullName", { fullName, userStateFullName: userState.fullName, passportJshir: userState.passportJshir })
  
  const userData = {
    userId: String(chatId),
    chatId: String(chatId),
    fullName: fullName,
    phone: userState.phone,
    course: userState.course,
    direction: userState.direction,
    language: userState.language || "uz",
  }

  // Validate that all required fields are present
  if (!userData.userId || !userData.chatId || !userData.fullName || !userData.phone || !userData.course || !userData.direction) {
    logger.error("[REGISTRATION] Missing required fields", {
      userId: !!userData.userId,
      chatId: !!userData.chatId,
      fullName: !!userData.fullName,
      phone: !!userData.phone,
      course: !!userData.course,
      direction: !!userData.direction,
    })
    const t = TRANSLATIONS[userState.language || "uz"] || TRANSLATIONS.uz
    bot.sendMessage(chatId, `${t.errorOccurred} ${t.registrationError}`)
    return
  }

  logger.debug("[REGISTRATION] User registration data", { userData })

  try {
    let result = null

    try {
      logger.debug("[REGISTRATION] Attempting API registration call...")
      result = await ErrorHandler.retryOperation(() => apiClient.registerUser(userData), 2, 2000)
      logger.info("[REGISTRATION] API registration successful")
    } catch (apiError) {
      logger.error("[REGISTRATION] API registration failed", apiError)
      throw apiError
    }

    if (result) {
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      const successMessage = t.registrationComplete

      const persistentKeyboard = {
        reply_markup: {
          keyboard: [
            [
              { text: t.sendMessageButton }
            ]
          ],
          resize_keyboard: true,
          one_time_keyboard: false,
          persistent: true
        }
      }

      bot.sendMessage(chatId, successMessage, persistentKeyboard)
      // Get fullName from API response if available
      // API response structure: { success: true, data: { user: { fullName: "...", ... } } }
      let displayName = userState.fullName
      if (result && result.data && result.data.user) {
        displayName = result.data.user.fullName || displayName
      } else if (result && result.user) {
        displayName = result.user.fullName || displayName
      } else if (result && result.fullName) {
        displayName = result.fullName
      }
      
      // Ensure we have a valid fullName - use userState.fullName (from student API) if available
      // Don't use passportJshir or chatId as display name
      if (!displayName || 
          displayName === userState.passportJshir || 
          displayName === String(chatId) ||
          /^\d+$/.test(displayName)) { // If it's all digits (like passportJshir)
        // Use userState.fullName if it's valid (from student API)
        if (userState.fullName && 
            userState.fullName !== userState.passportJshir && 
            userState.fullName !== String(chatId) &&
            !/^\d+$/.test(userState.fullName)) {
          displayName = userState.fullName
        } else {
          displayName = "User"
        }
      }
      
      // Final check: if displayName is still invalid, use "User"
      if (!displayName || 
          displayName === userState.passportJshir || 
          displayName === String(chatId) ||
          /^\d+$/.test(displayName)) {
        displayName = "User"
      }
      
      logger.debug("[REGISTRATION] Display name set", { displayName, fullName: userState.fullName })
      userStates.set(chatId, { 
        state: STATES.IDLE, 
        fullName: displayName, 
        language: language,
        lastActivity: Date.now()
      })
      MemoryManager.updateActivity(userStates, chatId)
    }
  } catch (error) {
    const errorInfo = ErrorHandler.handleAPIError(error, "User registration")
    const t = TRANSLATIONS.uz 
    bot.sendMessage(chatId, `${t.errorOccurred} ${errorInfo.userMessage}`)

    if (errorInfo.errorType !== "DUPLICATE") {
      bot.sendMessage(chatId, t.pleaseRegister)
      userStates.delete(chatId)
    }
  }
}

bot.on("polling_error", (error) => {
  logger.error("Polling error", error)
})

// Graceful shutdown
function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`)
  MemoryManager.stop()
  bot.stopPolling().then(() => {
    logger.info("Bot stopped successfully")
    process.exit(0)
  }).catch((err) => {
    logger.error("Error stopping bot", err)
    process.exit(1)
  })
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"))
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error)
  gracefulShutdown("uncaughtException")
})

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection", { reason, promise })
})

async function initializeBot() {
  logger.info("Initializing bot...", { apiBaseURL: API_BASE_URL })

  // Login and save tokens
  try {
    logger.info("[API] Logging in with bot credentials...")
    const tokens = await apiClient.login("telegram_bot", "telegram_bot123")
    if (tokens && tokens.access && tokens.refresh) {
      saveTokens(tokens.access, tokens.refresh)
      logger.info("✅ Bot muvaffaqiyatli ro'yxatdan o'tdi!")
    } else {
      logger.warn("⚠️ Login successful but tokens not received")
    }
  } catch (error) {
    logger.error("❌ Login failed", error)
    // Try to use existing tokens if login fails
    const savedTokens = readTokens()
    if (savedTokens.access && savedTokens.refresh) {
      apiClient.setTokens(savedTokens.access, savedTokens.refresh)
      logger.info("✅ Using existing tokens from tokens.json")
    }
  }

  // Load courses and directions from API
  try {
    logger.info("[API] Loading courses and directions from API...")
    coursesCache = await apiClient.getCourses()
    directionsCache = await apiClient.getDirections()
    coursesCacheTime = Date.now()
    directionsCacheTime = Date.now()
    logger.info(`[API] ✅ Loaded ${coursesCache.length} courses and ${directionsCache.length} directions`)
  } catch (error) {
    logger.warn("[API] ⚠️ Failed to load courses/directions from API, will use defaults", error)
  }

  const isHealthy = await apiClient.healthCheck()
  if (!isHealthy) {
    logger.warn("⚠️ API health check failed - bot will run in API-only mode")
  } else {
    logger.info("✅ API health check passed - online mode")
  }

  // Start memory cleanup
  MemoryManager.startCleanup(userStates)
  logger.info("🤖 Bot started successfully!", MemoryManager.getStats(userStates))
}

initializeBot()