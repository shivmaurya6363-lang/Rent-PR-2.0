import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Fake, clearly non-secret values so server modules can validate their environment in tests.
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
process.env.RAZORPAY_KEY_ID ??= "rzp_test_dummy";
process.env.RAZORPAY_KEY_SECRET ??= "dummy_key_secret";
process.env.RAZORPAY_WEBHOOK_SECRET ??= "dummy_webhook_secret";
process.env.DATABASE_URL ??= process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/unused";
