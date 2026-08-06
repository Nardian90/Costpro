/**
 * Type stub for the optional 'stripe' SDK.
 *
 * The stripe package is NOT a hard dependency — it's dynamically imported in
 * src/lib/billing/stripe.ts only when STRIPE_SECRET_KEY is set. This stub
 * prevents TypeScript errors (TS2307) when the package is not installed.
 *
 * If you need full type accuracy, install stripe as a dev dependency:
 *   npm install --save-dev stripe
 * Then this stub will be ignored in favor of the real types.
 */
declare module 'stripe' {
  export type StripeConfig = {
    apiVersion?: string;
  };
  export default class Stripe {
    constructor(secretKey: string, config?: StripeConfig);
    [key: string]: any;
  }
}
