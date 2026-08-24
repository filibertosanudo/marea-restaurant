import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/lib/generated/prisma/client";
import { loginSchema } from "@/lib/auth/schemas";
import { verifyPassword } from "@/lib/auth/password";
import { getEffectiveRole } from "@/lib/auth/permissions";
import { isRateLimited, recordAttempt, clearAttempts } from "@/lib/auth/rate-limit";

// A precomputed argon2id hash of a value nobody will ever type, used to
// keep authorize()'s timing identical whether the email exists or not —
// otherwise "no such user" would return faster than "wrong password" and
// leak which emails have accounts.
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzYWx0c2FsdA$K2f3f6vX2sVh8m2b8QhZbA1lM2z3vqk1uV1H4rQxYqM";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: UserRole;
      businessId: string | null;
      mustChangePassword: boolean;
    };
  }

  interface User {
    role?: UserRole;
    businessId?: string | null;
    mustChangePassword?: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role: UserRole;
    businessId: string | null;
    mustChangePassword: boolean;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/admin/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;

        if (isRateLimited(email)) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          include: { memberships: { where: { isActive: true } } },
        });

        const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
        const validPassword = await verifyPassword(hashToCheck, password);

        if (!user || !user.passwordHash || !validPassword) {
          recordAttempt(email);
          return null;
        }

        // Only staff sign in through this form.
        const role = getEffectiveRole(user);
        if (role !== UserRole.STAFF && role !== UserRole.BUSINESS_ADMIN && role !== UserRole.SUPER_ADMIN) {
          recordAttempt(email);
          return null;
        }

        clearAttempts(email);

        return {
          id: user.id,
          email: user.email ?? email,
          name: user.name,
          role,
          businessId: user.memberships[0]?.businessId ?? null,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role ?? UserRole.CUSTOMER;
        token.businessId = user.businessId ?? null;
        token.mustChangePassword = user.mustChangePassword ?? false;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = token.role;
      session.user.businessId = token.businessId;
      session.user.mustChangePassword = token.mustChangePassword;
      return session;
    },
  },
});
