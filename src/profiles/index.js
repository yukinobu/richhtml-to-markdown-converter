import chatgpt from './chatgpt.yaml';
import generic from './generic-html.yaml';

// Service profiles are evaluated in this order; Generic HTML is fallback only.
export const profiles = [chatgpt, generic];
