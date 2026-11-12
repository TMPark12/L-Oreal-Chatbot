# L'Oreal Chatbot

A preview of a friendly L'Oréal beauty assistant with a browser chat interface and a Cloudflare Worker proxy for OpenAI.

## Features

- Responsive L'Oréal-branded preview with Skin Care, Hair care and coloring, Make-up/Cosmetics, and Perfumes/Fragrances topics.
- Free-form questions and continuous conversation through the Cloudflare Worker.
- Topic buttons focus the initial question; later questions can move to another beauty topic. The full conversation remains visible while recent messages are sent for context.
- A name or nickname can be supplied at the start of a chat, or skipped. The name is kept in the current page session and sent with chat requests to personalize replies.
- Product and scientific information searches limited to `loreal.com` and `lorealparisusa.com`; official source links are shown with replies.
- The OpenAI API key stays in a Cloudflare Worker secret and is never sent to the browser.
- End Chat opens a closing message and disables further questions for that chat.
- L'Oréal USA contact details are included in the footer.

## Run the preview

Serve this directory over HTTP (for example, `python3 -m http.server 8000`) and open `http://localhost:8000`. The chat UI sends requests to `https://lorealchatbot.tmpark12.workers.dev/`.
Deploy the latest Worker code below whenever [worker.js](./worker.js) changes.

## Deploy the Worker

### Cloudflare dashboard

1. In **Workers & Pages**, select the existing `lorealchatbot` Worker and choose **Edit code**.
2. Replace the existing code with the entire contents of [worker.js](./worker.js), then select **Deploy**.
3. Open the Worker's **Settings** > **Variables and Secrets** and select **Add**. Choose **Secret**, enter `OPENAI_API_KEY` as the variable name, and enter your OpenAI API key as the value. Select **Deploy**.

The Worker reads the secret as `env.OPENAI_API_KEY`. Keep the actual key out of the source code, browser, and Git repository. The secret and code must be deployed to the same Worker that serves `https://lorealchatbot.tmpark12.workers.dev/`.

### Wrangler

1. Install and authenticate Wrangler with the Cloudflare account that owns the `tmpark12.workers.dev` subdomain.
2. Set the API key as an encrypted Cloudflare secret; do not put it in `chat.js` or commit it:

   ```sh
   npx wrangler secret put OPENAI_API_KEY
   ```

3. Deploy the Worker:

   ```sh
   npx wrangler deploy
   ```

The Worker is configured as `lorealchatbot` in [wrangler.toml](./wrangler.toml). If Cloudflare assigns a different workers.dev URL, update `CHAT_ENDPOINT` in [chat.js](./chat.js). OpenAI's Responses API web-search tool must be available to the account/model used by the Worker.

After deploying, check the browser preflight response:

```sh
curl -i -X OPTIONS 'https://lorealchatbot.tmpark12.workers.dev/' \
  -H 'Origin: http://localhost:8000' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

The response should be HTTP 204 with `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, and `Access-Control-Allow-Headers` headers. Then submit a question in the preview to verify the secret and OpenAI connection. If chat is unavailable, check the Worker logs for an error without exposing the key. A 503 indicates the secret is missing; a 502 indicates the OpenAI request or response failed.

The Worker validates input, does not accept client-supplied system prompts, disables response storage, and limits web search to official L'Oréal domains. Because the endpoint is public, configure Cloudflare rate limiting for the Worker before making it broadly available.

## Contact information sources

- [L'Oréal USA](https://www.loreal.com/en/usa/) lists its U.S. headquarters as 10 Hudson Yards, New York, NY 10001, and the main number as (212) 818-1500.
- [L'Oréal Paris U.S. contact page](https://www.lorealparisusa.com/contact-us) lists customer service at 1-800-322-2036.
