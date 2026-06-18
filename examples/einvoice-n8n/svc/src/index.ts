import { Hono } from "hono";
import { logger } from "hono/logger";
import { bearerAuth } from "hono/bearer-auth";
import { serve } from "@hono/node-server";
import { Capability, supports, InvoiceError } from "@paid-tw/einvoice";
import { getProvider, SUPPORTED_PROVIDERS } from "./providers.js";

const app = new Hono();
app.use("*", logger());

// Bearer auth — every n8n call must carry EINVOICE_SVC_TOKEN.
const svcToken = process.env.EINVOICE_SVC_TOKEN;
if (svcToken) {
  app.use("/v1/*", bearerAuth({ token: svcToken }));
} else {
  console.warn("⚠ EINVOICE_SVC_TOKEN not set — service is UNAUTHENTICATED. Do not run in production.");
}

// ---------- Health + meta -------------------------------------------------

app.get("/healthz", (c) => c.json({ ok: true, providers: SUPPORTED_PROVIDERS }));

app.get("/v1/capabilities/:provider", (c) => {
  const name = c.req.param("provider");
  try {
    const p = getProvider(name);
    return c.json({
      provider: p.name,
      capabilities: [...p.capabilities] as Capability[],
    });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400);
  }
});

// ---------- 5 SDK operations ----------------------------------------------

interface Wrapped<T> {
  provider: string;
  input: T;
}

function unwrap<T>(body: unknown): Wrapped<T> {
  if (!body || typeof body !== "object") throw new Error("body must be an object");
  const b = body as Record<string, unknown>;
  if (typeof b.provider !== "string") throw new Error("body.provider (string) required");
  if (!b.input || typeof b.input !== "object") throw new Error("body.input (object) required");
  return { provider: b.provider, input: b.input as T };
}

function asInvoiceError(e: unknown): { status: number; body: Record<string, unknown> } {
  if (e instanceof InvoiceError) {
    return {
      status: e.code === "INVALID_INPUT" || e.code === "UNSUPPORTED" ? 400 : 502,
      body: {
        error: { code: e.code, message: e.message, provider: e.providerCode ?? null },
      },
    };
  }
  return { status: 500, body: { error: { code: "INTERNAL", message: (e as Error).message } } };
}

app.post("/v1/issue", async (c) => {
  try {
    const { provider, input } = unwrap<Parameters<ReturnType<typeof getProvider>["issue"]>[0]>(
      await c.req.json(),
    );
    const result = await getProvider(provider).issue(input);
    return c.json({ provider, result });
  } catch (e) {
    const { status, body } = asInvoiceError(e);
    return c.json(body, status as 400 | 500 | 502);
  }
});

app.post("/v1/void", async (c) => {
  try {
    const { provider, input } = unwrap<Parameters<ReturnType<typeof getProvider>["void"]>[0]>(
      await c.req.json(),
    );
    const result = await getProvider(provider).void(input);
    return c.json({ provider, result });
  } catch (e) {
    const { status, body } = asInvoiceError(e);
    return c.json(body, status as 400 | 500 | 502);
  }
});

app.post("/v1/allowance", async (c) => {
  try {
    const { provider, input } = unwrap<Parameters<ReturnType<typeof getProvider>["allowance"]>[0]>(
      await c.req.json(),
    );
    const result = await getProvider(provider).allowance(input);
    return c.json({ provider, result });
  } catch (e) {
    const { status, body } = asInvoiceError(e);
    return c.json(body, status as 400 | 500 | 502);
  }
});

app.post("/v1/void-allowance", async (c) => {
  try {
    const { provider, input } = unwrap<
      Parameters<ReturnType<typeof getProvider>["voidAllowance"]>[0]
    >(await c.req.json());
    const result = await getProvider(provider).voidAllowance(input);
    return c.json({ provider, result });
  } catch (e) {
    const { status, body } = asInvoiceError(e);
    return c.json(body, status as 400 | 500 | 502);
  }
});

app.post("/v1/query", async (c) => {
  try {
    const { provider, input } = unwrap<Parameters<ReturnType<typeof getProvider>["query"]>[0]>(
      await c.req.json(),
    );
    const result = await getProvider(provider).query(input);
    return c.json({ provider, result });
  } catch (e) {
    const { status, body } = asInvoiceError(e);
    return c.json(body, status as 400 | 500 | 502);
  }
});

// ---------- Capability-aware failover -------------------------------------

interface FailoverBody {
  capability: Capability;
  candidates: string[];
  op: "issue" | "void" | "allowance" | "voidAllowance" | "query";
  input: unknown;
}

app.post("/v1/route", async (c) => {
  try {
    const body = (await c.req.json()) as FailoverBody;
    if (!body.capability || !Array.isArray(body.candidates) || !body.op) {
      return c.json({ error: "capability, candidates[], op are required" }, 400);
    }
    const errors: Record<string, string> = {};
    for (const name of body.candidates) {
      try {
        const p = getProvider(name);
        if (!supports(p, body.capability)) {
          errors[name] = `lacks capability ${body.capability}`;
          continue;
        }
        const result = await (p as Record<string, Function>)[body.op](body.input);
        return c.json({ provider: p.name, capability: body.capability, result });
      } catch (e) {
        errors[name] = (e as Error).message;
      }
    }
    return c.json({ error: "no candidate succeeded", attempts: errors }, 502);
  } catch (e) {
    const { status, body } = asInvoiceError(e);
    return c.json(body, status as 400 | 500 | 502);
  }
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port });
console.log(`einvoice-svc listening on :${port}`);
