import { jwtVerify, SignJWT } from "jose";

export interface AuthUser {
  uid: string;
  email: string;
  name?: string;
}

const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error("The environment variable JWT_SECRET is not set.");
  }
  return secret;
};

/**
 * Creates a JWT token for the user.
 */
export async function createToken(payload: AuthUser): Promise<string> {
  const secret = new TextEncoder().encode(getJwtSecretKey());
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d") // Token expires in 30 days
    .sign(secret);
}

/**
 * Verifies a JWT token and returns the payload.
 */
export async function verifyToken(token: string): Promise<AuthUser | null> {
  try {
    const secret = new TextEncoder().encode(getJwtSecretKey());
    const { payload } = await jwtVerify(token, secret);
    return payload as unknown as AuthUser;
  } catch (error) {
    return null;
  }
}

/**
 * Parses and returns the authenticated user from the request headers or cookies.
 */
export async function getAuthUser(request: Request): Promise<AuthUser | null> {
  // First check Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    return verifyToken(token);
  }

  // Then check cookies (for SSR/Pages)
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split("; ").map((c) => {
        const [key, ...v] = c.split("=");
        return [key, v.join("=")];
      })
    );
    if (cookies.token) {
      return verifyToken(cookies.token);
    }
  }

  return null;
}

export async function getAuditUser(request: Request): Promise<string | null> {
  const user = await getAuthUser(request);
  if (!user) return null;
  return user.email;
}
