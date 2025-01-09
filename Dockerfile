FROM node:18-alpine

WORKDIR /app

# Add build arguments
ARG MONGO_URI
ARG NODE_ENV=production

# Set environment variables for build time
ENV MONGO_URI=$MONGO_URI
ENV NODE_ENV=$NODE_ENV

COPY . .

RUN npm ci

RUN npm run build

EXPOSE 3000

# Set runtime environment variables
ENV NODE_ENV=production

CMD [ "node", "-r", "dotenv/config", "build" ]