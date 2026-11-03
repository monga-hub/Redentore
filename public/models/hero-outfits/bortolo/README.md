# Bortolo outfits

Three approved Meshy garment masters retain the drowned gondolier's hat, rope fastenings, lagoon cloth, coat tails and nautical shoulder ornaments. Each item independently chooses its original world and rarity; three material finishes share each world's six-piece master. Common equipment retains the original character. No item IDs, stats, saves, skeletons or animation clips change.

`master.glb` contains `testa`, `spalle`, `torso`, `mani`, `gambe`, `piedi` in original Bortolo bind coordinates and bone order. `cover.json` lists original body triangle IDs hidden by each equipped piece. Shoulder ornaments are overlays and intentionally have empty coverage. Cloth cuffs belong to torso; gloves replace the original hand surface exactly and inherit the original fist deformation. World3 has green/blue footwear; its epic kit uses the actual equipped earlier-world epic boots.

The implementation uses a practical hybrid: generated coat/hat/shoulder/boot geometry and original animated flexible arm, hand and leg surfaces. Coats follow coherent spine/hip fields, ornaments and shoes their original limb bones. Flexible fabric samples and detailed glove texture come from the approved sources. All three 1024px material triples pack garment UVs into the left 75% and glove UVs into the right 25%. The runtime reduces these on phones. Source sleeves/capes with rejected arm/leg weight bleed are not shipped as flexible limbs.

`icons.webp` is the shared 10×8 atlas of73 existing clothing IDs in `src/ui/clothingIconAtlas.ts`. Every clothing cell, including common equipment, is an original painted-style fantasy item illustration generated with the built-in image generation tool on2026-11-03. Hats, shoulders, coats, gloves, trousers and boots are isolated objects without wearers, faces or body parts. No model screenshots or screenshot filters are used. Items sharing the same world/finish/slot share their appearance. Weapons and nonclothing items keep the normal atlas.

Clothing colors follow the world, independently of rarity borders:

|World|Noncomune|Raro|Epico|
|---|---|---|---|
|1|Hemp and tar charcoal|Umber, brick red, cream|Aubergine, oxblood, ivory, antique gold|
|2|Peat and linen|Petrol teal, ochre, ivory|Lagoon teal, sea glass, ivory, pale gold|
|3|Chestnut and charcoal|Wine, ivory, bronze|Garnet, cream rope, antique gold|

The three finishes retain the approved UV-compatible surfaces. Low quality reduces ornament contrast and normal strength, with matte cloth and dull fittings. Rare adds richer color and surface detail. Epic retains embroidery and brighter selective metallic trim. The runtime reads the map's red channel as glow: it is zero for low/rare and a faint restricted frost-highlight mask for epic, breathing through the existing uniform. Green carries roughness and blue metalness. These packed maps use lossless compression to preserve the zero glow channels. Existing aura effects remain compatible; no new animation clips or effects system are introduced. The historical filenames `green`, `blue`, `epic` are lookup keys, not clothing palettes.

Known visual tradeoffs: the original faceted icy anatomy remains beneath flexible clothing; some shoulder/cuff joins and coat/leg intersections can show in extreme poses. The approved cloth detail and world silhouettes remain visible. No claim of seamless tailoring is made.

These are derivatives of this project's Meshy-generated assets, not extracted third-party game artwork. Existing original character attribution is in `/ATTRIBUTION.md`. Source task IDs:

| World | Master (epic) | Green | Blue |
|---|---|---|---|
|1|01a19d80-bf50-75bd-89c4-3b53284c7b71|01a19d98-0b9f-747b-9baf-4f562426bd47|01a19d98-264e-73f1-809b-c21c24633ae2|
|2|01a19d80-cbae-7614-aa29-d469039fe6c8|01a19d98-40b6-71e3-a55b-17fcd59c36a0|01a19d98-5589-75a4-81ff-798b563ebaee|
|3|01a19d80-d7c9-766b-925a-11ff83186a31|01a19d99-d31e-72f3-bbb2-a6b99be985d6|01a19d99-eacb-7264-944f-619216cc2f36|

Original-UV glove retexture: `01a19e08-f26c-729e-bc0e-513e690ee56e`. This delivery reused existing paid source assets and submitted no generation jobs.
