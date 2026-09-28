export function retryCredit(previous:string[],current:string[]){const before=new Set(previous);return current.some(x=>!before.has(x))}
