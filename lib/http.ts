export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status=status; }
}
export const json = (data: unknown, status = 200) => Response.json(data, {status, headers:{'Cache-Control':'no-store, private','Vary':'Cookie'}});
export async function payload(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError('Send a JSON request.',415);
  const reader=request.body?.getReader();if(!reader)throw new ApiError('The request is empty.');
  let size=0;const chunks:Uint8Array[]=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8192){await reader.cancel();throw new ApiError('The request is too long.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try {const data=JSON.parse(new TextDecoder().decode(bytes));if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data as Record<string,unknown>;}catch{throw new ApiError('The request could not be read.');}
}
