import type { z } from 'zod';

/** An error with an HTTP status that is safe to show to the user. */
export class HttpError extends Error {
  readonly status: number;
  readonly details?: string[];

  constructor(status: number, message: string, details?: string[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Human-readable list of what is wrong with some input. */
export function issueList(error: z.ZodError): string[] {
  return error.issues.map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message));
}

export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown, what = 'Some fields are not valid.'): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, what, issueList(result.error));
  return result.data;
}
