import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

import type { IPasswordHasher } from './ports';

/** ToDo.md 8절: bcrypt cost 12 */
export const BCRYPT_COST = 12;

@Injectable()
export class BcryptPasswordHasher implements IPasswordHasher {
  hash(plain: string): Promise<string> {
    return hash(plain, BCRYPT_COST);
  }

  compare(plain: string, hashed: string): Promise<boolean> {
    // 해시 형식이 깨져 있어도 예외 대신 false 를 돌려준다 (로그인 화면이 500 나면 안 된다)
    return compare(plain, hashed).catch(() => false);
  }
}
