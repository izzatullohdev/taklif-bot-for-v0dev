const fs = require("fs");
const path = require("path");

class LocalStorage {
  constructor() {
    this.dataDir = path.join(__dirname, "..", "data");
    this.backupDir = path.join(this.dataDir, "backups");
    this.usersFile = path.join(this.dataDir, "users.json");
    this.messagesFile = path.join(this.dataDir, "messages.json");
    this.tokensFile = path.join(this.dataDir, "tokens.json");
    this.lockFile = path.join(this.dataDir, ".lock");
    this.writeQueue = [];
    this.isWriting = false;

    // Create data directory if it doesn't exist
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Create backup directory
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    // Initialize files if they don't exist
    this.initializeFiles();
  }

  initializeFiles() {
    if (!fs.existsSync(this.usersFile)) {
      fs.writeFileSync(this.usersFile, JSON.stringify([], null, 2));
    }

    if (!fs.existsSync(this.messagesFile)) {
      fs.writeFileSync(this.messagesFile, JSON.stringify([], null, 2));
    }

    if (!fs.existsSync(this.tokensFile)) {
      fs.writeFileSync(this.tokensFile, JSON.stringify({ access: null, refresh: null }, null, 2));
    }
  }

  // Simple file locking mechanism
  async acquireLock() {
    const maxAttempts = 10;
    const delay = 100;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        if (!fs.existsSync(this.lockFile)) {
          fs.writeFileSync(this.lockFile, process.pid.toString());
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      } catch (error) {
        // Lock file might be stale, try to remove it
        try {
          if (fs.existsSync(this.lockFile)) {
            fs.unlinkSync(this.lockFile);
          }
        } catch (e) {
          // Ignore
        }
      }
    }
    return false;
  }

  releaseLock() {
    try {
      if (fs.existsSync(this.lockFile)) {
        fs.unlinkSync(this.lockFile);
      }
    } catch (error) {
      // Ignore
    }
  }

  // Create backup before writing
  createBackup(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        const backupPath = path.join(
          this.backupDir,
          `${path.basename(filePath)}.${Date.now()}.bak`
        );
        fs.copyFileSync(filePath, backupPath);

        // Keep only last 5 backups
        const backups = fs
          .readdirSync(this.backupDir)
          .filter((f) => f.startsWith(path.basename(filePath)))
          .sort()
          .reverse();
        if (backups.length > 5) {
          backups.slice(5).forEach((backup) => {
            try {
              fs.unlinkSync(path.join(this.backupDir, backup));
            } catch (e) {
              // Ignore
            }
          });
        }
      }
    } catch (error) {
      console.error("[LocalStorage] Backup failed:", error.message);
    }
  }

  // Validate data before writing
  validateUsers(users) {
    if (!Array.isArray(users)) return false;
    return users.every(
      (user) =>
        user &&
        user.chatId &&
        user.fullName &&
        typeof user.chatId === "string" &&
        typeof user.fullName === "string"
    );
  }

  validateMessages(messages) {
    if (!Array.isArray(messages)) return false;
    return messages.every(
      (msg) =>
        msg &&
        msg.messageId &&
        msg.chatId &&
        typeof msg.messageId === "string" &&
        typeof msg.chatId === "string"
    );
  }

  readUsers() {
    try {
      const data = fs.readFileSync(this.usersFile, "utf8");
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("[LocalStorage] Error reading users:", error.message);
      return [];
    }
  }

  async writeUsers(users) {
    if (!this.validateUsers(users)) {
      console.error("[LocalStorage] Invalid users data");
      return false;
    }

    const hasLock = await this.acquireLock();
    if (!hasLock) {
      console.error("[LocalStorage] Could not acquire lock for writing users");
      return false;
    }

    try {
      this.createBackup(this.usersFile);
      fs.writeFileSync(this.usersFile, JSON.stringify(users, null, 2));
      return true;
    } catch (error) {
      console.error("[LocalStorage] Error writing users:", error.message);
      return false;
    } finally {
      this.releaseLock();
    }
  }

  readMessages() {
    try {
      const data = fs.readFileSync(this.messagesFile, "utf8");
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.error("[LocalStorage] Error reading messages:", error.message);
      return [];
    }
  }

  async writeMessages(messages) {
    if (!this.validateMessages(messages)) {
      console.error("[LocalStorage] Invalid messages data");
      return false;
    }

    const hasLock = await this.acquireLock();
    if (!hasLock) {
      console.error("[LocalStorage] Could not acquire lock for writing messages");
      return false;
    }

    try {
      this.createBackup(this.messagesFile);
      fs.writeFileSync(this.messagesFile, JSON.stringify(messages, null, 2));
      return true;
    } catch (error) {
      console.error("[LocalStorage] Error writing messages:", error.message);
      return false;
    } finally {
      this.releaseLock();
    }
  }

  findUser(chatId) {
    const users = this.readUsers();
    const chatIdStr = String(chatId);
    return users.find((user) => String(user.chatId) === chatIdStr);
  }

  async saveUser(userData) {
    const users = this.readUsers();
    const chatIdStr = String(userData.chatId);
    const existingIndex = users.findIndex((user) => String(user.chatId) === chatIdStr);

    if (existingIndex >= 0) {
      users[existingIndex] = { ...users[existingIndex], ...userData };
    } else {
      users.push(userData);
    }

    return await this.writeUsers(users);
  }

  async saveMessage(messageData) {
    const messages = this.readMessages();
    messages.push(messageData);
    return await this.writeMessages(messages);
  }

  async updateUserActivity(chatId) {
    const users = this.readUsers();
    const chatIdStr = String(chatId);
    const userIndex = users.findIndex((user) => String(user.chatId) === chatIdStr);

    if (userIndex >= 0) {
      users[userIndex].lastActivity = new Date().toISOString();
      return await this.writeUsers(users);
    }

    return false;
  }

  // Token management
  readTokens() {
    try {
      const data = fs.readFileSync(this.tokensFile, "utf8");
      const parsed = JSON.parse(data);
      return {
        access: parsed.access || null,
        refresh: parsed.refresh || null,
      };
    } catch (error) {
      console.error("[LocalStorage] Error reading tokens:", error.message);
      return { access: null, refresh: null };
    }
  }

  async saveTokens(accessToken, refreshToken) {
    const hasLock = await this.acquireLock();
    if (!hasLock) {
      console.error("[LocalStorage] Could not acquire lock for writing tokens");
      return false;
    }

    try {
      const tokens = {
        access: accessToken,
        refresh: refreshToken,
        updatedAt: new Date().toISOString(),
      };
      this.createBackup(this.tokensFile);
      fs.writeFileSync(this.tokensFile, JSON.stringify(tokens, null, 2));
      return true;
    } catch (error) {
      console.error("[LocalStorage] Error writing tokens:", error.message);
      return false;
    } finally {
      this.releaseLock();
    }
  }
}

module.exports = LocalStorage
