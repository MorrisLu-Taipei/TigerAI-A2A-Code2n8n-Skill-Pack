import { createAmegoProvider } from "@paid-tw/einvoice-amego";
import { createEcpayProvider } from "@paid-tw/einvoice-ecpay";
import { createEzpayProvider } from "@paid-tw/einvoice-ezpay";
import { createEzpayCrossBorderProvider } from "@paid-tw/einvoice-ezpay-crossborder";
import { createEzreceiptProvider } from "@paid-tw/einvoice-ezreceipt";
import type { InvoiceProvider } from "@paid-tw/einvoice";

const env = process.env;

function need(name: string): string {
  const v = env[name];
  if (!v) throw new Error(`missing required env var: ${name}`);
  return v;
}

const mode = (env.EINVOICE_MODE === "PRODUCTION" ? "PRODUCTION" : "SANDBOX") as
  | "PRODUCTION"
  | "SANDBOX";

const cache = new Map<string, InvoiceProvider>();

export function getProvider(name: string): InvoiceProvider {
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  let p: InvoiceProvider;
  switch (key) {
    case "amego":
      p = createAmegoProvider({
        sellerTaxId: need("AMEGO_SELLER_TAX_ID"),
        appKey: need("AMEGO_APP_KEY"),
        mode,
      });
      break;
    case "ecpay":
      p = createEcpayProvider({
        merchantId: need("ECPAY_MERCHANT_ID"),
        hashKey: need("ECPAY_HASH_KEY"),
        hashIv: need("ECPAY_HASH_IV"),
        mode,
      });
      break;
    case "ezpay":
      p = createEzpayProvider({
        merchantId: need("EZPAY_MERCHANT_ID"),
        hashKey: need("EZPAY_HASH_KEY"),
        hashIv: need("EZPAY_HASH_IV"),
        mode,
      });
      break;
    case "ezpay-crossborder":
      p = createEzpayCrossBorderProvider({
        merchantId: need("EZPAY_CB_MERCHANT_ID"),
        hashKey: need("EZPAY_CB_HASH_KEY"),
        hashIv: need("EZPAY_CB_HASH_IV"),
        mode,
      });
      break;
    case "ezreceipt":
      p = createEzreceiptProvider({
        account: need("EZRECEIPT_ACCOUNT"),
        password: need("EZRECEIPT_PASSWORD"),
        mode,
      });
      break;
    default:
      throw new Error(`unknown provider: ${name}`);
  }
  cache.set(key, p);
  return p;
}

export const SUPPORTED_PROVIDERS = [
  "amego",
  "ecpay",
  "ezpay",
  "ezpay-crossborder",
  "ezreceipt",
] as const;
