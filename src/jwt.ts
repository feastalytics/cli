export interface AccessTokenPayload {
  sub: string;
  username?: string;
  "cognito:groups"?: string[];
  exp: number;
}

export function decodeJwtPayload(jwt: string): AccessTokenPayload {
  const payload = jwt.split(".")[1];
  if (payload == null) {
    throw new Error("Malformed JWT");
  }
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
}
