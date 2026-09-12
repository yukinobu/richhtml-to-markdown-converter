import { convert } from '../core/convert.ts';
import { profiles } from '../profiles/index.ts';
import { setupUI } from './ui.ts';

setupUI(document, navigator, convert, profiles);
