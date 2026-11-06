import data from '../../.generated/public-content.json';
import type { PublicManifest } from '../../scripts/content/schema';

// The build validates this file before Vite reads it; no runtime authoring-schema import.
export const manifest = data as PublicManifest;
