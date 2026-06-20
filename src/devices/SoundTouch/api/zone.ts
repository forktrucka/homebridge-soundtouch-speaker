import { compactMap, XMLElement } from './utils/index.js';
import { Member, memberFromElement } from './member.js';

export interface Zone {
  readonly master: string;
  readonly members: Member[];
  readonly senderIpAddress?: string;
}

export function zoneFromElement(element: XMLElement): Zone | undefined {
  if (!element.hasAttribute('master')) {
    return undefined;
  }
  const master = element.getAttribute('master');
  if (!master) {
    return undefined;
  }
  return {
    master,
    members: compactMap(element.getList('member'), memberFromElement),
  };
}

export function zoneToElement(zone: Zone): XMLElement {
  const attrs: Record<string, string> = { master: zone.master };
  if (zone.senderIpAddress) {
    attrs.senderIPAddress = zone.senderIpAddress;
  }
  const data = {
    $: attrs,
    member: zone.members.map((member: Member) => {
      return {
        $: {
          ipaddress: member.ipAddress,
        },
        _: member.deviceId,
      };
    }),
  };
  return new XMLElement({
    zone: data,
  });
}
