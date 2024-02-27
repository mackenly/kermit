# Website Thumbnail Generator
Generate a thumbnail of a website using Cloudflare Workers and Puppeteer.

## Deploying
Create R2 buckets:
- `wrangler r2 bucket create kermit-website-thumbnail-generator-screenshots`
- `wrangler r2 bucket create kermit-website-thumbnail-generator-screenshots-test`

Deploy the worker:
- `wrangler publish`


## Usage
To generate a thumbnail of a website, send a GET request to the worker with the `url` parameter set to the website you want to generate a thumbnail of.
Ex: `http://example.com/?url=http://mackenly.com`

I would suggest creating a lifecycle rule to delete images after a certain period of time to avoid using too much storage.