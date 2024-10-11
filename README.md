# Recipe: SEC filings from listed companies

## Overview

This project uses Airtop to scrape the SEC database for recent S-1 filings. It extracts company names and CIK numbers, then sends the results via Telegram.

## Setup

1. Install dependencies

```bash
npm install
```

2. Set the appropriate environment variable(s)

```bash
cp .env.example .env
```

Edit the .env file with your API keys:

- AIRTOP_API_KEY: Your Airtop API key
- TELEGRAM_BOT_TOKEN: Your Telegram bot token
- TELEGRAM_USER_ID: Your Telegram user ID

3. Run the script

```bash
npm run start
```

## How it works

- Creates an Airtop session
- Connects to the browser using Puppeteer
- Navigates to the SEC EDGAR search page
- Extracts company information using Airtop's API and AI prompting
- Formats and sends results via Telegram
- Cleans up the browser session

## Dependencies

- [@airtop/sdk](https://www.npmjs.com/package/@airtop/sdk)
- [puppeteer](https://www.npmjs.com/package/puppeteer)
- [node-telegram-bot-api](https://www.npmjs.com/package/node-telegram-bot-api)
- [dotenv](https://www.npmjs.com/package/dotenv)
