# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files (yarn)
COPY package.json yarn.lock ./

# Install yarn if not present and install ALL dependencies
RUN corepack enable && corepack prepare yarn@stable --activate && \
    yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN yarn build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files (yarn)
COPY package.json yarn.lock ./

# Install yarn and ONLY production dependencies
RUN corepack enable && corepack prepare yarn@stable --activate && \
    yarn install --frozen-lockfile --production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port (Railway will override with PORT env var)
EXPOSE 3000

# Start application
CMD ["yarn", "start"]
