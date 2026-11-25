FROM php:8.3-fpm

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    git \
    unzip \
    libicu-dev \
    libxml2-dev \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Установка расширений PHP, необходимых Symfony
RUN docker-php-ext-install intl pdo_mysql xml pdo_pgsql pgsql

# Установка Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

# Создание пользователя с тем же UID/GID, что и на хосте
ARG USER_ID=1000
ARG GROUP_ID=1000
RUN groupadd -g ${GROUP_ID} vscode && \
    useradd -u ${USER_ID} -g vscode -m vscode && \
    usermod -aG sudo vscode

# Настраиваем PHP-FPM на работу от имени vscode, чтобы не было проблем с правами на var/cache и var/log
RUN sed -i 's/user = www-data/user = vscode/g' /usr/local/etc/php-fpm.d/www.conf && \
    sed -i 's/group = www-data/group = vscode/g' /usr/local/etc/php-fpm.d/www.conf

USER vscode
WORKDIR /workspace
