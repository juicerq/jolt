interface Window {
  prototypeHost: {
    getConnection(): Promise<{ url: string; token: string }>
  }
}

declare module "*.css"
