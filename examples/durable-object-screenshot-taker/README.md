# Durable Object Screenshot Taker
Creates multiple screenshots of a website using Durable Objects in different resolutions.

## Deploying
Create R2 buckets:
- `wrangler r2 bucket create kermit-durable-object-screenshot-taker-screenshots`
- `wrangler r2 bucket create kermit-durable-object-screenshot-taker-screenshots-test`

Deploy the worker:
- `wrangler publish`

I would suggest creating a lifecycle rule to delete images after a certain period of time to avoid using too much storage.