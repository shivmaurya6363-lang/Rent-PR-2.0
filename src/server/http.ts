import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { log } from "./log";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const json = (data: unknown, init?: number | ResponseInit) =>
  NextResponse.json(data, typeof init === "number" ? { status: init } : init);

/** Wrap a handler so thrown errors become consistent JSON without leaking internals. */
export function handle<A extends unknown[]>(name: string, fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message, code: err.code }, err.status);
      }
      if (err instanceof ZodError) {
        return json({ error: "Invalid request", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
      }
      log.error(`${name} failed`, { error: err instanceof Error ? err.message : String(err) });
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  };
}
