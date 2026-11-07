import { z } from 'zod';

export const registerSchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(8).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.strictObject({
  email: registerSchema.shape.email,
  password: registerSchema.shape.password,
});

export type LoginInput = z.infer<typeof loginSchema>;
