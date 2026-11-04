/** Service NPCs have no quests, rewards or campaign progression of their own. */
export const SANCTUARY = {
  maestro: { name: "Maestro dell'Arena", x: -122, z: -32, yaw: Math.PI, r: 0.5, model: 'iseppo.glb', tint: 0xffc27a, greeting: 'La Governatrice è caduta. Qui i risorti possono prepararsi insieme alle prove dell’arena.' },
  custode: { name: 'Custode della Rinascita', x: -114, z: -32, yaw: Math.PI, r: 0.5, model: 'zuane.glb', tint: 0xffd59a, greeting: 'Ciò che hai appreso resta tuo. Possiamo ridistribuire soltanto la forza che hai investito nei potenziamenti.' },
} as const;
export type SanctuaryService = keyof typeof SANCTUARY;
