import { Pick3ScraperService } from './src/services/pick3/Pick3ScraperService';

async function test() {
  console.log("Testing Pick3ScraperService...");
  try {
    const results = await Pick3ScraperService.scrapeLatestResults();
    console.log(`Found ${results.length} results.`);
    if (results.length > 0) {
      console.log("Latest result:", JSON.stringify(results[0], null, 2));
    }
  } catch (error) {
    console.error("Error testing scrapers:", error);
  }
}

test();
