import 'dotenv/config';
import puppeteer, { Browser, Page } from 'puppeteer';
import { AirtopClient, AirtopError } from '@airtop/sdk';
import TelegramBot from 'node-telegram-bot-api';

const AIRTOP_API_KEY = process.env.AIRTOP_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN!, { polling: false });
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;

async function sendTelegramMessage(message: string) {
  try {
    await bot.sendMessage(TELEGRAM_USER_ID!, message, { 
      parse_mode: 'HTML',
      disable_web_page_preview: true
    });
  } catch (error) {
    console.error('Error sending telegram message:', error);
    throw error;
  }
}

async function run() {
  try {
    const client = new AirtopClient({
      apiKey: AIRTOP_API_KEY,
    });
    const createSessionResponse = await client.sessions.create({
      configuration: {
        timeoutMinutes: 5,
      },
    });

    const sessionId = createSessionResponse.data.id;
    console.log('Created airtop session', sessionId);

    if (!createSessionResponse.data.cdpWsUrl) {
      throw new Error('Unable to get cdp url');
    }

    const cdpUrl = createSessionResponse.data.cdpWsUrl;
    const browser: Browser = await puppeteer.connect({
      browserWSEndpoint: cdpUrl,
      headers: {
        Authorization: `Bearer ${AIRTOP_API_KEY}` || '',
      },
    });
    
    const page: Page = await browser.newPage();
    await page.goto('https://www.sec.gov/cgi-bin/browse-edgar?company=&CIK=&type=S-1&owner=include&count=80&action=getcurrent');

    const windowInfo = await client.windows.getWindowInfoForPuppeteerPage(createSessionResponse.data, page);

    const extractedContent = await client.windows.promptContent(sessionId, windowInfo.data.windowId, {
        prompt: `Extract the company names and their corresponding CIK numbers from the search results table. Get only the ones where the form type is S-1 and not S-1/A. Make sure to only return the JSON and nothing else. The output should use the following JSON schema and be sanitized and escaped as valid JSON:
        {
          "$schema": "http://json-schema.org/draft-04/schema#",
          "type": "array",
          "items": [
            {
              "type": "object",
              "properties": {
                "companyName": {
                  "type": "string"
                },
                "cik": {
                  "type": "string"
                }
              },
              "required": [
                "companyName",
                "cik"
              ]
            }
          ]
        }
        `,
    });
    

    const results = JSON.parse(
      extractedContent.data.modelResponse.replace(/\\n/g, "")
    );

    // Format the results as a list instead of a table
    const formattedResults = results.map((item: { companyName: string; cik: string }, index: number) => 
      `${index + 1}. <b>${item.companyName}</b>\n   CIK: <code>${item.cik}</code>`
    ).join('\n\n');

    const message = `<b>SEC EDGAR S-1 Results</b>\n\n${formattedResults}`;

    await sendTelegramMessage(message);
    console.log('Results sent via Telegram');

    // Clean up
    await browser.close();
    await client.sessions.terminate(sessionId);
    console.log('Session deleted');
    process.exit(0);
  } catch (err) {
    if (err instanceof AirtopError) {
      console.log(err.statusCode);
      console.log(err.message);
      console.log(err.body);
    } else {
      console.log(err);
    }
    throw err;
  }
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});