import { convert } from '../core/convert.js';
import { profiles } from '../profiles/index.js';
import { setupUI } from './ui.js';

setupUI(document, navigator, convert, profiles);
