import type { Warning } from "@/lib/app-types";

export class AppError extends Error {
  constructor(
    message: string,
    readonly fieldErrors?: Record<string, string>,
    readonly warnings?: Warning[],
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** A user-correctable problem with the submitted data. */
export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message, fieldErrors);
    this.name = "ValidationError";
  }
}

/** The change would leave a balance negative etc. — the caller may confirm and retry. */
export class NeedsConfirmation extends AppError {
  constructor(message: string, warnings: Warning[]) {
    super(message, undefined, warnings);
    this.name = "NeedsConfirmation";
  }
}
