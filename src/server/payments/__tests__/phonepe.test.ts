import { describe, expect, it } from "vitest";
import { PhonePeProvider, normalizePhonepe, phonepeChecksum, sha256Hex, verifyPhonepeCallback } from "../phonepe/adapter";

process.env.PHONEPE_MERCHANT_ID = "TESTMERCHANT";
process.env.PHONEPE_SALT_KEY = "test-salt-key-123";
process.env.PHONEPE_SALT_INDEX = "1";

const SALT = "test-salt-key-123";
const sign = (b64: string) => `${sha256Hex(b64 + SALT)}###1`;
const envelope = (decoded: object) => {
  const response = Buffer.from(JSON.stringify(decoded)).toString("base64");
  return { raw: JSON.stringify({ response }), response };
};

describe("PhonePe checksums and webhook verification (legacy code never verified callbacks)", () => {
  it("request checksum is sha256(payload+endpoint+salt)###index", () => {
    expect(phonepeChecksum("abc", "/pg/v1/pay", SALT, "1")).toBe(`${sha256Hex("abc/pg/v1/pay" + SALT)}###1`);
  });
  it("callback verification accepts the right signature and rejects others", () => {
    const { response } = envelope({ code: "PAYMENT_SUCCESS" });
    expect(verifyPhonepeCallback(sign(response), response, SALT, "1")).toBe(true);
    expect(verifyPhonepeCallback(sign(response + "x"), response, SALT, "1")).toBe(false);
    expect(verifyPhonepeCallback(null, response, SALT, "1")).toBe(false);
    expect(verifyPhonepeCallback("", response, SALT, "1")).toBe(false);
  });
  it("parseWebhook rejects an unsigned body and yields no events", () => {
    const { raw } = envelope({ code: "PAYMENT_SUCCESS", data: { merchantTransactionId: "T1", amount: 100 } });
    const r = new PhonePeProvider().parseWebhook(raw, new Headers());
    expect(r.valid).toBe(false);
    expect(r.events).toEqual([]);
  });
  it("parseWebhook accepts a signed success callback; identical redelivery has the same event id", () => {
    const { raw, response } = envelope({ code: "PAYMENT_SUCCESS", data: { merchantTransactionId: "T1", transactionId: "OM1", amount: 16500000 } });
    const h = new Headers({ "x-verify": sign(response) });
    const a = new PhonePeProvider().parseWebhook(raw, h);
    const b = new PhonePeProvider().parseWebhook(raw, h);
    expect(a.valid).toBe(true);
    expect(a.eventId).toBe(b.eventId);
    expect(a.events[0]).toMatchObject({ kind: "payment_captured", payment: { id: "OM1", orderId: "T1", amountPaise: 16500000 } });
  });
});

describe("normalizePhonepe", () => {
  it("maps failures, pending payments and mandate states", () => {
    expect(normalizePhonepe({ code: "PAYMENT_ERROR", message: "declined", data: { merchantTransactionId: "T2", amount: 1 } })[0]).toMatchObject({ kind: "payment_failed", payment: { failureCode: "PAYMENT_ERROR" } });
    expect(normalizePhonepe({ code: "PAYMENT_PENDING", data: { merchantTransactionId: "T3" } })[0].kind).toBe("ignored");
    expect(normalizePhonepe({ data: { merchantSubscriptionId: "SUB1", state: "ACTIVE" } })[0]).toMatchObject({ kind: "agreement_status", status: "active", subscriptionId: "SUB1" });
    expect(normalizePhonepe({ data: { merchantSubscriptionId: "SUB1", state: "REVOKED" } })[0]).toMatchObject({ status: "cancelled" });
  });
  it("declares what it cannot do instead of faking it", async () => {
    const p = new PhonePeProvider();
    await expect(p.cancelRecurringAgreement()).rejects.toThrow(/does not support/);
    await expect(p.refundPayment()).rejects.toThrow(/does not support/);
    expect(p.capabilities.merchantInitiatedCharges).toBe(true);
    expect(p.capabilities.firstCycleCollection).toBe("separate_payment");
  });
});
