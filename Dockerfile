# ----------  Build ----------
FROM node:20-alpine AS builder

WORKDIR /app

# System dependencies
RUN apk add --no-cache git

# Copy package files
COPY package*.json ./

# Install all dependencies
RUN npm ci

# Copy all sources
COPY . .

# Build TypeScript
RUN npm run build


# ---------- Runtime ----------
ENV NODE_ENV=production

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache nano

COPY package*.json ./

# Install prod dependencies only
WORKDIR /app
RUN npm ci --omit=dev

# Copy built JS files from builder
COPY --from=builder /app/dist ./dist

# Create logbook directory
RUN mkdir -p /app/logbooks

# Add non-root user
RUN mkdir -p /app/logbooks && \
    addgroup -g 1001 -S logbookuser && \
    adduser -S -D -H -u 1001 -G logbookuser logbookuser && \
    chown -R logbookuser:logbookuser /app

USER logbookuser

WORKDIR /app
