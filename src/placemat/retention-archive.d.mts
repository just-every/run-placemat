export function portableRetentionRow(table:string,row:Record<string,unknown>):Record<string,unknown>;
export function validateRetention(read:(table:string)=>Promise<any[]>,stateRows:any[],guestRows:any[]):Promise<void>;
