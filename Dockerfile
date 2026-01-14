# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files (yarn v1)
COPY package.json yarn.lock ./

# Install yarn v1 globally and install ALL dependencies
RUN npm install -g yarn@1.22.22 && \
    yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN yarn build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files (yarn v1)
COPY package.json yarn.lock ./

# Install yarn v1 and ONLY production dependencies
RUN npm install -g yarn@1.22.22 && \
    yarn install --frozen-lockfile --production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Expose port (Railway will override with PORT env var)
EXPOSE 3000

# Start application
CMD ["yarn", "start"]
