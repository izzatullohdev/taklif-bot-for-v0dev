# 📡 API Endpointlar Ro'yxati

## 🔐 Autentifikatsiya API (std-back.usat-ai-lab.uz)

**Base URL:** `http://std-back.usat-ai-lab.uz/api/v1`

### 1. Login (Kirish)
- **Method:** `POST`
- **Endpoint:** `/auth/login`
- **URL:** `http://std-back.usat-ai-lab.uz/api/v1/auth/login`
- **Headers:** 
  - `Content-Type: application/json`
- **Body:**
  ```json
  {
    "username": "admin",
    "password": "admin123"
  }
  ```
- **Response:** 
  ```json
  {
    "access": "access_token_here",
    "refresh": "refresh_token_here"
  }
  ```
- **Maqsad:** Bot ishga tushganda avtomatik login qiladi va tokenlarni saqlaydi
- **Funksiya:** `apiClient.login(username, password)`

### 2. Token Refresh (Token yangilash)
- **Method:** `POST`
- **Endpoint:** `/auth/refresh`
- **URL:** `http://std-back.usat-ai-lab.uz/api/v1/auth/refresh`
- **Headers:** 
  - `Content-Type: application/json`
- **Body:**
  ```json
  {
    "refresh": "refresh_token_here"
  }
  ```
- **Response:**
  ```json
  {
    "access": "new_access_token",
    "refresh": "new_refresh_token" // optional
  }
  ```
- **Maqsad:** Access token muddati tugaganda avtomatik yangilaydi
- **Funksiya:** `apiClient.refreshAccessToken()`
- **Avtomatik ishlaydi:** 401 xatolik kelganda

### 3. Talaba ma'lumotlarini tekshirish (PINFL bo'yicha)
- **Method:** `GET`
- **Endpoint:** `/students/by-pinfl/{pinfl}`
- **URL:** `http://std-back.usat-ai-lab.uz/api/v1/students/by-pinfl/{pinfl}`
- **Headers:** 
  - `Authorization: Bearer {access_token}`
  - `Content-Type: application/json`
- **Parametrlar:**
  - `pinfl` - Passport JSHIR (14 raqam)
- **Response:**
  ```json
  {
    "id": 123,
    "full_name": "Ism Familiya",
    "pinfl": "12345678901234",
    "phone": "+998901234567",
    "group_id": 1,
    "group": {
      "course": 2,
      "field": {
        "title": "Dasturlash"
      }
    }
  }
  ```
- **Maqsad:** Foydalanuvchi Passport JSHIR kiritganda, talaba ekanligini tekshiradi
- **Funksiya:** `apiClient.checkStudentByPINFL(pinfl)`
- **Xatoliklar:**
  - `404` - Talaba topilmadi
  - `401` - Token eskirgan, avtomatik yangilanadi

---

## 📝 Taklif/Shikoyat API (usat-taklif-backend.onrender.com)

**Base URL:** `https://taklifback.djangoacademy.uz/`

### 4. Foydalanuvchi mavjudligini tekshirish
- **Method:** `GET`
- **Endpoint:** `/users/{chatId}` yoki `/users?chatId={chatId}`
- **URL:** 
  - `https://taklifback.djangoacademy.uz//users/{chatId}`
  - `https://taklifback.djangoacademy.uz//users?chatId={chatId}`
