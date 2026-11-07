import { existsSync,writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if(!existsSync('.dev.vars')){
  writeFileSync('.dev.vars',`RATE_LIMIT_SECRET=${randomBytes(32).toString('hex')}\n`,{mode:0o600});
  console.log('Created the ignored local service secret.');
}else console.log('Existing local configuration preserved.');
