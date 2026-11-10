FROM node:22-alpine
WORKDIR /app
# install dependencies first so Docker can cache this layer
COPY package*.json ./
RUN npm ci
# then copy the source
COPY . .
CMD ["npm", "start"]
