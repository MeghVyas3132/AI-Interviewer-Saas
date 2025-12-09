FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies  
RUN npm install

# Copy all source code
COPY . .

# Clean .next cache to avoid stale builds
RUN rm -rf .next

# Expose port
EXPOSE 3000

# Start the application in development mode
CMD ["npm", "run", "dev"]
