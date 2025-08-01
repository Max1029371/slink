ARG NODE_VERSION=22.14.0

ARG PHP_VERSION=8.4.6
ARG PHP_MEMORY_LIMIT=512M

ARG UPLOAD_MAX_FILESIZE_IN_BYTES=52428800

## NodeJS base image
FROM node:${NODE_VERSION}-alpine AS node

### NodeJS build ###
FROM node AS node-dependencies
WORKDIR /client

COPY services/client/package.json services/client/yarn.lock ./

RUN yarn install --frozen-lockfile --non-interactive --production=true && \
    yarn add vite

COPY services/client/plugins ./plugins
COPY services/client/src ./src
COPY services/client/static ./static
COPY services/client/svelte.config.js services/client/tsconfig.json services/client/vite.config.ts ./

RUN yarn build
### End of NodeJS build ###

### PHP source ###
FROM alpine AS source
WORKDIR /source

COPY services/api/bin ./bin
COPY services/api/config ./config
COPY services/api/public ./public
COPY services/api/src ./src
COPY services/api/composer.json ./
### End of PHP source ###

### PHP vendor ###
FROM composer:2 AS vendor
WORKDIR /dependencies

COPY services/api/composer.json services/api/composer.lock ./

RUN composer install --ignore-platform-reqs --no-interaction --no-scripts --prefer-dist
### End of PHP vendor ###

### Base build stage ###
FROM php:${PHP_VERSION}-alpine AS base
RUN apk update && apk upgrade &&\
    apk add --no-cache \
    supervisor \
    redis \
    libmcrypt \
    libcurl \
    icu-libs \
    libsmbclient \
    imagemagick \
    vips \
    vips-tools \
    libjpeg-turbo \
    libheif \
    libpng \
    libwebp \
    tiff \
    freetype \
    postgresql-libs

RUN apk add --no-cache --virtual .build-deps $PHPIZE_DEPS git autoconf g++ make linux-headers curl-dev libmcrypt-dev icu-dev imagemagick-dev vips-dev postgresql-dev libpng-dev libwebp-dev tiff-dev freetype-dev libjpeg-turbo-dev libheif-dev oniguruma-dev samba-dev brotli-dev libffi-dev && \
    docker-php-ext-install curl intl mysqli pdo_pgsql mbstring exif ffi && \
    pecl install imagick redis smbclient vips swoole && \
    docker-php-ext-enable imagick redis smbclient vips swoole && \
    apk del .build-deps

RUN echo "ffi.enable=1" > /usr/local/etc/php/conf.d/zz-ffi-enable.ini

COPY ./docker/config/supervisord.conf /etc/supervisord.conf

# Copy startup script
COPY ./docker/scripts/startup.sh /usr/local/bin/startup.sh
RUN chmod +x /usr/local/bin/startup.sh

# Copy Slink executable
COPY ./docker/scripts/slink /usr/local/bin/slink
RUN chmod +x /usr/local/bin/slink

# Set memory limit
ARG PHP_MEMORY_LIMIT
RUN echo "memory_limit=${PHP_MEMORY_LIMIT}" > /usr/local/etc/php/conf.d/memory-limit.ini

# Set upload max filesize
ARG UPLOAD_MAX_FILESIZE_IN_BYTES
RUN echo "upload_max_filesize = $((UPLOAD_MAX_FILESIZE_IN_BYTES / 1024 / 1024))M" > /usr/local/etc/php/conf.d/uploads.ini && \
    echo "post_max_size = $((UPLOAD_MAX_FILESIZE_IN_BYTES / 1024 / 1024))M" >> /usr/local/etc/php/conf.d/uploads.ini

# Set current timezone
RUN apk add --no-cache tzdata
RUN echo 'date.timezone = ${TZ}' > /usr/local/etc/php/conf.d/timezone.ini

WORKDIR /services

ENV API_URL=http://localhost:8080
ENV API_PREFIX=/api
ENV PROXY_PREFIXES="/api;/image"
ENV ORIGIN=http://localhost:3000
ENV TZ=UTC

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisord.conf"]
### End of base build stage ###

### Test image ###
FROM php:${PHP_VERSION}-alpine AS test
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /services/api

COPY services/api/composer.json services/api/composer.lock ./

RUN composer install --ignore-platform-reqs --no-interaction --no-scripts

COPY --chown=www-data:www-data ./services/api .

RUN mv .env.example .env
ENV APP_ENV=test

ARG PHP_MEMORY_LIMIT
RUN echo "memory_limit=${PHP_MEMORY_LIMIT}" > /usr/local/etc/php/conf.d/memory-limit.ini
### End of test image ###

### Development image ###
FROM base AS dev
RUN apk add --no-cache --virtual .build-deps $PHPIZE_DEPS autoconf g++ make linux-headers && \
    pecl install xdebug && \
    docker-php-ext-enable xdebug && \
    apk del .build-deps

# Configure Xdebug
RUN echo "xdebug.mode=debug" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini && \
    echo "xdebug.client_host=host.docker.internal" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini && \
    echo "xdebug.log=/dev/null" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini && \
    echo "xdebug.idekey=PHPSTORM" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini && \
    echo "xdebug.start_with_request=yes" >> /usr/local/etc/php/conf.d/docker-php-ext-xdebug.ini

# Install Symfony CLI
RUN curl -1sLf 'https://dl.cloudsmith.io/public/symfony/stable/setup.alpine.sh' | sh
RUN apk add --no-cache symfony-cli

COPY docker/config/runtime/develop.conf /etc/supervisor/conf.d/develop.conf

# Add NodeJS executables
COPY --from=node /usr/local/bin /usr/local/bin

# Add NPM dependencies
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules

# Add Yarn dependencies
COPY --from=node /opt /opt

COPY services/api/.env.example ./api/.env

ENV API_ENABLED=true
ENV APP_ENV=dev
ENV NODE_ENV=development
ENV SWOOLE_ENABLED=false
ENV PHP_IDE_CONFIG="serverName=localhost"

EXPOSE 5173
EXPOSE 8080
### End of development image ###

### Production image ###
FROM base AS prod
RUN docker-php-ext-enable swoole opcache

COPY docker/config/runtime/production.conf /etc/supervisor/conf.d/production.conf

COPY --from=node /usr/local/bin/node /usr/local/bin/node

# Create non-root user
RUN addgroup -g 1000 slink && \
    adduser -D -u 1000 -G slink slink

# Source code
COPY --from=vendor --chown=slink:slink /dependencies/vendor ./api/vendor
COPY --from=source --chown=slink:slink /source ./api
COPY --from=node-dependencies --chown=slink:slink /client/build ./client/svelte-kit
COPY --from=node-dependencies --chown=slink:slink /client/package.json ./client/svelte-kit/package.json
COPY --chown=slink:slink services/api/.env.example ./api/.env

# Create project directories
RUN mkdir -p /app/var/data && \
    mkdir -p /app/slink && \
    chown -R slink:slink /app/var /app/slink

ENV API_ENABLED=false
ENV APP_ENV=prod
ENV NODE_ENV=production
ENV SWOOLE_ENABLED=true

# Set Node Adapter Size Limit
ARG UPLOAD_MAX_FILESIZE_IN_BYTES
ENV BODY_SIZE_LIMIT=${UPLOAD_MAX_FILESIZE_IN_BYTES}

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/api/health || exit 1
### End of production image ###