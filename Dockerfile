FROM node:18
WORKDIR /app

# Copy package descriptors and install dependencies at build time
COPY package*.json ./
RUN npm ci

# Copy the remainder of your source code
COPY . .

# Default command
CMD ["npm", "run", "dev"]
