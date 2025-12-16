/**
 * Memory Manager for production optimization
 * Cleans up inactive user states and manages memory efficiently
 */

class MemoryManager {
  constructor() {
    this.cleanupInterval = null
    this.INACTIVE_TIMEOUT = 30 * 60 * 1000 // 30 minutes
    this.CLEANUP_INTERVAL = 10 * 60 * 1000 // 10 minutes
  }

  /**
   * Start periodic cleanup of inactive user states
   * @param {Map} userStates - Map of user states
   */
  startCleanup(userStates) {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveUsers(userStates)
    }, this.CLEANUP_INTERVAL)

    // Run initial cleanup after 5 minutes
    setTimeout(() => {
      this.cleanupInactiveUsers(userStates)
    }, 5 * 60 * 1000)
  }

  /**
   * Clean up inactive users from memory
   * @param {Map} userStates - Map of user states
   */
  cleanupInactiveUsers(userStates) {
    const now = Date.now()
    let cleaned = 0

    for (const [chatId, state] of userStates.entries()) {
      // Remove inactive users (no activity for 30 minutes)
      if (state.lastActivity && now - state.lastActivity > this.INACTIVE_TIMEOUT) {
        userStates.delete(chatId)
        cleaned++
      }
      // Remove users in error states for more than 1 hour
      else if (state.errorTime && now - state.errorTime > 60 * 60 * 1000) {
        userStates.delete(chatId)
        cleaned++
      }
    }

    if (cleaned > 0) {
      console.log(`[MEMORY] Cleaned up ${cleaned} inactive user states. Active users: ${userStates.size}`)
    }
  }

  /**
   * Update user activity timestamp
   * @param {Map} userStates - Map of user states
   * @param {number} chatId - User chat ID
   */
  updateActivity(userStates, chatId) {
    const state = userStates.get(chatId)
    if (state) {
      state.lastActivity = Date.now()
    }
  }

  /**
   * Stop cleanup interval
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Get memory stats
   * @param {Map} userStates - Map of user states
   * @returns {Object} Memory statistics
   */
  getStats(userStates) {
    return {
      activeUsers: userStates.size,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    }
  }
}

module.exports = new MemoryManager()
