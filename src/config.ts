const PROD_TRPC_URL =
  "https://0p5hujj55d.execute-api.us-east-1.amazonaws.com/production";
const PROD_API_KEY = "oP7WJPUFmN98zjUrZ2seGczfbJiq9sR3oUUfb1Bc";

export function getApiUrl(): string {
  return process.env.FEAST_API_URL ?? PROD_TRPC_URL;
}

export function getApiKey(): string {
  return process.env.FEAST_API_KEY ?? PROD_API_KEY;
}
