# Use official Node.js 20+ image with Debian base
FROM node:20-slim

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install --production

# Copy application code
COPY price.js ./

# Expose HTTPS port
EXPOSE 443

# Run the app
CMD ["node", "price.js"]
