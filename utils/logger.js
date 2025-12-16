/**
 * Production-ready logging system
 * Supports different log levels and can be configured for production
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
}

const LOG_LEVEL = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'INFO' : 'DEBUG')

class Logger {
  constructor() {
    this.level = LOG_LEVELS[LOG_LEVEL.toUpperCase()] || LOG_LEVELS.INFO
    this.isProduction = process.env.NODE_ENV === 'production'
  }

  shouldLog(level) {
    return level <= this.level
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString()
    const levelName = Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === level)
    
    if (this.isProduction) {
      // Production: JSON format for log aggregation
      return JSON.stringify({
        timestamp,
        level: levelName,
        message,
        ...(data && { data })
      })
    } else {
      // Development: Human-readable format
      const dataStr = data ? ` ${JSON.stringify(data)}` : ''
      return `[${timestamp}] [${levelName}] ${message}${dataStr}`
    }
  }

  error(message, error = null) {
    if (this.shouldLog(LOG_LEVELS.ERROR)) {
      const data = error ? {
        message: error.message,
        stack: this.isProduction ? undefined : error.stack
      } : null
      console.error(this.formatMessage(LOG_LEVELS.ERROR, message, data))
    }
  }

  warn(message, data = null) {
    if (this.shouldLog(LOG_LEVELS.WARN)) {
      console.warn(this.formatMessage(LOG_LEVELS.WARN, message, data))
    }
  }

  info(message, data = null) {
    if (this.shouldLog(LOG_LEVELS.INFO)) {
      console.log(this.formatMessage(LOG_LEVELS.INFO, message, data))
    }
  }

  debug(message, data = null) {
    if (this.shouldLog(LOG_LEVELS.DEBUG)) {
      console.log(this.formatMessage(LOG_LEVELS.DEBUG, message, data))
    }
  }
}

module.exports = new Logger()
