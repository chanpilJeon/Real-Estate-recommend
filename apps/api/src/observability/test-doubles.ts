import type { ILogger } from '../core';

/** 테스트에서 로그 호출을 들여다보기 위한 가짜 로거 */
export class FakeLogger implements ILogger {
  readonly infos: string[] = [];
  readonly warns: string[] = [];
  readonly errors: { msg: string; err?: Error }[] = [];

  info(_ctx: string, msg: string): void {
    this.infos.push(msg);
  }
  warn(_ctx: string, msg: string): void {
    this.warns.push(msg);
  }
  error(_ctx: string, msg: string, err?: Error): void {
    this.errors.push({ msg, err });
  }
}
