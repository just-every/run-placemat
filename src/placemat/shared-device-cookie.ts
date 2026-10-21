/** A dedicated host-stand browser never implicitly becomes an account-admin session. */
export const DEVICE_COOKIE='__Host-pm-device'
export const hasDeviceCookie=(request:Request)=>request.headers.get('cookie')?.split(';').some(s=>s.trim().startsWith(DEVICE_COOKIE+'='))??false
