#!/bin/bash

# TUIfly Time-Off Tool - Production Deployment Script

echo "🚀 TUIfly Time-Off Tool - Production Deployment"
echo "=============================================="

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo "❌ Error: .env.production not found!"
    echo "💡 Copy .env.production.example to .env.production and update values"
    exit 1
fi

# Pull latest code (optional - comment out if deploying from local)
# git pull origin master

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker-compose -f docker-compose.prod.yml down

# Build new image
echo "🔨 Building Docker image..."
docker-compose -f docker-compose.prod.yml build

# Start services
echo "🚀 Starting services..."
docker-compose -f docker-compose.prod.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
echo "🏥 Checking application health..."
curl -f http://localhost:3000/health || echo "❌ Health check failed!"

# Show logs
echo "📋 Recent logs:"
docker-compose -f docker-compose.prod.yml logs --tail=50 app

echo ""
echo "✅ Deployment complete!"
echo "🌐 Application should be available at: http://localhost:3000"
echo ""
echo "📝 Useful commands:"
echo "   - View logs: docker-compose -f docker-compose.prod.yml logs -f app"
echo "   - Stop services: docker-compose -f docker-compose.prod.yml down"
echo "   - Restart app: docker-compose -f docker-compose.prod.yml restart app"
echo "   - Check status: docker-compose -f docker-compose.prod.yml ps"