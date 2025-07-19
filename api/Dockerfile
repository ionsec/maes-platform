FROM node:24-alpine

# Install dependencies for node-gyp and Docker CLI
RUN apk add --no-cache python3 make g++ docker-cli

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy application code
COPY . .

# Create logs directory
RUN mkdir -p logs

EXPOSE 3000

CMD ["node", "src/index.js"]