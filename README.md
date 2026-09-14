# ConstructionProjects

Учётная система строительных проектов: ввод данных через формы и импорт Excel,
реестры с фильтрами, дашборд, выгрузка в Excel/PDF и печать.

- Требования — [docs/ТЗ.md](docs/ТЗ.md)
- Стек и соглашения — [docs/АРХИТЕКТУРА.md](docs/АРХИТЕКТУРА.md)
- План разработки — [docs/РОАДМАП.md](docs/РОАДМАП.md)

## Что нужно установить

| Инструмент     | Версия           | Зачем                        |
| -------------- | ---------------- | ---------------------------- |
| Node.js        | 24 (npm 11)      | приложение и инструменты     |
| Docker Desktop | актуальная       | PostgreSQL 16 для разработки |
| Git            | любая актуальная |                              |

## Локальный запуск

1. Создайте `.env` из примера:

   ```bash
   cp .env.example .env
   ```

   В PowerShell: `Copy-Item .env.example .env`.

   Задайте `POSTGRES_PASSWORD` и подставьте **тот же пароль** в `DATABASE_URL`.
   Задайте `SEED_ADMIN_PASSWORD` — начальный пароль учётной записи `admin`
   (не короче 10 символов, буквы и цифры); без него сид не запустится.

2. Поднимите базу данных:

   ```bash
   docker compose up -d db
   ```

   PostgreSQL 16 слушает `localhost:5432`, данные хранятся в томе `db-data`.

3. Установите зависимости. Клиент Prisma генерируется автоматически
   (скрипт `postinstall`) в `src/generated/prisma`:

   ```bash
   npm install
   ```

4. Примените миграции:

   ```bash
   npx prisma migrate dev
   ```

5. Создайте первого администратора:

   ```bash
   npm run db:seed
   ```

   Логин `admin`, пароль — из `SEED_ADMIN_PASSWORD`, при первом входе его
   потребуется сменить. Повторный запуск ничего не меняет, если `admin` уже есть.

6. Запустите приложение:

   ```bash
   npm run dev
   ```

   Откройте http://localhost:3000.

## Команды

| Команда                                   | Что делает                                 |
| ----------------------------------------- | ------------------------------------------ |
| `npm run dev`                             | сервер разработки на http://localhost:3000 |
| `npm run build` / `npm start`             | продакшн-сборка и её запуск                |
| `npm run lint`                            | ESLint                                     |
| `npm run typecheck`                       | проверка типов TypeScript                  |
| `npm test`                                | модульные тесты (Vitest), `tests/unit`     |
| `npm run test:e2e`                        | сквозные тесты (Playwright), `tests/e2e`   |
| `npm run format` / `npm run format:check` | форматирование Prettier                    |
| `npm run db:seed`                         | создать администратора `admin`             |
| `npm run db:studio`                       | Prisma Studio — просмотр данных в браузере |
| `npx prisma migrate dev --name <имя>`     | создать и применить миграцию схемы         |

Перед сдачей задачи должны проходить `npm run lint`, `npm run typecheck` и `npm test`.

Перед первым запуском сквозных тестов скачайте браузер (один раз на машину):

```bash
npx playwright install chromium
```

`npm run test:e2e` сам запускает `npm run dev`, если сервер ещё не запущен.

## Переменные окружения

| Переменная            | Назначение                                       |
| --------------------- | ------------------------------------------------ |
| `POSTGRES_PASSWORD`   | пароль пользователя `postgres` в контейнере базы |
| `DATABASE_URL`        | строка подключения приложения и Prisma к базе    |
| `SEED_ADMIN_PASSWORD` | начальный пароль учётной записи `admin` для сида |

Настоящий `.env` в git не попадает; все переменные перечислены в `.env.example`.

## Структура

```
├── docker-compose.yml     # PostgreSQL 16
├── prisma/
│   ├── schema.prisma      # схема БД (описание — docs/СХЕМА-БД.md)
│   ├── migrations/        # миграции, применённые не редактируются
│   └── seed.ts            # первый администратор
├── prisma.config.ts       # конфигурация Prisma CLI (читает .env, команда сида)
├── messages/ru.json       # все тексты интерфейса
├── src/
│   ├── app/               # маршруты Next.js (App Router)
│   ├── components/ui/     # компоненты shadcn/ui
│   ├── i18n/request.ts    # next-intl: локаль ru без префикса в URL
│   ├── lib/auth/          # хэширование паролей (Argon2id)
│   ├── lib/db.ts          # клиент Prisma
│   ├── lib/format.ts      # даты, время и числа (Europe/Kyiv)
│   └── generated/prisma/  # сгенерированный клиент Prisma, не в git
└── tests/
    ├── unit/              # Vitest
    └── e2e/               # Playwright
```

## Частые проблемы

- **`Cannot find module '@/generated/prisma/client'`** — клиент не сгенерирован:
  выполните `npx prisma generate`.
- **Prisma не подключается к базе** — проверьте, что контейнер запущен
  (`docker compose ps`) и пароль в `DATABASE_URL` совпадает с `POSTGRES_PASSWORD`.
  Пароль задаётся при первом создании тома: если его поменяли позже, пересоздайте
  том командой `docker compose down -v` — **это удалит все данные базы**.
- **Порт 5432 занят** — на машине уже работает другой PostgreSQL; остановите его
  или поменяйте левую часть `ports` в `docker-compose.yml` и порт в `DATABASE_URL`.
