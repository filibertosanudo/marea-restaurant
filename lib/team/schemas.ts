import { z } from "zod";

export const teamMemberSchema = z.object({
  name: z.string().min(1, "Required").max(120),
  email: z.email(),
  role: z.enum(["STAFF", "BUSINESS_ADMIN"]),
});
