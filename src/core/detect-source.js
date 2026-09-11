import { allIncludingRoot } from './dom.js';

export function detectSource(root, profiles) {
  return profiles.find(profile => {
    if (!profile.detect) return false;
    const exists = selector => allIncludingRoot(root, selector).length > 0;
    return profile.detect.all ? profile.detect.all.every(exists) : profile.detect.any.some(exists);
  }) ?? profiles.find(profile => profile.id === 'generic-html');
}
