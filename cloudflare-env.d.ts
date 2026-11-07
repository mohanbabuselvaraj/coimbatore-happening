declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    RATE_LIMIT_SECRET?: string;
    ADMIN_OWNER_EMAIL?: string;
  }
}

declare module '*?worker&url' {
  const url: string;
  export default url;
}
