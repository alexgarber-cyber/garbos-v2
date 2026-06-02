FROM node:22-slim

WORKDIR /app

# Dependency layer — cached unless package manifests change.
COPY package.json package-lock.json* ./
RUN npm install

# App source is bind-mounted in dev; copied here for prod/standalone builds.
COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
