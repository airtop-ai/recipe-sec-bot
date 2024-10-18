import 'dotenv/config';
import puppeteer, { Browser, Page } from 'puppeteer';
import { AirtopClient, AirtopError } from '@airtop/sdk';
import TelegramBot from 'node-telegram-bot-api';

const AIRTOP_API_KEY = process.env.AIRTOP_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN!, { polling: false });
const TELEGRAM_USER_ID = process.env.TELEGRAM_USER_ID;

const client = new AirtopClient({
  apiKey: AIRTOP_API_KEY,
});

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
  let sessionId;
  let browser: Browser;
  try {
    const createSessionResponse = await client.sessions.create({
      configuration: {
        timeoutMinutes: 5,
      },
    });

    sessionId = createSessionResponse.data.id;
    console.log('Created airtop session', sessionId);

    if (!createSessionResponse.data.cdpWsUrl) {
      throw new Error('Unable to get cdp url');
    }

    const cdpUrl = createSessionResponse.data.cdpWsUrl;
    browser = await puppeteer.connect({
      browserWSEndpoint: cdpUrl,
      headers: {
        Authorization: `Bearer ${AIRTOP_API_KEY}` || '',
      },
    });
    
    const page: Page = await browser.newPage();
    await page.goto('https://www.sec.gov/cgi-bin/browse-edgar?company=&CIK=&type=S-1&owner=include&count=80&action=getcurrent');

    const windowInfo = await client.windows.getWindowInfoForPuppeteerPage(createSessionResponse.data, page);

    const prompt = `
You are on the SEC website looking at a search for the latest filings.
Please extract the company names and their corresponding CIK numbers (which follow the company name in parenthesees) from the search results table.
Get only the ones where the form type is S-1 and not S-1/A.
Company names might contain characters like backslashes, which should always be escaped.

Examples:
- "S-1   |  Some Company Inc (0001234567)" should produce a result '{ "companyName": "Some Company Inc", "cik": "0001234567", "formType": "S-1" }'.
- "S-1/A |  Another Company Inc (0009876543)" should be not be included because the form type is S-1/A.
- "S-1   |  Foo Inc \\D\\E (0002468024)" should produce a result with the backslashes in the company name escaped: '{ "companyName": "Foo Inc \\\\D\\\\E, "cik": "0002468024", "formType": "S-1" }'.

Please produce a list of results using the JSON schema below. If you are unable to do so, use the failure field to describe the reason for the failure.

{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "oneOf": [
    {
      "properties": {
        "results": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "companyName": {
                "type": "string"
              },
              "cik": {
                "type": "string"
              },
              "formType": {
                "type": "string"
              }
            },
            "required": ["companyName", "cik", "formType"]
          }
        }
      },
      "required": ["results"]
    },
    {
      "properties": {
        "failure": {
          "type": "string"
        }
      },
      "required": ["failure"]
    }
  ]
}
`;

    const extractedContent = await client.windows.promptContent(sessionId, windowInfo.data.windowId, {
        prompt: prompt,
    });    
    let modelResponse;
    try {
      modelResponse = JSON.parse(extractedContent.data.modelResponse);
    } catch (err) {
      console.log(`Failed to parse response: ${err}`);
      console.log('Raw Response:');
      console.log(extractedContent.data.modelResponse);
    }

    if (modelResponse.failure) {
      console.log(`Airtop AI reported failure: ${modelResponse.failure}`);
      throw new Error(modelResponse.failure);
    }

    // Format the results as a list instead of a table
    const formattedResults = modelResponse.results.map((item: { companyName: string; cik: string }, index: number) =>
      `${index + 1}. <b>${item.companyName}</b>\n   CIK: <code>${item.cik}</code>`
    ).join('\n\n');

    const message = `<b>SEC EDGAR S-1 Results</b>\n\n${formattedResults}`;

    await sendTelegramMessage(message);
    console.log('Results sent via Telegram');
  } catch (err) {
    if (err instanceof AirtopError) {
      console.log(err.statusCode);
      console.log(err.message);
      console.log(err.body);
    } else {
      console.log(err);
    }
    throw err;
  } finally {
    // Clean up
    try { await browser.close(); } catch (err) {}
    if (sessionId) {
      await client.sessions.terminate(sessionId);
    }
    console.log('Session deleted');
  }
  process.exit(0);
}
run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
