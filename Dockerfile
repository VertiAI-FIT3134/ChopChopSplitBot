FROM node:18-alpine

WORKDIR /app

# Only keep NODE_ENV for build optimization
# All other environment variables will be loaded dynamically at runtime
ENV NODE_ENV=production

COPY . .

# Install dependencies including devDependencies
RUN npm ci --include=dev

# Build the application
# No environment variables needed at build time due to lazy loading
RUN npm run build

# Clean up dev dependencies
RUN npm ci --omit=dev

EXPOSE 3000

# Runtime command that uses Node's native environment loading
# This allows SvelteKit's $env/dynamic/private to work properly
# Environment variables like BOT_TOKEN and APP_HOST will be loaded on-demand
CMD ["node", "build"]