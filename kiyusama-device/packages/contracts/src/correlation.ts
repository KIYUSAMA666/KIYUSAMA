export function sameCorrelation(...ids:string[]){return ids.length>0&&ids.every(x=>x.trim()!==''&&x===ids[0])}
