import type { AssetsManifest, MatchConfig } from './shared/types';

const imageLoads = new Map<string, Promise<void>>();
export async function preloadMatchAssets(config: MatchConfig) {
  const response = await fetch('/assets/manifest.json');
  if (!response.ok) throw new Error('No se pudo cargar el contenido / Content could not load.');
  const assets:AssetsManifest = await response.json();
  const urls = [assets.backgrounds[config.arena],assets.sheets.body,...assets.sheets.hair,...assets.sheets.shirt,...assets.sheets.pants,...(assets.arenaPlatforms?.[config.arena]??assets.platforms),...Object.values(assets.effects).flat()];
  await Promise.all(urls.map(url=>{
    if (!imageLoads.has(url)) imageLoads.set(url,new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>{imageLoads.delete(url);reject(new Error('Falta una imagen del juego / Game image failed to load.'));};image.src=url;}));
    return imageLoads.get(url);
  }));
}

