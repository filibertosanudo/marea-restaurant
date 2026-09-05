import { describe, it, expect } from "vitest";
import { toTeamMemberDTO } from "./team";

describe("toTeamMemberDTO", () => {
  it("maps a membership + user row into the flat DTO shape", () => {
    const dto = toTeamMemberDTO({
      id: "mem_1",
      userId: "user_1",
      role: "STAFF",
      isActive: true,
      user: { name: "Diego Fuentes", email: "diego@marea.test", mustChangePassword: true },
    } as never);

    expect(dto).toEqual({
      membershipId: "mem_1",
      userId: "user_1",
      name: "Diego Fuentes",
      email: "diego@marea.test",
      role: "STAFF",
      isActive: true,
      mustChangePassword: true,
    });
  });

  it("falls back to empty strings for a null name or email", () => {
    const dto = toTeamMemberDTO({
      id: "mem_2",
      userId: "user_2",
      role: "STAFF",
      isActive: false,
      user: { name: null, email: null, mustChangePassword: false },
    } as never);

    expect(dto.name).toBe("");
    expect(dto.email).toBe("");
  });
});
