// These headers must be supplied by Sites dispatch, never by a client-side role.
// Local preview uses the platform's loopback-only mock identity.
export function adminAccess(headers: Headers, ownerEmail: string | undefined) {
  const userId=headers.get('oai-authenticated-user-id'),email=headers.get('oai-authenticated-user-email');
  if(!userId||!email)return {status:401,message:'Sign in to manage this map.'} as const;
  if(!ownerEmail?.trim())return {status:503,message:'Administrator access is not configured.'} as const;
  if(email.trim().toLowerCase()!==ownerEmail.trim().toLowerCase())return {status:403,message:'This dashboard is restricted to the map owner.'} as const;
  return {status:200,userId} as const;
}
