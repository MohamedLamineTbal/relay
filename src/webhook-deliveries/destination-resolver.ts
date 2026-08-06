import { Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';

export const DESTINATION_RESOLVER = Symbol('DESTINATION_RESOLVER');
export interface DestinationResolver {
  resolve(hostname: string): Promise<string[]>;
}

@Injectable()
export class NodeDestinationResolver implements DestinationResolver {
  async resolve(hostname: string) {
    return (await lookup(hostname, { all: true })).map(
      ({ address }) => address,
    );
  }
}
