FROM node:24.15.0-alpine3.23 AS build

WORKDIR /usr/src/app

COPY package.json package-lock.json /usr/src/app/

RUN npm ci

COPY . .

RUN npm run build

FROM node:24.15.0-alpine3.23

WORKDIR /app

COPY --from=build /usr/src/app/package.json /app/
COPY --from=build /usr/src/app/node_modules/ /app/node_modules/
COPY --from=build /usr/src/app/build /app/

EXPOSE 3000

CMD [ "node", "index.js" ]
