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

   Логин `admin`, пароль — из `SEED_ADMIN_PASSWORD`. Пароли пользователей
   назначает и сбрасывает только администратор. Повторный запуск ничего
   не меняет, если `admin` уже есть.

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
| `npm run typecheck`                       | типы маршрутов Next.js и проверка типов    |
| `npm test`                                | модульные тесты и тесты с базой (Vitest)   |
| `npm run test:e2e`                        | сквозные тесты (Playwright)                |
| `npm run test:db:init`                    | пересоздать тестовые базы                  |
| `npm run format` / `npm run format:check` | форматирование Prettier                    |
| `npm run db:seed`                         | создать администратора `admin`             |
| `npm run db:studio`                       | Prisma Studio — просмотр данных в браузере |
| `npx prisma migrate dev --name <имя>`     | создать и применить миграцию схемы         |

Перед сдачей задачи должны проходить `npm run lint`, `npm run typecheck` и `npm test`.

В Windows PowerShell команды `npm` и `npx` могут не запускаться из-за политики выполнения
скриптов — тогда пишите `npm.cmd` и `npx.cmd`, например `npm.cmd test`
(подробнее — в «Частых проблемах»).

## Тесты

| Набор                 | Где          | Что проверяет                                                                                                      |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------ |
| Модульные (Vitest)    | `tests/unit` | чистые функции: матрица прав, `diffEntity`, схемы Zod, форматы, файлы выгрузки                                     |
| С базой (Vitest)      | `tests/db`   | server actions и выборки на настоящей базе: права, последний администратор, журнал аудита, вход, выгрузка          |
| Сквозные (Playwright) | `tests/e2e`  | вход, создание пользователя, ограничения менеджера, деактивация — в Chromium и WebKit, вход ещё и на ширине 360 px |

В тестах с базой приложение работает с настоящей PostgreSQL. Подменяется только то, что даёт
запросу Next.js: cookie и заголовки, переводы (берутся из настоящего `messages/ru.json`)
и кеш страниц.

### Тестовые базы

Тесты не обращаются к базе разработчика. На том же сервере PostgreSQL используются отдельные
базы — имя из `DATABASE_URL` с суффиксом:

- `constructionprojects_test` — Vitest;
- `constructionprojects_e2e_test` — Playwright.

Базы разные, чтобы `npm test` и `npm run test:e2e` можно было запускать одновременно.
Прогон сам создаёт базу, если её нет, и применяет недостающие миграции. Vitest очищает все
таблицы перед каждым тестом с базой, поэтому такие файлы выполняются по очереди. Playwright
очищает базу в начале прогона, а каждый тест создаёт своих пользователей с уникальными
логинами — тесты не зависят ни от порядка, ни от данных прошлого запуска. Очистка отказывается
работать с базой, имя которой не оканчивается на `_test`.

Пересоздать обе тестовые базы с нуля (например, если база сломана вручную):

```bash
npm run test:db:init
```

### Запуск

1. Запустите контейнер базы: `docker compose up -d db` — он нужен и для `npm test`.
2. Один раз на машину скачайте браузеры Playwright:

   ```bash
   npx playwright install chromium webkit
   ```

3. Запустите наборы:

   ```bash
   npm test
   ```

   ```bash
   npm run test:e2e
   ```

`npm run test:e2e` поднимает собственный dev-сервер на http://localhost:3100 с тестовой базой
и каталогом сборки `.next-e2e`, поэтому не мешает запущенному `npm run dev`. Порт 3100 должен
быть свободен: чужой сервер на нём не переиспользуется. Первый прогон дольше — dev-сервер
компилирует страницы.

Выборочный запуск:

```bash
npx vitest run --configLoader runner --project db tests/db/sign-in.test.ts
```

```bash
npx playwright test --project webkit tests/e2e/login.spec.ts
```

Если сквозной тест упал, трасса лежит в `test-results/`; открыть её —
`npx playwright show-trace <путь к trace.zip>`.

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
│   ├── app/
│   │   ├── (auth)/        # страница входа
│   │   ├── (app)/         # защищённая зона
│   │   ├── print/         # печатное представление отчётов
│   │   └── api/export/    # выгрузка в Excel и PDF
│   ├── features/auth/     # server actions входа/выхода, схемы Zod, формы
│   ├── components/ui/     # компоненты shadcn/ui
│   ├── i18n/request.ts    # next-intl: локаль ru без префикса в URL
│   ├── lib/auth/          # сессии, текущий пользователь, хэширование паролей (Argon2id)
│   ├── lib/db.ts          # клиент Prisma
│   ├── lib/export/        # выгрузка в Excel, PDF и печать из описания колонок
│   ├── lib/format.ts      # даты, время и числа (Europe/Kyiv)
│   ├── middleware.ts      # без cookie сессии — перенаправление на /login
│   └── generated/prisma/  # сгенерированный клиент Prisma, не в git
└── tests/
    ├── unit/              # Vitest: чистые функции
    ├── db/                # Vitest: actions и выборки на тестовой базе
    ├── e2e/               # Playwright
    └── support/           # тестовые базы: имена, миграции, очистка
```

## Частые проблемы

- **`npm.ps1 cannot be loaded because running scripts is disabled on this system`** — Windows PowerShell
  запрещает скрипты `.ps1`, а `npm` и `npx` запускаются через них. Вызывайте `npm.cmd` и `npx.cmd`
  (`npm.cmd test`, `npm.cmd run test:e2e`, `npx.cmd prisma migrate dev`) — они работают без смены политики.
  Чтобы обычный `npm` заработал всегда, разрешите локальные скрипты для своей учётной записи:
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. В Git Bash и терминале VS Code с bash проблемы нет.
- **`Cannot find module '@/generated/prisma/client'`** — клиент не сгенерирован:
  выполните `npx prisma generate`.
- **Prisma не подключается к базе** — проверьте, что контейнер запущен
  (`docker compose ps`) и пароль в `DATABASE_URL` совпадает с `POSTGRES_PASSWORD`.
  Пароль задаётся при первом создании тома: если его поменяли позже, пересоздайте
  том командой `docker compose down -v` — **это удалит все данные базы**.
- **Порт 5432 занят** — на машине уже работает другой PostgreSQL; остановите его
  или поменяйте левую часть `ports` в `docker-compose.yml` и порт в `DATABASE_URL`.
