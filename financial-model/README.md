# Финансовая модель — Казань 2026

Интерактивное веб-приложение для анализа инвестпроекта в недвижимость.

## Быстрый старт

```bash
cd financial-model

# 1. Установить зависимости
pip install -r requirements.txt

# 2. Настроить переменные окружения
cp .env.example .env
# Отредактируйте .env — укажите GEMINI_API_KEY (опционально)

# 3. Запустить
python app.py
```

Откройте браузер: http://localhost:5000

## Функционал

- Редактирование всех параметров проекта в реальном времени
- Автоматический пересчёт NPV, IRR, PI, Equity IRR, Payback, DSCR
- График денежного потока по кварталам
- Сохранение и загрузка сценариев (SQLite)
- Сравнение до 3 сценариев
- AI-анализ через Google Gemini (опционально)
- Экспорт в PDF
- Адаптивный дизайн (работает на телефоне)

## Получить Gemini API Key (бесплатно)

1. Перейдите на https://aistudio.google.com/
2. Нажмите «Get API Key»
3. Скопируйте ключ в `.env` → `GEMINI_API_KEY=...`

## Структура

```
financial-model/
├── app.py          # Flask роуты
├── model.py        # Финансовые расчёты
├── ai_analyst.py   # Google Gemini AI
├── database.py     # SQLite
├── requirements.txt
├── .env.example
├── templates/
│   └── index.html
├── static/
│   ├── css/style.css
│   └── js/app.js
└── data/           # БД создаётся автоматически
```
