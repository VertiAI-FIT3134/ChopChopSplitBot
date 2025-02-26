FROM node:18-alpine

WORKDIR /app

COPY . .

# Add build-time environment variables
ARG MONGO_URI
ENV MONGO_URI=${MONGO_URI}

ARG BOT_TOKEN
ENV BOT_TOKEN=${BOT_TOKEN}

ARG APP_HOST
ENV APP_HOST=${APP_HOST}

ARG APP_PORT
ENV APP_PORT=${APP_PORT}

ARG GEMINI_API_KEY
ENV GEMINI_API_KEY=${GEMINI_API_KEY}

ARG STRIPE_SECRET_KEY
ENV STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}

RUN npm ci

RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production

# Run the built application using the Node adapter output
CMD ["node", "build"]