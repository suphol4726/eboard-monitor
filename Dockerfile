FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm ci

# Copy full application code
COPY . .

# Build Vite frontend & Express esbuild CJS server
RUN npm run build

# Expose port 3000
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Start server
CMD ["npm", "run", "start"]
