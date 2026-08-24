import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/lib/generated/prisma/client";
import { loginSchema } from "@/lib/auth/schemas";
import { verifyPassword } from "@/lib/auth/password";
import { getEffectiveRole } from "@/lib/auth/roles";
import { isRateLimited, recordLoginAttempt, getClientIp } from "@/lib/auth/rate-limit";

// How long a token is trusted before the next request re-checks the
// membership in the database. Amortizes the cost (not a query per request)
// while keeping a deactivation or role change from taking up to 8 hours to
// take effect.
const REVALIDATE_INTERVAL_MS = 60 * 1000;

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
      /// true once a DB revalidation finds the account gone or the
      /// membership deactivated. Every auth guard treats this as "logged
      /// out" even though the JWT cookie itself is still technically valid
      /// until it expires — a JWT can't be revoked server-side, so this is
      /// the flag that makes the revalidation in the `jwt` callback stick.
      revoked: boolean;
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
    revoked?: boolean;
    /// Timestamp (ms) of the last time this token was checked against the
    /// database. Drives the amortized revalidation below.
    checkedAt: number;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // A shift, not a month: the previous default (30 days from Auth.js) let a
  // fired employee's token outlive their last shift by weeks.
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  pages: {
    signIn: "/admin/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials, request) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const ipAddress = getClientIp(request);

        if (await isRateLimited(email, ipAddress)) return null;

        const user = await prisma.user.findUnique({
          where: { email, deletedAt: null },
          include: { memberships: { where: { isActive: true } } },
        });

        const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
        const validPassword = await verifyPassword(hashToCheck, password);

        if (!user || !user.passwordHash || !validPassword) {
          await recordLoginAttempt(email, ipAddress, false);
          return null;
        }

        // Only staff sign in through this form.
        const role = getEffectiveRole(user);
        if (role !== UserRole.STAFF && role !== UserRole.BUSINESS_ADMIN && role !== UserRole.SUPER_ADMIN) {
          await recordLoginAttempt(email, ipAddress, false);
          return null;
        }

        await recordLoginAttempt(email, ipAddress, true);

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
        token.revoked = false;
        token.checkedAt = Date.now();
        return token;
      }

      if (token.revoked) return token;

      const isStale = Date.now() - (token.checkedAt ?? 0) > REVALIDATE_INTERVAL_MS;
      if (!isStale) return token;

      const dbUser = await prisma.user.findUnique({
        where: { id: token.sub },
        // Scoped to the business this token was issued for — an active
        // membership at a DIFFERENT business must not keep this session
        // alive if the membership at THIS one was deactivated. Falls back
        // to "any active membership" only when the token has no businessId
        // yet (SUPER_ADMIN, whose role doesn't depend on a membership).
        include: {
          memberships: {
            where: token.businessId
              ? { isActive: true, businessId: token.businessId }
              : { isActive: true },
          },
        },
      });

      if (!dbUser || dbUser.deletedAt) {
        token.revoked = true;
        return token;
      }

      const role = getEffectiveRole(dbUser);
      // The membership this token was issued for is no longer active (or
      // was never re-granted since) — same as being deactivated mid-shift.
      const stillStaff =
        role === UserRole.STAFF || role === UserRole.BUSINESS_ADMIN || role === UserRole.SUPER_ADMIN;
      if (!stillStaff) {
        token.revoked = true;
        return token;
      }

      token.role = role;
      token.businessId = dbUser.memberships[0]?.businessId ?? token.businessId;
      token.mustChangePassword = dbUser.mustChangePassword;
      token.checkedAt = Date.now();
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = token.role;
      session.user.businessId = token.businessId;
      session.user.mustChangePassword = token.mustChangePassword;
      session.user.revoked = token.revoked ?? false;
      return session;
    },
  },
});
