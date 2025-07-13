# NextBrain Backend Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build the application
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

# Create uploads directory
RUN mkdir -p uploads/users

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "run", "start:prod"]
