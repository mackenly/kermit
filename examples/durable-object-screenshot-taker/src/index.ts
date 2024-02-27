export interface Env {
	BROWSER: DurableObjectNamespace;
	BUCKET: R2Bucket;
	MYBROWSER: BrowserWorker;
}

import puppeteer, { BrowserWorker, Puppeteer } from '@cloudflare/puppeteer';

// original source code from: https://developers.cloudflare.com/browser-rendering/get-started/browser-rendering-with-do/

export default {
	/**
	 * This is the standard fetch handler for a Cloudflare Worker
	 *
	 * @param request - The request submitted to the Worker from the client
	 * @param env - The interface to reference bindings declared in wrangler.toml
	 * @param ctx - The execution context of the Worker
	 * @returns The response to be sent back to the client
	 */
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {

		let id: DurableObjectId = env.BROWSER.idFromName("browser");
		let obj: DurableObjectStub = env.BROWSER.get(id);

		// Send a request to the Durable Object, then await its response.
		let resp = await obj.fetch(request.url);

		return resp;
	}
};

const KEEP_BROWSER_ALIVE_IN_SECONDS: number = 60;

/**
 * The Durable Object class for the browser
 */
export class Browser {
	state: DurableObjectState;
	env: Env;
	keptAliveInSeconds: number;
	storage: DurableObjectStorage;
	browser: any;

	/**
	 * Constructor for the Durable Object
	 * @param state DurableObjectState
	 * @param env Env 
	 */
	constructor(state: DurableObjectState, env: Env) {
		this.state = state;
		this.env = env;
		this.keptAliveInSeconds = 0;
		this.storage = this.state.storage;
	}

	/**
	 * Define the fetch method for the Durable Object
	 * @param request Request object
	 * @returns Response object
	 */
	async fetch(request: Request): Promise<Response> {
		// screen resolutions to test out
		const width = [1920, 1366, 1536, 360, 414]
		const height = [1080, 768, 864, 640, 896]

		// use the current date and time to create a folder structure for R2
		const nowDate = new Date()
		var coeff = 1000 * 60 * 5
		var roundedDate = (new Date(Math.round(nowDate.getTime() / coeff) * coeff)).toString();
		var folder = roundedDate.split(" GMT")[0]
		const url = new URL(request.url).searchParams.get("url");

		// validate the URL
		if (!url) {
			return new Response("URL is required", { status: 400 });
		}
		if (!url.startsWith("http")) {
			return new Response("URL must start with http or https", { status: 400 });
		}
		if (!url.includes(".")) {
			return new Response("URL must contain a domain", { status: 400 });
		}
		if (url.includes(" ")) {
			return new Response("URL cannot contain spaces", { status: 400 });
		}
		if (url.includes("localhost")) {
			return new Response("URL cannot be localhost", { status: 400 });
		}

		const urlSafeUrl = url.replace(/[^a-zA-Z0-9]/g, "_");

		//if there's a browser session open, re-use it
		if (!this.browser || !this.browser.isConnected()) {
			console.log(`Browser DO: Starting new instance`);
			try {
				this.browser = await puppeteer.launch(this.env.MYBROWSER);
			} catch (e) {
				console.log(`Browser DO: Could not start browser instance. Error: ${e}`);
			}
		}

		// Reset keptAlive after each call to the DO
		this.keptAliveInSeconds = 0;

		const page = await this.browser.newPage();

		// take screenshots of each screen size
		for (let i = 0; i < width.length; i++) {
			await page.setViewport({ width: width[i], height: height[i] });
			await page.goto(url);
			const fileName = "screenshot_" + width[i] + "x" + height[i]
			const sc = await page.screenshot({ path: fileName + ".jpg" });

			await this.env.BUCKET.put(urlSafeUrl + "/" + folder + "/" + fileName + ".jpg", sc);
		}

		// Close tab when there is no more work to be done on the page
		await page.close();

		// Reset keptAlive after performing tasks to the DO.
		this.keptAliveInSeconds = 0;

		// set the first alarm to keep DO alive
		let currentAlarm = await this.storage.getAlarm();
		if (currentAlarm == null) {
			console.log(`Browser DO: setting alarm`);
			const TEN_SECONDS = 10 * 1000;
			await this.storage.setAlarm(Date.now() + TEN_SECONDS);
		}

		return new Response("success");
	}

	/**
	 * Define the alarm method for the Durable Object
	 * @returns void
	 */
	async alarm(): Promise<void> {
		this.keptAliveInSeconds += 10;

		// Extend browser DO life
		if (this.keptAliveInSeconds < KEEP_BROWSER_ALIVE_IN_SECONDS) {
			console.log(`Browser DO: has been kept alive for ${this.keptAliveInSeconds} seconds. Extending lifespan.`);
			await this.storage.setAlarm(Date.now() + 10 * 1000);
			// You could ensure the ws connection is kept alive by requesting something
			// or just let it close automatically when there  is no work to be done
			// for example, `await this.browser.version()`
		} else {
			console.log(`Browser DO: exceeded life of ${KEEP_BROWSER_ALIVE_IN_SECONDS}s.`);
			if (this.browser) {
				console.log(`Closing browser.`);
				await this.browser.close();
			}
		}
	}

}