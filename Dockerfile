FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:web
FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/web-dist ./web-dist
COPY server ./server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 DATA_DIR=/data
VOLUME /data
EXPOSE 8080
CMD ["node","server/index.mjs"]
