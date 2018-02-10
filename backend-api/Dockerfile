FROM node:8.1.0-alpine

LABEL  author="hstarorg" email="hm910705@163.com"

COPY  docker/dumb-init /usr/local/bin/dumb-init

COPY dist /dist

ENTRYPOINT ["/usr/local/bin/dumb-init", "--"]

WORKDIR /dist

EXPOSE 5002

CMD ["node", "index.js"]

