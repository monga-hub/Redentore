# Selection sanctuary

Original Redentore artwork generated with the built-in OpenAI imagegen tool on 2026-11-04. The supplied game screenshot informed atmosphere only; no game artwork, characters, interface or symbols were used as assets.

- `sanctuary.webp`: landscape scene, 1672 × 941, 282,986 bytes.
- `sanctuary-portrait.webp`: portrait composition, 941 × 1672, 266,244 bytes.
- `ivy.webp`: transparent foreground plants, 1672 × 941, 256,262 bytes.

Both scenic plates received a precise imagegen edit removing the recognizable San Marco campanile and adjacent bell towers, replacing them with low lagoon rooftops and haze. The location is an imagined ruined sanctuary, not a geographic reconstruction.

`src/ui/selectBackdrop.ts` selects the portrait plate below a square aspect ratio and anchors lightweight CSS fire, smoke, embers, cloud/mist and ivy layers to the artwork. Neither plate contains a hero or UI. Hero models and lighting remain in the existing selection renderer.
