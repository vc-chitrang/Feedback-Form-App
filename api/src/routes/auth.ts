import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { admin, createSession, requireAdmin, SESSION_COOKIE, SESSION_TTL_MS, verifyPassword, type Role } from '../auth';
import { HttpError, parse, sha256 } from '../util';

const LoginBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
});

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/api/admin/auth/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = parse(LoginBody, req.body);
      const { rows } = await app.db.query<{ id: string; password_hash: string; role: Role }>(
        'select id, password_hash, role from admin_user where email = $1 and disabled_at is null',
        [body.email],
      );
      const user = rows[0];
      // Same generic message whether the email exists or not (no account enumeration).
      if (!user || !(await verifyPassword(body.password, user.password_hash))) {
        req.log.warn({ email: body.email }, 'failed admin login');
        throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect');
      }
      const token = await createSession(app.db, user.id);
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: app.config.cookieSecure,
        path: '/',
        maxAge: SESSION_TTL_MS / 1000,
      });
      return { ok: true };
    },
  );

  app.post('/api/admin/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await app.db.query('delete from admin_session where token_hash = $1', [sha256(token)]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/admin/me', { preHandler: requireAdmin() }, async (req) => {
    const a = admin(req);
    return {
      user: { id: a.userId, email: a.email, name: a.name, role: a.role },
      tenant: { id: a.tenantId, name: a.tenantName, slug: a.tenantSlug },
    };
  });
}
