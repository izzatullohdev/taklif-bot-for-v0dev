# Production Deployment Guide

## Optimizations Implemented

### 1. Memory Management
- **Automatic cleanup** of inactive user states (30 minutes timeout)
- **Memory leak prevention** with periodic cleanup every 10 minutes
- **Activity tracking** for efficient memory usage

### 2. API Client Optimizations
- **Connection pooling** with keepAlive (max 50 sockets)
- **Circuit breaker pattern** to prevent cascading failures
- **Request queue management** for handling high load
- **Token refresh optimization** with request queuing

### 3. Error Handling
- **Production-ready logging** system with log levels
- **Graceful error recovery** with retry mechanisms
- **Circuit breaker** to handle API failures gracefully

### 4. Performance
- **Non-blocking operations** - all I/O operations are async
- **Optimized polling** interval (300ms)
- **Efficient caching** for courses and directions (1 hour TTL)
- **Connection reuse** with HTTP/HTTPS agents

### 5. Scalability
- **Handles 100+ concurrent users** without blocking
- **Memory-efficient** state management
- **Request throttling** built into API client

## Environment Variables

Create a `.env` file with:

```env
TELEGRAM_BOT_TOKEN=your_token_here
API_BASE_URL=https://taklifback.djangoacademy.uz/
NODE_ENV=production
LOG_LEVEL=INFO
API_TIMEOUT=15000
```

## Running in Production

1. **Install dependencies:**
   ```bash
   npm install --production
   ```

2. **Set environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Start the bot:**
   ```bash
   npm start
   ```

## Monitoring

The bot logs memory usage and active users every 10 minutes. Check logs for:
- Memory cleanup statistics
- API health status
- Circuit breaker state
- Active user count

## Performance Metrics

- **Memory cleanup**: Every 10 minutes
- **Inactive user timeout**: 30 minutes
- **API timeout**: 15 seconds (configurable)
- **Max concurrent requests**: 10
- **Circuit breaker threshold**: 5 failures

## Health Checks

The bot automatically:
- Checks API health on startup
- Monitors connection status
- Recovers from API failures
- Cleans up inactive sessions

## Troubleshooting

1. **High memory usage**: Check inactive user cleanup logs
2. **API errors**: Check circuit breaker state in logs
3. **Slow responses**: Check API timeout settings
4. **Connection issues**: Verify API_BASE_URL is correct
