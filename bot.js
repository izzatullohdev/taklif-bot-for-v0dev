const TelegramBot = require("node-telegram-bot-api")
const APIClient = require("./api/apiClient")
const ErrorHandler = require("./utils/errorHandler")
const Validator = require("./utils/validator")
require("dotenv").config()

const token = process.env.TELEGRAM_BOT_TOKEN
if (!token) {
  console.error("❌ ERROR: TELEGRAM_BOT_TOKEN is required!")
  console.error("Please set TELEGRAM_BOT_TOKEN in your .env file")
  process.exit(1)
}
const bot = new TelegramBot(token, { polling: true })

const API_BASE_URL = process.env.API_BASE_URL || "https://usat-taklif-backend.onrender.com/api"
const apiClient = new APIClient(API_BASE_URL)



const userStates = new Map()

const STATES = {
  IDLE: "idle",
  WAITING_LANGUAGE: "waiting_language",
  WAITING_NAME: "waiting_name",
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
    welcomeRegistration: "Assalomu alaykum! Ro'yxatdan o'tish uchun ism familiyangizni kiriting:",
    
    suggestion: "✏️ Taklif",
    complaint: "⚠️ Shikoyat",
    back: "🔙 Orqaga",
    sendMessageButton: "✉️ Xabar yuborish",
    
    enterFullName: "📝 Ism familiyangizni kiriting:",
    enterPhone: "📱 Telefon raqamingizni kiriting (+998XXXXXXX formatida):",
    selectCourse: "🎓 Kursni tanlang:",
    selectDirection: "💻 Yo'nalishni tanlang:",
    courseSelected: (course) => `✅ Kurs tanlandi: ${course}`,
    directionSelected: (direction) => `✅ Yo'nalish tanlandi: ${direction}`,
    registrationCompleting: "🎉 Ro'yxatdan o'tish yakunlanmoqda...",
    registrationComplete: "✅ Ro'yxatdan o'tish muvaffaqiyatli yakunlandi!\nQuyidagi \"✉️Xabar yuborish\" tugmasi orqali xabaringizni yuborishingiz mumkin!",
    
    course1: "1-kurs",
    course2: "2-kurs", 
    course3: "3-kurs",
    course4: "4-kurs",
    
    directions: {
      dasturiy_injiniring: "Dasturiy injiniring",
      kompyuter_injiniringi: "Kompyuter injiniringi",
      bank_ishi: "Bank ishi",
      moliya_texnologiyalar: "Moliya va moliyaviy texnologiyalar",
      logistika: "Logistika",
      iqtisodiyot: "Iqtisodiyot",
      buxgalteriya_hisobi: "Buxgalteriya hisobi",
      turizm_mehmondostlik: "Turizm va mehmondo'stlik",
      maktabgacha_talim: "Maktabgacha taʼlim",
      boshlangich_talim: "Boshlangʻich taʼlim",
      maxsus_pedagogika: "Maxsus pedagogika",
      ozbek_tili_adabiyoti: "O'zbek tili va adabiyoti",
      xorijiy_til_adabiyoti: "Xorijiy til va adabiyoti",
      tarix: "Tarix",
      matematika: "Matematika",
      psixologiya: "Psixologiya",
      arxitektura: "Arxitektura",
      ijtimoiy_ish: "Ijtimoiy ish"
    },
    
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
    invalidName: "❌ Ism faqat harflardan iborat bo'lishi kerak va kamida 2 ta so'zdan iborat bo'lishi kerak. Qaytadan kiriting:",
    invalidPhone: "❌ Telefon raqam noto'g'ri formatda. +998XXXXXXX formatida kiriting:",
    messageError: "❌ Xabar yuborishda xatolik yuz berdi. Qaytadan urinib ko'ring.",
    registrationError: "❌ Xatolik yuz berdi. Ro'yxatdan o'tish uchun ism familiyangizni kiriting:",
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
    welcomeRegistration: "Здравствуйте! Для регистрации введите ваше имя и фамилию:",
    
    suggestion: "✏️ Предложение",
    complaint: "⚠️ Жалоба",
    back: "🔙 Назад",
    sendMessageButton: "✉️ Отправить сообщение",
    
    enterFullName: "📝 Введите ваше имя и фамилию:",
    enterPhone: "📱 Введите номер телефона (+998XXXXXXX формат):",
    selectCourse: "🎓 Выберите курс:",
    selectDirection: "💻 Выберите направление:",
    courseSelected: (course) => `✅ Курс выбран: ${course}`,
    directionSelected: (direction) => `✅ Направление выбрано: ${direction}`,
    registrationCompleting: "🎉 Регистрация завершается...",
    registrationComplete: "✅ Регистрация успешно завершена!\nВы можете отправить свое сообщение через кнопку \"✉️Отправить сообщение\" ниже!",
    
    course1: "1-курс",
    course2: "2-курс",
    course3: "3-курс", 
    course4: "4-курс",
    
    directions: {
      dasturiy_injiniring: "Программная инженерия",
      kompyuter_injiniringi: "Компьютерная инженерия",
      bank_ishi: "Банковское дело",
      moliya_texnologiyalar: "Финансы и финансовые технологии",
      logistika: "Логистика",
      iqtisodiyot: "Экономика",
      buxgalteriya_hisobi: "Бухгалтерский учет",
      turizm_mehmondostlik: "Туризм и гостеприимство",
      maktabgacha_talim: "Дошкольное образование",
      boshlangich_talim: "Начальное образование",
      maxsus_pedagogika: "Специальная педагогика",
      ozbek_tili_adabiyoti: "Узбекский язык и литература",
      xorijiy_til_adabiyoti: "Иностранный язык и литература",
      tarix: "История",
      matematika: "Математика",
      psixologiya: "Психология",
      arxitektura: "Архитектура",
      ijtimoiy_ish: "Социальная работа"
    },
    
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
    invalidName: "❌ Имя должно содержать только буквы и состоять минимум из 2 слов. Введите заново:",
    invalidPhone: "❌ Неверный формат номера телефона. Введите в формате +998XXXXXXX:",
    messageError: "❌ Ошибка при отправке сообщения. Попробуйте еще раз.",
    registrationError: "❌ Произошла ошибка. Для регистрации введите ваше имя и фамилию:",
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

function getCourseOptions(language = "uz") {
  const t = TRANSLATIONS[language]
  return {
    reply_markup: {
      inline_keyboard: [
        [
          { text: t.course1, callback_data: "course_1" },
          { text: t.course2, callback_data: "course_2" },
        ],
        [
          { text: t.course3, callback_data: "course_3" },
          { text: t.course4, callback_data: "course_4" },
        ],
      ],
    },
  }
}

function getDirectionOptions(language = "uz", page = 1) {
  const t = TRANSLATIONS[language]
  const directions = t.directions
  
  switch (page) {
    case 1:
      return {
        reply_markup: {
          inline_keyboard: [
            [{ text: directions.dasturiy_injiniring, callback_data: "dir_dasturiy_injiniring" }],
            [{ text: directions.kompyuter_injiniringi, callback_data: "dir_kompyuter_injiniringi" }],
            [{ text: directions.bank_ishi, callback_data: "dir_bank_ishi" }],
            [{ text: directions.moliya_texnologiyalar, callback_data: "dir_moliya_texnologiyalar" }],
            [{ text: directions.logistika, callback_data: "dir_logistika" }],
            [{ text: directions.iqtisodiyot, callback_data: "dir_iqtisodiyot" }],
            [{ text: t.nextPage, callback_data: "dir_page_2" }],
          ],
        },
      }
    case 2:
      return {
        reply_markup: {
          inline_keyboard: [
            [{ text: directions.buxgalteriya_hisobi, callback_data: "dir_buxgalteriya_hisobi" }],
            [{ text: directions.turizm_mehmondostlik, callback_data: "dir_turizm_mehmondostlik" }],
            [{ text: directions.maktabgacha_talim, callback_data: "dir_maktabgacha_talim" }],
            [{ text: directions.boshlangich_talim, callback_data: "dir_boshlangich_talim" }],
            [{ text: directions.maxsus_pedagogika, callback_data: "dir_maxsus_pedagogika" }],
            [{ text: directions.ozbek_tili_adabiyoti, callback_data: "dir_ozbek_tili_adabiyoti" }],
            [
              { text: t.prevPage, callback_data: "dir_page_1" },
              { text: t.nextPage, callback_data: "dir_page_3" },
            ],
          ],
        },
      }
    case 3:
      return {
        reply_markup: {
          inline_keyboard: [
            [{ text: directions.xorijiy_til_adabiyoti, callback_data: "dir_xorijiy_til_adabiyoti" }],
            [{ text: directions.tarix, callback_data: "dir_tarix" }],
            [{ text: directions.matematika, callback_data: "dir_matematika" }],
            [{ text: directions.psixologiya, callback_data: "dir_psixologiya" }],
            [{ text: directions.arxitektura, callback_data: "dir_arxitektura" }],
            [{ text: directions.ijtimoiy_ish, callback_data: "dir_ijtimoiy_ish" }],
            [{ text: t.prevPage, callback_data: "dir_page_2" }],
          ],
        },
      }
    default:
      return getDirectionOptions(language, 1)
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
      apiClient.updateUserActivity(chatId)

      const userLanguage = existingUser.language || "uz"
      showMainMenu(chatId, existingUser.fullName, userLanguage)
      userStates.set(chatId, { state: STATES.IDLE, fullName: existingUser.fullName, language: userLanguage })
    } else {
      showLanguageSelection(chatId)
    }
  } catch (error) {
    const t = TRANSLATIONS.uz 
    bot.sendMessage(chatId, t.registrationError)
    userStates.set(chatId, { state: STATES.WAITING_NAME })
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
      showMainMenu(chatId, existingUser.fullName, userLanguage)
      userStates.set(chatId, { state: STATES.IDLE, fullName: existingUser.fullName, language: userLanguage })
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
        showMainMenu(chatId, existingUser.fullName, userLanguage)
        userStates.set(chatId, { state: STATES.IDLE, fullName: existingUser.fullName, language: userLanguage })
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
      case STATES.WAITING_NAME:
        const nameLanguage = userState.language || "uz"
        const nameT = TRANSLATIONS[nameLanguage] || TRANSLATIONS.uz
        
        if (!text || text.trim().length < 2) {
          bot.sendMessage(chatId, nameT.enterFullName)
          return
        }

        if (!Validator.validateFullName(text)) {
          bot.sendMessage(chatId, nameT.invalidName)
          return
        }

        userState.fullName = text.trim()
        userState.state = STATES.WAITING_PHONE

        bot.sendMessage(chatId, nameT.enterPhone)
        userStates.set(chatId, userState)
        break

      case STATES.WAITING_PHONE:
        const phoneLanguage = userState.language || "uz"
        const phoneT = TRANSLATIONS[phoneLanguage] || TRANSLATIONS.uz
        
        if (!Validator.validatePhoneNumber(text)) {
          bot.sendMessage(chatId, phoneT.invalidPhone)
          return
        }

        userState.phone = text.trim()
        userState.state = STATES.WAITING_COURSE

        bot.sendMessage(chatId, phoneT.selectCourse, getCourseOptions(phoneLanguage))
        userStates.set(chatId, userState)
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
      userState.state = STATES.WAITING_NAME

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
      const courseNumber = data.replace("course_", "")
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      
      const course = courseNumber === "1" ? t.course1 : 
                    courseNumber === "2" ? t.course2 :
                    courseNumber === "3" ? t.course3 : t.course4
      
      userState.course = course
      userState.state = STATES.WAITING_DIRECTION

      bot.editMessageText(`${t.courseSelected(course)}\n\n${t.selectDirection}`, {
        chat_id: chatId,
        message_id: messageId,
        ...getDirectionOptions(language, 1),
      })

      userStates.set(chatId, userState)
      return
    }

    if (data.startsWith("dir_page_")) {
      const pageNumber = parseInt(data.replace("dir_page_", ""))
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      const pageText = t.selectDirection

      bot.editMessageText(pageText, {
        chat_id: chatId,
        message_id: messageId,
        ...getDirectionOptions(language, pageNumber),
      })
      return
    }

    if (data.startsWith("dir_") && !data.startsWith("dir_page_")) {
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      const directions = t.directions
      
      const directionMap = {
        dir_dasturiy_injiniring: directions.dasturiy_injiniring,
        dir_kompyuter_injiniringi: directions.kompyuter_injiniringi,
        dir_bank_ishi: directions.bank_ishi,
        dir_moliya_texnologiyalar: directions.moliya_texnologiyalar,
        dir_logistika: directions.logistika,
        dir_iqtisodiyot: directions.iqtisodiyot,
        dir_buxgalteriya_hisobi: directions.buxgalteriya_hisobi,
        dir_turizm_mehmondostlik: directions.turizm_mehmondostlik,
        dir_maktabgacha_talim: directions.maktabgacha_talim,
        dir_boshlangich_talim: directions.boshlangich_talim,
        dir_maxsus_pedagogika: directions.maxsus_pedagogika,
        dir_ozbek_tili_adabiyoti: directions.ozbek_tili_adabiyoti,
        dir_xorijiy_til_adabiyoti: directions.xorijiy_til_adabiyoti,
        dir_tarix: directions.tarix,
        dir_matematika: directions.matematika,
        dir_psixologiya: directions.psixologiya,
        dir_arxitektura: directions.arxitektura,
        dir_ijtimoiy_ish: directions.ijtimoiy_ish,
      }

      const direction = directionMap[data]
      if (direction) {
        userState.direction = direction

        bot.editMessageText(`${t.directionSelected(direction)}\n\n${t.registrationCompleting}`, {
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
        const welcomeText = t.welcome(existingUser.fullName)

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

        userStates.set(chatId, { state: STATES.IDLE, fullName: existingUser.fullName, language: userLanguage })
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

    console.log("=== TAKLIF/SHIKOYAT API'GA JO'NATILAYOTGAN DATA ===")
    console.log("Ticket Type:", userState.ticketType)
    console.log("Full Data:", JSON.stringify(messageData, null, 2))
    console.log("================================================")

    let result = null

    try {
      result = await ErrorHandler.retryOperation(() => apiClient.saveMessage(messageData), 2, 2000)
      console.log("✅ API'ga muvaffaqiyatli jo'natildi!")
    } catch (apiError) {
      console.log("❌ API'ga jo'natishda xatolik:", apiError.message)
      logger.error("API message submission failed", { error: apiError.message })
    }

    if (result) {
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      const translatedType = t.messageTypes[userState.ticketType] || userState.ticketType

      const statusMessage = t.messageSubmitted(translatedType)
      bot.sendMessage(chatId, statusMessage)

      setTimeout(() => {
        // Show main menu after 0.5 seconds as per memory requirement
        setTimeout(() => {
          showMainMenu(chatId, userState.fullName, userState.language)
          userStates.set(chatId, { state: STATES.IDLE, fullName: userState.fullName, language: userState.language })
        }, 500)
      }, 2000)
    } else {
      const language = userState.language || "uz"
      const t = TRANSLATIONS[language] || TRANSLATIONS.uz
      bot.sendMessage(chatId, t.messageError)
    }
  } catch (error) {
    logger.error("Message submission error", { error: error.message, chatId })
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
  const userData = {
    userId: chatId, 
    chatId: chatId,
    fullName: userState.fullName,
    phone: userState.phone,
    course: userState.course,
    direction: userState.direction,
    language: userState.language || "uz",
    lastActivity: new Date().toISOString(),
  }

  console.log("[v0] User registration data being sent to API:", JSON.stringify(userData, null, 2))

  try {
    let result = null

    try {
      console.log("[v0] Attempting API registration call...")
      result = await ErrorHandler.retryOperation(() => apiClient.registerUser(userData), 2, 2000)
      console.log("[v0] API registration successful:", result)
    } catch (apiError) {
      console.log("[v0] API registration failed:", apiError.message)
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
      userStates.set(chatId, { state: STATES.IDLE, fullName: userState.fullName, language: language })
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
  console.error("Polling error:", error.message)
})

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down gracefully...")
  process.exit(0)
})

process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down gracefully...")
  process.exit(0)
})

async function initializeBot() {
  console.log("Initializing bot...")
  console.log(`API Base URL: ${API_BASE_URL}`)
  console.log(`Bot Token: ${token ? "Set" : "Missing"}`)

  const isHealthy = await apiClient.healthCheck()
  if (!isHealthy) {
    console.warn("⚠️ API health check failed - bot will run in API-only mode")
    console.warn("Please check if the API server is running and accessible")
  } else {
    console.log("✅ API health check passed - online mode")
  }

  console.log("🤖 Bot started successfully!")
}

initializeBot()