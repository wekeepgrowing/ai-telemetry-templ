# Stage 1: Build the SEA (Single Executable Application)
FROM node:20-bullseye AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first (for better caching)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the project files
COPY . .

# Build TypeScript project
RUN npm run build

# Install esbuild and postject for SEA bundling (if not already in package.json)
RUN npm install --no-save esbuild postject

# Create directories
RUN mkdir -p dist bin

# Bundle the application
RUN npx esbuild dist/json-executor.js --bundle --platform=node --target=node20 --outfile=dist/bundled-executor.js

# Create SEA configuration file
RUN echo '{"main": "dist/bundled-executor.js", "output": "dist/sea-prep.blob", "disableExperimentalSEAWarning": true, "useSnapshot": false, "useCodeCache": true}' > dist/sea-config.json

# Generate SEA blob
RUN node --experimental-sea-config dist/sea-config.json

# Copy Node.js binary to create our executable
RUN cp $(which node) bin/ai-executor

# Use postject to inject the blob into the binary
RUN npx postject bin/ai-executor NODE_SEA_BLOB dist/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2

# Make the binary executable
RUN chmod +x bin/ai-executor

# Stage 2: Create a minimal runtime image
FROM debian:bullseye-slim

# Install any runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy only the executable from the builder stage
COPY --from=builder /app/bin/ai-executor /app/ai-executor

# Set executable permissions again (just to be safe)
RUN chmod +x /app/ai-executor

# Create a logs directory for the application
RUN mkdir -p /app/logs && chmod 777 /app/logs

# Set the entrypoint to the executable
ENTRYPOINT ["/app/ai-executor"]

# The application expects to receive JSON input via stdin
# Example usage:
# docker run -i --rm ai-executor < input.json