- **Headers:** 
  - `Authorization: Bearer {access_token}` (agar kerak bo'lsa)
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "user": {
        "chatId": "123456789",
        "fullName": "Ism Familiya",
        "phone": "+998901234567",
        "course": "2-kurs",
        "direction": "Dasturlash",
        "language": "uz"
      }
    }
  }
  ```
- **Maqsad:** Foydalanuvchi ro'yxatdan o'tganligini tekshiradi
- **Funksiya:** `apiClient.checkUserExists(chatId)`
- **Xatoliklar:**
  - `404` - Foydalanuvchi topilmadi (normal holat)

### 5. Foydalanuvchini ro'yxatdan o'tkazish
- **Method:** `POST`
- **Endpoint:** `/users`
- **URL:** `https://taklifback.djangoacademy.uz//users`
- **Headers:** 
  - `Content-Type: application/json`
  - `Authorization: Bearer {access_token}` (agar kerak bo'lsa)
- **Body:**
  ```json
  {
    "chatId": "123456789",
    "fullName": "Ism Familiya",
    "phone": "+998901234567",
    "course": "2-kurs",
    "direction": "Dasturlash",
    "language": "uz"
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "user": { ... }
    }
  }
  ```
- **Maqsad:** Yangi foydalanuvchini ro'yxatdan o'tkazadi
- **Funksiya:** `apiClient.registerUser(userData)`
- **Xatoliklar:**
  - `400` - Noto'g'ri ma'lumotlar
  - `409` - Foydalanuvchi allaqachon mavjud

### 6. Foydalanuvchi faolligini yangilash
- **Method:** `PUT`
- **Endpoint:** `/users/{chatId}`
- **URL:** `https://taklifback.djangoacademy.uz//users/{chatId}`
- **Headers:** 
  - `Content-Type: application/json`
  - `Authorization: Bearer {access_token}` (agar kerak bo'lsa)
- **Body:**
  ```json
  {
    "lastActivity": "2025-12-12T10:30:00.000Z"
  }
  ```
- **Maqsad:** Foydalanuvchi so'nggi faollik vaqtini yangilaydi
- **Funksiya:** `apiClient.updateUserActivity(chatId)`
- **Xatoliklar:**
  - `404` - Endpoint mavjud emas (e'tiborsiz qoldiriladi)

### 7. Xabar yuborish (Taklif/Shikoyat)
- **Method:** `POST`
- **Endpoint:** `/messages`
- **URL:** `https://taklifback.djangoacademy.uz//messages`
- **Headers:** 
  - `Content-Type: application/json`
  - `Authorization: Bearer {access_token}` (agar kerak bo'lsa)
- **Body:**
  ```json
  {
    "messageId": "unique_message_id",
    "userId": "123456789",
    "chatId": "123456789",
    "timestamp": "2025-12-12T10:30:00.000Z",
    "status": "pending",
    "ticketType": "suggestion" | "complaint",
    "text": "Xabar matni...",
    "language": "uz" | "ru",
    "isactive": true,
    "substatus": "category_name" // faqat complaint uchun majburiy
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "message": { ... }
    }
  }
  ```
- **Maqsad:** Foydalanuvchi taklif yoki shikoyatini yuboradi
- **Funksiya:** `apiClient.saveMessage(messageData)`
- **Xatoliklar:**
  - `400` - Noto'g'ri ma'lumotlar
  - `413` - Xabar juda katta

### 8. Foydalanuvchi xabarlarini olish
- **Method:** `GET`
- **Endpoint:** `/messages?userId={chatId}&limit={limit}`
- **URL:** `https://taklifback.djangoacademy.uz//messages?userId={chatId}&limit=10`
- **Headers:** 
  - `Authorization: Bearer {access_token}` (agar kerak bo'lsa)
- **Parametrlar:**
  - `userId` - Telegram chat ID
  - `limit` - Xabarlar soni (default: 10)
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "messages": [ ... ]
    }
  }
  ```
- **Maqsad:** Foydalanuvchi yuborgan xabarlar ro'yxatini oladi
- **Funksiya:** `apiClient.getUserMessages(chatId, limit)`

### 9. Health Check (Server holatini tekshirish)
- **Method:** `GET`
- **Endpoint:** `/health` → `/` → `/users?limit=1`
- **URL:** 
  - `https://taklifback.djangoacademy.uz//health`
  - `https://taklifback.djangoacademy.uz//` (fallback)
  - `https://taklifback.djangoacademy.uz//users?limit=1` (last resort)
- **Maqsad:** API server ishlayotganini tekshiradi
- **Funksiya:** `apiClient.healthCheck()`
- **Qaytaradi:** `true` yoki `false`

---

## 🔄 Avtomatik Mexanizmlar

### Token Yangilash
- **Qachon ishlaydi:** 401 xatolik kelganda
- **Qanday ishlaydi:**
  1. 401 xatolik keladi
  2. `refreshAccessToken()` chaqiriladi
  3. Yangi token olinadi
  4. Asl so'rov qayta yuboriladi
  5. Agar refresh ham ishlamasa, qayta login qilinadi

### Avtomatik Login
- **Qachon ishlaydi:** 
  - Bot ishga tushganda
  - Token mavjud emas bo'lganda
  - Token yangilash ishlamaganda
- **Credentials:** 
  - `username: admin`
  - `password: admin123`

### Token Saqlash
- **Fayl:** `data/tokens.json`
- **Format:**
  ```json
  {
    "access": "access_token",
    "refresh": "refresh_token",
    "updatedAt": "2025-12-12T10:30:00.000Z"
  }
  ```

---

## 📊 API Client Metodlari

| Metod | Maqsad | Base URL |
|-------|--------|----------|
| `login()` | Autentifikatsiya | std-back |
| `refreshAccessToken()` | Token yangilash | std-back |
| `checkStudentByPINFL()` | Talaba tekshirish | std-back |
| `checkUserExists()` | Foydalanuvchi tekshirish | taklif-backend |
| `registerUser()` | Ro'yxatdan o'tkazish | taklif-backend |
| `updateUserActivity()` | Faollik yangilash | taklif-backend |
| `saveMessage()` | Xabar yuborish | taklif-backend |
| `getUserMessages()` | Xabarlarni olish | taklif-backend |
| `healthCheck()` | Server holati | taklif-backend |
| `ensureAuthenticated()` | Token mavjudligini ta'minlash | - |

---

## ⚠️ Xatoliklar va Yechimlar

### 400 Bad Request
- **Sabab:** Noto'g'ri ma'lumotlar yuborilgan
- **Yechim:** Ma'lumotlarni tekshirish va to'g'rilash

### 401 Unauthorized
- **Sabab:** Token eskirgan yoki yo'q
- **Yechim:** Avtomatik token yangilash yoki qayta login

### 404 Not Found
- **Sabab:** Endpoint yoki resurs topilmadi
- **Yechim:** Endpoint manzilini tekshirish

### 409 Conflict
- **Sabab:** Foydalanuvchi allaqachon mavjud
- **Yechim:** Normal holat, e'tiborsiz qoldiriladi

---

## 🔧 Konfiguratsiya

**Fayl:** `config/config.js`

```javascript
{
  api: {
    baseURL: "https://taklifback.djangoacademy.uz/",
    timeout: 10000,
    retryAttempts: 3,
    retryDelay: 1000
  }
}
```

**Environment Variables:**
- `API_BASE_URL` - API base URL (optional)
- `API_TIMEOUT` - So'rov timeout (optional)
- `API_RETRY_ATTEMPTS` - Qayta urinishlar soni (optional)
- `API_RETRY_DELAY` - Qayta urinish orasidagi vaqt (optional)

