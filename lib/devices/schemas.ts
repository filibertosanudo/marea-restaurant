import { z } from "zod";

export const deviceSchema = z.object({
  name: z.string().min(1, "Required").max(120),
});
