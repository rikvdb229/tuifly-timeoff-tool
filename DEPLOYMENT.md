# TUIfly Time-Off Tool - Production Deployment Guide

## 🚀 Quick Fix for Current Issue

The server startup issue is caused by Express binding to 'localhost' instead of '0.0.0.0' in Docker. Here's the fix:

### Immediate Fix on Raspberry Pi:

1. **Update your .env.production file:**
```bash
# Keep these as-is for now
HOST=localhost
APP_URL=http://localhost:3000
```

2. **Deploy the updated code:**
```bash
# Copy the updated files to your Pi
scp src/server.js pi@your-pi-ip:/path/to/tuifly-timeoff/src/
scp src/app.js pi@your-pi-ip:/path/to/tuifly-timeoff/src/
scp src/services/emailNotificationService.js pi@your-pi-ip:/path/to/tuifly-timeoff/src/services/
scp Dockerfile pi@your-pi-ip:/path/to/tuifly-timeoff/
scp docker-compose.prod.yml pi@your-pi-ip:/path/to/tuifly-timeoff/

# SSH to your Pi
ssh pi@your-pi-ip

# Navigate to project
cd /path/to/tuifly-timeoff

# Rebuild and restart
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Check logs
docker-compose -f docker-compose.prod.yml logs -f app
```

## 📋 What Was Fixed

1. **Server Binding**: Server now binds to `0.0.0.0` in production/Docker environments
2. **Environment Variables**: Added `APP_URL` support throughout the application
3. **Docker Configuration**: Proper health checks and networking
4. **Error Handling**: Better server startup error messages

## 🔧 Full Production Setup with Custom Domain

Once you have a domain (e.g., DuckDNS):

1. **Update .env.production:**
```env
HOST=your-domain.duckdns.org
APP_URL=https://your-domain.duckdns.org
CORS_ORIGIN=https://your-domain.duckdns.org
GOOGLE_REDIRECT_URI=https://your-domain.duckdns.org/auth/google/callback
GOOGLE_GMAIL_REDIRECT_URI=https://your-domain.duckdns.org/auth/google/gmail/callback
SESSION_COOKIE_SECURE=true
```

2. **Update Google OAuth:**
   - Go to Google Cloud Console
   - Add your domain to authorized redirect URIs
   - Add both HTTP and HTTPS versions during testing

3. **Set up HTTPS with Caddy (recommended):**
```yaml
# Add to docker-compose.prod.yml
caddy:
  image: caddy:alpine
  container_name: tuifly-caddy
  restart: unless-stopped
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile
    - caddy_data:/data
    - caddy_config:/config
  networks:
    - tuifly-network
```

Create `Caddyfile`:
```
your-domain.duckdns.org {
    reverse_proxy app:3000
}
```

## 🐛 Troubleshooting

### Container won't start:
```bash
# Check logs
docker-compose -f docker-compose.prod.yml logs app

# Check if port is in use
sudo lsof -i :3000

# Restart everything
docker-compose -f docker-compose.prod.yml down -v
docker-compose -f docker-compose.prod.yml up -d
```

### Database connection issues:
```bash
# Check database logs
docker-compose -f docker-compose.prod.yml logs postgres

# Test connection
docker exec -it tuifly-postgres psql -U tuifly_user -d tuifly_prod
```

### Health check:
```bash
# From Pi
curl http://localhost:3000/health

# From remote
curl http://your-pi-ip:3000/health
```

## 📝 Environment Variables Reference

### Required for Production:
- `NODE_ENV=production`
- `PORT=3000` (don't change)
- `HOST=your-domain` (for display)
- `APP_URL=https://your-domain` (full URL)
- `DATABASE_URL` (PostgreSQL connection)
- `REDIS_URL` (Redis connection)
- `SESSION_SECRET` (generate with: openssl rand -hex 32)
- `GOOGLE_CLIENT_ID` (from Google Console)
- `GOOGLE_CLIENT_SECRET` (from Google Console)

### Optional but Recommended:
- `TOKEN_ENCRYPTION_KEY` (32 chars)
- `SMTP_*` (for email notifications)
- `ADMIN_NOTIFICATION_EMAIL`
- `CALENDAR_BOOKING_WINDOW_MONTHS`

## 🎯 Next Steps

1. Test locally first with docker-compose
2. Set up DuckDNS or similar for your Pi
3. Configure Google OAuth with your domain
4. Deploy with HTTPS using Caddy
5. Set up backups for PostgreSQL data

## 📞 Support

Check logs first:
```bash
docker-compose -f docker-compose.prod.yml logs -f
```

The application now properly:
- Binds to 0.0.0.0 in Docker
- Uses APP_URL for all external URLs
- Supports both HTTP and HTTPS
- Has proper health checks
- Shows clear error messages