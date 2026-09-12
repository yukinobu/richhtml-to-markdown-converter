import chatgpt from './chatgpt.yaml';
import generic from './generic-html.yaml';
import { validateProfiles } from '../core/profile-schema.ts';
import { hookRegistry } from '../hooks/chatgpt.ts';

// Service profiles are evaluated in this order; Generic HTML is fallback only.
const builtins = [chatgpt, generic];
validateProfiles(builtins, hookRegistry);
export const profiles = builtins;
