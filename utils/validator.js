class Validator {
  static validatePhoneNumber(phone) {
    if (!phone || typeof phone !== "string") return false;
    // Uzbekistan phone number validation - only +998 format
    const cleaned = phone.replace(/[\s\-]/g, "");
    const phoneRegex = /^\+998[0-9]{9}$/;
    return phoneRegex.test(cleaned);
  }

  static validatePassportJSHIR(jshir) {
    if (!jshir || typeof jshir !== "string") return false;
    // Passport JSHIR must be exactly 14 digits
    const cleaned = jshir.replace(/[\s\-]/g, "");
    const jshirRegex = /^[0-9]{14}$/;
    return jshirRegex.test(cleaned);
  }

  static validateFullName(name) {
    if (!name || typeof name !== "string") return false;
    // Check if name contains at least 2 words and only letters/spaces
    // Includes Uzbek characters: ў, қ, ғ, ҳ, etc.
    const nameRegex = /^[a-zA-ZА-Яа-яЁёўқғҳЎҚҒҲ\s]{2,50}$/;
    const words = name.trim().split(/\s+/);
    return nameRegex.test(name) && words.length >= 2;
  }

  static validateMessageText(text) {
    if (!text || typeof text !== "string") {
      return { valid: false, error: "Matn kiritilmagan" }
    }

    const trimmedText = text.trim()

    if (trimmedText.length < 10) {
      return { valid: false, error: "Matn juda qisqa (kamida 10 ta belgi)" }
    }

    if (trimmedText.length > 1000) {
      return { valid: false, error: "Matn juda uzun (maksimal 1000 ta belgi)" }
    }

    // Check for spam patterns (less strict)
    const spamPatterns = [
      /(.)\1{20,}/, // Repeated characters (increased threshold)
      /^[A-Z\s!]{50,}$/, // All caps (increased threshold)
    ]

    for (const pattern of spamPatterns) {
      if (pattern.test(trimmedText)) {
        return { valid: false, error: "Matn spam kabi ko'rinmoqda" }
      }
    }
    
    // URLs are allowed but logged for moderation

    return { valid: true }
  }

  static sanitizeInput(input) {
    if (typeof input !== "string") return input

    // Remove potentially harmful characters
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/[<>]/g, "")
      .trim()
  }
}

module.exports = Validator
