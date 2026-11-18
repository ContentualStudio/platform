import { BadRequestException } from "@nestjs/common";
import { ZodError, ZodSchema } from "zod";

export function parseWithSchema<T>(
  schema: ZodSchema<T>,
  body: unknown,
  errorCode: string,
  fallbackMessage: string,
): T {
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new BadRequestException({
        code: errorCode,
        message: error.issues[0]?.message ?? fallbackMessage,
      });
    }

    throw error;
  }
}
