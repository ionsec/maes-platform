FROM node:24-alpine

# Update package index and install required packages
RUN apk update && apk add --no-cache \
    git \
    ca-certificates \
    curl \
    wget

# Set timezone
ENV TZ=UTC

# Install xsv for CSV processing (optional)
# RUN curl -L https://github.com/BurntSushi/xsv/releases/download/0.13.0/xsv-0.13.0-x86_64-unknown-linux-musl.tar.gz | \
#     tar xz -C /usr/local/bin/

# Install IPinfo CLI (optional)
# RUN curl -L https://github.com/ipinfo/cli/releases/download/ipinfo-3.3.1/ipinfo_3.3.1_linux_amd64.tar.gz | \
#     tar xz -C /usr/local/bin/

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create directories
RUN mkdir -p /input /output

# Create non-root user
RUN addgroup -g 1001 -S analyzer && \
    adduser -S analyzer -u 1001 -G analyzer

# Change ownership
RUN chown -R analyzer:analyzer /app /input /output

USER analyzer

CMD ["node", "src/index.js"]