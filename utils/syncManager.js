const logger = require("./logger")

class SyncManager {
  constructor(apiClient, localStorage) {
    this.apiClient = apiClient
    this.localStorage = localStorage
    this.syncInterval = null
    this.isRunning = false
  }

  start(intervalMinutes = 5) {
    if (this.isRunning) {
      logger.warn("Sync manager is already running")
      return
    }

    this.isRunning = true
    logger.info(`Starting sync manager with ${intervalMinutes} minute intervals`)

    // Run initial sync
    this.syncData()

    // Set up periodic sync
    this.syncInterval = setInterval(
      () => {
        this.syncData()
      },
      intervalMinutes * 60 * 1000,
    )
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval)
      this.syncInterval = null
    }
    this.isRunning = false
    logger.info("Sync manager stopped")
  }

  async syncData() {
    try {
      // Check if API is available
      const isHealthy = await this.apiClient.healthCheck();

      if (!isHealthy) {
        logger.warn("API not available, skipping sync");
        return;
      }

      logger.info("Starting data synchronization...");

      // Sync pending messages
      await this.syncMessages();

      // Sync user data
      await this.syncUsers();

      // Update lastSync timestamp
      this.lastSync = new Date().toISOString();

      logger.info("Data synchronization completed", {
        lastSync: this.lastSync,
      });
    } catch (error) {
      logger.error("Sync failed:", { error: error.message, stack: error.stack });
    }
  }

  async syncMessages() {
    const messages = this.localStorage.readMessages();
    // Fix: Check for both "offline_pending" and "pending" status
    const pendingMessages = messages.filter(
      (msg) => msg.status === "offline_pending" || msg.status === "pending" || !msg.synced
    );

    if (pendingMessages.length === 0) {
      return;
    }

    logger.info(`Syncing ${pendingMessages.length} pending messages`);

    let syncedCount = 0;
    for (const message of pendingMessages) {
      try {
        // Update status to pending for API submission
        const updatedMessage = { ...message, status: "pending" };

        await this.apiClient.saveMessage(updatedMessage);

        // Update local status to synced
        message.status = "synced";
        message.synced = true;
        message.syncedAt = new Date().toISOString();

        syncedCount++;
        logger.info(`Message ${message.messageId} synced successfully`);
      } catch (error) {
        logger.error(`Failed to sync message ${message.messageId}:`, error.message);
        // Mark as failed but keep for retry
        message.syncAttempts = (message.syncAttempts || 0) + 1;
        if (message.syncAttempts > 5) {
          message.status = "sync_failed";
          logger.warn(`Message ${message.messageId} failed after 5 attempts`);
        }
      }
    }

    // Save updated messages
    if (syncedCount > 0) {
      await this.localStorage.writeMessages(messages);
    }
  }

  async syncUsers() {
    const users = this.localStorage.readUsers();
    const unsyncedUsers = users.filter((user) => !user.synced);

    if (unsyncedUsers.length === 0) {
      return;
    }

    logger.info(`Syncing ${unsyncedUsers.length} unsynced users`);

    let syncedCount = 0;
    for (const user of unsyncedUsers) {
      try {
        // Remove synced flag before sending to API
        const { synced, syncedAt, ...userData } = user;
        await this.apiClient.registerUser(userData);

        // Mark as synced
        user.synced = true;
        user.syncedAt = new Date().toISOString();

        syncedCount++;
        logger.info(`User ${user.fullName} synced successfully`);
      } catch (error) {
        // If user already exists, mark as synced
        if (error.message.includes("already exists")) {
          user.synced = true;
          user.syncedAt = new Date().toISOString();
          syncedCount++;
          logger.info(`User ${user.fullName} already exists, marked as synced`);
        } else {
          logger.error(`Failed to sync user ${user.fullName}:`, error.message);
        }
      }
    }

    // Save updated users
    if (syncedCount > 0) {
      await this.localStorage.writeUsers(users);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastSync: this.lastSync || null,
    }
  }
}

module.exports = SyncManager
