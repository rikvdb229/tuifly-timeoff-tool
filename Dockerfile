# Use official Node.js image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install dependencies for node-gyp (required by some npm packages)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create logs directory
RUN mkdir -p logs

# Set environment to indicate Docker runtime
ENV DOCKER_ENV=true

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "src/server.js"]