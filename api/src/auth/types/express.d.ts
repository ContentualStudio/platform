import { AuthenticatedUser } from "../guards/session.guard";

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
