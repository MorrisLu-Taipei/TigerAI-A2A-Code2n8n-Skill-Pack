# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
# Make sure tsx is kept in the final image
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/src/server ./src/server
COPY --from=build /app/tsconfig.json ./

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 3000

# Start server using tsx (native ESM support for .ts)
CMD ["npx", "tsx", "src/server/index.ts"]
