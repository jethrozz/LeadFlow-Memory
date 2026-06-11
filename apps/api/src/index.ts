import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);

serve({
  fetch: createApp().fetch,
  port,
});

console.log(`LeadFlow API listening on http://127.0.0.1:${port}`);
