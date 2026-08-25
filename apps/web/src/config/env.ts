const trimTrailingSlash=(value:string)=>value.replace(/\/+$/,'')
const runtimeEnv=(import.meta as ImportMeta&{env?:ImportMetaEnv}).env||{} as ImportMetaEnv

export const env={
  apiBaseUrl:trimTrailingSlash(runtimeEnv.VITE_API_URL||'http://localhost:3000/api/v1'),
  demoMode:runtimeEnv.VITE_DEMO_MODE==='true',
  demoAdminPassword:runtimeEnv.VITE_DEMO_ADMIN_PASSWORD||'',
} as const
