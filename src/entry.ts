// Keep multiplayer outside every campaign boot/migration/save side effect.
if (new URLSearchParams(location.search).has('coop')) await import('./coop/client.ts');
else await import('./main.ts');
export {};
