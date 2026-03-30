FROM node:20-slim
WORKDIR /app
COPY index.ts ./
RUN npm install -g tsx
USER node
EXPOSE 8080
CMD ["tsx", "index.ts"]
