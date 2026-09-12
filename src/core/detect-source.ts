import { allIncludingRoot } from './dom.ts';
import type { Profile } from './profile.ts';

export function detectSource(root: Element, profiles: Profile[]) {
  return profiles.find(profile => {
    if (!profile.detect) return false;
    const exists = (selector: string) => allIncludingRoot(root, selector).length > 0;
    return profile.detect.all ? profile.detect.all.every(exists) : profile.detect.any.some(exists);
  }) ?? profiles.find(profile => profile.id === 'generic-html');
}
