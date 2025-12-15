class ErrorHandler {
  static handleAPIError(error, context = "", language = "uz") {
    const timestamp = new Date().toISOString();
    console.error(`[ERROR] ${timestamp} - ${context}:`, error.message);

    const messages = {
      uz: {
        timeout: "Serverga ulanishda muammo. Iltimos, biroz kuting va qaytadan urinib ko'ring.",
        network: "Internet aloqasi bilan muammo. Iltimos, internetingizni tekshiring.",
        duplicate: "Bu foydalanuvchi allaqachon ro'yxatdan o'tgan.",
        validation: "Ma'lumotlarda xatolik. Iltimos, to'g'ri ma'lumot kiriting.",
        unknown: "Kutilmagan xatolik yuz berdi. Iltimos, qaytadan urinib ko'ring.",
      },
      ru: {
        timeout: "Проблема с подключением к серверу. Пожалуйста, подождите и попробуйте снова.",
        network: "Проблема с интернет-соединением. Пожалуйста, проверьте интернет.",
        duplicate: "Этот пользователь уже зарегистрирован.",
        validation: "Ошибка в данных. Пожалуйста, введите правильные данные.",
        unknown: "Произошла неожиданная ошибка. Пожалуйста, попробуйте снова.",
      },
    };

    const t = messages[language] || messages.uz;

    // Categorize errors
    if (error.message.includes("timeout")) {
      return {
        userMessage: t.timeout,
        shouldRetry: true,
        errorType: "TIMEOUT",
      };
    }

    if (error.message.includes("Network Error") || error.code === "ENOTFOUND") {
      return {
        userMessage: t.network,
        shouldRetry: true,
        errorType: "NETWORK",
      };
    }

    if (error.message.includes("already exists")) {
      return {
        userMessage: t.duplicate,
        shouldRetry: false,
        errorType: "DUPLICATE",
      };
    }

    if (error.message.includes("Invalid") || error.message.includes("Missing")) {
      return {
        userMessage: t.validation,
        shouldRetry: false,
        errorType: "VALIDATION",
      };
    }

    // Default error
    return {
      userMessage: t.unknown,
      shouldRetry: true,
      errorType: "UNKNOWN",
    };
  }

  static async retryOperation(operation, maxRetries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        console.log(`[RETRY] Attempt ${attempt}/${maxRetries} failed:`, error.message)

        if (attempt === maxRetries) {
          throw error
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay * attempt))
      }
    }
  }
}

module.exports = ErrorHandler
