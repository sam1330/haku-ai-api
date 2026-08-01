import 'express';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        subscription_type: string;
        subscription_expires_at: string | Date | null;
      };
    }
  }
}
