# Stage 1: Build Node.js application
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy package management files
COPY package.json package-lock.json ./
RUN npm install

# Copy application source code
COPY . .

# Build the Nitro server for production
RUN npm run build

# Stage 2: Production runtime with Python and Node.js
FROM node:20-bookworm-slim

WORKDIR /app

# Install Python 3 and pip
RUN apt-get update && \
    apt-get install -y python3 python3-pip python3-venv libgl1 libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

# Set up Python virtual environment and install schemdraw
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy built Node app from builder stage
COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src/lib/python ./src/lib/python

# Expose port for Render
ENV PORT=8080
EXPOSE 8080

# Start the Nitro server
CMD ["node", ".output/server/index.mjs"]
