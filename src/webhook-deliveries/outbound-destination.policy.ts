import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { BlockList, isIP } from 'node:net';
import {
  DESTINATION_RESOLVER,
  type DestinationResolver,
} from './destination-resolver';

const globalIpv6 = new BlockList();
globalIpv6.addSubnet('2000::', 3, 'ipv6');

const specialIpv6 = new BlockList();
specialIpv6.addSubnet('2001::', 23, 'ipv6');
specialIpv6.addSubnet('2001:db8::', 32, 'ipv6');
specialIpv6.addSubnet('2002::', 16, 'ipv6');
specialIpv6.addSubnet('3ffe::', 16, 'ipv6');
specialIpv6.addSubnet('3fff::', 20, 'ipv6');

function isPublic(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) ||
      (a === 203 && b === 0)
    );
  }
  return (
    isIP(address) === 6 &&
    globalIpv6.check(address, 'ipv6') &&
    !specialIpv6.check(address, 'ipv6')
  );
}

@Injectable()
export class OutboundDestinationPolicy {
  constructor(
    @Inject(DESTINATION_RESOLVER)
    private readonly resolver: DestinationResolver,
  ) {}
  async assertSafe(url: string) {
    const parsed = new URL(url);
    const addresses = await this.resolver.resolve(parsed.hostname);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      addresses.length === 0 ||
      addresses.some((address) => !isPublic(address))
    ) {
      throw new BadRequestException(
        'Webhook destination must resolve to public HTTPS addresses',
      );
    }
    return addresses;
  }
}
