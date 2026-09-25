FROM node:24-alpine
WORKDIR /relay
RUN npm install --no-save --no-package-lock ws@8.21.3
COPY server.mts .
ENV PORT=8080
USER node
EXPOSE 8080
CMD ["node", "server.mts"]
