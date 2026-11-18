import { z } from "zod";
import { paidTierKeys } from "./billing-tiers";

export const checkoutRequestSchema = z.object({
  tier: z.enum(paidTierKeys),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

export const referralAttachSchema = z.object({
  code: z.string().trim().min(1).max(64),
});

export type ReferralAttachRequest = z.infer<typeof referralAttachSchema>;
