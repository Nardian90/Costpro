import Parser from 'rss-parser';

async function testFeed() {
    const parser = new Parser({
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
    });

    const url = 'https://www.granma.cu/feed';
    console.log(`Fetching ${url}...`);
    try {
        const feed = await parser.parseURL(url);
        console.log(`Title: ${feed.title}`);
        console.log(`Items count: ${feed.items?.length}`);
        if (feed.items && feed.items.length > 0) {
            console.log(`First item title: ${feed.items[0].title}`);
        }
    } catch (error) {
        console.error('Error parsing feed:', error);
    }
}

testFeed();
