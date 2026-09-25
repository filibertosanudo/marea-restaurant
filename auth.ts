import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/lib/generated/prisma/client";
import { loginSchema } from "@/lib/auth/schemas";
import { DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { claimsForSignIn, revalidateClaims, tokenAfterUpdate } from "@/lib/auth/token-claims";
import { firstBusinessFor } from "@/lib/auth/business-access";
import { isRateLimited, recordLoginAttempt, getClientIp } from "@/lib/auth/rate-limit";

// How long a token is trusted before the next request re-checks the
// membership in the database. Amortizes the cost (not a query per request)
// while keeping a deactivation or role change from taking up to 8 hours to
// take effect.
const REVALIDATE_INTERVAL_MS = 60 * 1000;

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string | null;
      role: UserRole;
      businessId: string | null;
      /// The user administers a chain (ORG_ADMIN). `role` is still the one
      /// they hold at the active business.
      orgAdmin: boolean;
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
    orgAdmin?: boolean;
    mustChangePassword?: boolean;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role: UserRole;
    businessId: string | null;
    orgAdmin: boolean;
    mustChangePassword: boolean;
    revoked?: boolean;
    /// Timestamp (ms) of the last time this token was checked against the
    /// database. Drives the amortized revalidation below.
    checkedAt: number;
  }
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
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
        const ipAddress = getClientIp(request.headers);

        if (await isRateLimited(email, ipAddress)) return null;

        const user = await prisma.user.findUnique({ where: { email, deletedAt: null } });

        const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
        const validPassword = await verifyPassword(hashToCheck, password);

        if (!user || !user.passwordHash || !validPassword) {
          await recordLoginAttempt(email, ipAddress, false);
          return null;
        }

        // Only staff sign in through this form, and only on a business they
        // may act on (lib/auth/business-access.ts): the first of their own
        // memberships, or of their organization's businesses.
        const claims = await claimsForSignIn(user.id, await firstBusinessFor(user.id));
        if (!claims) {
          await recordLoginAttempt(email, ipAddress, false);
          return null;
        }

        await recordLoginAttempt(email, ipAddress, true);

        return {
          id: user.id,
          email: user.email ?? email,
          name: user.name,
          role: claims.role,
          businessId: claims.businessId,
          orgAdmin: claims.orgAdmin,
          mustChangePassword: claims.mustChangePassword,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.role = user.role ?? UserRole.CUSTOMER;
        token.businessId = user.businessId ?? null;
        token.orgAdmin = user.orgAdmin ?? false;
        token.mustChangePassword = user.mustChangePassword ?? false;
        token.revoked = false;
        token.checkedAt = Date.now();
        return token;
      }

      if (token.revoked) return token;

      // A request to change business. The payload comes from whoever called
      // update(): the switch action, but also anything the browser can post to
      // the session endpoint. It is a request, not a fact; see tokenAfterUpdate.
      if (trigger === "update") return tokenAfterUpdate(token, session);

      const isStale = Date.now() - (token.checkedAt ?? 0) > REVALIDATE_INTERVAL_MS;
      if (!isStale) return token;

      // Re-authorises the token's business, not just the user: an account that
      // is gone, a password changed since the token was issued, or a user who
      // may no longer act on this business (membership deactivated, or the
      // business left their organization) ends the session here.
      const claims = await revalidateClaims({
        sub: token.sub as string,
        businessId: token.businessId,
        iat: token.iat,
      });
      if (!claims) {
        token.revoked = true;
        return token;
      }

      token.role = claims.role;
      token.businessId = claims.businessId;
      token.orgAdmin = claims.orgAdmin;
      token.mustChangePassword = claims.mustChangePassword;
      token.checkedAt = Date.now();
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.sub as string;
      session.user.role = token.role;
      session.user.businessId = token.businessId;
      session.user.orgAdmin = token.orgAdmin ?? false;
      session.user.mustChangePassword = token.mustChangePassword;
      session.user.revoked = token.revoked ?? false;
      return session;
    },
  },
});
