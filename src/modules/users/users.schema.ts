import { z } from 'zod';
import { registerSchema } from '../auth/auth.schema.js';

export const profilePatchSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(100).optional(),
    email: registerSchema.shape.email.optional(),
  })
  .refine((value) => value.name !== undefined || value.email !== undefined);

export type ProfilePatchInput = z.infer<typeof profilePatchSchema>;
