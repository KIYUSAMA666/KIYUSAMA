export function authenticityGate(input:{signature_valid:boolean;source_trusted:boolean;fresh:boolean}){return input.signature_valid&&input.source_trusted&&input.fresh?'VERIFIED':'UNVERIFIED'}
