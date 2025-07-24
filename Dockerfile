FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build  # Build your Next.js app

EXPOSE 3000

CMD ["npm", "start"]